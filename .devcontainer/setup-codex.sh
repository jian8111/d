#!/usr/bin/env bash
# 署名: PRO1V(valerie...@gmail.com)
# Codespaces postStartCommand: auto-install @openai/codex and write ~/.codex config from $YLS_API_KEY.
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

MISSING_PKGS=()
command -v codex >/dev/null 2>&1 || MISSING_PKGS+=("@openai/codex@latest")
command -v opencode >/dev/null 2>&1 || MISSING_PKGS+=("opencode-ai@latest")
if [ "${#MISSING_PKGS[@]}" -gt 0 ]; then
  if ! npm install -g "${MISSING_PKGS[@]}"; then
    mkdir -p "$HOME/.npm-global"
    npm config set prefix "$HOME/.npm-global"
    grep -q '.npm-global/bin' "$HOME/.bashrc" 2>/dev/null || echo 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    grep -q '.npm-global/bin' "$HOME/.profile" 2>/dev/null || echo 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"' >> "$HOME/.profile"
    export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"
    npm install -g "${MISSING_PKGS[@]}"
  fi
fi

mkdir -p "$HOME/.codex"
chmod 700 "$HOME/.codex"

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

def model_entry(name: str, effort: str = "xhigh") -> dict:
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
                "gpt-6.2-sol": model_entry("gpt-6.2-sol"),
                "gpt-6.2-astra": model_entry("gpt-6.2-astra"),
                "gpt-6.1-sol": model_entry("gpt-6.1-sol"),
                "gpt-6.1-terra": model_entry("gpt-6.1-terra"),
                "gpt-6-astra": model_entry("gpt-6-astra"),
                "grok-4.7": model_entry("grok-4.7"),
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
model_reasoning_effort = "xhigh"
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
    "sol": ("gpt-6.2-sol", "xhigh"),
    "astra": ("gpt-6.2-astra", "xhigh"),
    "gpt-6-2-sol": ("gpt-6.2-sol", "xhigh"),
    "gpt-6-2-astra": ("gpt-6.2-astra", "xhigh"),
    "gpt-6-1-sol": ("gpt-6.1-sol", "xhigh"),
    "terra": ("gpt-6.1-terra", "xhigh"),
    "gpt-6-astra": ("gpt-6-astra", "xhigh"),
    "grok": ("grok-4.7", "xhigh"),
}
for name, (model, effort) in profiles.items():
    p = codex_dir / f"{name}.config.toml"
    p.write_text(f'model = "{model}"\nmodel_reasoning_effort = "{effort}"\n', encoding="utf-8")
    os.chmod(p, 0o600)
PY

echo "[setup-codex] AI 开工前请先阅读 AGENTS.md 与 PROGRESS.md。"
echo "[setup-codex] Codex: $(command -v codex || echo 'not-on-path') | OpenCode: $(command -v opencode || echo 'not-on-path')"
