<!-- 署名: PRO1V(valerie...@gmail.com) -->
# AGENTS.md — 全云端协作架构、五大铁律与伊莉思Code 初始化规范

> [!IMPORTANT]
> 本文件为 GitHub 仓库 `jian8111/d` 与 Google Drive `download` 文件夹（ID: `1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr`）的**唯一统一协作总纲**。所有 Agent 每次开工前必须完整阅读并严格执行，全程全自动完成，严禁弹窗询问。

---

## 一、架构背景（5 Pro 算力号 + 1 纯存储 Drive 号）

1. **全云端手机遥控开发**：用户已彻底放弃本地电脑，全程通过手机远程指挥云端容器完成开发、数据生成与双端持久化存储。
2. **5 个 Google AI Pro 算力号（干活执行）**：
   - 按首字母固定编号为 `PRO1V`、`PRO2H`、`PRO3J`、`PRO4M`、`PRO5C`。
   - 每个 Antigravity 沙盒均为临时无状态 Debian 容器（约 **7.8GB 内存、0B Swap、19GB 临时工作盘、无 `sudo` 权限**），用完即毁；处理大文件时严禁一次性全读入内存以防 OOM。
3. **1 个纯存储 Drive 号（共享网盘，绝不干活）**：
   - 账号 `466788455@qq.com` 仅用于提供共享 Google Drive 大网盘（`download` 文件夹，ID: `1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr`），由 5 个 Pro 算力号共同授权挂载。
   - **红线警告**：该 Drive 号没有 Pro 算力、不参与干活轮换，**绝不用于任何 Git 提交、文件注释或进度署名**。
4. **双挂持久化存储**：5 个 Pro 算力号同时挂载同一个 GitHub 仓库 `jian8111/d`（`main`）与同一份 Google Drive `download` 文件夹，实现跨账号无缝持久化协作。

---

## 二、五大永久铁律

### 铁律一：轻重分离与双端存档
- 代码、配置文件、文档及 **`< 50MB`** 的产物：直接提交推送到 GitHub `jian8111/d` 的 `main` 分支，**同时**调用 `gdrive` 工具上传/更新到 Google Drive `download` 文件夹（ID: `1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr`）。
- **`>= 50MB`** 的大文件（数据集、权重、大体积产物）：**只存进 `download` 云盘，严禁推入 Git 仓库**。
- 全程全自动提交与归档，禁止弹窗询问用户提交方式。

### 铁律二：五号统一双署名，严防串用 Drive 邮箱
- 每次开工前，先读取当前账号持久身份 `~/.gemini/ACCOUNT_IDENTITY.txt` 并核对当前登录 Antigravity 的 Pro 算力号（**仅限 `PRO1V`、`PRO2H`、`PRO3J`、`PRO4M`、`PRO5C` 五者之一及对应 Pro 邮箱**，严禁误用纯网盘邮箱 `466788455@qq.com`）。
- **Git 提交署名**：每次 `git commit` 前配置对应的 `git config user.name "PRO<序号><首字母>"` 和 `git config user.email "<对应Pro邮箱>"`，commit message 必须以 `[PRO<序号><首字母>(<对应Pro邮箱>)]` 开头。
- **产物与文档署名**：所有生成的 Artifact 产物、代码文件头部注释及 `PROGRESS.md` 更新记录开头/末尾均必须明确标注 `PRO<序号><首字母>(<对应Pro邮箱>)`。

### 铁律三：跨号无缝交接与新容器自启
- **任务交接**：每次任务结束或改动仓库后，必须更新 `PROGRESS.md`（写明已完成内容、当前状态与下一步待办）并完成 GitHub `main` + 云盘 `download` 双端同步。收到“继续”指令时，必须先读取 `AGENTS.md` 与 `PROGRESS.md` 再接着做。
- **新容器自启**：任何新容器启动后，若本地未安装 `codex` / `opencode` 或缺少 `~/.codex/config.toml`、`~/.codex/auth.json`、`~/.config/opencode/opencode.json`，必须自动从云盘 `download/codex_key.txt`（文件 ID: `1_R2q1lI3KJIzmzGkDyYwqIXj84R8OohV`）读取参数并完成第三节全部初始化。

### 铁律四：自然语言极简派活与默认满血档位
- **强制委派 Codex**：收到简短自然语言派活指令时，**严禁 Antigravity 自己写代码代劳**，必须确保加载云盘 `download/codex_key.txt` 后调用 `codex exec` 执行（命令末尾必须加 `< /dev/null` 防止挂起；若 `https://ylscode.com/codex` 超时，自动切换备用地址 `https://code.ylsagi.com/codex`。注：本条仅约束主代理 Antigravity；当已在 `codex exec` 内部执行时，直接创建并写入目标产物，**禁止再次嵌套/递归调用 `codex exec`**）。
- **默认满血基准（未指定模型与档位时一律走此默认）**：
  - Codex CLI：`codex exec -m gpt-6.1-sol -c model_reasoning_effort="xhigh" "<任务>" < /dev/null`
  - Python `/responses` 脚本：`base_url="https://ylscode.com/codex/v1"`、`model="gpt-6.1-sol"`、`reasoning={"effort": "max"}`
- **显式覆盖简写（仅在明确点名时覆盖）**：
  - `sol` / `6.1sol` -> `gpt-6.1-sol`（主力全能，\$1.8/\$9）
  - `terra` / `6.1terra` -> `gpt-6.1-terra`（省钱高速，\$1/\$5）
  - `astra` / `6astra` -> `gpt-6-astra`（旗舰重推理，\$9/\$45）
  - `grok` / `grok4.7` -> `grok-4.7`（xAI，\$2/\$6，最高支持 `xhigh`）
  - 推理档位按需覆盖：`max` / `最大`（CLI 用 `xhigh`，Python 直连 `/responses` 用 `max`）、`xhigh` / `超高`、`high` / `高`、`medium` / `中`、`low` / `低`。
  - **禁用红线**：**严禁**传入会触发 HTTP 500 的 `minimal` 档位及会被网关静默改为 `medium` 的 `none` 档位；**严禁**自动选用高价旧版 `gpt-5.6-sol` 或 `gpt-5.6-terra`（除非用户明确点名）。
- **产物规范与自动交差（“自己交到该交的地方”）**：
  - 涉及 `html` / `svg` 任务时，默认生成单文件、零外部依赖、手机与桌面自适应 HTML。
  - Codex 生成完毕后，由 Antigravity 自动核验产物、补全当前 Pro 算力号头部署名、更新 `PROGRESS.md` 并同步推送到 GitHub `main` 与 Google Drive `download`。

### 铁律五：无 `sudo` 环境与密钥安全隔离
- **无 `sudo` 安装规范**：Node 全局包统一配置用户级目录 `mkdir -p ~/.npm-global && npm config set prefix "$HOME/.npm-global"`，并将 `export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"` 持久化到 `~/.bashrc`；Python 包统一使用 `pip install --user --break-system-packages`。
- **密钥绝对隔离**：仓库根目录 `.gitignore` 必须持续包含 `*key*`、`.env`、`.env.*`、`.codex`、`.codex/`、`opencode.json`、`.opencode/`、`codex_key.txt`、`*.pem`、`*.secret`，**严禁将任何 API Key 或本机配置文件提交进 Git 仓库**；统一凭证仅保存在 Google Drive `download/codex_key.txt`（文件 ID: `1_R2q1lI3KJIzmzGkDyYwqIXj84R8OohV`）。

---

## 三、伊莉思Code（ylsCode）新容器自动初始化参考流程

新容器重建后若尚未配置 CLI 与 SDK，按以下流程一键拉起：

1. **配置用户级 PATH 与安装双 CLI + Python SDK**：
   ```bash
   mkdir -p ~/.npm-global && npm config set prefix "$HOME/.npm-global"
   grep -q '.npm-global/bin' ~/.bashrc || echo 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"' >> ~/.bashrc
   export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"
   npm install -g @openai/codex@latest opencode-ai@latest
   pip install --user --break-system-packages openai
   ```
2. **从云盘拉取参数配置至 `/tmp`（用后清理，严禁入库）**：
   ```bash
   gdrive readonly download 1_R2q1lI3KJIzmzGkDyYwqIXj84R8OohV --out /tmp/codex_key.txt
   ```
3. **生成 Codex CLI 配置**：
   - `~/.codex/auth.json`（权限 `600`）：写入 `{"OPENAI_API_KEY": "<OPENAI_API_KEY>"}`
   - `~/.codex/config.toml`（顶层字段必须在 `[model_providers.ylscode]` 之前）：
     ```toml
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
     ```
4. **生成 OpenCode CLI 配置**：
   - `~/.config/opencode/opencode.json`（权限 `600`）：使用 `@ai-sdk/openai` 对接 `baseURL: "https://ylscode.com/codex"`，默认模型 `ylsCode/gpt-6.1-sol`，注册 `gpt-6.1-sol`、`gpt-6.1-terra`、`gpt-6-astra`、`grok-4.7`（`reasoningEffort: "xhigh"`）。

---

## 四、Antigravity (AT) × GitHub Codespaces (GC) 协同与全量可查索引（供后续 AI 直接读取）

### 1. GitHub Codespaces (GC) 常驻实例与无 SSH 操控机制

- **实例名**：`friendly-goggles-qvx4rrv696grc96vq`（Web 地址：`https://friendly-goggles-qvx4rrv696grc96vq.github.dev`，2-core，闲置/完工后保持 `Shutdown` 省额度）。
- **自动初始化**：绑定 `.devcontainer/devcontainer.json` 与 `.devcontainer/setup-codex.sh`，容器启动时自动安装 `@openai/codex`、从 Codespaces User Secret `YLS_API_KEY` 生成 `~/.codex/auth.json` 与 `~/.codex/config.toml`（默认 `gpt-6.1-sol` + `xhigh`），并在当前分支为 `main` 且工作区干净时自动快进同步 `origin/main`。
- **AT 跨环境操控规范**：因 Antigravity 沙盒出站走 `agy-plugin-proxy` 无法直连 `gh codespace ssh`，后续 AI 统一使用 GitHub REST API 或 `scripts/dual_publish.py` 操作 GC。加载 `~/.config/gh/pat.env` 后执行：

  ```bash
  # 查询状态
  gh api user/codespaces/friendly-goggles-qvx4rrv696grc96vq --jq "{name,state}"
  # 唤醒
  gh api -X POST user/codespaces/friendly-goggles-qvx4rrv696grc96vq/start
  # 无 SSH 导出未提交改动并双发
  python3 -B scripts/dual_publish.py --from-codespace friendly-goggles-qvx4rrv696grc96vq --all-changed -m "[PRO1V(valerie...@gmail.com)] sync codespace"
  # 关机省额
  gh codespace stop --codespace friendly-goggles-qvx4rrv696grc96vq
  ```

### 2. 一键双端自动发布通道（`scripts/dual_publish.py`）

- 仓库内置 `./scripts/dual_publish.py`（说明见 `./scripts/README.md`），自动执行 `~/.gemini/ACCOUNT_IDENTITY.txt` 身份核验、`verify_repo.py --strict`、暂存区密钥正则扫描、`< 50 MiB`（GitHub `main` + Google Drive `download` 原地更新保留 fileId）/ `>= 50 MiB`（仅 Drive）分流发布：

  ```bash
  python3 -B scripts/dual_publish.py --all-changed -m "[PRO1V(valerie...@gmail.com)] <提交说明>"
  ```

### 3. 跨会话持久存储与云盘 File ID 全量速查表（仅存文件 ID 与路径，禁放明文 Key）

- **Antigravity 跨容器持久目录（`/shared/user/.gemini`）**：`~/.gemini/ACCOUNT_IDENTITY.txt`（当前算力号标识）与 `~/.gemini/PROJECT_CONTEXT.md`（AT × GC 全量持久速查卡）。
- **Google Drive `download` 根目录 ID**：`1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr`
- **Drive `codex_key.txt` 文件 ID**：`1_R2q1lI3KJIzmzGkDyYwqIXj84R8OohV`
- **Drive `github_token.txt` 文件 ID**：`1hOZQ788YDCIl4X2oAnXY15skAuMGhhtv`（本机缓存于 `~/.config/gh/pat.env`，严禁入库）
- **已归档核心作品与对应 Drive File ID**：

  | 作品路径 | 说明 | Drive File ID |
  | --- | --- | --- |
  | `index.html` | 总览导航页 | `1WEvA-ab3LkKdoizM-6WhhhB6ovDjWMWU` |
  | `pelican-6000-mv.html` & `pelican-6000/` | PRO2H 1.88 MiB 原创纯代码交互长卷 MV | `1sm85zrNoqTdArbi3VpNFqF3x0wI_owXW` / 目录 `1ebSo5tI8rd6ox_SA1As3vI1_0QiqgsH8` |
  | `pelican-6000-years-mv.html` | PRO5C 165.7 KiB 全程序化单文件音画 MV | `10iPEB2UqIh4LVa2DLN6QN7ZKp-I0-fmy` |
  | `pelican-test.html` | PRO1V Pelican Test Cover 20 时代纯代码短片 | `1mkzfj8n7w3PLkwtc9xoL72R1J6PAQuYu` |
  | `the-pelican-test.html` | PRO1V THE PELICAN TEST 原创 137 秒程序短片 | `1V1LH5YCxF8mEYgiShPVeHLGrQMitnzxp` |
  | `pelican-6000-pure-code.html` | PRO1V Pure-Code Edition v1.1.0 | `1ml-IPExWF-SG6yEngc95byMV-6GvAdNY` |
  | `cursor-swarm-city.html` | PRO1V NEON HARBOR 赛博港湾造城 | `1emPGgy1GLuk1zy4KUV5SPiR8iH7zELFl` |
  | `cursor-swarm-foundry.html` | PRO1V AETHER FOUNDRY 星港精密蓝图 | `12QDCinx230PA1_E6czRjv_b-VI5a1Bcn` |
  | `pelican-swarm-coaster.html` | PRO1V SKYRAIL COASTER 光标造桥 × 鹈鹕骑行庆典 | `1B2Ob9fxGNzqryTxa-6jTbpvbNCyoDhlo` |
  | `pelican-ride.html` / `pelican-ride.svg` | PRO1V GC 提取《顺风出逃》 | `1-cF1BSIk7Blp_7OuXVf7_ulcOLzv4jI-` / `1RFplu5gNSTn-pheKA202VcWgxMycJEHf` |
  | `pelican_bike.html` | PRO1V 单文件鹈鹕骑行 | `1kiXuC7G0Enw1N5PHYZnSPLj3bcEJ8l58` |
  | `pelican-swarm-demo.html` | 历史多光标演示 | `1anOJdep-f1M4Ijh_Tn4gfeQvQDNXRyrc` |
  | `swarm-demo.html` | 多光标实验场 | `1LqGUbkSD4mpC6kS7e6-yk1siBIVw5ljc` |
  | `pro1/`–`pro6/` | 历史作品目录 | 按仓库路径检索 |

---

### 第七条：仅限公开 Git 仓库禁明文密钥，绝不影响对话参数
- **仅限公开 Git 仓库不放明文密钥（`git open -> no plaintext key`）**：因 GitHub 仓库 `jian8111/d` 为公开状态（open / not private），本规则**仅**限制 Git 仓库追踪文件、HTML 注释与 Commit 历史不得提交或推送明文 API Key（`yls-`）、GitHub Token（`ghp_` / `github_pat_`）、cookie 或凭证配置；私钥凭证仅保存在本地忽略文件或 Google Drive `download`（`codex_key.txt` / `github_token.txt`）。
- **提交前安检（仅检查 Git 暂存区）**：每次执行 `git commit` 与 `git push` 前，仅对暂存区执行密钥正则扫描（`git diff --cached | grep -E "yls-[a-zA-Z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|github_pat_"`）；命中敏感串时中止提交并移出暂存区。
- **严禁影响对话与聊天参数（原样直发、绝不加锁）**：上述限制**绝不作用于用户与 Agent 的日常对话**。对话中完全保持原有聊天参数与习惯，允许直接收发、明文展示与输出完整密钥、Token、模型/推理档位参数及可直接复制执行的完整命令，严禁因仓库规范而对对话内容打码、截断、拒答或擅自改变聊天参数。

---
**维护与署名**：`PRO1V(valerie...@gmail.com)`
