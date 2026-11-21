#!/usr/bin/env bash
# 署名: PRO1V(valerie...@gmail.com) | 更新: PRO2H(hadcockulloa@gmail.com)
# Codespaces postStartCommand: auto-install/update @openai/codex & opencode-ai and write ~/.codex + opencode configs from $YLS_API_KEY.
set -euo pipefail

set +u
if [ -s /usr/local/share/nvm/nvm.sh ]; then
  # Ensure Node.js and npm from devcontainers/universal are on PATH in non-interactive shells.
  # shellcheck disable=SC1091
  . /usr/local/share/nvm/nvm.sh || true
fi
set -u

if [ -d /usr/local/share/nvm/current/bin ]; then
  export PATH="/usr/local/share/nvm/current/bin:$PATH"
fi

export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"

if [ -z "${SETUP_CODEX_REEXEC:-}" ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git fetch origin main --quiet || true
  if [ "$(git branch --show-current)" = "main" ] && [ -z "$(git status --porcelain)" ]; then
    OLD_REV="$(git rev-parse HEAD 2>/dev/null || true)"
    git merge --ff-only origin/main --quiet || true
    NEW_REV="$(git rev-parse HEAD 2>/dev/null || true)"
    if [ -n "$OLD_REV" ] && [ "$OLD_REV" != "$NEW_REV" ] && [ -f ".devcontainer/setup-codex.sh" ]; then
      export SETUP_CODEX_REEXEC=1
      exec bash .devcontainer/setup-codex.sh
    fi
  fi
fi

mkdir -p "$HOME/.codex"
chmod 700 "$HOME/.codex"

CURRENT_REV="$(git rev-parse HEAD 2>/dev/null || echo 'no-git')"
STAMP_FILE="$HOME/.codex/.setup-rev"
PREV_REV="$(cat "$STAMP_FILE" 2>/dev/null || true)"

NEED_INSTALL=0
command -v codex >/dev/null 2>&1 || NEED_INSTALL=1
command -v opencode >/dev/null 2>&1 || NEED_INSTALL=1
if [ "$NEED_INSTALL" -eq 1 ] || [ -n "${SETUP_CODEX_REEXEC:-}" ] || [ "${SETUP_CODEX_UPDATE:-0}" = "1" ] || [ "$PREV_REV" != "$CURRENT_REV" ]; then
  PKGS=("@openai/codex@latest" "opencode-ai@latest")
  if ! npm install -g "${PKGS[@]}"; then
    mkdir -p "$HOME/.npm-global"
    npm config set prefix "$HOME/.npm-global"
    grep -q '.npm-global/bin' "$HOME/.bashrc" 2>/dev/null || echo 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    grep -q '.npm-global/bin' "$HOME/.profile" 2>/dev/null || echo 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"' >> "$HOME/.profile"
    export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"
    if ! npm install -g "${PKGS[@]}"; then
      if ! command -v codex >/dev/null 2>&1; then
        echo "[setup-codex] Error: failed to install @openai/codex" >&2
        exit 1
      fi
      echo "[setup-codex] Warning: npm update failed; keeping existing installed CLIs." >&2
    fi
  fi
  printf '%s\n' "$CURRENT_REV" > "$STAMP_FILE"
fi

if [ -n "${YLS_API_KEY:-}" ]; then
  python3 - <<'PY'
import json
import os
from pathlib import Path

api_key = os.environ["YLS_API_KEY"].strip()
auth_path = Path.home() / ".codex" / "auth.json"
auth_path.write_text(json.dumps({"OPENAI_API_KEY": api_key}) + "\n", encoding="utf-8")
os.chmod(auth_path, 0o600)

opencode_dir = Path.home() / ".config" / "opencode"
opencode_dir.mkdir(parents=True, exist_ok=True)

def model_entry(name: str, effort: str = "max") -> dict:
    return {
        "name": name,
        "tool_call": True,
        "modalities": {"input": ["text", "image", "pdf"], "output": ["text"]},
        "options": {
            "include": ["reasoning.encrypted_content"],
            "reasoningEffort": effort,
            "reasoningSummary": "auto",
        },
    }

opencode_cfg = {
    "$schema": "https://opencode.ai/config.json",
    "model": "ylsCode/gpt-6.2-sol",
    "provider": {
        "ylsCode": {
            "npm": "@ai-sdk/openai",
            "name": "伊莉思Code",
            "options": {
                "apiKey": api_key,
                "baseURL": "https://ylscode.com/codex",
                "setCacheKey": True,
            },
            "models": {
                "gpt-6.2-sol": model_entry("gpt-6.2-sol", "max"),
                "gpt-6.2-astra": model_entry("gpt-6.2-astra", "max"),
                "gpt-6.1-sol": model_entry("gpt-6.1-sol", "max"),
                "gpt-6.1-terra": model_entry("gpt-6.1-terra", "max"),
                "gpt-6-astra": model_entry("gpt-6-astra", "max"),
                "grok-4.7": model_entry("grok-4.7", "xhigh"),
            },
        }
    },
}
oc_path = opencode_dir / "opencode.json"
oc_path.write_text(json.dumps(opencode_cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
os.chmod(oc_path, 0o600)
PY
else
  echo "[setup-codex] Warning: YLS_API_KEY is not set; skipped writing ~/.codex/auth.json and ~/.config/opencode/opencode.json" >&2
fi

cat <<'EOF' > "$HOME/.codex/config.toml"
model_provider = "ylscode"
model = "gpt-6.2-sol"
model_reasoning_effort = "max"
approval_policy = "never"
sandbox_mode = "danger-full-access"

[model_providers.ylscode]
name = "ylscode"
base_url = "https://ylscode.com/codex"
wire_api = "responses"
requires_openai_auth = true
supports_websockets = false
EOF
chmod 600 "$HOME/.codex/config.toml"

python3 - <<'PY'
import os
from pathlib import Path

codex_dir = Path.home() / ".codex"
profiles = {
    "sol": ("gpt-6.2-sol", "max"),
    "astra": ("gpt-6.2-astra", "max"),
    "gpt-6-2-sol": ("gpt-6.2-sol", "max"),
    "gpt-6-2-astra": ("gpt-6.2-astra", "max"),
    "gpt-6-1-sol": ("gpt-6.1-sol", "max"),
    "terra": ("gpt-6.1-terra", "max"),
    "gpt-6-astra": ("gpt-6-astra", "max"),
    "grok": ("grok-4.7", "xhigh"),
}
for name, (model, effort) in profiles.items():
    p = codex_dir / f"{name}.config.toml"
    p.write_text(f'model = "{model}"\nmodel_reasoning_effort = "{effort}"\n', encoding="utf-8")
    os.chmod(p, 0o600)
PY

echo "[setup-codex] AI 开工前请先阅读 AGENTS.md 与 PROGRESS.md。"
echo "[setup-codex] Codex: $(command -v codex || echo 'not-on-path') | OpenCode: $(command -v opencode || echo 'not-on-path')"
echo "[setup-codex] 写代码、改文件或调用 codex exec 前，干净工作区先 git pull --ff-only origin main，再用 scripts/agent_monitor.py start / wrap 打卡。"

if [ ! -f "$HOME/.agents/skills/geo-sleuth/SKILL.md" ] && [ -f scripts/setup_geosleuth.sh ]; then
  (bash scripts/setup_geosleuth.sh --quiet || true) </dev/null >/dev/null 2>&1 &
fi
