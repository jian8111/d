# d

鹈鹕骑自行车（Pelican Riding a Bicycle）SVG / HTML 多版本对比与归档仓库。

## 目录结构

```text
.
├── README.md
├── index.html          # 作品总览导航页（汇总各版本预览与直达入口）
├── pro2/
│   ├── README.md
│   ├── index.html      # Pro2 交互式 HTML + 内联 SVG 版
│   └── pelican.svg     # Pro2 独立 SVG 文件
├── pro3/
│   ├── README.md
│   ├── pelican.html    # Pro3 交互式 HTML + 内联 SVG 版（含双连杆 IK 实时踩踏、调速、晨光/落日切换、Web Audio 车铃与导出 SVG）
│   └── pelican.svg     # Pro3 独立纯矢量 SVG 源文件
└── pro4/
    ├── README.md
    ├── index.html      # Pro4 交互式 HTML + 内联 SVG 版（含双连杆 IK、昼夜三光影切换、防滑视差、Web Audio 车铃与导出当前帧 SVG）
    ├── styles.css      # 海岸纸张质感原生样式表
    ├── app.js          # 双连杆 IK、齿轮同步与交互逻辑
    └── pelican-bicycle.svg # Pro4 独立纯矢量 SVG 源文件
```

## 本地预览

直接用浏览器打开根目录 [`index.html`](./index.html) 即可浏览全部版本，或直接访问 [`pro4/index.html`](./pro4/index.html) / [`pro3/pelican.html`](./pro3/pelican.html)。所有页面均为零外部依赖，支持离线运行。
