# 署名: PRO2H(hadcockulloa@gmail.com)
"""Extract the MV's complete text repertoire as integer, 1000-upm outlines.

Run from any directory: python3 pelican-6000/tools/extract_glyphs.py
Requires fontTools, Node.js (to evaluate the two data modules), and the Noto TTCs.
The generated ES module has no external dependencies or runtime font requests.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from fontTools.misc.roundTools import otRound
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTCollection


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "src" / "data"
UPM = 1000
FONT_NUMBER = 2
FONT_FILES = {
    "serif": Path("/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"),
    "sans": Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
}
FONT_LICENSE = """Noto Serif CJK: © 2017-2022 Adobe (http://www.adobe.com/).
Noto Sans CJK: © 2014-2021 Adobe (http://www.adobe.com/).
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
"""
EXTRA_TEXT = (
    "Hydrogen", "鹈鹕", "六千年的车", "六千年", "PELICAN", "NO.21",
    "席位虚位以待", "鹈鹕骑者", "pelican-6000-mv.html",
    "全片纯代码，无任何音频/贴图，不到半张照片 Size",
    "点击或按 Space 开始播放 · 双击/F 全屏 · M 静音 · R 重播 · ←/→ 快进退",
    "加载音频引擎...", "第 21 席 · 发布会席位", "静候「鹈鹕本人」回应",
    "下载完成", "字节", "KB", "MB", "%",
    "，。、；：「」『』·—…（）！？【】",
)

# Hand-carved small-seal forms: 六 (roof and parted legs), 千 (curved axial
# figure), 年 (禾 over 人). All paths share the square seal's 0..1000 viewBox.
# These are filled relief shapes, not modern-font outlines or stroked text.
SEAL = {
    "viewBox": "0 0 1000 1000",
    "color": "#b6382c",
    "frame": (
        "M45 48L952 42L958 947L53 958L45 48Z"
        "M101 109L110 894L894 887L886 103L101 109Z"
        "M49 219L76 212L79 269L50 277Z"
        "M923 724L957 713L957 751L925 765Z"
    ),
    "六": (
        "M213 177C235 198 248 224 249 251L222 258C222 231 211 209 193 192Z"
        "M139 306C166 282 193 272 225 272C257 272 286 284 315 308L298 330"
        "C271 309 250 301 225 301C200 301 179 310 157 329Z"
        "M181 368L208 377C198 477 181 558 157 624L133 613"
        "C156 542 173 459 181 368Z"
        "M244 376L271 367C278 463 291 546 318 615L293 628"
        "C264 551 250 467 244 376Z"
        "M154 670C173 657 195 650 220 650C249 650 273 659 294 676L277 699"
        "C258 685 241 679 220 679C200 679 184 684 168 696Z"
        "M204 700L233 700L232 816L204 816Z"
    ),
    "千": (
        "M383 244C449 236 516 215 574 182L589 208"
        "C525 243 458 263 387 273Z"
        "M475 251L504 251L504 710C504 750 517 774 548 791L534 817"
        "C493 796 475 761 475 710Z"
        "M364 405C409 395 449 391 489 391C532 391 570 395 611 405L604 433"
        "C565 424 529 420 489 420C450 420 413 424 371 433Z"
        "M393 588C416 567 435 543 451 511L476 525"
        "C458 561 436 589 412 611Z"
        "M502 523L527 509C542 542 565 567 590 587L571 611"
        "C541 587 518 558 502 523Z"
    ),
    "年": (
        "M669 232C731 223 793 205 849 179L862 205"
        "C805 233 741 251 674 261Z"
        "M754 246L783 246L783 574L754 574Z"
        "M656 315L881 315L881 344L656 344Z"
        "M752 344L774 363C747 408 714 444 672 469L657 444"
        "C696 420 728 386 752 344Z"
        "M786 347C812 387 841 415 881 440L866 465"
        "C824 439 791 407 762 363Z"
        "M685 489L713 489L713 546L839 546L839 488L867 488L867 575L685 575Z"
        "M757 574L785 577C780 674 748 755 685 821L663 801"
        "C721 739 751 666 757 574Z"
        "M789 629C805 703 832 760 880 805L859 826"
        "C807 777 778 714 762 635Z"
        "M657 635L883 635L883 663L657 663Z"
    ),
}

RUNTIME_JS = r'''
const OUTLINE_CACHE = new Map();
const glyphFor = (ch, family) => {
  const face = GLYPHS[family] ?? GLYPHS.serif;
  return face[ch] ?? face["?"];
};
const glyphChars = (text) => Array.from(String(text));

/** Single-line advance in output pixels; no trailing letter spacing. */
export function measureGlyphText(text, fontSize = 16, family = "serif", letterSpacing = 0) {
  const chars = glyphChars(text);
  return chars.reduce((width, ch) => width + glyphFor(ch, family)[0] * fontSize / GLYPHS.upm, 0)
    + Math.max(0, chars.length - 1) * letterSpacing;
}

/**
 * Draw outlines with y at the baseline (ascenders above y). Returns advance width.
 * options: family, letterSpacing, align (left/center/right), color, fill (false
 * disables fill), stroke (CSS color or true), lineWidth (pixels), opacity, scale.
 * charColors / charScales accept arrays or (ch, index) functions.
 * onChar(ch, index, {x,y,advance,fontSize,glyph}) may return overrides:
 * {color,scale,scaleX,scaleY,dx,dy,opacity,stroke,lineWidth,fill}.
 * Overrides affect drawing only; karaoke layout keeps its stable text advances.
 */
export function drawGlyphText(ctx, text, x, y, fontSize = 16, options = {}) {
  const family = options.family ?? "serif";
  const letterSpacing = options.letterSpacing ?? 0;
  const width = measureGlyphText(text, fontSize, family, letterSpacing);
  const align = options.align ?? options.textAlign ?? "left";
  let cursor = x - (align === "center" ? width / 2 : align === "right" ? width : 0);
  const unit = fontSize / GLYPHS.upm;
  const valueAt = (value, ch, i) => typeof value === "function" ? value(ch, i) : value?.[i];
  ctx.save();
  try {
    glyphChars(text).forEach((ch, i) => {
      const glyph = glyphFor(ch, family);
      const advance = glyph[0] * unit;
      const style = options.onChar?.(ch, i, { x: cursor, y, advance, fontSize, glyph }) ?? {};
      const scale = style.scale ?? valueAt(options.charScales, ch, i) ?? options.scale ?? 1;
      const sx = unit * scale * (style.scaleX ?? 1);
      const sy = unit * scale * (style.scaleY ?? 1);
      if (glyph[1] && sx !== 0 && sy !== 0) {
        const cacheKey = `${family}:${ch}`;
        let path = OUTLINE_CACHE.get(cacheKey);
        if (!path) {
          path = new Path2D(glyph[1]);
          OUTLINE_CACHE.set(cacheKey, path);
        }
        ctx.save();
        try {
          ctx.translate(cursor + (style.dx ?? 0), y + (style.dy ?? 0));
          // OpenType y points UP. Flip around this character's baseline exactly once.
          ctx.scale(sx, -sy);
          ctx.globalAlpha *= (options.opacity ?? 1) * (style.opacity ?? 1);
          const color = style.color ?? valueAt(options.charColors, ch, i) ?? options.color;
          const fill = style.fill ?? options.fill;
          if (fill !== false) {
            ctx.fillStyle = color ?? (typeof fill === "string" ? fill : ctx.fillStyle);
            ctx.fill(path);
          }
          const stroke = style.stroke ?? options.stroke;
          if (stroke) {
            ctx.strokeStyle = typeof stroke === "string" ? stroke : color ?? ctx.fillStyle;
            ctx.lineWidth = (style.lineWidth ?? options.lineWidth ?? 1) / Math.max(Math.abs(sx), Math.abs(sy));
            ctx.stroke(path);
          }
        } finally {
          ctx.restore();
        }
      }
      cursor += advance + letterSpacing;
    });
  } finally {
    ctx.restore();
  }
  return width;
}

// SVGPathPen emits only absolute M/L/H/V/C/Q/Z, including implicit repeated args.
// Convert the coordinates themselves so callers can use one ordinary SVG path.
function svgOutline(pathD, x, scale) {
  const tokens = pathD.match(/[MLHVCQZ]|-?(?:\d*\.)?\d+/g) ?? [];
  const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4 };
  const number = (n) => String(Math.round(n * 1000) / 1000);
  let i = 0;
  let command = "";
  let result = "";
  while (i < tokens.length) {
    if (/^[A-Z]$/.test(tokens[i])) command = tokens[i++];
    if (command === "Z") {
      result += "Z";
      command = "";
      continue;
    }
    const count = arity[command];
    if (!count || i + count > tokens.length) throw new Error("Invalid glyph outline");
    const values = tokens.slice(i, i + count).map(Number);
    i += count;
    result += command + values.map((v, j) => {
      if (command === "H") return number(x + v * scale);
      if (command === "V") return number(-v * scale);
      return number(j % 2 === 0 ? x + v * scale : -v * scale);
    }).join(" ");
    if (command === "M") command = "L";
  }
  return result;
}

/** Combined SVG d string, upright, with the text baseline at (0,0). */
export function buildGlyphSvgPaths(text, fontSize = 16, family = "serif", letterSpacing = 0) {
  const unit = fontSize / GLYPHS.upm;
  let x = 0;
  return glyphChars(text).map((ch) => {
    const [advance, pathD] = glyphFor(ch, family);
    const result = svgOutline(pathD, x, unit);
    x += advance * unit + letterSpacing;
    return result;
  }).join("");
}
'''


def collect_characters() -> list[str]:
    """Evaluate actual exports rather than guessing at JS quoting or factories."""
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required to read the scene and lyric exports")
    loader = r'''
import { readFileSync } from "node:fs";
const load = async (path) => import("data:text/javascript;base64," + readFileSync(path).toString("base64"));
const scenes = await load(process.argv[1]);
const lyrics = await load(process.argv[2]);
if (scenes.SCENES_META.length !== 20 || lyrics.LYRICS_CUES.length !== 36) {
  throw new Error("Expected exactly 20 scenes and 36 lyric cues");
}
const fields = ["title", "era", "medium", "caption", "plaqueLeft", "plaqueRight"];
const texts = scenes.SCENES_META.flatMap((scene) => fields.map((field) => {
  if (typeof scene[field] !== "string") throw new Error(`Scene ${scene.id} is missing ${field}`);
  return scene[field];
}));
texts.push(...Object.values(scenes.FRAME_SYSTEMS).map((frame) => frame.label));
texts.push(...lyrics.LYRICS_CUES.map((cue) => cue.text));
process.stdout.write(JSON.stringify(texts));
'''
    result = subprocess.run(
        [node, "--input-type=module", "-e", loader,
         str(DATA_DIR / "scenes-meta.js"), str(DATA_DIR / "lyrics-data.js")],
        text=True, capture_output=True, check=True,
    )
    texts = json.loads(result.stdout)
    chars = set("".join(texts) + "".join(EXTRA_TEXT))
    chars.update(chr(code) for code in range(32, 127))
    return sorted((ch for ch in chars if ch.isprintable()), key=ord)


def extract_family(font_path: Path, chars: list[str]) -> dict[str, list]:
    if not font_path.is_file():
        raise FileNotFoundError(f"Required Noto CJK collection is missing: {font_path}")
    # Open lazily and process one face at a time, never loading the entire TTC.
    with TTCollection(str(font_path), lazy=True) as collection:
        font = collection.fonts[FONT_NUMBER]
        cmap = font.getBestCmap()
        missing = [ch for ch in chars if ord(ch) not in cmap]
        if missing:
            raise RuntimeError(f"Missing glyphs in {font_path.name}: {''.join(missing)}")
        glyph_set = font.getGlyphSet()
        scale = UPM / font["head"].unitsPerEm
        metrics = font["hmtx"].metrics
        outlines = {}
        for ch in chars:
            name = cmap[ord(ch)]
            # Transform first, then quantize all path operands to integer font units.
            pen = SVGPathPen(glyph_set, ntos=lambda value: str(otRound(value)))
            glyph_set[name].draw(TransformPen(pen, (scale, 0, 0, scale, 0, 0)))
            path_d = pen.getCommands()
            if not path_d and not ch.isspace():
                raise RuntimeError(f"Unexpected empty outline for {ch!r}")
            outlines[ch] = [otRound(metrics[name][0] * scale), path_d]
        return outlines


def compact_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    chars = collect_characters()
    destination = DATA_DIR / "glyphs.js"
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Stream family output, keeping only one extracted face in memory at a time.
    with destination.open("w", encoding="utf-8", newline="\n") as output:
        output.write("// 署名: PRO2H(hadcockulloa@gmail.com)\n")
        output.write("// Generated by tools/extract_glyphs.py; OpenType outlines retain y-up coordinates.\n")
        output.write("// Source: Noto Serif CJK SC Bold / Noto Sans CJK SC Regular, SIL OFL 1.1.\n")
        output.write("/*\n" + FONT_LICENSE + "*/\n")
        output.write("export const GLYPHS = {upm:1000,\n")
        for family, font_path in FONT_FILES.items():
            outlines = extract_family(font_path, chars)
            output.write(f"{family}:{{\n")
            for ch, glyph in outlines.items():
                output.write(f"{compact_json(ch)}:{compact_json(glyph)},\n")
            output.write("},\n")
            visible = sum(bool(glyph[1]) for glyph in outlines.values())
            print(f"{family}: {len(outlines)} glyphs, {visible} non-empty outlines")
            del outlines
        output.write("};\n\nexport const SEAL_LIUQIANNIAN = ")
        output.write(compact_json(SEAL))
        output.write(";\n")
        output.write(RUNTIME_JS)
    size = destination.stat().st_size
    print(f"Wrote {destination.relative_to(ROOT)}: {size:,} bytes ({size / 1024:.1f} KiB)")


if __name__ == "__main__":
    main()
