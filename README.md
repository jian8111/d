<!-- 署名: PRO1V(valerie...@gmail.com) | 历史: PRO5C(crispinowilbourn@gmail.com), PRO2H(hadcockulloa@gmail.com), PRO4M(wilermccomber@gmail.com), PRO3J(saveljevsjill148@gmail.com) | 纯Drive存储号(非Pro): 466788455@qq.com -->
# d

鹈鹕骑自行车（Pelican Riding a Bicycle）SVG / HTML 多版本对比与归档仓库。

---

## ✍️ 五账号联合签名稿（置顶报到处）

> [!IMPORTANT]
> **请各位前往 [`SIGNATURES.md`](./SIGNATURES.md) 完成统一双署名报到！**
> **6 账号架构**：5 个 Pro 执行账号（`PRO1V`–`PRO5C`）共用第 6 个纯 Drive 存储号 **`466788455@qq.com`**（仅提供 Drive `download` 文件夹，**不提供 Pro**）；协作规则见 [`AGENTS.md`](./AGENTS.md)，交接进度见 [`PROGRESS.md`](./PROGRESS.md)。

| 账号编号 | 统一双署名 (`PRO<序号><首字母>(<完整Google邮箱>)`) | 负责目录 | 签名状态 | 入口 |
| :--- | :--- | :--- | :--- | :--- |
| `PRO1V` | `PRO1V(valerie...@gmail.com)` *(待补全完整 Gmail)* | `pro1/` | ✅ 已签名 (`2026-11-14`) | [查看签名](./SIGNATURES.md) |
| `PRO2H` | `PRO2H(hadcockulloa@gmail.com)` | `pro2/` | ✅ 已签名 (`2026-11-14`) | [查看签名](./SIGNATURES.md) |
| `PRO3J` | `PRO3J(saveljevsjill148@gmail.com)` | `pro3/` | ✅ 已签名 (`2026-11-14`) | [查看签名](./SIGNATURES.md) |
| `PRO4M` | `PRO4M(wilermccomber@gmail.com)` | `pro4/` | ✅ 已签名 (`2026-11-14`) | [查看签名](./SIGNATURES.md) |
| `PRO5C` | `PRO5C(crispinowilbourn@gmail.com)` | `pro5/` | ✅ 已签名 (`2026-11-14`) | [查看签名](./SIGNATURES.md) |

**快捷签名格式**（填入 [`SIGNATURES.md`](./SIGNATURES.md) 并同步更新上表）：
```markdown
- **`PRO<序号><首字母>(<完整Google邮箱>)`** — 报到签名｜Git Commit: `[PRO<序号><首字母>(<完整Google邮箱>)]`｜日期：`YYYY-MM-DD`｜留言：<一句话确认>
```

---

## 目录结构

```text
.
├── AGENTS.md                   # 仓库与跨账号协作永久规则（5 Pro + 1 Drive 架构与四大铁律）
├── PROGRESS.md                 # 跨号交接进度记录
├── SIGNATURES.md               # ✍️ 五账号联合签名稿 / 签到簿（置顶报到）
├── README.md
├── index.html                  # 作品总览导航页（集成 5 账号 CursorSwarm 多光标搭建动画与控制台）
├── pelican-swarm-demo.html     # CursorSwarm 队友双作（Pro1 × Pro6）演示 + 原创 7 层光标拼装鹈鹕 Demo
├── swarm-demo.html             # Cursor Swarm 多光标实验室与配置架构总览
├── .cursor/
│   ├── rules/                  # .mdc 协作规则、Swarm 编排规范、前端规则与 pstack 模型路由
│   ├── skills/                 # /swarm、/swarm-verify（含 verify_repo.py）与 /cursor-swarm-ui
│   ├── agents/                 # swarm-planner、swarm-worker、swarm-verifier、github-sync-reviewer
│   ├── hooks/                  # swarm-guard.py（防强推 main、50MB 防超限与密钥隔离守卫）
│   ├── hooks.json              # Cursor 生命周期 Hook 配置
│   ├── mcp.json                # GitHub / Playwright / Context7 MCP 服务配置
│   └── environment.json        # Cursor Cloud Agents 云端环境初始化配置
├── .github/workflows/
│   ├── pages.yml               # GitHub Pages 自动构建与发布工作流
│   ├── ci-verify.yml           # PR / Push 自动运行 verify_repo.py --strict
│   └── cursor-agent-swarm.yml  # Cursor CLI Agent Swarm CI 工作流（workflow_dispatch & /swarm）
├── assets/
│   ├── css/swarm-ui.css        # Swarm 控制台与横幅样式
│   ├── js/swarm-ui.js          # 5 账号多光标控制器与可选 Web Audio 音效
│   └── vendor/cursor-swarm/    # 本地托管 MIT 协议 cursor-swarm.min.js（零外部 CDN 依赖）
├── pro1/ ... pro6/             # 六个版本的「鹈鹕骑自行车」纯矢量 SVG & 交互 HTML 作品
```

## Cursor Swarm × GitHub 配置说明

1. **Cursor IDE / CLI 本地多智能体蜂群**：
   - 使用 Cursor 打开本仓库即自动加载 [`.cursor/rules/`](./.cursor/rules) 与 [`.cursor/agents/`](./.cursor/agents)。
   - 在 Agent 对话中输入 `/swarm <目标>`，主控代理会按互不冲突的目录切片派发 `swarm-worker` 并行开发，并调用 `swarm-verifier` 与 [`verify_repo.py`](./.cursor/skills/swarm-verify/scripts/verify_repo.py) 完成全量校验。
   - 如需在 MCP 中启用 GitHub Server，在本地导出 `GITHUB_PERSONAL_ACCESS_TOKEN` 环境变量即可（[`.cursor/mcp.json`](./.cursor/mcp.json) 使用 `${env:...}` 占位，不存放明文密钥）。
2. **GitHub Actions 与 GitHub Pages**：
   - **GitHub Pages**（[`.github/workflows/pages.yml`](./.github/workflows/pages.yml)）：在 GitHub 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**，推送 `main` 后即自动发布 `index.html`、`pelican-swarm-demo.html`、`swarm-demo.html` 与 `pro1/`–`pro6/`。
   - **Cursor Agent Swarm CI**（[`.github/workflows/cursor-agent-swarm.yml`](./.github/workflows/cursor-agent-swarm.yml)）：配置仓库 Secret 后可通过 `Actions → Cursor Agent Swarm CI` 手动触发，或在 Issue/PR 评论中输入 `/swarm <任务>` 自动开分支并发起 PR：
     ```bash
     gh secret set CURSOR_API_KEY --repo jian8111/d --body "$CURSOR_API_KEY"
     ```
3. **本地校验与预览**：
   - 运行校验：`python3 .cursor/skills/swarm-verify/scripts/verify_repo.py --strict`
   - 本地预览：直接打开 [`index.html`](./index.html)、[`pelican-swarm-demo.html`](./pelican-swarm-demo.html) 或 [`swarm-demo.html`](./swarm-demo.html)，或启动静态服务器 `python3 -m http.server 8787`。所有页面均为零外部依赖，支持离线运行。

---
**最近更新署名**：`PRO1V(valerie...@gmail.com)｜五号全员集结: PRO2H, PRO3J, PRO4M, PRO5C｜纯Drive存储号(非Pro): 466788455@qq.com`
