# 署名: PRO2H(hadcockulloa@gmail.com)
"""Build a deterministic, offline HTML bundle using only the Python stdlib.

Run from the repository or project directory, for example::

    python3 pelican-6000/tools/build_single_html.py --check

``--check`` builds normally and additionally verifies the dependency order and
every literal internal ESM reference, without a browser. Cycles are rejected:
immutable module Blob URLs require dependencies to be created first. Vendor
JavaScript is copied as opaque leaf modules and is never dependency-scanned.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import posixpath
import re
import sys
from typing import NamedTuple
from urllib.parse import unquote


FILENAME = "pelican-6000-mv.html"
BYTE_PLACEHOLDER = 'content="0000000000"'
EXCLUDED_DIRS = {
    "__pycache__", "tools", "test", "tests", "__tests__", "__snapshots__",
    "fixtures", "coverage", "node_modules",
}
TEST_FILE_RE = re.compile(r"(?:[._-](?:test|spec|snapshot)\.|^test[_.-])", re.I)
SOURCE_MAP_RE = re.compile(
    r"(?:\s*(?://[#@]\s*sourceMappingURL=[^\r\n]*|/\*[#@]\s*sourceMappingURL=[\s\S]*?\*/))+$"
)

# Python and the bootloader use the same token pattern and specifier rules.
# Tokenizing first keeps import-looking text in comments/strings/regexes inert.
TOKEN_PATTERN = (
    r"\s+|//[^\r\n]*|/\*[\s\S]*?\*/"
    r"|\"(?:\\[\s\S]|[^\"\\])*\"|'(?:\\[\s\S]|[^'\\])*'"
    r"|`(?:\\[\s\S]|[^`\\])*`"
    r"|[A-Za-z_$][\w$]*|[0-9]+(?:\.[0-9]+)?|[^\s]"
)
TOKEN_RE = re.compile(TOKEN_PATTERN)
REGEX_LITERAL_RE = re.compile(r"/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\\[\r\n])+/[a-z]*")
REGEX_PREFIXES = {
    "(", "[", "{", "=", ":", ",", ";", "!", "?", "&", "|", "+", "-",
    "*", "%", "^", "~", ">", "<", "return", "throw", "case", "yield",
    "await", "else", "do", "typeof", "void", "delete", "in", "of",
}


class BuildError(ValueError):
    """An invalid project or unsupported module graph."""


class Token(NamedTuple):
    value: str
    start: int
    end: int


class Specifier(NamedTuple):
    value: str
    start: int  # Inside the quotes, so replacement preserves their spelling.
    end: int


def js_tokens(source: str) -> list[Token]:
    tokens: list[Token] = []
    cursor = 0
    while cursor < len(source):
        match = TOKEN_RE.match(source, cursor)
        if match is None:
            raise BuildError(f"Cannot tokenize JavaScript at offset {cursor}")
        value = match.group()
        if value == "/" and (not tokens or tokens[-1].value in REGEX_PREFIXES):
            literal = REGEX_LITERAL_RE.match(source, cursor)
            if literal:
                value = literal.group()
                tokens.append(Token(value, cursor, literal.end()))
                cursor = literal.end()
                continue
        if not value.isspace() and not value.startswith(("//", "/*")):
            tokens.append(Token(value, cursor, match.end()))
        cursor = match.end()
    return tokens


def decode_js_string(value: str) -> str:
    """Decode quoted ESM paths, including escaped Unicode and line continuations."""
    def escape(match: re.Match[str]) -> str:
        sequence = match.group()[1:]
        if sequence.startswith("u{"):
            return chr(int(sequence[2:-1], 16))
        if sequence.startswith(("u", "x")):
            return chr(int(sequence[1:], 16))
        return {"n": "\n", "r": "\r", "t": "\t", "b": "\b", "f": "\f",
                "v": "\v", "0": "\0", "\n": "", "\r": "", "\r\n": ""}.get(sequence, sequence)

    return re.sub(r"\\(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])", escape, value[1:-1])


def esm_specifiers(source: str) -> list[Specifier]:
    """Find literal import/export specifiers, ignoring comments and plain strings.

    Supports static imports, side-effect imports, re-exports and literal dynamic
    imports (including an options argument). Computed paths and template literal
    contents are deliberately left alone; they are not static ESM specifiers.
    """
    tokens = js_tokens(source)
    found: list[Specifier] = []
    for i, token in enumerate(tokens):
        if token.value not in {"import", "export"}:
            continue
        if i and tokens[i - 1].value == ".":
            continue  # import.meta and object.import(...) are not imports.
        j = i + 1
        if j >= len(tokens):
            continue
        next_value = tokens[j].value
        if token.value == "import" and next_value[:1] in {"'", '"'}:
            pass
        elif token.value == "import" and next_value == "(":
            j += 1
            if (j + 1 >= len(tokens) or tokens[j].value[:1] not in {"'", '"'}
                    or tokens[j + 1].value not in {")", ","}):
                continue
        else:
            if token.value == "export" and next_value not in {"*", "{"}:
                continue
            if token.value == "import" and (next_value in {".", "("} or not re.match(r"[\w${*]", next_value)):
                continue
            depth = 0
            while j < len(tokens):
                current = tokens[j].value
                if current == "{":
                    depth += 1
                elif current == "}":
                    depth -= 1
                    if depth == 0 and token.value == "export":
                        j += 1
                        break
                if depth == 0 and current in {"from", ";"}:
                    break
                j += 1
            if j >= len(tokens) or tokens[j].value != "from":
                continue
            j += 1
        if j < len(tokens) and tokens[j].value[:1] in {"'", '"'}:
            item = tokens[j]
            found.append(Specifier(decode_js_string(item.value), item.start + 1, item.end - 1))
    return found


def resolve_specifier(importer: str, specifier: str) -> str | None:
    """Resolve exact POSIX VFS paths; external/bare specifiers return None."""
    if not specifier.startswith(("./", "../", "/")) or specifier.startswith("//"):
        return None
    path = unquote(re.split(r"[?#]", specifier, maxsplit=1)[0])
    path = (path.lstrip("/") if path.startswith("/")
            else posixpath.join(posixpath.dirname(importer), path))
    normalized = posixpath.normpath(path)
    if normalized == ".." or normalized.startswith("../"):
        raise BuildError(f"Import escapes VFS: {importer} -> {specifier}")
    return normalized


def module_dependencies(files: dict[str, str]) -> dict[str, list[str]]:
    graph: dict[str, list[str]] = {}
    for path, source in files.items():
        if not path.endswith(".js"):
            continue
        graph[path] = []
        if path.startswith("vendor/"):
            continue  # Opaque leaves: never tokenize or search vendor bundles.
        for item in esm_specifiers(source):
            target = resolve_specifier(path, item.value)
            if target is None:
                continue
            if target not in files:
                raise BuildError(f"Unresolved internal import: {path} -> {item.value} ({target})")
            if not target.endswith((".js", ".json")):
                raise BuildError(f"Unsupported module type: {path} -> {target}")
            if target.endswith(".js") and target not in graph[path]:
                graph[path].append(target)
    return graph


def topological_order(files: dict[str, str], entry: str) -> list[str]:
    if entry not in files or not entry.endswith(".js"):
        raise BuildError(f"Missing JavaScript entry: {entry}")
    graph = module_dependencies(files)
    state: dict[str, int] = {}
    topo: list[str] = []
    active: list[str] = []

    def visit(path: str) -> None:
        if state.get(path) == 2:
            return
        if state.get(path) == 1:
            cycle = active[active.index(path):] + [path]
            raise BuildError("Circular ESM dependency: " + " -> ".join(cycle))
        state[path] = 1
        active.append(path)
        for target in graph[path]:
            visit(target)
        active.pop()
        state[path] = 2
        topo.append(path)

    visit(entry)
    # Include standalone workers and other JS too, with entry traversal first.
    for path in sorted(graph):
        visit(path)
    return topo


def check_vfs(vfs: dict) -> None:
    files, topo = vfs["files"], vfs["topo"]
    graph = module_dependencies(files)
    if len(topo) != len(set(topo)) or set(topo) != set(graph):
        raise BuildError("Topological list must contain every JavaScript file exactly once")
    if vfs["entry"] not in graph:
        raise BuildError(f"Missing entry: {vfs['entry']}")
    positions = {path: index for index, path in enumerate(topo)}
    for path, targets in graph.items():
        for target in targets:
            if positions[target] >= positions[path]:
                raise BuildError(f"Invalid topological order: {target} must precede {path}")


def collect_vfs(root: Path, entry: str) -> dict:
    # Fail before reading any bundles if the app has not been assembled yet.
    if not (root / entry).is_file():
        raise BuildError(f"Missing JavaScript entry: {root / entry}")
    files: dict[str, str] = {}
    for directory, extensions in (("src", {".js", ".json"}), ("vendor", {".js"})):
        for folder, dirs, names in os.walk(root / directory, followlinks=False):
            dirs[:] = sorted(name for name in dirs if not name.startswith(".")
                             and name not in EXCLUDED_DIRS and not (Path(folder) / name).is_symlink())
            for name in sorted(names):
                path = Path(folder) / name
                if (name.startswith(".") or TEST_FILE_RE.search(name)
                        or path.suffix not in extensions or path.is_symlink()):
                    continue
                text = path.read_text(encoding="utf-8")
                if directory == "vendor":
                    text = SOURCE_MAP_RE.sub("", text)
                files[path.relative_to(root).as_posix()] = text
    for name in ("styles.css", "index.html"):
        if (root / name).is_file():
            files[name] = (root / name).read_text(encoding="utf-8")
    files = dict(sorted(files.items()))
    return {"version": 1, "entry": entry, "topo": topological_order(files, entry),
            "files": files, "styles": files.get("styles.css", "")}


class IndexParts(HTMLParser):
    """Keep the app's DOM and useful metadata, removing its old script/link tags."""

    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.body: list[str] = []
        self.metadata: list[str] = []
        self.title: list[str] = []
        self.language = "zh-CN"
        self.body_attrs = ""
        self.in_body = False
        self.in_title = False
        self.in_script = False
        self.feed(source)
        self.close()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "html":
            self.language = values.get("lang") or self.language
        if tag == "body":
            self.in_body = True
            self.body_attrs = "".join(f' {key}="{html.escape(value or "", quote=True)}"' for key, value in attrs)
            return
        if self.in_script:
            return
        if tag == "script":
            self.in_script = True
            return
        if tag == "title":
            self.in_title = True
        if tag == "meta" and values.get("name", "").lower() not in {
            "", "viewport", "bundle-bytes", "bundle-filename",
        }:
            name = html.escape(values["name"], quote=True)
            content = html.escape(values.get("content") or "", quote=True)
            self.metadata.append(f'<meta name="{name}" content="{content}" />')
        if self.in_body and tag not in {"link", "base", "meta", "title"}:
            for key, value in attrs:
                if key in {"src", "href", "poster", "srcset"} and value:
                    if value.startswith(("#", "data:")):
                        continue
                    if tag == "a" and key == "href" and value.startswith(("https://", "http://", "mailto:")):
                        continue
                    raise BuildError(f"index.html contains an unbundled asset: <{tag} {key}={value!r}>")
            self.body.append(self.get_starttag_text())

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag == "script":
            self.in_script = False

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.in_script = False
            return
        if self.in_script:
            return
        if tag == "body":
            self.in_body = False
            return
        if tag == "title":
            self.in_title = False
            return
        if self.in_body and tag not in {"html", "link", "base", "meta"}:
            self.body.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if self.in_script:
            return
        if self.in_title:
            self.title.append(data)
        elif self.in_body:
            self.body.append(data)

    def handle_entityref(self, name: str) -> None:
        self.handle_data(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.handle_data(f"&#{name};")

    def handle_comment(self, data: str) -> None:
        # Original comments can contain stale script/asset tags; omit them.
        pass


BOOTLOADER = r'''
// 署名: PRO2H(hadcockulloa@gmail.com)
const tokenRE = new RegExp(__TOKEN_PATTERN__, "gy");
const regexRE = /\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\\[\r\n])+\/[a-z]*/y;
const regexPrefixes = new Set(__REGEX_PREFIXES__);
function tokens(source) {
  const result = [];
  let cursor = 0;
  while (cursor < source.length) {
    tokenRE.lastIndex = cursor;
    const match = tokenRE.exec(source);
    if (!match) throw new Error(`Cannot tokenize JavaScript at ${cursor}`);
    let value = match[0];
    if (value === "/" && (!result.length || regexPrefixes.has(result.at(-1).value))) {
      regexRE.lastIndex = cursor;
      const literal = regexRE.exec(source);
      if (literal) {
        result.push({ value: literal[0], start: cursor, end: regexRE.lastIndex });
        cursor = regexRE.lastIndex;
        continue;
      }
    }
    if (!/^\s+$/.test(value) && !value.startsWith("//") && !value.startsWith("/*")) {
      result.push({ value, start: cursor, end: tokenRE.lastIndex });
    }
    cursor = tokenRE.lastIndex;
  }
  return result;
}
function decodeString(value) {
  return value.slice(1, -1).replace(/\\(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, sequence => {
    const code = sequence.slice(1);
    if (code.startsWith("u{")) return String.fromCodePoint(parseInt(code.slice(2, -1), 16));
    if (/^[ux]/.test(code)) return String.fromCodePoint(parseInt(code.slice(1), 16));
    return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0", "\n": "", "\r": "", "\r\n": "" })[code] ?? code;
  });
}
function specifiers(source) {
  const list = tokens(source), found = [];
  for (let i = 0; i < list.length; i++) {
    const keyword = list[i].value;
    if (keyword !== "import" && keyword !== "export") continue;
    if (i && list[i - 1].value === ".") continue;
    let j = i + 1;
    if (j >= list.length) continue;
    const next = list[j].value;
    if (keyword === "import" && /^['"]/.test(next)) {
      // Side-effect import.
    } else if (keyword === "import" && next === "(") {
      j++;
      if (j + 1 >= list.length || !/^['"]/.test(list[j].value) || ![")", ","].includes(list[j + 1].value)) continue;
    } else {
      if (keyword === "export" && !["*", "{"].includes(next)) continue;
      if (keyword === "import" && ([".", "("].includes(next) || !/^[\w${*]/.test(next))) continue;
      let depth = 0;
      while (j < list.length) {
        const current = list[j].value;
        if (current === "{") depth++;
        else if (current === "}") {
          depth--;
          if (depth === 0 && keyword === "export") { j++; break; }
        }
        if (depth === 0 && ["from", ";"].includes(current)) break;
        j++;
      }
      if (j >= list.length || list[j].value !== "from") continue;
      j++;
    }
    if (j < list.length && /^['"]/.test(list[j].value)) {
      const item = list[j];
      found.push({ value: decodeString(item.value), start: item.start + 1, end: item.end - 1 });
    }
  }
  return found;
}
function normalizePath(path) {
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error(`Path escapes VFS: ${path}`);
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
function resolveSpecifier(importer, specifier) {
  if (!/^(?:\.\.?\/|\/)/.test(specifier) || specifier.startsWith("//")) return null;
  const path = decodeURIComponent(specifier.split(/[?#]/, 1)[0]);
  return normalizePath(path.startsWith("/") ? path : importer.slice(0, importer.lastIndexOf("/") + 1) + path);
}
function rewriteModule(source, path, files, blobMap) {
  // Replace from right to left so original token offsets remain valid.
  for (const item of specifiers(source).reverse()) {
    const target = resolveSpecifier(path, item.value);
    if (target === null) continue;
    if (!Object.hasOwn(files, target) || !Object.hasOwn(blobMap, target)) {
      throw new Error(`Unresolved internal import: ${path} -> ${item.value}`);
    }
    source = source.slice(0, item.start) + blobMap[target] + source.slice(item.end);
  }
  return source;
}
function mimeFor(path) {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".html")) return "text/html";
  return "text/plain";
}
async function boot() {
  const bytes = Uint8Array.from(atob(document.getElementById("vfs-payload").textContent.trim()), char => char.charCodeAt(0));
  if (typeof DecompressionStream !== "function") throw new Error("This browser does not support gzip decompression.");
  const payload = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  const vfs = JSON.parse(payload);
  if (vfs.version !== 1) throw new Error("Unsupported VFS version.");
  const style = document.createElement("style");
  style.id = "mv-vfs-styles";
  style.textContent = vfs.styles;
  document.head.append(style);
  window.__MV_VFS__ = {
    filename: "pelican-6000-mv.html",
    exactBytes: Number(document.querySelector("meta[name=bundle-bytes]").content),
    files: vfs.files,
  };
  const origFetch = window.fetch.bind(window);
  const documentURL = new URL(document.baseURI);
  const basePath = decodeURIComponent(new URL(".", documentURL).pathname);
  try { localStorage.setItem(`${navigator.language}-2.4.0`, "{}"); } catch { /* Storage may be disabled. */ }
  window.fetch = function(input, init) {
    try {
      const requestURL = new URL(typeof input === "string" || input instanceof URL ? input : input.url, documentURL);
      const method = (init?.method || input?.method || "GET").toUpperCase();
      const sameOrigin = requestURL.protocol === documentURL.protocol && requestURL.host === documentURL.host;
      if (sameOrigin && ["GET", "HEAD"].includes(method)) {
        const pathname = decodeURIComponent(requestURL.pathname);
        const candidates = [pathname.startsWith(basePath) ? pathname.slice(basePath.length) : "", pathname.replace(/^\/+/, "")];
        for (const path of candidates) {
          if (Object.hasOwn(vfs.files, path)) {
            return Promise.resolve(new Response(method === "HEAD" ? null : vfs.files[path], {
              status: 200, headers: { "Content-Type": mimeFor(path) },
            }));
          }
        }
      }
      const localPath = sameOrigin && decodeURIComponent(requestURL.pathname).startsWith(basePath)
        ? decodeURIComponent(requestURL.pathname).slice(basePath.length) : "";
      const localTranslation = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*\.json$/i.test(localPath);
      const cdnTranslation = requestURL.hostname === "cdn.jsdelivr.net"
        && /^\/npm\/p5(?:@[^/]+)?\/(?:[^/]+\/)*translations\/.+\/extracted\.json$/.test(requestURL.pathname);
      if (["GET", "HEAD"].includes(method) && (localTranslation || cdnTranslation)) {
        return Promise.resolve(new Response(method === "HEAD" ? null : "{}", {
          status: 200, headers: { "Content-Type": "application/json" },
        }));
      }
    } catch { /* Let native fetch report malformed or unsupported requests. */ }
    return origFetch(input, init);
  };
  window.__MV_P5_TRANSLATIONS_LOCAL__ = true;
  const blobMap = Object.create(null);
  for (const [path, text] of Object.entries(vfs.files)) {
    if (path.endsWith(".json")) blobMap[path] = URL.createObjectURL(new Blob([text], { type: mimeFor(path) }));
  }
  for (const path of vfs.topo) {
    const rawText = vfs.files[path];
    const transformed = path.startsWith("vendor/") ? rawText : rewriteModule(rawText, path, vfs.files, blobMap);
    blobMap[path] = URL.createObjectURL(new Blob([transformed], { type: "text/javascript" }));
  }
  if (!blobMap[vfs.entry]) throw new Error(`Missing entry module: ${vfs.entry}`);
  // Keep Blob URLs alive: later dynamic imports and workers may still use them.
  await import(blobMap[vfs.entry]);
}
try {
  await boot();
} catch (error) {
  console.error("MV boot failed:", error);
  const banner = document.createElement("div");
  banner.id = "mv-boot-error";
  banner.setAttribute("role", "alert");
  banner.style.cssText = "position:fixed;inset:12px 12px auto;z-index:2147483647;padding:16px;border:1px solid #a33;border-radius:8px;background:#211;color:#fee;font:14px/1.5 system-ui;white-space:pre-wrap";
  banner.textContent = `Unable to start the MV.\n${error.message || error}`;
  document.body.append(banner);
}
'''

HTML_TEMPLATE = '''<!doctype html>
<!-- 署名: PRO2H(hadcockulloa@gmail.com) -->
<html lang="__LANG__">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="bundle-bytes" content="0000000000" />
<meta name="bundle-filename" content="pelican-6000-mv.html" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23171411'/%3E%3Cpath d='M12 39h32l12-10H36V18H24v21z' fill='%23ffe49e'/%3E%3C/svg%3E" />
<title>__TITLE__</title>
__METADATA__
</head>
<body__BODY_ATTRS__>
__BODY__
<script id="vfs-payload" type="text/plain">__PAYLOAD__</script>
<script type="module">
__BOOTLOADER__
</script>
</body>
</html>
'''


def render_html(vfs: dict) -> str:
    parts = IndexParts(vfs["files"].get("index.html", ""))
    payload = json.dumps(vfs, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    packed = base64.b64encode(gzip.compress(payload, compresslevel=9, mtime=0)).decode("ascii")
    bootloader = BOOTLOADER.replace("__TOKEN_PATTERN__", json.dumps(TOKEN_PATTERN))
    bootloader = bootloader.replace("__REGEX_PREFIXES__", json.dumps(sorted(REGEX_PREFIXES)))
    values = {
        "LANG": html.escape(parts.language, quote=True),
        "TITLE": html.escape(html.unescape("".join(parts.title)) or "Pelican · 六千年 MV"),
        "METADATA": "\n".join(parts.metadata),
        "BODY_ATTRS": parts.body_attrs,
        "BODY": "".join(parts.body) or '<main id="app"></main>',
        "PAYLOAD": packed,
        "BOOTLOADER": bootloader,
    }
    # One substitution pass: text inside a replacement is never re-interpreted.
    final_html = re.sub(r"__(LANG|TITLE|METADATA|BODY_ATTRS|BODY|PAYLOAD|BOOTLOADER)__",
                        lambda match: values[match[1]], HTML_TEMPLATE)
    if final_html.count(BYTE_PLACEHOLDER) != 1:
        raise BuildError("Expected exactly one bundle byte-count placeholder")
    exact_bytes = len(final_html.encode("utf-8"))
    if exact_bytes >= 10**10:
        raise BuildError("Bundle byte count does not fit ten decimal digits")
    final_html = final_html.replace(BYTE_PLACEHOLDER, f'content="{exact_bytes:010d}"', 1)
    if len(final_html.encode("utf-8")) != exact_bytes:
        raise BuildError("Bundle byte-count metadata is not exact")
    return final_html


def source_root(value: str) -> Path:
    requested = Path(value).expanduser()
    if not requested.is_absolute() and value == "pelican-6000" and not requested.is_dir():
        # Running tools/build_single_html.py from inside the project also works.
        requested = Path(__file__).resolve().parents[1]
    root = requested.resolve()
    if not root.is_dir():
        raise BuildError(f"Source directory does not exist: {root}")
    return root


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", default="pelican-6000", help="Project directory (default: pelican-6000)")
    parser.add_argument("--output", default="../pelican-6000-mv.html", help="Output path, relative to --src")
    parser.add_argument("--entry", default="src/main.js", help="Entry path, relative to --src")
    parser.add_argument("--check", action="store_true", help="Also verify all internal imports and topological order")
    args = parser.parse_args(argv)
    try:
        root = source_root(args.src)
        entry = posixpath.normpath(args.entry.replace("\\", "/"))
        if entry.startswith(("/", "../")) or entry == "..":
            raise BuildError("Entry must be a path inside --src")
        vfs = collect_vfs(root, entry)
        if args.check:
            check_vfs(vfs)
        final_html = render_html(vfs)
        output = Path(args.output).expanduser()
        if not output.is_absolute():
            output = root / output
        output = output.resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(final_html.encode("utf-8"))
        print(f"Built {output}: {output.stat().st_size:,} bytes; {len(vfs['files'])} VFS files; {len(vfs['topo'])} modules")
        if args.check:
            print("PASS: dependency-first order; zero unresolved internal imports; exact byte-count metadata")
        return 0
    except (BuildError, OSError, UnicodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
