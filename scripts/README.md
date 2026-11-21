<!-- 署名: PRO1V(valerie...@gmail.com) -->
# 双端发布与 1A Plus 监控

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

脚本先读取 `~/.gemini/ACCOUNT_IDENTITY.txt`，只接受五个已登记的 Pro 身份，再从 `SIGNATURES.md` 或内置映射解析 Pro 邮箱并配置 Git 署名。纯 Drive 存储号不能用于发布。

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

## 1A Plus 监控

`agent_monitor.py status` 用一次 GitHub 请求读取 Issue #7 的六条固定评论。`status --json` 输出以槽位名为键的 JSON。写命令默认读取持久身份，可用 `--agent PRO5C` 指定 Pro 槽位。`--targets` 接受逗号分隔的仓库相对文件或目录，目录与其子文件视为重叠。

```bash
python3 scripts/agent_monitor.py status
python3 scripts/agent_monitor.py start --task "更新索引" --targets index.html --run-id index-42
python3 scripts/agent_monitor.py heartbeat --run-id index-42 --note "正在校对"
python3 scripts/agent_monitor.py done --run-id index-42 --commit abc1234
python3 scripts/agent_monitor.py wrap --task "检查发布脚本" --targets scripts -- python3 scripts/dual_publish.py --dry-run
```

`start` 输出 `RUN_ID`，支持 `--json`、`--executor`、`--note`，在五个 Pro 中检查近 30 分钟内的文件占用。默认清理本槽位 6 小时未续心跳的任务，`--prune-hours 0` 可关闭启动时清理。`heartbeat` 和 `done` 可通过 `--targets` 更新文件清单。失败用 `error --run-id ID`。`wrap` 实时透传子进程输出，每 75 秒续心跳，可用 `--heartbeat-sec` 调整。`clear --stale` 默认清理 30 分钟未续心跳的任务，也支持 `--stale 分钟`、`--run-id ID` 或 `--all`。`gc --state running|shutdown` 更新 GC 状态，可附 `--task`、`--note`。

每次更新从 `monitor-state` 的 `slots/<SLOT>.json` 读取 blob SHA 和 `rev`，按 SHA 提交。遇到写冲突，等待 0.25 至 0.85 秒后重读并重放当前操作，最多重试 8 次。成功后仅 PATCH 原评论，按 `rev` 检查并读回修复过时镜像。文件缺失时可从旧评论初始化。分支受限时，脚本会提示已回退到评论，并在写前复读、写后核验。GitHub 评论 PATCH 没有文档化的原子 CAS 保证，分支恢复后会接回更高版本。任务 JSON 和评论正文在写入前检查密钥，公开输出中的邮箱会脱敏。

## 并发发布

推送前先 `git fetch origin main`。远端有新提交时自动 `git pull --rebase origin main`，变基冲突会中止变基并列出冲突文件。推送遇到并发非快进拒绝时，最多重新同步并推送两次。

```bash
python3 scripts/dual_publish.py index.html --monitor-run-id index-42
python3 scripts/dual_publish.py --all-changed --monitor-task "更新索引"
```

`--monitor-run-id` 精确关闭任务并记录当前 HEAD 短 SHA。省略时按实际发布路径匹配，`--monitor-task` 可指定任务名。匹配有歧义时保留活跃任务，槽位空闲时只更新最近交付。自动附带的 `PROGRESS.md` 不作为匹配依据。使用 Codespaces 选项会同步 GC 槽位，监控故障只报 Warning。`--skip-monitor` 关闭监控联动，`--dry-run` 仅预览。

## GeoSleuth 安装

<!-- 署名: PRO5C(crispinowilbourn@gmail.com) -->

在仓库根目录运行以下命令。脚本优先从 Google Drive 获取 `geo-sleuth-skill.tar.gz`，Drive 不可用时浅克隆 GitHub 上游。技能安装到 `~/.agents/skills/geo-sleuth`，并为 Claude、OpenCode、Gemini 和 Copilot 建立软链接。

```bash
bash scripts/setup_geosleuth.sh
```

- `--force` 重新安装。已有 `SKILL.md` 时，默认只检查并更新软链接。
- `--from-github` 在需要安装技能时直接使用 GitHub。可与 `--force` 一起使用。
- `--with-ml-cache` 或 `GEOSLEUTH_WITH_CACHE=1` 查询 Drive 的 `download` 文件夹，找到 `geo-sleuth-ml-cache.tar.gz` 时下载并解压到 `~/.cache/`。缓存约 2.4 GB。
- `--doctor` 在 `uv` 可用时运行技能的 `scripts/doctor.py`。`--quiet` 隐藏常规安装日志，保留错误和显式诊断输出。

Codespaces 的启动脚本在技能缺失时后台运行 `bash scripts/setup_geosleuth.sh --quiet`。

## 自测

```bash
python3 -m py_compile scripts/agent_monitor.py scripts/dual_publish.py
python3 scripts/agent_monitor.py --help
python3 scripts/agent_monitor.py status
python3 scripts/dual_publish.py --help
python3 scripts/dual_publish.py --dry-run
```

维护署名：`PRO1V(valerie...@gmail.com)`
