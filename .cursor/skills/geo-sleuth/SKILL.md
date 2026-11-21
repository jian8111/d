---
name: geo-sleuth
description: 用户请求照片定位、网络迷踪或 GeoSleuth 时，加载云盘托管的 GeoSleuth 技能并按其流程研判。
---

<!-- 署名: PRO5C(crispinowilbourn@gmail.com) -->

# GeoSleuth

1. 检查 `"$HOME/.agents/skills/geo-sleuth/SKILL.md"`。文件缺失时，在仓库根目录执行 `bash scripts/setup_geosleuth.sh`。
2. 读取 `"$HOME/.agents/skills/geo-sleuth/SKILL.md"`，按其中的流程执行。

- Antigravity（AT）无 `sudo`，约有 7.8 GB 内存和 19 GB 临时盘，代理对可访问域名有限制。AT 适合轻量线索分析、太阳位置与几何脚本，可加 `--no-rev` 跳过以图搜图。
- 完整联网以图搜图和使用 2.4 GB DINOv2/CLIP 模型处理图片推荐在 GitHub Codespaces（GC）`ominous-waffle-gxpr99x65p743vwvp` 执行。
- 复杂定位推演和多候选取舍时，搭配 `gpt-6.2-sol`（`max`）与 `gpt-6.2-astra`（`max`）交叉核验线索。
