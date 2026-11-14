---
name: swarm-verify
description: Verify repository health across HTML/SVG showcases, CursorSwarm frontend assets, .cursor config schemas, GitHub workflows, and AGENTS.md <50MB archive rules. Use before committing or after parallel swarm edits.
icon: shield
color: green
---
<!-- 署名: PRO1V(valerie...@gmail.com) -->

# Swarm Verify

Validate the entire `jian8111/d` workspace with deterministic checks before committing to GitHub `main` or syncing to Google Drive `download`.

## Usage

Run the verification script from the repository root:

```bash
python3 .cursor/skills/swarm-verify/scripts/verify_repo.py
```

Pass `--strict` to fail on any warning (e.g., missing signature headers or broken relative asset links):

```bash
python3 .cursor/skills/swarm-verify/scripts/verify_repo.py --strict
```

## What It Checks

1. **50 MB Archive Iron Rule (`AGENTS.md` #1)**: Flags any tracked or untracked non-`.git` file `>= 50 MB` that must go only to Google Drive `download` instead of Git.
2. **Cursor Config Validity**: Parses `.cursor/mcp.json`, `.cursor/hooks.json`, and `.cursor/environment.json` as strict JSON, and validates YAML frontmatter in `.cursor/rules/*.mdc`, `.cursor/skills/*/SKILL.md`, and `.cursor/agents/*.md`.
3. **Zero-CDN & Link Integrity**: Checks `index.html`, `swarm-demo.html`, and `pro1/`–`pro6/` HTML files for broken relative `href`/`src` links and verifies vendored `./assets/vendor/cursor-swarm/cursor-swarm.min.js` exists.
4. **SVG Well-Formedness**: Parses all `.svg` files as valid XML.
5. **Dual-Signature & Handoff Presence**: Confirms `AGENTS.md`, `PROGRESS.md`, and `SIGNATURES.md` exist and contain valid signature markers.
