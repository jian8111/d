#!/usr/bin/env bash
# 署名: PRO5C(crispinowilbourn@gmail.com)
set -euo pipefail

usage() {
  printf '%s\n' '用法：scripts/setup_geosleuth.sh [--force] [--from-github] [--with-ml-cache] [--doctor] [--quiet]'
}

force=0
from_github=0
with_cache=${GEOSLEUTH_WITH_CACHE:-0}
doctor=0
quiet=0
while (($#)); do
  case "$1" in
    --force) force=1 ;;
    --from-github) from_github=1 ;;
    --with-ml-cache) with_cache=1 ;;
    --doctor) doctor=1 ;;
    --quiet) quiet=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf '未知参数：%s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

log() {
  if ((!quiet)); then
    printf '[setup-geosleuth] %s\n' "$*" >&2
  fi
}

skills_dir="$HOME/.agents/skills"
skill_dir="$skills_dir/geo-sleuth"
gdrive_cli=$(command -v gdrive || true)
if [[ -z "$gdrive_cli" && -x /opt/antigravity/bin/gdrive ]]; then
  gdrive_cli=/opt/antigravity/bin/gdrive
fi

work_dir=
stage_dir=
owned_archive=
cleanup() {
  if [[ -n "$owned_archive" ]]; then
    rm -f -- "$owned_archive"
  fi
  if [[ -n "$work_dir" ]]; then
    rm -rf -- "$work_dir"
  fi
  if [[ -n "$stage_dir" ]]; then
    if [[ ! -e "$skill_dir" && ! -L "$skill_dir" && ( -e "$stage_dir/previous" || -L "$stage_dir/previous" ) ]]; then
      mv -T -- "$stage_dir/previous" "$skill_dir" || return 1
    fi
    rm -rf -- "$stage_dir"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p -- "$skills_dir"
# Cursor may request installation while the Codespaces startup hook is running.
exec {skill_lock}<"$skills_dir"
flock -x "$skill_lock"

if ((force)) || [[ ! -f "$skill_dir/SKILL.md" ]]; then
  work_dir=$(mktemp -d /tmp/geo-sleuth.XXXXXXXX)
  stage_dir=$(mktemp -d "$skills_dir/.geo-sleuth.XXXXXXXX")
  source_dir=

  if ((!from_github)) && [[ -n "$gdrive_cli" ]]; then
    archive=/tmp/geo-sleuth-skill.tar.gz
    if [[ ! -e "$archive" && ! -L "$archive" ]] && (umask 077; set -C; : > "$archive") 2>/dev/null; then
      owned_archive=$archive
    else
      archive="$work_dir/geo-sleuth-skill.tar.gz"
    fi
    mkdir -- "$stage_dir/drive"
    log '从 Google Drive 下载技能包。'
    if "$gdrive_cli" readonly download 1tfopCesoGPB1JrJ5XxzFDoP4lx-KnZTP --out "$archive" >/dev/null \
      && tar -xzf "$archive" -C "$stage_dir/drive" \
      && [[ -f "$stage_dir/drive/geo-sleuth/SKILL.md" && ! -L "$stage_dir/drive/geo-sleuth" ]]; then
      source_dir="$stage_dir/drive/geo-sleuth"
    else
      log 'Drive 技能包不可用，改用 GitHub。'
    fi
  fi

  if [[ -z "$source_dir" ]]; then
    log '从 GitHub 克隆 Oldcircle/geo-sleuth。'
    git clone --depth 1 --quiet https://github.com/Oldcircle/geo-sleuth "$work_dir/repo"
    source_dir="$stage_dir/geo-sleuth"
    cp -a -- "$work_dir/repo/skills/geo-sleuth" "$source_dir"
    if [[ ! -f "$source_dir/SKILL.md" || -L "$source_dir" ]]; then
      printf '[setup-geosleuth] 上游技能目录缺少 SKILL.md。\n' >&2
      exit 1
    fi
  fi

  if [[ -e "$skill_dir" || -L "$skill_dir" ]]; then
    mv -T -- "$skill_dir" "$stage_dir/previous"
  fi
  mv -T -- "$source_dir" "$skill_dir"
  log "技能已安装到 $skill_dir。"
else
  log '技能已安装，更新软链接。'
fi

for alias_dir in "$HOME/.claude/skills" "$HOME/.config/opencode/skills" "$HOME/.gemini/skills" "$HOME/.copilot/skills"; do
  mkdir -p -- "$alias_dir"
  link="$alias_dir/geo-sleuth"
  if [[ -e "$link" && ! -L "$link" ]]; then
    printf '[setup-geosleuth] 软链接位置已被占用：%s\n' "$link" >&2
    exit 1
  fi
  ln -sfnT -- "$skill_dir" "$link"
done

if [[ "$with_cache" == 1 ]]; then
  cache_name=geo-sleuth-ml-cache.tar.gz
  if [[ -n "$gdrive_cli" ]]; then
    cache_id=$("$gdrive_cli" readonly ls 1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr --max 0 --json | python3 -B -c '
import json
import sys

for entry in json.load(sys.stdin):
    if entry.get("name") == sys.argv[1] and entry.get("id"):
        print(entry["id"])
        break
' "$cache_name")
    if [[ -n "$cache_id" ]]; then
      if [[ -z "$work_dir" ]]; then
        work_dir=$(mktemp -d /tmp/geo-sleuth.XXXXXXXX)
      fi
      log '从 Google Drive 下载模型缓存。'
      "$gdrive_cli" readonly download "$cache_id" --out "$work_dir/$cache_name" >/dev/null
      mkdir -p -- "$HOME/.cache"
      tar -xzf "$work_dir/$cache_name" -C "$HOME/.cache"
    else
      log "Drive 中还没有 $cache_name。"
    fi
  else
    log 'gdrive 不可用，跳过模型缓存。'
  fi
fi

cleanup
trap - EXIT
exec {skill_lock}<&-

if ((doctor)); then
  if command -v uv >/dev/null 2>&1; then
    uv run "$skill_dir/scripts/doctor.py"
  else
    log 'uv 不可用，跳过诊断。'
  fi
fi
