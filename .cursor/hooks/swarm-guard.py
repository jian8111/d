#!/usr/bin/env python3
# 署名: PRO1V(valerie...@gmail.com)
"""Cursor hook script enforcing AGENTS.md safety guardrails for Swarm, size, & secrets."""

from __future__ import annotations

import fnmatch
import json
import os
import re
import subprocess
import sys
from pathlib import Path

MAX_GIT_FILE_BYTES = 50 * 1024 * 1024
SECRET_NAME_PATTERNS = (
    "*key*",
    ".env",
    ".env.*",
    "opencode.json",
    "codex_key.txt",
    "*.pem",
    "*.secret",
)
SECRET_DIR_NAMES = {".codex", ".opencode"}


def is_secret_path(rel_path: str) -> bool:
    parts = Path(rel_path).parts
    if any(p in SECRET_DIR_NAMES for p in parts):
        return True
    name = parts[-1] if parts else rel_path
    return any(fnmatch.fnmatch(name, pat) for pat in SECRET_NAME_PATTERNS)


def check_staged_secrets(cwd: Path) -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "diff", "--cached", "--name-only"],
            cwd=str(cwd),
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None
    for line in out.splitlines():
        rel = line.strip()
        if rel and is_secret_path(rel):
            return rel
    return None


def handle_before_shell(payload: dict) -> dict:
    cmd = str(payload.get("command") or "")
    if re.search(r"\bgit\s+push\b.*(?:\s--force\b|\s-f\b)", cmd) and re.search(
        r"\b(main|master)\b", cmd
    ):
        return {
            "permission": "deny",
            "user_message": "Blocked force-push to main/master per Cursor Swarm safety guard.",
            "agent_message": "Do not force-push to main/master; create a normal commit or feature branch.",
        }

    if re.search(r"\bgit\s+(?:commit|push)\b", cmd):
        cwd = Path(payload.get("cwd") or os.getcwd())
        staged_secret = check_staged_secrets(cwd)
        if staged_secret:
            return {
                "permission": "deny",
                "user_message": f"Blocked git commit/push: secret/config file {staged_secret} is isolated per AGENTS.md.",
                "agent_message": f"Unstage secret file {staged_secret}; never commit credentials or local CLI config.",
            }
        for dirpath, dirnames, filenames in os.walk(cwd):
            dirnames[:] = [d for d in dirnames if d not in {".git", "node_modules"}]
            for name in filenames:
                fpath = Path(dirpath) / name
                try:
                    size = fpath.stat().st_size
                except OSError:
                    continue
                if size >= MAX_GIT_FILE_BYTES:
                    rel = fpath.relative_to(cwd)
                    return {
                        "permission": "deny",
                        "user_message": f"Blocked git commit/push: {rel} is >= 50MB (AGENTS.md rule 1).",
                        "agent_message": (
                            f"File {rel} exceeds 50MB. Move it to Google Drive download folder "
                            "and remove/gitignore it before committing to Git."
                        ),
                    }

    return {"permission": "allow"}


def handle_subagent_start(_payload: dict) -> dict:
    return {"permission": "allow"}


def main() -> int:
    try:
        raw = sys.stdin.read().strip()
        payload = json.loads(raw) if raw else {}
    except Exception:
        print(json.dumps({"permission": "allow"}))
        return 0

    event = payload.get("hook_event_name", "")
    if event == "beforeShellExecution":
        result = handle_before_shell(payload)
    elif event == "subagentStart":
        result = handle_subagent_start(payload)
    else:
        result = {"permission": "allow"}

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
