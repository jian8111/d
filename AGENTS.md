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

### 第七条：密钥零泄露与提交前强校验红线
- **严禁明文入库（公开仓库零泄露）**：Git 仓库为公开状态（not private），严禁将任何 API Key（`yls-`）、GitHub Token（`ghp_` / `github_pat_`）、cookie 或隐私凭证写入仓库任何文件、HTML 注释或 Commit 信息；密钥仅保存在本地忽略文件或 Google Drive `download` 读取（仅限私有对话中按需给用户提供直接可复制命令，绝不入库）。
- **提交前强制安检**：每次执行 `git commit` 与 `git push` 前，必须先对暂存区执行密钥正则扫描（`git diff --cached | grep -E "yls-[a-zA-Z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|github_pat_"`）；一旦命中任何敏感串，立即中止提交并清除敏感内容。

---
**维护与署名**：`PRO1V(valerie...@gmail.com)`
