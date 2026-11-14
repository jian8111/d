#!/usr/bin/env python3
# 署名: PRO1V(valerie...@gmail.com)
"""Repository integrity verifier for jian8111/d Cursor Swarm & GitHub setup."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

MAX_GIT_FILE_BYTES = 50 * 1024 * 1024  # 50 MB per AGENTS.md rule 1
REQUIRED_ROOT_FILES = ["AGENTS.md", "PROGRESS.md", "SIGNATURES.md", "README.md", "index.html"]
CURSOR_JSON_FILES = [
    ".cursor/mcp.json",
    ".cursor/hooks.json",
    ".cursor/environment.json",
]


def extract_frontmatter(text: str) -> dict[str, str] | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    block = text[4:end]
    data: dict[str, str] = {}
    for line in block.splitlines():
        if ":" in line and not line.lstrip().startswith("-"):
            key, val = line.split(":", 1)
            data[key.strip()] = val.strip().strip('"').strip("'")
    return data


def check_file_sizes(root: Path, errors: list[str]) -> int:
    count = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in {".git", "node_modules", "__pycache__"}]
        for name in filenames:
            path = Path(dirpath) / name
            count += 1
            size = path.stat().st_size
            if size >= MAX_GIT_FILE_BYTES:
                rel = path.relative_to(root)
                errors.append(
                    f"[SIZE >= 50MB] {rel} is {size / (1024 * 1024):.2f} MB; "
                    "AGENTS.md rule 1 forbids pushing >=50MB files to Git."
                )
    return count


def check_cursor_configs(root: Path, errors: list[str], warnings: list[str]) -> None:
    for rel in CURSOR_JSON_FILES:
        path = root / rel
        if not path.exists():
            errors.append(f"[MISSING] {rel}")
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"[INVALID JSON] {rel}: {exc}")
            continue
        if rel == ".cursor/mcp.json" and "mcpServers" not in data:
            errors.append("[SCHEMA] .cursor/mcp.json missing top-level 'mcpServers' key")
        if rel == ".cursor/hooks.json" and data.get("version") != 1:
            errors.append("[SCHEMA] .cursor/hooks.json must set integer 'version': 1")

    rules_dir = root / ".cursor" / "rules"
    if not rules_dir.exists():
        errors.append("[MISSING] .cursor/rules directory")
    else:
        for mdc in sorted(rules_dir.glob("*.mdc")):
            fm = extract_frontmatter(mdc.read_text(encoding="utf-8"))
            if fm is None or "description" not in fm:
                errors.append(f"[FRONTMATTER] {mdc.relative_to(root)} missing valid YAML frontmatter/description")

    skills_dir = root / ".cursor" / "skills"
    if not skills_dir.exists():
        errors.append("[MISSING] .cursor/skills directory")
    else:
        for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
            fm = extract_frontmatter(skill_md.read_text(encoding="utf-8"))
            parent_name = skill_md.parent.name
            if fm is None:
                errors.append(f"[FRONTMATTER] {skill_md.relative_to(root)} missing YAML frontmatter")
                continue
            if fm.get("name") != parent_name:
                errors.append(
                    f"[SKILL NAME] {skill_md.relative_to(root)} name={fm.get('name')!r} "
                    f"must match parent folder {parent_name!r}"
                )
            if not fm.get("description"):
                errors.append(f"[SKILL DESC] {skill_md.relative_to(root)} missing description")

    agents_dir = root / ".cursor" / "agents"
    if not agents_dir.exists():
        errors.append("[MISSING] .cursor/agents directory")
    else:
        for agent_md in sorted(agents_dir.glob("*.md")):
            fm = extract_frontmatter(agent_md.read_text(encoding="utf-8"))
            if fm is None or not fm.get("name") or not fm.get("description"):
                errors.append(f"[AGENT] {agent_md.relative_to(root)} missing name/description frontmatter")

    hook_script = root / ".cursor" / "hooks" / "swarm-guard.py"
    if hook_script.exists() and not os.access(hook_script, os.X_OK):
        warnings.append(f"[PERMISSIONS] {hook_script.relative_to(root)} is not executable (+x)")


def check_web_and_svgs(root: Path, errors: list[str], warnings: list[str]) -> None:
    for svg in sorted(root.rglob("*.svg")):
        if ".git" in svg.parts:
            continue
        try:
            ET.parse(svg)
        except ET.ParseError as exc:
            errors.append(f"[SVG XML] {svg.relative_to(root)}: {exc}")

    attr_re = re.compile(r'(?:src|href)="([^"]+)"')
    for html in sorted(root.rglob("*.html")):
        if ".git" in html.parts:
            continue
        text = html.read_text(encoding="utf-8")
        if re.search(r'<script[^>]+src="https?://', text, re.IGNORECASE):
            warnings.append(f"[EXTERNAL SCRIPT] {html.relative_to(root)} loads remote <script> CDN")
        for match in attr_re.finditer(text):
            target = match.group(1)
            if (
                not target
                or target.startswith(("http://", "https://", "#", "mailto:", "data:", "javascript:"))
            ):
                continue
            clean = target.split("#", 1)[0].split("?", 1)[0]
            resolved = (html.parent / clean).resolve()
            if not resolved.exists():
                errors.append(f"[BROKEN LINK] {html.relative_to(root)} -> {target}")


def check_docs_and_workflows(root: Path, errors: list[str], warnings: list[str]) -> None:
    for rel in REQUIRED_ROOT_FILES:
        if not (root / rel).exists():
            errors.append(f"[MISSING] {rel}")

    workflows_dir = root / ".github" / "workflows"
    if not workflows_dir.exists() or not list(workflows_dir.glob("*.yml")):
        warnings.append("[WORKFLOWS] No .github/workflows/*.yml files found")

    if not (root / "assets" / "vendor" / "cursor-swarm" / "cursor-swarm.min.js").exists():
        errors.append("[MISSING] assets/vendor/cursor-swarm/cursor-swarm.min.js")


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify jian8111/d Swarm + Cursor + GitHub repo integrity.")
    parser.add_argument("--root", default=".", help="Repository root path")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    errors: list[str] = []
    warnings: list[str] = []

    file_count = check_file_sizes(root, errors)
    check_cursor_configs(root, errors, warnings)
    check_web_and_svgs(root, errors, warnings)
    check_docs_and_workflows(root, errors, warnings)

    print(f"Scanned {file_count} files under {root}")
    for w in warnings:
        print(f"WARN: {w}")
    for e in errors:
        print(f"ERROR: {e}")

    if errors or (args.strict and warnings):
        print(f"FAILED ({len(errors)} errors, {len(warnings)} warnings)")
        return 1
    print(f"PASS (0 errors, {len(warnings)} warnings)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
