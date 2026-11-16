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

if ! command -v codex >/dev/null 2>&1; then
  if ! npm install -g @openai/codex@latest; then
    mkdir -p "$HOME/.npm-global"
    npm config set prefix "$HOME/.npm-global"
    grep -q '.npm-global/bin' "$HOME/.bashrc" 2>/dev/null || echo 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    grep -q '.npm-global/bin' "$HOME/.profile" 2>/dev/null || echo 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"' >> "$HOME/.profile"
    export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"
    npm install -g @openai/codex@latest
  fi
fi

mkdir -p "$HOME/.codex"
chmod 700 "$HOME/.codex"

if [ -n "${YLS_API_KEY:-}" ]; then
  python3 - <<'PY'
import json
import os

api_key = os.environ["YLS_API_KEY"].strip()
auth_path = os.path.expanduser("~/.codex/auth.json")
with open(auth_path, "w", encoding="utf-8") as f:
    json.dump({"OPENAI_API_KEY": api_key}, f)
    f.write("\n")
os.chmod(auth_path, 0o600)
PY
else
  echo "[setup-codex] Warning: YLS_API_KEY is not set; skipped writing ~/.codex/auth.json" >&2
fi

cat <<'EOF' > "$HOME/.codex/config.toml"
model_provider = "ylscode"
model = "gpt-6.1-sol"
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

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git fetch origin main --quiet || true
  if [ "$(git branch --show-current)" = "main" ] && [ -z "$(git status --porcelain)" ]; then
    git merge --ff-only origin/main --quiet || true
  fi
fi

echo "[setup-codex] AI 开工前请先阅读 AGENTS.md 与 PROGRESS.md。"
echo "[setup-codex] Codex configured: $(command -v codex || echo 'not-on-path')"
