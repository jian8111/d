<!-- 署名: PRO1V(valerie...@gmail.com) -->
# 双端发布渠道

`dual_publish.py` 将仓库变更按 `AGENTS.md` 的 50 MiB 规则发布：小于 50 MiB 的文件进入 GitHub `main` 并同步到 Google Drive `download`，大于等于 50 MiB 的文件只同步到 Drive。脚本只使用 Python 3 标准库，外部操作通过已登录的 `git`、`gdrive` 与 `gh` CLI 完成。

`resolve_cli(name)` 依次检查当前 PATH、`/opt/antigravity/bin`、`/usr/local/bin`、`~/.npm-global/bin` 和 `~/.local/bin`。运行子命令及加载 PAT 环境时会自动补入 `/opt/antigravity/bin`、`~/.local/bin`、`~/.npm-global/bin`，无需子壳预先配置这些 PATH。

## 快速使用

先在仓库根目录预览全部变更（无路径时也默认采用 `git status` 变更，并自动加入 `PROGRESS.md`）：

```bash
python3 scripts/dual_publish.py --dry-run
```

确认计划后发布：

```bash
python3 scripts/dual_publish.py --all-changed -m "docs: publish updates"
```

也可以只指定文件或目录：

```bash
python3 scripts/dual_publish.py scripts/dual_publish.py scripts/README.md
```

默认 Drive `download` 根目录 ID 是 `1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr`，可用 `--drive-root ID` 覆盖。`--skip-git` 和 `--skip-drive` 分别关闭一端；`--message/-m` 设置提交说明。`--dry-run` 不执行 `commit`、`push` 或任何 Drive `mutate` 操作。

## 身份、安全与 Drive 行为

脚本先读取 `~/.gemini/ACCOUNT_IDENTITY.txt`，只接受 `PRO1V`、`PRO2H`、`PRO3J`、`PRO4M`、`PRO5C`，再从 `SIGNATURES.md` 或内置映射解析 Pro 邮箱，并配置当前仓库的 Git 署名。纯 Drive 存储号 `466788455@qq.com` 永远会被拒绝。

发布前会运行：

```bash
python3 .cursor/skills/swarm-verify/scripts/verify_repo.py --strict
```

脚本只扫描将进入 Git 的小文件及 `git diff --cached`，检查 `yls-…`、`ghp_…` 和 `github_pat_…` 密钥模式；命中立即中止。所有路径都会经过 `.gitignore` 检查，`codex_key.txt`、`github_token.txt`、`.codex`、`.env` 等忽略内容不会上传或提交。

Drive 同步会逐级执行 `gdrive readonly ls <folder_id> --max 0 --json`，在本次运行内缓存目录列表与子目录 ID，批量发布复用缓存：已有目录复用，缺少目录先 `gdrive mutate mkdir`，清除父目录列表缓存后重新 `ls` 取得 ID；已有同名文件使用 `gdrive mutate update` 保留原 ID，否则使用 `gdrive mutate upload`。上传成功后补入返回的文件记录；响应缺少文件名或 ID 时清除父目录列表缓存，供下次查询刷新。

## Codespaces 无 SSH 联调

若需要从 Codespace 导出当前改动，脚本会读取 `~/.config/gh/pat.env`（存在时），调用导出 API、轮询至 `state=succeeded`，`git fetch` 后 squash 合并到本地 `main`，再继续上述双端发布：

```bash
python3 scripts/dual_publish.py --from-codespace NAME --all-changed -m "sync: codespace export"
```

完成后可加 `--stop-codespace NAME` 自动执行 `gh codespace stop`。导出、轮询、fetch、合并和停止操作在 `--dry-run` 下只打印计划。

## 自测

```bash
python3 -m py_compile scripts/dual_publish.py
python3 scripts/dual_publish.py --help
python3 scripts/dual_publish.py --dry-run
```

维护署名：`PRO1V(valerie...@gmail.com)`
