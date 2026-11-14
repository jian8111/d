---
name: cursor-swarm-ui
description: Configure, theme, or troubleshoot the multi-cursor page-building animation (CursorSwarm) on index.html and swarm-demo.html. Use when modifying webpage cards, swarm cursor animations, palettes, or floating controls.
paths:
  - "*.html"
  - "assets/**/*"
icon: rocket
color: purple
---
<!-- 署名: PRO1V(valerie...@gmail.com) -->

# CursorSwarm Frontend Integration

This repository vendors `ZhengLinLei/cursor-swarm.js` (MIT License) locally at `assets/vendor/cursor-swarm/cursor-swarm.min.js` and exposes a shared UI controller at `assets/js/swarm-ui.js`.

## Key Files

- `assets/vendor/cursor-swarm/cursor-swarm.min.js`: Zero-dependency multi-cursor builder engine.
- `assets/js/swarm-ui.js`: Initializes the 5 themed `PRO1V`–`PRO5C` team cursors, optional Web Audio micro-clicks, and floating `data-cs-ignore` controls (`Replay`, `Reveal All`, speed `1x/2x/3x`, palette switcher).
- `index.html`: Gallery home page with automatic swarm build (non-deconstructing on scroll-up so visitors keep cards visible).
- `swarm-demo.html`: Interactive CursorSwarm playground & `.cursor/` + GitHub Pages architecture explorer.

## Markup Attributes

- `data-cs-ignore`: Skip element and all descendants (required on floating control bars).
- `data-cs="skip"` / `data-cs="none"`: Skip element itself while still animating children (`none`).
- `data-cs="frame|pop|type|words|media"`: Override automatic element build type detection.
- `data-cs-copy="true|false"` and `data-cs-relocate="true|false"`: Control duplicate card cloning (`⌘C`/`⌘V`) and out-of-place drag-to-home animation.
