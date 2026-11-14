<!-- 署名: PRO1V(valerie...@gmail.com / Drive绑定: 466788455@qq.com) -->
# AGENTS.md — 仓库与跨账号协作永久规则

本文件定义 GitHub 仓库 `jian8111/d` 与 Google Drive `download` 文件夹（ID: `1RyZ0U23cXeT2jyyPDFjX7NjfBAXOGejr`）的永久协作铁律，所有 Agent 执行任务时必须严格遵守：

1. **存档与防超限铁律**：代码和小于 50MB 的文件直接推送到 GitHub 仓库 `jian8111/d` 的 `main` 分支，同时保存到 Google Drive 的 `download` 文件夹；超过 50MB 的大文件只存进 `download`，严禁推入 Git 仓库。全程禁止弹窗询问提交方式。
2. **跨号交接进度**：每次任务结束或改动代码后，自动在 `download` 和仓库根目录更新 `PROGRESS.md`，简明记录已完成内容和下一步待办。收到“继续”指令时，先读取 `PROGRESS.md` 再接着做。
3. **云端环境规范**：当前容器无 sudo 权限，安装 Python 依赖统一用 `pip install --user`，前端依赖直接用 `npm install`。
4. **五账号统一双署名铁律（共 5 个 Pro 账号，按账号首字母编号为 PRO1V、PRO2H、PRO3J、PRO4M、PRO5C）**：
   - 每次执行任务前，先自动查询当前登录的 Google 账号/Drive 用户信息（或读取当前账号持久目录 `~/.gemini/ACCOUNT_IDENTITY.txt`）获取完整邮箱，按首字母匹配对应的 `PRO<序号><首字母>(<完整Google邮箱>)` 身份（例如 `PRO1V(valerie...@gmail.com)`、`PRO2H(hxxxx@gmail.com)`、`PRO3J(jxxxx@gmail.com)`、`PRO4M(mxxxx@gmail.com)`、`PRO5C(cxxxx@gmail.com)`）。
   - **Git 提交署名**：每次 `git commit` 前必须配置 `git config user.name "PRO<序号><首字母>"` 和 `git config user.email "<对应Google邮箱>"`，且 commit message 必须以 `[PRO<序号><首字母>(<对应Google邮箱>)]` 开头。
   - **Artifact 与进度署名**：所有生成的 Artifact 产物、代码文件头部注释以及 `PROGRESS.md` 的每次更新记录，末尾或标题处必须明确标注署名 `PRO<序号><首字母>(<对应Google邮箱>)`。

---
**维护与首次创建署名**：`PRO1V(valerie...@gmail.com / Drive实测返回: 466788455@qq.com)`
