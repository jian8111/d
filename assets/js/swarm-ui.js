/* 署名: PRO1V(valerie...@gmail.com) */
(function (global) {
  "use strict";

  const TEAM_AGENTS = [
    { name: "PRO1V", color: "#147d75", role: "layout" },
    { name: "PRO2H", color: "#e05a47", role: "type" },
    { name: "PRO3J", color: "#e69d24", role: "media" },
    { name: "PRO4M", color: "#2c6bed", role: "layout" },
    { name: "PRO5C", color: "#8e44ad", role: "type" }
  ];

  const PALETTE_PRESETS = {
    team: {
      colors: TEAM_AGENTS.map((a) => a.color),
      hud: {
        background: "rgba(23, 42, 54, 0.9)",
        color: "#f6f1e7",
        mute: "#9ec7c3",
        border: "rgba(123, 245, 233, 0.25)"
      }
    },
    neon: "neon",
    ocean: "ocean",
    sunset: "sunset",
    ink: "ink"
  };

  function createSoundEngine() {
    let ctx = null;
    let enabled = false;
    let lastTick = 0;

    function unlock() {
      if (ctx) {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        return;
      }
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }

    function playBuildTick(type) {
      if (!enabled || !ctx) return;
      const now = performance.now();
      if (now - lastTick < 55) return;
      lastTick = now;
      if (ctx.state === "suspended") return;

      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const freqMap = { frame: 420, pop: 680, type: 540, words: 510, media: 780 };
        osc.type = type === "media" ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freqMap[type] || 520, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.045);
        gain.gain.setValueAtTime(0.035, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.055);
      } catch (_) {
        // Ignore audio errors when context is blocked
      }
    }

    return {
      isEnabled: () => enabled,
      toggle: () => {
        enabled = !enabled;
        if (enabled) unlock();
        return enabled;
      },
      setEnabled: (val) => {
        enabled = Boolean(val);
        if (enabled) unlock();
      },
      tick: playBuildTick
    };
  }

  function mountGallerySwarm(userOpts) {
    if (typeof global.CursorSwarm !== "function") return null;

    if (!global.CursorSwarm.palettes.team) {
      global.CursorSwarm.palettes.team = PALETTE_PRESETS.team;
    }

    const sound = createSoundEngine();
    let currentSpeed = (userOpts && userOpts.speed) || 1.6;
    let currentPalette = (userOpts && userOpts.palette) || "team";
    let instance = null;

    const dock = document.createElement("aside");
    dock.className = "swarm-dock";
    dock.setAttribute("data-cs-ignore", "");
    dock.setAttribute("aria-label", "CursorSwarm 控制栏");

    dock.innerHTML = [
      '<span class="swarm-dock-badge"><i class="swarm-dock-dot"></i><span data-swarm-status>SWARM READY</span></span>',
      '<button type="button" class="swarm-btn-primary" data-swarm-reveal title="立即显示全部页面元素">⚡ 全显</button>',
      '<button type="button" data-swarm-replay title="重新播放多光标搭建动画">↻ 重播</button>',
      '<button type="button" data-swarm-speed title="切换搭建速度">1.6×</button>',
      '<select data-swarm-palette aria-label="切换光标配色">',
      '  <option value="team">Team 五色</option>',
      '  <option value="neon">Neon 霓虹</option>',
      '  <option value="ocean">Ocean 海洋</option>',
      '  <option value="sunset">Sunset 落日</option>',
      '  <option value="ink">Ink 墨色</option>',
      "</select>",
      '<button type="button" data-swarm-sound title="开启或关闭搭建音效">🔇 静音</button>',
      userOpts && userOpts.demoLink !== false
        ? '<a href="./swarm-demo.html" title="打开 CursorSwarm 实验室与配置总览">实验室 →</a>'
        : '<a href="./index.html" title="返回鹈鹕作品集首页">← 作品集</a>'
    ].join("");

    document.body.appendChild(dock);

    const statusEl = dock.querySelector("[data-swarm-status]");
    const revealBtn = dock.querySelector("[data-swarm-reveal]");
    const replayBtn = dock.querySelector("[data-swarm-replay]");
    const speedBtn = dock.querySelector("[data-swarm-speed]");
    const paletteSel = dock.querySelector("[data-swarm-palette]");
    const soundBtn = dock.querySelector("[data-swarm-sound]");

    function updateStatus(text) {
      if (statusEl) statusEl.textContent = text;
    }

    function bootSwarm() {
      if (instance) {
        try {
          instance.destroy();
        } catch (_) {}
      }

      const baseAgents = TEAM_AGENTS.map((a) => ({ name: a.name, role: a.role }));

      const opts = Object.assign(
        {
          cursors: 5,
          agents: baseAgents,
          names: TEAM_AGENTS.map((a) => a.name),
          palette: PALETTE_PRESETS[currentPalette] || currentPalette,
          startPosition: "corners",
          deconstruct: false,
          exitAfterBuild: "edge",
          idle: "dim",
          speed: currentSpeed,
          copyPaste: 0.4,
          relocation: 0.25,
          hud: true,
          hudPosition: "bottom-left",
          respectReducedMotion: true,
          onBuild: (_el, type) => {
            sound.tick(type);
            if (instance) {
              updateStatus("BUILDING " + Math.round(instance.progress * 100) + "%");
            }
          },
          onDone: () => updateStatus("SWARM DONE ✓")
        },
        userOpts || {}
      );

      instance = new global.CursorSwarm(opts).init();
      if (instance.state === "stopped") {
        updateStatus("REDUCED MOTION");
      } else {
        updateStatus("5 AGENTS ACTIVE");
      }
      return instance;
    }

    revealBtn.addEventListener("click", () => {
      if (instance) {
        instance.stop({ reveal: true });
        updateStatus("REVEALED ✓");
      }
    });

    replayBtn.addEventListener("click", () => {
      bootSwarm();
    });

    const speedSteps = [1, 1.6, 2.5, 3.5];
    speedBtn.addEventListener("click", () => {
      const idx = speedSteps.indexOf(currentSpeed);
      currentSpeed = speedSteps[(idx + 1) % speedSteps.length];
      speedBtn.textContent = currentSpeed + "×";
      if (instance && instance.state === "running") {
        instance.setSpeed(currentSpeed);
      }
    });

    paletteSel.value = currentPalette;
    paletteSel.addEventListener("change", () => {
      currentPalette = paletteSel.value;
      const preset = PALETTE_PRESETS[currentPalette] || currentPalette;
      if (instance && instance.state !== "destroyed") {
        instance.setPalette(preset);
      }
    });

    soundBtn.addEventListener("click", () => {
      const on = sound.toggle();
      soundBtn.textContent = on ? "🔊 音效" : "🔇 静音";
      soundBtn.classList.toggle("swarm-btn-active", on);
    });

    bootSwarm();

    return {
      getInstance: () => instance,
      replay: bootSwarm,
      reveal: () => {
        if (instance) instance.stop({ reveal: true });
      },
      sound
    };
  }

  global.SwarmGalleryUI = {
    TEAM_AGENTS: TEAM_AGENTS,
    PALETTE_PRESETS: PALETTE_PRESETS,
    createSoundEngine: createSoundEngine,
    mountGallerySwarm: mountGallerySwarm
  };
})(window);
