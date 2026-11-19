#!/usr/bin/env python3
# 署名: PRO5C(crispinowilbourn@gmail.com)
"""Manage the six fixed Issue #7 slots using the monitor-state Contents API."""

from __future__ import annotations

import argparse
import base64
import binascii
import copy
import html
import json
import math
import os
import posixpath
import random
import re
import signal
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence

if __package__:
    from . import dual_publish as publish
else:
    import dual_publish as publish

REPO = "jian8111/d"
MONITOR_ISSUE_NUMBER = 7
MONITOR_COMMENT_IDS = {
    "PRO1V": 7013584882, "PRO2H": 7013585386, "PRO3J": 7013585792,
    "PRO4M": 7013586208, "PRO5C": 7013586711, "GC": 7013587156,
}
PRO_LABELS = {slot: f"{slot}({email})" for slot, email in publish.PRO_EMAILS.items()}
STATE_BRANCH = "monitor-state"
DEFAULT_CODESPACE = "ominous-waffle-gxpr99x65p743vwvp"
RETRIES = 8
STATUS_TEXT = {"running": "运行中", "idle": "空闲", "shutdown": "已关机"}
JSON_START = "<!-- MONITOR-JSON-START -->"
JSON_END = "<!-- MONITOR-JSON-END -->"
Slot = dict[str, Any]
Change = Callable[[Slot], None]


class MonitorError(RuntimeError):
    pass


class ApiError(MonitorError):
    def __init__(self, method: str, endpoint: str, detail: str):
        match = re.search(r"\bHTTP(?:/\d(?:\.\d)?)?\s+(\d{3})\b", detail, re.I)
        self.status = int(match[1]) if match else None
        self.conflict = self.status == 409 or bool(re.search(
            r"sha.{0,80}(?:mismatch|does not match|wasn't supplied|was not supplied|must be supplied)"
            r"|already exists|is at [0-9a-f]+ but expected", detail, re.I,
        ))
        self.restricted = (
            self.status in (403, 404) and not re.search(r"rate limit|abuse", detail, re.I)
            or bool(re.search(r"protected branch|branch protection|repository rule violations", detail, re.I))
        )
        super().__init__(f"GitHub {method} {endpoint} 失败（HTTP {self.status or '未知'}）。")


def warn(message: object) -> None:
    print(f"Warning: {publish.redact(str(message))}", file=sys.stderr)


def check_secret(text: str) -> None:
    if publish.TOKEN_RE.search(text):
        raise MonitorError("监控内容命中密钥规则，已中止写入。")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def seconds_between(start: str, end: str) -> int:
    try:
        first, last = (datetime.fromisoformat(v.replace("Z", "+00:00")) for v in (start, end))
        if first.tzinfo is None or last.tzinfo is None:
            raise ValueError
        return max(0, int((last - first).total_seconds()))
    except (AttributeError, ValueError, TypeError) as exc:
        raise MonitorError("槽位中存在无法解析的时间戳。") from exc


def current_agent(override: str | None) -> str:
    if override is not None and override not in PRO_LABELS:
        raise MonitorError("非法 Pro 槽位。")
    path = Path.home() / ".gemini" / "ACCOUNT_IDENTITY.txt"
    raw = path.read_text(encoding="utf-8").strip()
    keys = set(re.findall(r"\bPRO\d+[A-Z]\b", raw))
    if len(keys) != 1 or not keys.issubset(PRO_LABELS) or publish.DRIVE_EMAIL in raw:
        raise MonitorError("持久身份文件含有非法或不唯一的 Pro 身份。")
    key = keys.pop()
    emails = set(publish.EMAIL_RE.findall(raw))
    if emails and emails != {publish.PRO_EMAILS[key]}:
        raise MonitorError("持久身份文件中的邮箱与 Pro 身份不匹配。")
    return override or key


def api(method: str, endpoint: str, payload: dict | None = None) -> Any:
    command = ["gh", "api", "-X", method, f"repos/{REPO}/{endpoint}"]
    data = None
    if payload is not None:
        command.extend(["--input", "-"])
        data = json.dumps(payload, ensure_ascii=False)
        check_secret(data)
    try:
        result = subprocess.run(
            command, input=data, text=True, capture_output=True, timeout=30,
            env=publish.load_pat_env(),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise MonitorError(f"无法执行 gh api {method}（{type(exc).__name__}）。") from exc
    if result.returncode:
        raise ApiError(method, endpoint, result.stderr + "\n" + result.stdout)
    try:
        return json.loads(result.stdout)
    except ValueError as exc:
        raise MonitorError("GitHub 返回了无效的 JSON。") from exc


def empty_slot(slot: str) -> Slot:
    data = dict(schema=1, rev=0, slot=slot, kind="pro", label=slot,
                status="idle", active_tasks=[], last_done={}, updated_at=now())
    if slot == "GC":
        data.update(kind="codespace", status="shutdown", codespace=DEFAULT_CODESPACE,
                    web_url=f"https://{DEFAULT_CODESPACE}.github.dev", actor="", task="")
    else:
        data["label"] = publish.redact(PRO_LABELS[slot])
    return data


def decode_slot(slot: str, text: str, *, legacy: bool = False) -> Slot:
    check_secret(text)
    try:
        data = json.loads(text)
        if legacy and isinstance(data, dict):
            data.setdefault("rev", 0)
        if (data["schema"] != 1 or data["slot"] != slot or type(data["rev"]) is not int
                or data["rev"] < 0 or not isinstance(data["active_tasks"], list)
                or not isinstance(data["last_done"], (dict, type(None)))
                or data["status"] not in STATUS_TEXT):
            raise ValueError
        check_secret(json.dumps(data, ensure_ascii=False))
        return json.loads(publish.redact(json.dumps(data, ensure_ascii=False)))
    except (KeyError, TypeError, ValueError) as exc:
        raise MonitorError(f"{slot} 的槽位数据无效。") from exc


def marker(slot: str) -> str:
    return f"<!-- AGENT-MONITOR-SLOT:{slot} -->"


def parse_comment(slot: str, comment: dict) -> Slot:
    body = comment.get("body") or ""
    if not body.startswith(marker(slot)):
        raise MonitorError(f"{slot} 固定评论的槽位标记不匹配。")
    match = re.search(re.escape(JSON_START) + r"\s*```json\s*\n(.*?)\n```\s*"
                      + re.escape(JSON_END), body, re.S)
    if not match:
        raise MonitorError(f"{slot} 固定评论缺少监控 JSON。")
    return decode_slot(slot, match[1], legacy=True)


def list_all_slots() -> dict[str, Slot]:
    endpoint = f"issues/{MONITOR_ISSUE_NUMBER}/comments?per_page=100"
    by_id = {c["id"]: c for c in api("GET", endpoint)}
    missing = [slot for slot, cid in MONITOR_COMMENT_IDS.items() if cid not in by_id]
    if missing:
        raise MonitorError(f"看板缺少固定评论：{', '.join(missing)}。")
    return {slot: parse_comment(slot, by_id[cid]) for slot, cid in MONITOR_COMMENT_IDS.items()}


def read_comment(slot: str) -> Slot:
    return parse_comment(slot, api("GET", f"issues/comments/{MONITOR_COMMENT_IDS[slot]}"))


def read_file(slot: str) -> tuple[str | None, Slot | None]:
    try:
        entry = api("GET", f"contents/slots/{slot}.json?ref={STATE_BRANCH}")
    except ApiError as exc:
        if exc.status == 404:
            return None, None
        raise
    try:
        content = base64.b64decode(entry["content"]).decode("utf-8")
        sha = entry["sha"]
        if not sha:
            raise ValueError
    except (KeyError, TypeError, ValueError, binascii.Error) as exc:
        raise MonitorError(f"无法解码 {slot} 的 Contents API 响应。") from exc
    return sha, decode_slot(slot, content)


def md(value: str) -> str:
    value = html.escape(" ".join(value.split()))
    return re.sub(r"([\\`*_\[\]~|])", r"\\\1", value)


def render(data: Slot) -> str:
    slot, status = data["slot"], data["status"]
    lines = [marker(slot), f"### `{slot}` · {STATUS_TEXT[status]} (`{status}`)", ""]
    if slot == "GC":
        lines.append(f"- **Codespace** {md(data['codespace'])} · {md(data['actor'])} · {md(data['task'])}")
    tasks = data["active_tasks"]
    if tasks:
        for i, t in enumerate(tasks, 1):
            targets = ", ".join(t["targets"]) or "未指定"
            lines.extend([f"{i}. **{md(t['task'])}** · {md(t['executor'])}",
                          f"   - 占用文件 {md(targets)}",
                          f"   - 开始 {md(t['started_at'])} · 心跳 {md(t['heartbeat_at'])}"])
    else:
        last = data["last_done"]
        if last:
            lines.append(f"- **最近交付** {md(last['task'])} · {md(last['executor'])} · "
                         f"{md(last['status'])} · {md(last.get('commit') or '无提交')} · "
                         f"{md(last['finished_at'])}")
        else:
            lines.append("- 暂无交付记录")
    block = json.dumps(data, ensure_ascii=False, indent=2)
    block = block.replace("<", r"\u003c").replace(">", r"\u003e").replace("`", r"\u0060")
    body = "\n".join([*lines, "", JSON_START, "```json", block, "```", JSON_END])
    check_secret(body)
    return body


def changed(base: Slot, change: Change) -> Slot:
    data = copy.deepcopy(base)
    change(data)
    if data["kind"] == "pro":
        data["status"] = "running" if data["active_tasks"] else "idle"
    if data == base:
        return base
    data.update(rev=base["rev"] + 1, updated_at=now())
    return decode_slot(base["slot"], json.dumps(data, ensure_ascii=False))


def backoff(attempt: int) -> None:
    if attempt >= RETRIES:
        raise MonitorError(f"并发冲突在 {RETRIES} 次重试后仍未收敛。")
    time.sleep(random.uniform(0.25, 0.85))


def patch_comment(slot: str, data: Slot) -> None:
    api("PATCH", f"issues/comments/{MONITOR_COMMENT_IDS[slot]}", {"body": render(data)})


def mirror(slot: str, data: Slot) -> None:
    for attempt in range(RETRIES + 1):
        visible = read_comment(slot)
        if visible["rev"] <= data["rev"] and visible != data:
            patch_comment(slot, data)
        # Even a PATCH accepted after a newer writer's PATCH must repair its stale result.
        _, latest = read_file(slot)
        visible = read_comment(slot)
        if latest is None:
            raise MonitorError(f"{slot} 镜像核验时找不到状态文件。")
        if visible == latest or visible["rev"] > latest["rev"]:
            return
        data = latest
        backoff(attempt)


def comment_fallback(slot: str, change: Change, stored: Slot | None) -> Slot:
    warn(f"{slot} 状态分支受限，使用固定评论更新并读回核验。")
    for attempt in range(RETRIES + 1):
        current = read_comment(slot)
        if stored is not None and stored["rev"] > current["rev"]:
            base = stored
        else:
            base = current
        desired = changed(base, change)
        if desired == current:
            return current
        if read_comment(slot) == current:
            patch_comment(slot, desired)
            if read_comment(slot) == desired:
                return desired
        backoff(attempt)
        # A writer with branch permission may also have advanced the authoritative file.
        try:
            _, stored = read_file(slot)
        except ApiError as exc:
            if not exc.restricted:
                raise
    raise MonitorError("评论读回核验失败。")


def update_slot(slot: str, change: Change) -> Slot:
    for attempt in range(RETRIES + 1):
        try:
            sha, stored = read_file(slot)
        except ApiError as exc:
            if exc.restricted:
                return comment_fallback(slot, change, None)
            raise
        try:
            visible = read_comment(slot)
        except ApiError as exc:
            if exc.status != 404:
                raise
            visible = None
        # Import any newer, verified comment-only changes when branch access returns.
        base = stored
        if visible is not None and (base is None or visible["rev"] > base["rev"]):
            base = visible
        desired = changed(base or empty_slot(slot), change)
        if desired != stored:
            document = json.dumps(desired, ensure_ascii=False, indent=2) + "\n"
            check_secret(document)
            render(desired)  # Validate both wire formats before the first remote write.
            payload = {"branch": STATE_BRANCH, "message": f"monitor {slot} rev {desired['rev']}",
                       "content": base64.b64encode(document.encode()).decode("ascii")}
            if sha is not None:
                payload["sha"] = sha
            try:
                api("PUT", f"contents/slots/{slot}.json", payload)
            except ApiError as exc:
                if exc.restricted:
                    return comment_fallback(slot, change, stored)
                if exc.conflict:
                    backoff(attempt)
                    continue
                raise
        try:
            mirror(slot, desired)
        except MonitorError as exc:
            warn(f"{slot} 状态已保存，评论镜像待同步：{exc}")
        return desired
    raise MonitorError("状态更新失败。")


def target_list(values: str | Iterable[str]) -> list[str]:
    parts = values.split(",") if isinstance(values, str) else values
    return list(dict.fromkeys(posixpath.normpath(p.strip()) for p in parts if p.strip()))


def overlapping(requested: Sequence[str], occupied: Sequence[str]) -> list[str]:
    return [a for a in requested if any(
        a == b or a == "." or b == "." or a.startswith(b + "/") or b.startswith(a + "/")
        for b in occupied
    )]


def active_task(data: Slot, run_id: str) -> dict | None:
    return next((t for t in data["active_tasks"] if t["run_id"] == run_id), None)


def prune(data: Slot, age_sec: float, stamp: str) -> None:
    data["active_tasks"] = [t for t in data["active_tasks"]
                            if seconds_between(t["heartbeat_at"], stamp) < age_sec]


def start_task(slot: str, task: str, executor: str, targets: list[str], note: str,
               run_id: str, prune_hours: float = 6) -> Slot:
    stamp = now()
    entry = dict(run_id=run_id, task=task, executor=executor, targets=targets,
                 status="running", started_at=stamp, heartbeat_at=stamp, note=note)
    # A supplied ID must round-trip unchanged through the public slot representation.
    if not run_id.strip() or publish.redact(run_id) != run_id:
        raise MonitorError("run_id 为空或含凭证、邮箱。")

    def start(data: Slot) -> None:
        existing = active_task(data, run_id)
        if existing:
            if (existing["task"], existing["executor"], existing["targets"]) != (
                    publish.redact(task), publish.redact(executor),
                    [publish.redact(p) for p in targets]):
                raise MonitorError("该 run_id 已被另一项任务使用。")
            return
        if (data["last_done"] or {}).get("run_id") == run_id:
            raise MonitorError("该 run_id 已结束。")
        if prune_hours > 0:
            prune(data, prune_hours * 3600, stamp)
        data["active_tasks"].append(entry)

    saved = update_slot(slot, start)
    try:
        board = list_all_slots()
        # Include the committed local slot even if its mirror is temporarily behind.
        if board[slot]["rev"] < saved["rev"]:
            board[slot] = saved
        for other in PRO_LABELS:
            for t in board[other]["active_tasks"]:
                if other == slot and t["run_id"] == run_id:
                    continue
                if seconds_between(t["heartbeat_at"], stamp) < 1800:
                    common = overlapping(targets, target_list(t["targets"]))
                    if common:
                        warn(f"⚠️ 文件并发冲突预警 · {other} / {t['task']} · {', '.join(common)}")
    except MonitorError as exc:
        warn(f"任务已登记，读取全仓冲突看板失败：{exc}")
    return saved


def heartbeat(slot: str, run_id: str, note: str | None, targets: list[str] | None) -> Slot:
    def beat(data: Slot) -> None:
        t = active_task(data, run_id)
        if t is None:
            raise MonitorError("心跳对应的 run_id 未在运行。")
        t["heartbeat_at"] = now()
        if note is not None:
            t["note"] = note
        if targets is not None:
            t["targets"] = targets
    return update_slot(slot, beat)


def complete(data: Slot, run_id: str, status: str, commit: str, note: str | None,
             targets: list[str] | None) -> None:
    t = active_task(data, run_id)
    if t is None:
        last = data["last_done"] or {}
        if last.get("run_id") != run_id or last.get("status") != status:
            raise MonitorError("没有与该 run_id 对应的活跃任务。")
        # A publisher can attach the SHA after wrap has already closed the same run.
        if commit:
            last["commit"] = commit
        return
    stamp = now()
    data["active_tasks"].remove(t)
    data["last_done"] = dict(run_id=run_id, task=t["task"], executor=t["executor"],
                             status=status, commit=commit, targets=t["targets"] if targets is None else targets,
                             started_at=t["started_at"], finished_at=stamp,
                             duration_sec=seconds_between(t["started_at"], stamp),
                             note=t["note"] if note is None else note)


def finish_task(slot: str, run_id: str, status: str, commit: str = "",
                note: str | None = None, targets: list[str] | None = None) -> Slot:
    return update_slot(slot, lambda d: complete(d, run_id, status, commit, note, targets))


def clear_tasks(slot: str, run_id: str | None, stale: float | None, all_tasks: bool) -> Slot:
    def clear(data: Slot) -> None:
        if all_tasks:
            data["active_tasks"].clear()
        elif run_id is not None:
            data["active_tasks"] = [t for t in data["active_tasks"] if t["run_id"] != run_id]
        else:
            prune(data, (30 if stale is None else stale) * 60, now())
    return update_slot(slot, clear)


def record_publish_completion(agent: str, paths: Sequence[str], commit: str, *,
                              run_id: str | None = None, task: str | None = None,
                              message: str = "发布交付") -> Slot:
    if agent not in PRO_LABELS:
        raise MonitorError("非法发布身份。")
    if run_id is not None:
        return finish_task(agent, run_id, "done", commit)
    files = target_list(paths)
    # Pin the first decision across retries. A later run may claim the exact same files.
    selected: str | None = None
    decided = False
    delivery_id = uuid.uuid4().hex

    def record(data: Slot) -> None:
        nonlocal decided, selected
        tasks = data["active_tasks"]
        matches = [t for t in tasks if overlapping(files, target_list(t["targets"]))]
        if task:
            matches = [t for t in matches if t["task"] == task]
            if len(tasks) == 1 and tasks[0]["task"] == task:
                matches = tasks
        match = matches[0]["run_id"] if len(matches) == 1 else None
        if not decided:
            selected = match if tasks else delivery_id
            decided = True
        if selected is not None and selected == match:
            complete(data, selected, "done", commit, None, None)
        elif not tasks and selected == delivery_id:
            stamp = now()
            data["last_done"] = dict(run_id=delivery_id, task=task or message,
                                     executor="dual_publish.py", status="done", commit=commit,
                                     targets=files, started_at=stamp, finished_at=stamp,
                                     duration_sec=0, note="")

    saved = update_slot(agent, record)
    if (saved["last_done"] or {}).get("run_id") != selected or selected is None:
        warn("发布已完成，活跃任务缺少唯一匹配，已保留。")
    return saved


def update_gc_state(state: str, actor: str, *, task: str | None = None,
                    note: str | None = None, codespace: str | None = None, commit: str = "") -> Slot:
    if actor not in PRO_LABELS or state not in ("running", "shutdown"):
        raise MonitorError("非法 GC 状态或执行身份。")
    run_id = uuid.uuid4().hex

    def update(data: Slot) -> None:
        stamp = now()
        name = codespace or data["codespace"]
        label = task or (data["task"] if state == data["status"] and data["task"] else
                         ("Codespace 运行中" if state == "running" else "关机待命"))
        previous = data["active_tasks"][0] if data["active_tasks"] and data["codespace"] == name else {}
        entry = dict(run_id=previous.get("run_id", run_id), task=label, executor="GitHub Codespaces",
                     targets=[], status="running", started_at=previous.get("started_at", stamp),
                     heartbeat_at=stamp, note=previous.get("note", "") if note is None else note)
        data.update(status=state, actor=actor, task=label, codespace=name, label=f"GC ({name})",
                    web_url=f"https://{name}.github.dev", active_tasks=[entry])
        if state == "shutdown":
            complete(data, entry["run_id"], "shutdown", commit, note, None)
            data["last_done"]["actor"] = actor

    return update_slot("GC", update)


def show_board(board: dict[str, Slot]) -> None:
    stamp = now()
    print("槽位    状态     任务与占用文件")
    for slot, data in board.items():
        status = STATUS_TEXT[data["status"]]
        print(f"{slot:<7} {status}")
        for t in data["active_tasks"]:
            duration = seconds_between(t["started_at"], stamp)
            age = seconds_between(t["heartbeat_at"], stamp)
            print(f"        {t['task']} · {t['executor']} · {', '.join(t['targets']) or '未指定文件'}"
                  f" · 运行 {duration}s · 心跳 {age}s 前")
        if slot == "GC":
            print(f"        {data['codespace']} · {data['actor']} · {data['task']}")
        if not data["active_tasks"] and data["last_done"]:
            last = data["last_done"]
            print(f"        最近交付 {last['task']} · {last['status']} · {last.get('commit') or '无提交'}")


def wrap(slot: str, args: argparse.Namespace, targets: list[str]) -> int:
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        raise MonitorError("wrap 缺少 -- 后的子命令。")
    run_id = uuid.uuid4().hex
    stopped = threading.Event()
    child: subprocess.Popen | None = None
    received = 0
    deadline = 0.0

    def forward(signum: int) -> None:
        if child is not None and child.poll() is None:
            try:
                os.killpg(child.pid, signum)
            except ProcessLookupError:
                pass

    def on_signal(signum: int, _frame: Any) -> None:
        nonlocal received, deadline
        received = signum
        deadline = time.monotonic() + 5
        forward(signum)

    def keep_alive() -> None:
        while not stopped.wait(args.heartbeat_sec):
            try:
                heartbeat(slot, run_id, None, None)
            except Exception as exc:
                warn(f"心跳更新失败：{exc}")

    thread = threading.Thread(target=keep_alive, daemon=True)
    handlers = {sig: signal.signal(sig, on_signal) for sig in (signal.SIGINT, signal.SIGTERM)}
    code = 1
    registered = False
    try:
        start_task(slot, args.task, args.executor, targets, "", run_id)
        registered = True
        print(f"RUN_ID={run_id}", file=sys.stderr, flush=True)
        if received:
            code = 128 + received
        else:
            thread.start()
            child = subprocess.Popen(command, start_new_session=True)
            # A signal may have arrived while Popen was constructing the child.
            if received:
                forward(received)
            while True:
                try:
                    rc = child.wait(timeout=0.25)
                    code = 128 - rc if rc < 0 else rc
                    break
                except subprocess.TimeoutExpired:
                    if received and time.monotonic() >= deadline:
                        forward(signal.SIGKILL)
    except KeyboardInterrupt:
        code = 130
    except Exception as exc:
        if isinstance(exc, FileNotFoundError):
            code = 127
        elif isinstance(exc, PermissionError):
            code = 126
        warn(exc)
    finally:
        stopped.set()
        try:
            if child is not None and child.poll() is None:
                forward(signal.SIGTERM)
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    forward(signal.SIGKILL)
                    child.wait()
            if thread.is_alive():
                thread.join()
        finally:
            try:
                if registered:
                    finish_task(slot, run_id, "done" if code == 0 else "error",
                                note=f"退出码 {code}" if code else None)
            except Exception as exc:
                warn(f"任务收尾失败（run_id={run_id}）：{exc}")
            finally:
                for sig, handler in handlers.items():
                    signal.signal(sig, handler)
    return code


def interval(value: str) -> float:
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise argparse.ArgumentTypeError("时间间隔必须为有限非负数。")
    return number


def build_parser() -> argparse.ArgumentParser:
    parser = publish.PublicParser(description="1A Plus 并发任务监控 · Issue #7")
    parser.add_argument("--agent", choices=PRO_LABELS, help="指定 Pro 槽位，默认读取持久身份。")
    sub = parser.add_subparsers(dest="action", required=True)
    descriptions = {
        "start": "登记并发任务", "heartbeat": "刷新任务心跳", "done": "记录交付",
        "error": "记录失败", "wrap": "运行子命令并自动登记、续心跳和收尾",
        "clear": "清理活跃任务", "gc": "更新 Codespace 状态", "status": "读取六槽看板",
    }
    for action, description in descriptions.items():
        p = sub.add_parser(action, help=description)
        p.add_argument("--agent", choices=PRO_LABELS, default=argparse.SUPPRESS,
                       help=argparse.SUPPRESS)
        if action in ("start", "wrap"):
            p.add_argument("--task", required=True)
            p.add_argument("--executor", default="codex")
            p.add_argument("--targets", default="", help="逗号分隔的仓库相对路径。")
        if action in ("heartbeat", "done", "error"):
            p.add_argument("--run-id", required=True)
        if action in ("heartbeat", "done"):
            p.add_argument("--targets", help="替换占用路径。")
        if action in ("start", "heartbeat", "done", "error", "gc"):
            p.add_argument("--note")
        if action in ("done", "error"):
            p.add_argument("--commit", default="")
        if action in ("start", "status"):
            p.add_argument("--json", action="store_true")
        if action == "start":
            p.add_argument("--run-id")
            p.add_argument("--prune-hours", type=interval, default=6)
        elif action == "wrap":
            p.add_argument("--heartbeat-sec", type=interval, default=75)
            p.add_argument("command", nargs=argparse.REMAINDER)
        elif action == "clear":
            group = p.add_mutually_exclusive_group()
            group.add_argument("--run-id")
            group.add_argument("--stale", nargs="?", type=interval, const=30, metavar="MINUTES")
            group.add_argument("--all", action="store_true")
        elif action == "gc":
            p.add_argument("--state", choices=("running", "shutdown"), required=True)
            p.add_argument("--task")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.action == "status":
            board = list_all_slots()
            if args.json:
                print(json.dumps(board, ensure_ascii=False, indent=2))
            else:
                show_board(board)
            return 0
        slot = current_agent(args.agent)
        # Scan unmodified inputs too, including fields of an idempotent update.
        check_secret(json.dumps({k: v for k, v in vars(args).items() if k != "command"},
                                ensure_ascii=False))
        targets = target_list(args.targets) if getattr(args, "targets", None) is not None else None
        if args.action == "start":
            run_id = args.run_id if args.run_id is not None else uuid.uuid4().hex
            state = start_task(slot, args.task, args.executor, targets or [], args.note or "",
                               run_id, args.prune_hours)
            print(json.dumps({"run_id": run_id, "slot": slot, "rev": state["rev"]},
                             ensure_ascii=False) if args.json else f"RUN_ID={run_id}")
            return 0
        if args.action == "wrap":
            if args.heartbeat_sec <= 0:
                raise MonitorError("--heartbeat-sec 必须大于零。")
            return wrap(slot, args, targets or [])
        if args.action == "heartbeat":
            state = heartbeat(slot, args.run_id, args.note, targets)
        elif args.action in ("done", "error"):
            state = finish_task(slot, args.run_id, args.action, args.commit, args.note, targets)
        elif args.action == "clear":
            state = clear_tasks(slot, args.run_id, args.stale, args.all)
        else:
            state = update_gc_state(args.state, slot, task=args.task, note=args.note)
        print(f"{state['slot']} · {STATUS_TEXT[state['status']]} · rev {state['rev']}")
        return 0
    except (MonitorError, OSError, ValueError) as exc:
        print(f"ERROR: {publish.redact(str(exc))}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
