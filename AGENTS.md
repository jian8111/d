<!-- 署名: PRO1V(valerie...@gmail.com) -->
# AGENTS.md — 全云端协作架构、永久铁律与伊莉思Code API 接入规范

> [!IMPORTANT]
> 本文件定义 GitHub 仓库 `jian8111/d` 与 Google Drive `download` 文件夹（ID: `1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr`）的**系统架构背景、四大永久铁律**及**伊莉思Code API 自动初始化规范**。所有 Agent 每次开工前必须完整阅读并严格执行，全程禁止弹窗询问。

---

## 一、系统来龙去脉与“5 Pro + 1 Drive”架构

1. **彻底取代本地电脑**：用户已放弃本地电脑，全程通过手机远程指挥云端容器完成开发、数据生成与持久化存储。
2. **“5 个算力干活号 + 1 个纯网盘号”严格分工（共 6 个谷歌账号）**：
   - **5 个算力干活号（Google AI Pro）**：按账号首字母编号为 `PRO1V`、`PRO2H`、`PRO3J`、`PRO4M`、`PRO5C`。这 5 个账号负责登录 Antigravity 提供云端容器（每个容器约 **7.8GB 内存、Swap 为 0B、临时工作盘 19GB、无 `sudo` 权限**，用完即毁；严禁一次性将超大文件全读入内存导致 OOM）及模型算力执行任务。
   - **1 个纯网盘存储号（只做 Drive，绝不干活）**：`466788455@qq.com` 专门用于提供大容量 Google Drive 存储（内建共享根目录 `download`，ID: `1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr`）。上述 5 个 Pro 干活号在连接 Google Drive 时全部授权绑定了这同一个网盘号（相当于 5 台云端电脑共享同一块大硬盘）。
   - **身份识别红线**：该网盘号 **没有 Pro 算力，也不参与干活与轮换**。每次识别身份署名时，必须读取当前账号持久目录 `~/.gemini/ACCOUNT_IDENTITY.txt` 或识别当前登录 Antigravity 的 Pro 干活号（**仅限 `PRO1V`、`PRO2H`、`PRO3J`、`PRO4M`、`PRO5C` 五者之一**），**严禁把 `gdrive` 接口读取到的纯网盘存储号邮箱（`466788455@qq.com`）误当成干活账号署名**！
3. **双挂持久化存储**：5 个 Pro 干活号全部同时挂载了同一个 GitHub 仓库 `jian8111/d` 和这同一个网盘号下的 `download` 文件夹，实现代码与大文件双端持久化。

---

## 二、必须严格遵守的四大铁律

1. **轻重分离与双端存档**：
   - 代码、配置文件、文档及小于 50MB 的产物直接推送到 `jian8111/d` 的 `main` 分支，同时调用 `gdrive` 工具保存到云盘 `download` 文件夹（ID: `1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr`）。
   - 超过 50MB 的大文件（数据集、模型权重、大体积产物）**只存进 `download` 云盘，严禁推入 Git 仓库**。全程禁止弹窗询问提交方式。
2. **五号统一双署名**：
   - 每次开工前确认当前登录 Antigravity 的 Pro 干活号身份（仅限 `PRO1V`、`PRO2H`、`PRO3J`、`PRO4M`、`PRO5C`，排除纯网盘存储号 `466788455@qq.com`），读取 `~/.gemini/ACCOUNT_IDENTITY.txt` 获取对应 `PRO<序号><首字母>(<对应Pro邮箱>)`。
   - **Git 提交署名**：每次 `git commit` 前配置对应的 `git config user.name "PRO<序号><首字母>"` 和 `git config user.email "<对应Pro邮箱>"`，且 commit message 必须以 `[PRO<序号><首字母>(<对应Pro邮箱>)]` 开头。
   - **产物与进度署名**：所有生成的 Artifact 产物、代码文件头部注释及 `PROGRESS.md` 记录末尾/标题处必须明确标注该署名。
3. **跨号无缝交接**：
   - 每次任务结束或改动代码后，必须更新 `PROGRESS.md`（写明已完成内容、当前状态和下一步待办）并双端同步（GitHub `main` + 云盘 `download`）。
   - 收到“继续”指令时，先读取 `AGENTS.md` 和 `PROGRESS.md` 再接着做。
4. **无 `sudo` 环境规范**：
   - 安装 Python 包统一用 `pip install --user`（Debian 12 PEP 668 环境可加 `--break-system-packages` 或使用 venv）。
   - 安装 Node 全局包统一配置 `mkdir -p ~/.npm-global && npm config set prefix "$HOME/.npm-global" && export PATH="$HOME/.npm-global/bin:$PATH"`。

---

## 三、伊莉思Code API 双协议配置与云盘自动初始化规范

1. **密钥安全隔离**：
   - 仓库 `.gitignore` 必须持续包含 `*key*`、`.env`、`.codex` 和 `opencode.json`，**严禁将任何 API Key 或本机配置文件写入 Git 仓库**。
   - 统一凭证保存在 Google Drive `download/codex_key.txt`（文件 ID：`1_R2q1lI3KJIzmzGkDyYwqIXj84R8OohV`），包含 `OPENAI_API_KEY`、`OPENAI_COMPLETIONS_URL`、`OPENAI_CODEX_URL`、`OPENAI_BASE_URL` 与实测可用模型 `OPENAI_MODEL`。
2. **新容器自动拉取与初始化流程（每次容器重建后自动执行）**：
   - **Step A（免 sudo 安装 CLI 与 SDK）**：
     ```bash
     mkdir -p ~/.npm-global && npm config set prefix "$HOME/.npm-global"
     export PATH="$HOME/.npm-global/bin:$PATH"
     npm install -g @openai/codex@latest opencode-ai@latest
     pip install --user --break-system-packages openai
     ```
   - **Step B（从云盘读取密钥配置到 `/tmp`）**：
     ```bash
     gdrive readonly download 1_R2q1lI3KJIzmzGkDyYwqIXj84R8OohV --out /tmp/codex_key.txt
     ```
   - **Step C（生成 Codex CLI 配置 `~/.codex/auth.json` 与 `~/.codex/config.toml`）**：
     - `~/.codex/auth.json`：写入 `{"OPENAI_API_KEY": "<从codex_key.txt读取>"}`。
     - `~/.codex/config.toml`（注意顶层字段必须在 `[model_providers.ylscode]` 之前）：
       ```toml
       model_provider = "ylscode"
       model = "<OPENAI_MODEL，当前已验证: gpt-6.1-sol>"
       model_reasoning_effort = "high"
       approval_policy = "never"
       sandbox_mode = "danger-full-access"

       [model_providers.ylscode]
       name = "ylscode"
       base_url = "https://ylscode.com/codex" # 若超时可切换 https://code.ylsagi.com/codex
       wire_api = "responses"
       requires_openai_auth = true
       supports_websockets = false
       ```
   - **Step D（生成 OpenCode CLI 配置 `~/.config/opencode/opencode.json`）**：
     - 使用 `@ai-sdk/openai` 对接 `baseURL: "https://ylscode.com/codex"`（Responses 协议），配置模型列表后用 `opencode run --model ylsCode/gpt-6.1-sol "回复OK"` 验证。
3. **双协议实测状态与调用注意事项**：
   - **`/codex` 网关（`wire_api = "responses"`，已验证畅通）**：主用 `https://ylscode.com/codex`（备用 `https://code.ylsagi.com/codex`）。`GET /codex/v1/models` 返回当前开放的 9 个模型；Codex CLI、OpenCode（`@ai-sdk/openai`）及 Python `OpenAI(base_url="https://ylscode.com/codex/v1").responses.create(...)` 均可正常调用（实测 `gpt-6.1-sol` 验证通过）。
   - **`/v1` 网关（`openai-completions` 兼容地址）**：`OPENAI_COMPLETIONS_URL=https://ylscode.com/v1` 已归档在 `codex_key.txt`；当前实测 `ylscode.com/v1/*`、`code.ylsagi.com/v1/*` 与 `/codex/v1/chat/completions` 均返回 `404`（当前账户网关为 Responses 专用线路，如后续平台/密钥开通标准 `/v1/chat/completions` 或 67 模型线路时可直接按 `OPENAI_COMPLETIONS_URL` 切换调用）。

---
**维护与署名**：`PRO1V(valerie...@gmail.com)`
