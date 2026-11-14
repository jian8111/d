#!/usr/bin/env python3
# 署名: PRO1V(valerie...@gmail.com)
"""Publish repository files to GitHub and the shared Google Drive folder.

The command deliberately uses only Python's standard library.  It delegates
GitHub, Codespaces, and Drive operations to their installed command-line tools
and keeps the 50 MB Git/Drive split from AGENTS.md in one place.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


SIGNATURE = "PRO1V(valerie...@gmail.com)"
DEFAULT_DRIVE_ROOT = "1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr"
MAX_GIT_FILE_BYTES = 50 * 1024 * 1024
SECRET_RE = re.compile(
    rb"yls-[a-zA-Z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{8,}"
)
PRO_EMAILS = {
    "PRO1V": "valerie...@gmail.com",
    "PRO2H": "hadcockulloa@gmail.com",
    "PRO3J": "saveljevsjill148@gmail.com",
    "PRO4M": "wilermccomber@gmail.com",
    "PRO5C": "crispinowilbourn@gmail.com",
}
DRIVE_EMAIL = "466788455@qq.com"
IDENTITY_RE = re.compile(r"\b(PRO[1-5][A-Z])\b")


class PublishError(RuntimeError):
    """A user-actionable publishing or preflight error."""


@dataclass(frozen=True)
class Identity:
    key: str
    email: str

    @property
    def signature(self) -> str:
        return f"{self.key}({self.email})"


@dataclass(frozen=True)
class Candidate:
    absolute: Path
    relative: str
    size: int

    @property
    def is_large(self) -> bool:
        return self.size >= MAX_GIT_FILE_BYTES


def command_text(command: Sequence[str]) -> str:
    """Return a shell-like command for plans without exposing environment secrets."""

    return shlex.join(str(part) for part in command)


def resolve_cli(name: str) -> str | None:
    """Find a CLI even when a child shell omits user installation paths."""

    found = shutil.which(name)
    if found:
        return found
    for directory in (
        Path("/opt/antigravity/bin"),
        Path("/usr/local/bin"),
        Path.home() / ".npm-global" / "bin",
        Path.home() / ".local" / "bin",
    ):
        candidate = directory / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def with_cli_path(env: dict[str, str] | None = None) -> dict[str, str]:
    """Copy an environment and append missing CLI directories to PATH."""

    result = (os.environ if env is None else env).copy()
    paths = result.get("PATH", os.defpath).split(os.pathsep)
    for directory in (
        "/opt/antigravity/bin",
        str(Path.home() / ".local" / "bin"),
        str(Path.home() / ".npm-global" / "bin"),
    ):
        if directory not in paths:
            paths.append(directory)
    result["PATH"] = os.pathsep.join(paths)
    return result


def run_command(
    command: Sequence[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
    check: bool = True,
    capture: bool = True,
    input_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a command with text I/O and a useful error message."""

    command_env = with_cli_path(env)
    argv = list(command)
    argv[0] = shutil.which(argv[0], path=command_env["PATH"]) or resolve_cli(argv[0]) or argv[0]
    try:
        result = subprocess.run(
            argv,
            cwd=str(cwd),
            env=command_env,
            input=input_text,
            text=True,
            capture_output=capture,
            check=False,
        )
    except FileNotFoundError as exc:
        raise PublishError(f"找不到命令 {command[0]!r}，请先安装对应 CLI。") from exc
    if check and result.returncode != 0:
        details = (result.stderr or result.stdout or "").strip()
        suffix = f"\n{details}" if details else ""
        raise PublishError(f"命令失败（{result.returncode}）：{command_text(command)}{suffix}")
    return result


def repo_root(requested: str | None) -> Path:
    if requested:
        root = Path(requested).expanduser().resolve()
        if not (root / ".git").exists() and not (root / ".git").is_file():
            raise PublishError(f"不是 Git 仓库根目录：{root}")
        return root
    result = run_command(["git", "rev-parse", "--show-toplevel"], cwd=Path.cwd())
    return Path(result.stdout.strip()).resolve()


def read_identity(root: Path) -> Identity:
    path = Path.home() / ".gemini" / "ACCOUNT_IDENTITY.txt"
    if not path.exists():
        raise PublishError(f"缺少持久身份文件：{path}")
    raw = path.read_text(encoding="utf-8", errors="replace").strip()
    match = IDENTITY_RE.search(raw)
    if not match:
        raise PublishError("ACCOUNT_IDENTITY.txt 未包含 PRO1V/PRO2H/PRO3J/PRO4M/PRO5C 身份。")
    key = match.group(1)
    embedded = re.search(rf"{re.escape(key)}\s*\(([^)]+)\)", raw)
    signatures = root / "SIGNATURES.md"
    signature_email = None
    if signatures.exists():
        text = signatures.read_text(encoding="utf-8", errors="replace")
        sig_match = re.search(rf"{re.escape(key)}\s*\(([^)]+)\)", text)
        if sig_match:
            signature_email = sig_match.group(1).strip()
    email = signature_email or PRO_EMAILS[key]
    if embedded and embedded.group(1).strip() != email:
        raise PublishError(
            f"身份邮箱与 SIGNATURES.md 不一致：{embedded.group(1).strip()} != {email}"
        )
    if email == DRIVE_EMAIL or DRIVE_EMAIL in email:
        raise PublishError("拒绝使用纯 Drive 存储号 466788455@qq.com 作为 Pro 身份。")
    if key not in PRO_EMAILS:
        raise PublishError(f"不支持的 Pro 身份：{key}")
    return Identity(key, email)


def configure_git_identity(root: Path, identity: Identity, *, dry_run: bool) -> None:
    commands = [
        ["git", "config", "user.name", identity.key],
        ["git", "config", "user.email", identity.email],
    ]
    for command in commands:
        if dry_run:
            print(f"DRY-RUN {command_text(command)}")
        else:
            run_command(command, cwd=root)


def run_integrity_verify(root: Path) -> None:
    verifier = root / ".cursor" / "skills" / "swarm-verify" / "scripts" / "verify_repo.py"
    if not verifier.exists():
        raise PublishError(f"缺少仓库完整性校验脚本：{verifier}")
    result = run_command(
        ["python3", ".cursor/skills/swarm-verify/scripts/verify_repo.py", "--strict"], cwd=root
    )
    if result.stdout:
        print(result.stdout.rstrip())
    if result.stderr:
        print(result.stderr.rstrip(), file=sys.stderr)


def is_ignored(root: Path, relative: str) -> bool:
    result = run_command(
        ["git", "check-ignore", "--no-index", "-q", "--", relative],
        cwd=root,
        check=False,
    )
    return result.returncode == 0


def path_relative_to_root(root: Path, value: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = root / path
    resolved = path.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise PublishError(f"路径必须位于仓库根目录内：{value}") from exc
    return resolved


def expand_input_path(root: Path, value: str) -> list[Path]:
    path = path_relative_to_root(root, value)
    if not path.exists():
        raise PublishError(f"文件不存在：{path.relative_to(root)}")
    if path.is_file():
        return [path]
    files: list[Path] = []
    for child in sorted(path.rglob("*")):
        if ".git" in child.relative_to(root).parts:
            continue
        if child.is_file():
            files.append(child.resolve())
    return files


def parse_status_paths(raw: str) -> list[str]:
    """Parse ``git status --porcelain=v1 -z`` and retain current paths."""

    parts = raw.split("\0")
    paths: list[str] = []
    index = 0
    while index < len(parts):
        record = parts[index]
        index += 1
        if not record:
            continue
        if len(record) < 4:
            continue
        status = record[:2]
        value = record[3:]
        # A rename/copy record is followed by the destination path in -z mode.
        if status[0] in {"R", "C"} or status[1] in {"R", "C"}:
            if index < len(parts) and parts[index]:
                value = parts[index]
                index += 1
        # Deleted files cannot be uploaded to Drive and have no local size.
        if status[0] == "D" or status[1] == "D":
            continue
        paths.append(value)
    return paths


def changed_paths(root: Path) -> list[str]:
    result = run_command(
        ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd=root
    )
    return parse_status_paths(result.stdout)


def collect_candidates(root: Path, requested: Sequence[str], all_changed: bool) -> list[Candidate]:
    values = list(requested)
    if all_changed or not values:
        values.extend(changed_paths(root))
        if "PROGRESS.md" not in values:
            values.append("PROGRESS.md")
    files: dict[str, Path] = {}
    for value in values:
        for path in expand_input_path(root, value):
            relative = path.relative_to(root).as_posix()
            if is_ignored(root, relative):
                raise PublishError(f"拒绝处理 .gitignore 忽略文件：{relative}")
            files[relative] = path
    candidates = [
        Candidate(path, relative, path.stat().st_size) for relative, path in sorted(files.items())
    ]
    return candidates


def scan_bytes(data: bytes, source: str) -> None:
    if SECRET_RE.search(data):
        raise PublishError(f"密钥正则命中，已中止发布：{source}")


def scan_local_candidates(candidates: Iterable[Candidate]) -> None:
    for candidate in candidates:
        with candidate.absolute.open("rb") as handle:
            # Keep the scan bounded even for a file just below the 50 MiB Git limit.
            tail = b""
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                data = tail + chunk
                scan_bytes(data, candidate.relative)
                tail = data[-128:]


def scan_cached_diff(root: Path) -> None:
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--binary"],
            cwd=str(root),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except FileNotFoundError as exc:
        raise PublishError("找不到 git 命令，无法扫描 git diff --cached。") from exc
    if result.returncode != 0:
        details = result.stderr.decode("utf-8", errors="replace").strip()
        raise PublishError(f"git diff --cached 扫描失败：{details}")
    scan_bytes(result.stdout, "git diff --cached")


def staged_reset_large(root: Path, large: Sequence[Candidate], *, dry_run: bool) -> None:
    if not large:
        return
    staged_result = run_command(["git", "diff", "--cached", "--name-only", "--"], cwd=root)
    staged = set(staged_result.stdout.splitlines())
    paths = [candidate.relative for candidate in large if candidate.relative in staged]
    if not paths:
        return
    command = ["git", "reset", "HEAD", "--", *paths]
    if dry_run:
        print(f"DRY-RUN {command_text(command)}  # >= 50MB files stay Drive-only")
    else:
        run_command(command, cwd=root)


def has_working_change(root: Path, relative: str) -> bool:
    result = run_command(["git", "status", "--porcelain", "--", relative], cwd=root)
    return bool(result.stdout.strip())


def publish_git(
    root: Path,
    identity: Identity,
    small: Sequence[Candidate],
    *,
    message: str,
    dry_run: bool,
    skip_git: bool,
) -> None:
    if skip_git:
        print("Git 发布已跳过（--skip-git）。")
        return
    paths = [candidate.relative for candidate in small if has_working_change(root, candidate.relative)]
    if not paths:
        print("没有需要提交到 Git 的小文件变更。")
        return
    prefix = f"[{identity.signature}]"
    commit_message = message.strip() or "publish changes"
    if not commit_message.startswith(prefix):
        commit_message = f"{prefix} {commit_message}"
    add = ["git", "add", "--", *paths]
    commit = ["git", "commit", "--only", "-m", commit_message, "--", *paths]
    push = ["git", "push", "origin", "main"]
    if dry_run:
        print(f"DRY-RUN {command_text(add)}")
        print("DRY-RUN security scan: git diff --cached")
        print(f"DRY-RUN {command_text(commit)}")
        print(f"DRY-RUN {command_text(push)}")
        return
    run_command(add, cwd=root)
    scan_cached_diff(root)
    run_command(commit, cwd=root)
    run_command(push, cwd=root)


def json_from_output(output: str) -> Any:
    """Decode JSON even when a CLI prefixes it with informational lines."""

    stripped = output.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for index, char in enumerate(stripped):
            if char not in "[{":
                continue
            try:
                value, _ = decoder.raw_decode(stripped[index:])
                return value
            except json.JSONDecodeError:
                continue
    return None


def records_from_json(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return []
    for key in ("files", "items", "entries", "results", "data"):
        nested = value.get(key)
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]
        if isinstance(nested, dict):
            records = records_from_json(nested)
            if records:
                return records
    if any(key in value for key in ("id", "name", "title", "fileId")):
        return [value]
    return []


def record_id(record: dict[str, Any]) -> str | None:
    for key in ("id", "fileId", "file_id", "ID"):
        value = record.get(key)
        if value:
            return str(value)
    return None


def record_name(record: dict[str, Any]) -> str | None:
    for key in ("name", "title", "filename", "fileName"):
        value = record.get(key)
        if value is not None:
            return str(value)
    return None


def record_is_folder(record: dict[str, Any]) -> bool:
    for key in ("isFolder", "is_folder", "folder"):
        if key in record and isinstance(record[key], bool):
            return record[key]
    values = [
        str(record.get(key, "")).lower()
        for key in ("mimeType", "mime_type", "type", "kind", "fileType")
    ]
    return any("folder" in value or "directory" in value for value in values)


def find_record(records: Sequence[dict[str, Any]], name: str, *, folder: bool | None) -> dict[str, Any] | None:
    matches = [record for record in records if record_name(record) == name]
    if folder is None:
        return matches[0] if matches else None
    for record in matches:
        if record_is_folder(record) == folder:
            return record
    return None


class DrivePublisher:
    def __init__(self, root: Path, drive_root: str, *, dry_run: bool) -> None:
        self.root = root
        self.drive_root = drive_root
        self.dry_run = dry_run
        self._ls_cache: dict[str, list[dict[str, Any]]] = {}
        self._folder_cache: dict[tuple[str, str], str] = {}

    def ensure_cli(self) -> None:
        # Let the required readonly ls call provide the actionable missing-CLI
        # error.  An extra --help call would make dry-runs and mocked CLIs noisy.
        return

    def ls(self, folder_id: str) -> list[dict[str, Any]]:
        if folder_id not in self._ls_cache:
            result = run_command(
                ["gdrive", "readonly", "ls", folder_id, "--max", "0", "--json"], cwd=self.root
            )
            self._ls_cache[folder_id] = records_from_json(json_from_output(result.stdout))
        return self._ls_cache[folder_id]

    def child_folder(self, parent_id: str, name: str) -> str:
        key = (parent_id, name)
        if key in self._folder_cache:
            return self._folder_cache[key]
        records = self.ls(parent_id)
        existing = find_record(records, name, folder=True)
        if existing:
            child_id = record_id(existing)
            if child_id:
                self._folder_cache[key] = child_id
                return child_id
        conflicting_file = find_record(records, name, folder=False)
        if conflicting_file:
            raise PublishError(f"Drive 路径冲突：{name} 已是文件，无法作为目录。")
        run_command(["gdrive", "mutate", "mkdir", name, "--parent", parent_id], cwd=self.root)
        # The contract requires a fresh ls after mkdir so the canonical ID is reused.
        self._ls_cache.pop(parent_id, None)
        records = self.ls(parent_id)
        created = find_record(records, name, folder=True)
        if not created or not record_id(created):
            raise PublishError(f"Drive mkdir 后找不到目录：{name}")
        child_id = record_id(created) or ""
        self._folder_cache[key] = child_id
        return child_id

    def sync_one(self, candidate: Candidate) -> None:
        if self.dry_run:
            print(
                f"DRY-RUN Drive: ensure download/{candidate.relative}; "
                "existing file IDs are updated in place"
            )
            return
        self.ensure_cli()
        parts = candidate.relative.split("/")
        parent_id = self.drive_root
        for part in parts[:-1]:
            parent_id = self.child_folder(parent_id, part)
        filename = parts[-1]
        records = self.ls(parent_id)
        existing = find_record(records, filename, folder=False)
        existing_id = record_id(existing) if existing else None
        local = str(candidate.absolute)
        if existing_id:
            run_command(
                ["gdrive", "mutate", "update", existing_id, local, "--json"], cwd=self.root
            )
        else:
            result = run_command(
                ["gdrive", "mutate", "upload", local, "--parent", parent_id, "--json"],
                cwd=self.root,
            )
            uploaded = records_from_json(json_from_output(result.stdout))
            created = find_record(uploaded, filename, folder=False)
            if created and record_id(created):
                records.append(created)
            else:
                self._ls_cache.pop(parent_id, None)

    def sync(self, candidates: Sequence[Candidate], *, skip_drive: bool) -> None:
        if skip_drive:
            print("Google Drive 发布已跳过（--skip-drive）。")
            return
        self.ensure_cli()
        for candidate in candidates:
            self.sync_one(candidate)


def load_pat_env() -> dict[str, str]:
    path = Path.home() / ".config" / "gh" / "pat.env"
    env = os.environ.copy()
    if not path.exists():
        return with_cli_path(env)
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        env[key] = value
    return with_cli_path(env)


def find_nested(value: Any, keys: set[str]) -> Any:
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in keys and item not in (None, ""):
                return item
        for item in value.values():
            found = find_nested(item, keys)
            if found not in (None, ""):
                return found
    elif isinstance(value, list):
        for item in value:
            found = find_nested(item, keys)
            if found not in (None, ""):
                return found
    return None


def export_state(value: Any) -> str | None:
    found = find_nested(value, {"state", "status"})
    return str(found).lower() if found is not None else None


def export_ref(value: Any) -> str | None:
    found = find_nested(
        value,
        {
            "branch",
            "branch_name",
            "export_branch",
            "ref",
            "reference",
            "git_ref",
            "sha",
            "commit_sha",
        },
    )
    return str(found) if found else None


def codespace_export(root: Path, name: str, *, dry_run: bool, poll_interval: float, timeout: float) -> None:
    env = load_pat_env()
    endpoint = f"user/codespaces/{name}/exports"
    if dry_run:
        print(f"DRY-RUN gh api -X POST {endpoint}")
        print(f"DRY-RUN poll export state until succeeded, then git fetch and squash merge")
        return
    response = run_command(["gh", "api", "-X", "POST", endpoint], cwd=root, env=env)
    payload = json_from_output(response.stdout)
    state = export_state(payload)
    if state is None and export_ref(payload):
        state = "succeeded"
    started = time.monotonic()
    while state not in {"succeeded", "success", "completed", "complete"}:
        if state in {"failed", "failure", "cancelled", "canceled", "error"}:
            raise PublishError(f"Codespaces 导出失败，状态：{state}")
        if time.monotonic() - started >= timeout:
            raise PublishError(f"Codespaces 导出轮询超时（{timeout:g}s）。")
        time.sleep(max(0.1, poll_interval))
        poll_target = find_nested(payload, {"status_url", "export_url", "url"}) or endpoint
        poll = run_command(["gh", "api", str(poll_target)], cwd=root, env=env)
        payload = json_from_output(poll.stdout)
        state = export_state(payload)
        # Some API versions return no state after a successful export but do return a ref.
        if state is None and export_ref(payload):
            state = "succeeded"
    ref = export_ref(payload)
    if not ref:
        raise PublishError("Codespaces 导出成功但响应中没有可 fetch 的分支或提交引用。")
    branch = run_command(["git", "symbolic-ref", "--short", "HEAD"], cwd=root).stdout.strip()
    if branch != "main":
        run_command(["git", "switch", "main"], cwd=root)
    run_command(["git", "fetch", "origin", ref], cwd=root)
    run_command(["git", "merge", "--squash", "FETCH_HEAD"], cwd=root)
    print(f"已将 Codespaces 导出 {ref} squash 合并到本地 main。")


def stop_codespace(root: Path, name: str, *, dry_run: bool) -> None:
    command = ["gh", "codespace", "stop", "--codespace", name]
    if dry_run:
        print(f"DRY-RUN {command_text(command)}")
        return
    run_command(command, cwd=root, env=load_pat_env())


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="将小文件发布到 GitHub main，并将全部文件同步到 Google Drive download。"
    )
    parser.add_argument("paths", nargs="*", help="要发布的文件或目录（默认无路径时使用全部变更）。")
    parser.add_argument("--root", help="Git 仓库根目录，默认由 git rev-parse 获取。")
    parser.add_argument("--drive-root", default=DEFAULT_DRIVE_ROOT, help="Drive download 根文件夹 ID。")
    parser.add_argument("--all-changed", action="store_true", help="使用 git status 变更/新增文件，并加入 PROGRESS.md。")
    parser.add_argument("--message", "-m", default="publish changes", help="Git commit message。")
    parser.add_argument("--dry-run", action="store_true", help="只打印计划，不 commit/push/Drive mutate。")
    parser.add_argument("--skip-git", action="store_true", help="跳过 git add/commit/push。")
    parser.add_argument("--skip-drive", action="store_true", help="跳过 Google Drive 同步。")
    parser.add_argument("--from-codespace", metavar="NAME", help="导出并 squash 合并指定 Codespace。")
    parser.add_argument("--stop-codespace", metavar="NAME", help="完成后调用 gh codespace stop。")
    parser.add_argument("--poll-interval", type=float, default=2.0, help=argparse.SUPPRESS)
    parser.add_argument("--timeout", type=float, default=600.0, help=argparse.SUPPRESS)
    return parser


def execute(args: argparse.Namespace) -> int:
    root = repo_root(args.root)
    identity = read_identity(root)
    print(f"身份核验通过：{identity.signature}")
    configure_git_identity(root, identity, dry_run=args.dry_run)

    if args.from_codespace:
        codespace_export(
            root,
            args.from_codespace,
            dry_run=args.dry_run,
            poll_interval=args.poll_interval,
            timeout=args.timeout,
        )

    run_integrity_verify(root)
    all_changed = args.all_changed or (not args.paths)
    candidates = collect_candidates(root, args.paths, all_changed)
    if not candidates:
        print("没有可发布的文件。")
        if args.stop_codespace:
            stop_codespace(root, args.stop_codespace, dry_run=args.dry_run)
        return 0

    small = [candidate for candidate in candidates if not candidate.is_large]
    large = [candidate for candidate in candidates if candidate.is_large]
    scan_local_candidates(small)
    if not args.skip_git:
        # Scan pre-existing staged content before adding anything new.
        scan_cached_diff(root)
    staged_reset_large(root, large, dry_run=args.dry_run)
    print(f"计划发布：小文件 {len(small)} 个（Git + Drive），大文件 {len(large)} 个（仅 Drive）。")
    for candidate in candidates:
        size_mb = candidate.size / (1024 * 1024)
        lane = "Drive-only" if candidate.is_large else "Git + Drive"
        print(f"  {lane}: {candidate.relative} ({size_mb:.2f} MiB)")

    publish_git(
        root,
        identity,
        small,
        message=args.message,
        dry_run=args.dry_run,
        skip_git=args.skip_git,
    )
    DrivePublisher(root, args.drive_root, dry_run=args.dry_run).sync(
        candidates, skip_drive=args.skip_drive
    )
    if args.stop_codespace:
        stop_codespace(root, args.stop_codespace, dry_run=args.dry_run)
    print("发布流程完成。" if not args.dry_run else "dry-run 计划完成，未执行 commit/push/Drive mutate。")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return execute(args)
    except PublishError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("ERROR: 已中断。", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
