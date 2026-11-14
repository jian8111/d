(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  // Mechanical constants matching SVG geometry
  const BBX = 535;
  const BBY = 538;
  const CRANK_R = 44;
  const CHAINRING_R = 31;
  const WHEEL_REAR = { x: 390, y: 526 };
  const WHEEL_FRONT = { x: 755, y: 526 };
  const WHEEL_R_PX = 104;
  const GEAR_RATIO = 28 / 13; // 28T chainring -> 13T rear cog
  const WHEEL_CIRC_M = 2.15; // realistic 700c touring tire circumference in meters
  const BASE_RPM = 54;
  const L1 = 118;
  const L2 = 154;
  const PARALLAX_PERIOD = 1440;

  // State
  let isPlaying = true;
  let speedMult = 1.0;
  let crankDeg = 58; // matches initial static SVG pose
  let wheelDeg = 0;
  let groundPx = 0;
  let cloudPx = 0;
  let distanceMeters = 0;
  let elapsedTime = 0;
  let bellPulseTime = -10;
  let currentMode = "morning";
  let lastTimestamp = null;
  let audioCtx = null;

  // DOM References
  const svg = document.getElementById("pelican-scene");
  const wheelRearEl = document.getElementById("wheel-rear");
  const wheelFrontEl = document.getElementById("wheel-front");
  const cranksetEl = document.getElementById("crankset");
  const chainLinksEl = document.getElementById("bike-chain-links");

  const crankNearArmEl = document.getElementById("crank-near-arm");
  const pedalNearEl = document.getElementById("pedal-near");
  const crankFarArmEl = document.getElementById("crank-far-arm");
  const pedalFarEl = document.getElementById("pedal-far");

  const farThighEl = document.getElementById("pelican-far-thigh");
  const farShankEl = document.getElementById("pelican-far-shank");
  const farShankHiEl = document.getElementById("pelican-far-shank-hi");
  const farFootEl = document.getElementById("pelican-far-foot");

  const nearThighEl = document.getElementById("pelican-near-thigh");
  const nearThighStrokeEl = document.getElementById("pelican-near-thigh-stroke");
  const nearShankEl = document.getElementById("pelican-near-shank");
  const nearShankHiEl = document.getElementById("pelican-near-shank-hi");
  const nearFootEl = document.getElementById("pelican-near-foot");

  const upperGroupEl = document.getElementById("pelican-upper-group");
  const headGroupEl = document.getElementById("pelican-head-group");
  const pouchEl = document.getElementById("pelican-pouch");
  const scarfEl = document.getElementById("pelican-scarf");
  const scarfTail1El = document.getElementById("scarf-tail-1");
  const scarfTail2El = document.getElementById("scarf-tail-2");
  const scarfStripesEl = document.getElementById("scarf-stripes");
  const gogglesEl = document.getElementById("pelican-goggles");
  const breezeLayerEl = document.getElementById("layer-breeze");
  const breezePaths = [
    document.getElementById("breeze-1"),
    document.getElementById("breeze-2"),
    document.getElementById("breeze-3"),
    document.getElementById("breeze-4"),
  ];

  const parallaxPostsEl = document.getElementById("parallax-posts");
  const parallaxPaversEl = document.getElementById("parallax-pavers");
  const parallaxDashesEl = document.getElementById("parallax-lane-dashes");
  const parallaxGrassEl = document.getElementById("parallax-grass");
  const cloudsLayerEl = document.getElementById("clouds-layer");
  const sailboatsEl = document.getElementById("sailboats-layer");
  const gullsEl = document.getElementById("gulls-group");
  const lighthouseBeamEl = document.getElementById("lighthouse-beam");
  const headlampBeamEl = document.getElementById("headlamp-beam");
  const bellWavesEl = document.getElementById("bell-waves");
  const bellHitEl = document.getElementById("bike-bell-hit");

  // Atmosphere layers
  const skyMorningEl = document.getElementById("sky-bg-morning");
  const skySunsetEl = document.getElementById("sky-bg-sunset");
  const skyNightEl = document.getElementById("sky-bg-night");
  const glowMorningEl = document.getElementById("glow-morning");
  const glowSunsetEl = document.getElementById("glow-sunset");
  const starsEl = document.getElementById("sky-stars");
  const sunEl = document.getElementById("celestial-sun");
  const sunDiscEl = document.getElementById("sun-disc");
  const sunHaloEl = document.getElementById("sun-halo");
  const moonEl = document.getElementById("celestial-moon");
  const oceanMorningEl = document.getElementById("ocean-bg-morning");
  const oceanSunsetEl = document.getElementById("ocean-bg-sunset");
  const oceanNightEl = document.getElementById("ocean-bg-night");
  const oceanShimmerEl = document.getElementById("ocean-shimmer");
  const roadNightTintEl = document.getElementById("road-night-tint");
  const groundShadowEl = document.getElementById("ground-shadow-main");

  // UI controls
  const btnTogglePlay = document.getElementById("btn-toggle-play");
  const playIconEl = document.getElementById("play-icon");
  const playLabelEl = document.getElementById("play-label");
  const btnBell = document.getElementById("btn-bell");
  const sliderSpeed = document.getElementById("slider-speed");
  const speedValueEl = document.getElementById("speed-value");
  const modeButtons = Array.from(document.querySelectorAll(".seg-btn"));
  const toggleScarf = document.getElementById("toggle-scarf");
  const toggleGoggles = document.getElementById("toggle-goggles");
  const toggleBreeze = document.getElementById("toggle-breeze");
  const btnDownloadSvg = document.getElementById("btn-download-svg");

  const metricSpeedEl = document.getElementById("metric-speed");
  const metricCadenceEl = document.getElementById("metric-cadence");
  const metricDistanceEl = document.getElementById("metric-distance");

  function createSvgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  function buildParallaxScenery() {
    // 1. Guardrail posts every 180px across 2880px (two seamless 1440px periods)
    for (let x = 65; x < PARALLAX_PERIOD * 2; x += 180) {
      parallaxPostsEl.appendChild(
        createSvgEl("rect", { x, y: 502, width: 10, height: 42, rx: 2 })
      );
    }

    // 2. Horizontal road joints (fixed) + angled paver joints every 240px across 2880px
    parallaxPaversEl.appendChild(createSvgEl("line", { x1: 0, y1: 594, x2: 1200, y2: 594 }));
    parallaxPaversEl.appendChild(createSvgEl("line", { x1: 0, y1: 686, x2: 1200, y2: 686 }));
    for (let x = 180; x < PARALLAX_PERIOD * 2; x += 240) {
      parallaxPaversEl.appendChild(
        createSvgEl("line", { x1: x, y1: 566, x2: x - 35, y2: 594 })
      );
      parallaxPaversEl.appendChild(
        createSvgEl("line", { x1: x - 50, y1: 686, x2: x - 95, y2: 760 })
      );
    }

    // 3. Bike lane dashes every 120px across 2880px
    for (let x = 36; x < PARALLAX_PERIOD * 2; x += 120) {
      parallaxDashesEl.appendChild(
        createSvgEl("rect", { x, y: 646, width: 68, height: 6, rx: 3 })
      );
    }

    // 4. Coastal grass tufts every 480px across 2880px
    for (let x = 102; x < PARALLAX_PERIOD * 2; x += 480) {
      const d = `M ${x},566 Q ${x - 8},544 ${x - 16},534 M ${x + 4},566 Q ${x + 6},542 ${x + 12},530 M ${x + 8},566 Q ${x + 18},548 ${x + 26},540`;
      parallaxGrassEl.appendChild(createSvgEl("path", { d }));
    }
  }

  function solveLegIK(hx, hy, px, py) {
    const dx = px - hx;
    const dy = py - hy;
    const d = Math.max(40, Math.min(L1 + L2 - 2, Math.hypot(dx, dy)));
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const ux = dx / d;
    const uy = dy / d;
    // Forward-bending knee (+x side of downward vector)
    const nx = uy;
    const ny = -ux;
    return {
      kx: hx + a * ux + h * nx,
      ky: hy + a * uy + h * ny,
    };
  }

  function buildThighPaths(hx, hy, kx, ky, hipHalfW, kneeHalfW) {
    const dx = kx - hx;
    const dy = ky - hy;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    // Front normal & back normal
    const fx = uy;
    const fy = -ux;
    const bx = -uy;
    const by = ux;

    const hbx = hx + bx * hipHalfW;
    const hby = hy + by * hipHalfW;
    const hfx = hx + fx * (hipHalfW + 2);
    const hfy = hy + fy * (hipHalfW + 2);
    const htx = hx - ux * 11;
    const hty = hy - uy * 11;

    const kfx = kx + fx * kneeHalfW;
    const kfy = ky + fy * kneeHalfW;
    const kbx = kx + bx * kneeHalfW;
    const kby = ky + by * kneeHalfW;
    const ktx = kx + ux * 10;
    const kty = ky + uy * 10;

    const midX = (hx + kx) * 0.5;
    const midY = (hy + ky) * 0.5;
    const fCtrlX = midX + fx * (hipHalfW + 4);
    const fCtrlY = midY + fy * (hipHalfW + 4);
    const bCtrlX = midX + bx * (hipHalfW + 2);
    const bCtrlY = midY + by * (hipHalfW + 2);

    const fillD =
      `M ${hbx.toFixed(1)},${hby.toFixed(1)} ` +
      `Q ${htx.toFixed(1)},${hty.toFixed(1)} ${hfx.toFixed(1)},${hfy.toFixed(1)} ` +
      `Q ${fCtrlX.toFixed(1)},${fCtrlY.toFixed(1)} ${kfx.toFixed(1)},${kfy.toFixed(1)} ` +
      `Q ${ktx.toFixed(1)},${kty.toFixed(1)} ${kbx.toFixed(1)},${kby.toFixed(1)} ` +
      `Q ${bCtrlX.toFixed(1)},${bCtrlY.toFixed(1)} ${hbx.toFixed(1)},${hby.toFixed(1)} Z`;

    const contourD =
      `M ${hfx.toFixed(1)},${hfy.toFixed(1)} ` +
      `Q ${fCtrlX.toFixed(1)},${fCtrlY.toFixed(1)} ${kfx.toFixed(1)},${kfy.toFixed(1)} ` +
      `Q ${ktx.toFixed(1)},${kty.toFixed(1)} ${kbx.toFixed(1)},${kby.toFixed(1)} ` +
      `Q ${bCtrlX.toFixed(1)},${bCtrlY.toFixed(1)} ${hbx.toFixed(1)},${hby.toFixed(1)}`;

    return { fillD, contourD };
  }

  function updatePedalAndLeg(side, deg, bobY) {
    const rad = (deg * Math.PI) / 180;
    const px = BBX + CRANK_R * Math.cos(rad);
    const py = BBY + CRANK_R * Math.sin(rad);
    const footTilt = Math.cos(rad) * 5.5;

    if (side === "near") {
      crankNearArmEl.setAttribute("x2", px.toFixed(1));
      crankNearArmEl.setAttribute("y2", py.toFixed(1));
      pedalNearEl.setAttribute(
        "transform",
        `translate(${(px - 558.3).toFixed(1)}, ${(py - 575.3).toFixed(1)})`
      );

      const hx = 476;
      const hy = 336 + bobY;
      const { kx, ky } = solveLegIK(hx, hy, px, py);
      const { fillD, contourD } = buildThighPaths(hx, hy, kx, ky, 19, 11);
      nearThighEl.setAttribute("d", fillD);
      nearThighStrokeEl.setAttribute("d", contourD);

      const shankD = `M ${kx.toFixed(1)},${ky.toFixed(1)} L ${px.toFixed(1)},${(py - 5).toFixed(1)}`;
      nearShankEl.setAttribute("d", shankD);
      nearShankHiEl.setAttribute("d", shankD);

      const dx = px - 558.3;
      const dy = py - 575.3;
      nearFootEl.setAttribute(
        "transform",
        `translate(${dx.toFixed(1)}, ${dy.toFixed(1)}) rotate(${footTilt.toFixed(1)} 561 571)`
      );
    } else {
      crankFarArmEl.setAttribute("x2", px.toFixed(1));
      crankFarArmEl.setAttribute("y2", py.toFixed(1));
      pedalFarEl.setAttribute("x", (px - 14).toFixed(1));
      pedalFarEl.setAttribute("y", (py - 4).toFixed(1));

      const hx = 490;
      const hy = 332 + bobY;
      const { kx, ky } = solveLegIK(hx, hy, px, py);
      const { fillD } = buildThighPaths(hx, hy, kx, ky, 17, 10);
      farThighEl.setAttribute("d", fillD);

      const shankD = `M ${kx.toFixed(1)},${ky.toFixed(1)} L ${px.toFixed(1)},${(py - 4).toFixed(1)}`;
      farShankEl.setAttribute("d", shankD);
      farShankHiEl.setAttribute("d", shankD);

      const dx = px - 511.7;
      const dy = py - 500.7;
      farFootEl.setAttribute(
        "transform",
        `translate(${dx.toFixed(1)}, ${dy.toFixed(1)}) rotate(${footTilt.toFixed(1)} 514 500)`
      );
    }
  }

  function updateScene(dt) {
    elapsedTime += dt;
    const activeSpeed = isPlaying ? speedMult : 0;

    // Crank, wheel, chain & road travel
    const crankDegPerSec = (BASE_RPM * activeSpeed * 360) / 60;
    const dCrank = crankDegPerSec * dt;
    crankDeg = (crankDeg + dCrank) % 360;

    const dWheel = dCrank * GEAR_RATIO;
    wheelDeg = (wheelDeg + dWheel) % 360;

    const dWheelRad = (dWheel * Math.PI) / 180;
    const dGroundPx = dWheelRad * WHEEL_R_PX;
    groundPx = (groundPx + dGroundPx) % PARALLAX_PERIOD;

    // Real-world meter distance from wheel turns
    distanceMeters += (dWheel / 360) * WHEEL_CIRC_M;

    // Gentle cloud & sailboat drift even when paused (so scene stays alive)
    cloudPx = (cloudPx + (10 + activeSpeed * 18) * dt) % 1400;
    const cloudShift = -((cloudPx % 1400) - 200);
    // Keep clouds in-frame smoothly via wrapped loop
    const cloudOffset = -(cloudPx % 1400);
    cloudsLayerEl.setAttribute(
      "transform",
      `translate(${(cloudOffset > -1200 ? cloudOffset : cloudOffset + 1400).toFixed(1)}, 0)`
    );
    // Actually wrap cleanly with modulo 1300 offset from 0 -> -1300
    const boatBob = Math.sin(elapsedTime * 1.6) * 1.8;
    sailboatsEl.setAttribute("transform", `translate(0, ${boatBob.toFixed(2)})`);

    const gullBob = Math.sin(elapsedTime * 2.1) * 2.5;
    gullsEl.setAttribute("transform", `translate(0, ${gullBob.toFixed(2)})`);

    // Subtle pedaling rhythm bob on pelican upper body + neck counter-balance
    const crankRad = (crankDeg * Math.PI) / 180;
    const bobY = activeSpeed > 0.02 ? Math.sin(crankRad * 2) * 1.9 : 0;
    const bodyLean = Math.min(2.6, activeSpeed * 0.9);
    upperGroupEl.setAttribute(
      "transform",
      `translate(0, ${bobY.toFixed(2)}) rotate(${bodyLean.toFixed(2)} 482 328)`
    );

    // Scarf breeze flutter
    const flutterAmp = 2.2 + activeSpeed * 4.2;
    const f1 = Math.sin(elapsedTime * (5.5 + activeSpeed * 4.5)) * flutterAmp;
    const f2 = Math.cos(elapsedTime * (6.3 + activeSpeed * 4.8) + 0.8) * (flutterAmp * 0.9);
    scarfTail1El.setAttribute(
      "d",
      `M 485,254 C 450,${(248 + f1 * 0.45).toFixed(1)} 416,${(258 - f1 * 0.5).toFixed(1)} 386,${(246 + f1).toFixed(1)} C 378,${(243 + f1).toFixed(1)} 374,${(252 + f1).toFixed(1)} 384,${(258 + f1 * 0.9).toFixed(1)} C 412,${(272 - f1 * 0.4).toFixed(1)} 448,266 486,266 Z`
    );
    scarfTail2El.setAttribute(
      "d",
      `M 476,262 C 446,${(268 + f2 * 0.4).toFixed(1)} 416,${(280 - f2 * 0.4).toFixed(1)} 392,${(274 + f2).toFixed(1)} C 386,${(272 + f2).toFixed(1)} 384,${(280 + f2).toFixed(1)} 393,${(284 + f2 * 0.9).toFixed(1)} C 418,${(292 - f2 * 0.3).toFixed(1)} 454,280 486,271 Z`
    );
    scarfStripesEl.setAttribute(
      "transform",
      `translate(0, ${(f1 * 0.28).toFixed(1)})`
    );

    // Bell ring pouch gulp & happy head nod
    const sinceBell = elapsedTime - bellPulseTime;
    if (sinceBell >= 0 && sinceBell < 0.7) {
      const p = sinceBell / 0.7;
      const nod = Math.sin(p * Math.PI * 3) * (1 - p) * 4.5;
      const pouchDrop = Math.sin(p * Math.PI * 2) * (1 - p) * 5.0;
      headGroupEl.setAttribute("transform", `rotate(${(-nod).toFixed(2)} 538 242)`);
      pouchEl.setAttribute("transform", `translate(0, ${Math.max(0, pouchDrop).toFixed(2)})`);
    } else {
      headGroupEl.setAttribute("transform", "");
      pouchEl.setAttribute("transform", "");
    }

    // Rotate wheels, crankset, and chain links
    wheelRearEl.setAttribute("transform", `rotate(${wheelDeg.toFixed(2)} ${WHEEL_REAR.x} ${WHEEL_REAR.y})`);
    wheelFrontEl.setAttribute("transform", `rotate(${wheelDeg.toFixed(2)} ${WHEEL_FRONT.x} ${WHEEL_FRONT.y})`);
    cranksetEl.setAttribute("transform", `rotate(${crankDeg.toFixed(2)} ${BBX} ${BBY})`);

    const chainOffset = -((crankDeg * Math.PI) / 180) * CHAINRING_R;
    chainLinksEl.setAttribute("stroke-dashoffset", chainOffset.toFixed(2));

    // Update both cranks & 2-link IK pelican legs
    updatePedalAndLeg("far", crankDeg + 180, bobY);
    updatePedalAndLeg("near", crankDeg, bobY);

    // Scroll boardwalk parallax layers seamlessly
    const shift = -(groundPx % PARALLAX_PERIOD);
    const tx = `translate(${shift.toFixed(2)}, 0)`;
    parallaxPostsEl.setAttribute("transform", tx);
    parallaxDashesEl.setAttribute("transform", tx);
    parallaxGrassEl.setAttribute("transform", tx);
    // Keep horizontal paver baselines fixed by translating only angled lines?
    // Even cleaner: translate pavers group & extend horizontal lines inside it? Let's keep pavers transform exact
    parallaxPaversEl.setAttribute("transform", tx);

    // Breeze streaks animation
    if (toggleBreeze.checked && activeSpeed > 0.1) {
      breezeLayerEl.setAttribute("opacity", Math.min(0.85, 0.25 + activeSpeed * 0.35).toFixed(2));
      breezePaths.forEach((p, idx) => {
        const dashShift = -((elapsedTime * (140 + activeSpeed * 220) + idx * 45) % 90);
        p.setAttribute("transform", `translate(${(dashShift * 0.45).toFixed(1)}, 0)`);
      });
    } else if (!toggleBreeze.checked) {
      breezeLayerEl.setAttribute("opacity", "0");
    } else {
      breezeLayerEl.setAttribute("opacity", "0.18");
    }

    // Night lighthouse beam gentle sweep
    if (currentMode === "night") {
      const sweep = Math.sin(elapsedTime * 0.85) * 14;
      lighthouseBeamEl.setAttribute("transform", `translate(22, 10) rotate(${sweep.toFixed(2)})`);
    }

    // Update live telemetry HUD
    const currentRpm = Math.round(BASE_RPM * activeSpeed);
    const speedKmh = ((currentRpm / 60) * GEAR_RATIO * WHEEL_CIRC_M * 3.6);
    metricSpeedEl.textContent = `${speedKmh.toFixed(1)} km/h`;
    metricCadenceEl.textContent = `${currentRpm} RPM`;
    metricDistanceEl.textContent =
      distanceMeters >= 1000
        ? `${(distanceMeters / 1000).toFixed(2)} km`
        : `${Math.round(distanceMeters)} m`;
  }

  function fixParallaxPaversWidth() {
    // Extend horizontal paver lines across full 2880px so translating parallax-pavers never exposes edges
    const lines = parallaxPaversEl.querySelectorAll("line");
    if (lines.length >= 2) {
      lines[0].setAttribute("x2", String(PARALLAX_PERIOD * 2));
      lines[1].setAttribute("x2", String(PARALLAX_PERIOD * 2));
    }
    // Wrap cloud layer gracefully across 1300px without leaving viewport blank
    // Rebuild clouds seamlessly by cloning clouds +1280px right
    const origClouds = cloudsLayerEl.innerHTML;
    const extraGroup = createSvgEl("g", { transform: "translate(1280, 0)" });
    extraGroup.innerHTML = origClouds;
    cloudsLayerEl.appendChild(extraGroup);
  }

  function setAtmosphere(mode) {
    currentMode = mode;
    document.body.setAttribute("data-theme", mode);

    modeButtons.forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });

    if (mode === "morning") {
      skyMorningEl.setAttribute("opacity", "1");
      skySunsetEl.setAttribute("opacity", "0");
      skyNightEl.setAttribute("opacity", "0");
      glowMorningEl.setAttribute("opacity", "1");
      glowSunsetEl.setAttribute("opacity", "0");
      starsEl.setAttribute("opacity", "0");
      sunEl.setAttribute("opacity", "1");
      sunDiscEl.setAttribute("cy", "195");
      sunHaloEl.setAttribute("cy", "195");
      sunDiscEl.setAttribute("fill", "#fff6cf");
      sunHaloEl.setAttribute("fill", "#ffe5a3");
      moonEl.setAttribute("opacity", "0");
      oceanMorningEl.setAttribute("opacity", "1");
      oceanSunsetEl.setAttribute("opacity", "0");
      oceanNightEl.setAttribute("opacity", "0");
      oceanShimmerEl.setAttribute("stroke", "#ffeab5");
      oceanShimmerEl.setAttribute("opacity", "0.54");
      cloudsLayerEl.setAttribute("fill", "#ffffff");
      cloudsLayerEl.setAttribute("opacity", "0.72");
      lighthouseBeamEl.setAttribute("opacity", "0");
      headlampBeamEl.setAttribute("opacity", "0");
      roadNightTintEl.setAttribute("opacity", "0");
      groundShadowEl.setAttribute("opacity", "0.34");
    } else if (mode === "sunset") {
      skyMorningEl.setAttribute("opacity", "0");
      skySunsetEl.setAttribute("opacity", "1");
      skyNightEl.setAttribute("opacity", "0");
      glowMorningEl.setAttribute("opacity", "0");
      glowSunsetEl.setAttribute("opacity", "1");
      starsEl.setAttribute("opacity", "0.18");
      sunEl.setAttribute("opacity", "1");
      sunDiscEl.setAttribute("cy", "342");
      sunHaloEl.setAttribute("cy", "342");
      sunDiscEl.setAttribute("fill", "#ffd27d");
      sunHaloEl.setAttribute("fill", "#ff884d");
      moonEl.setAttribute("opacity", "0");
      oceanMorningEl.setAttribute("opacity", "0");
      oceanSunsetEl.setAttribute("opacity", "1");
      oceanNightEl.setAttribute("opacity", "0");
      oceanShimmerEl.setAttribute("stroke", "#ffb066");
      oceanShimmerEl.setAttribute("opacity", "0.68");
      cloudsLayerEl.setAttribute("fill", "#ffd8be");
      cloudsLayerEl.setAttribute("opacity", "0.62");
      lighthouseBeamEl.setAttribute("opacity", "0.32");
      headlampBeamEl.setAttribute("opacity", "0.28");
      roadNightTintEl.setAttribute("opacity", "0.14");
      groundShadowEl.setAttribute("opacity", "0.28");
    } else if (mode === "night") {
      skyMorningEl.setAttribute("opacity", "0");
      skySunsetEl.setAttribute("opacity", "0");
      skyNightEl.setAttribute("opacity", "1");
      glowMorningEl.setAttribute("opacity", "0");
      glowSunsetEl.setAttribute("opacity", "0");
      starsEl.setAttribute("opacity", "0.92");
      sunEl.setAttribute("opacity", "0");
      moonEl.setAttribute("opacity", "1");
      oceanMorningEl.setAttribute("opacity", "0");
      oceanSunsetEl.setAttribute("opacity", "0");
      oceanNightEl.setAttribute("opacity", "1");
      oceanShimmerEl.setAttribute("stroke", "#cbe8ef");
      oceanShimmerEl.setAttribute("opacity", "0.38");
      cloudsLayerEl.setAttribute("fill", "#274c5e");
      cloudsLayerEl.setAttribute("opacity", "0.45");
      lighthouseBeamEl.setAttribute("opacity", "0.85");
      headlampBeamEl.setAttribute("opacity", "0.92");
      roadNightTintEl.setAttribute("opacity", "0.52");
      groundShadowEl.setAttribute("opacity", "0.48");
    }
  }

  function playBrassBellSound() {
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!audioCtx) {
        audioCtx = new AudioContextCtor();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      const strike = (startOffset) => {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc1.type = "sine";
        osc2.type = "triangle";
        osc1.frequency.setValueAtTime(1960, now + startOffset);
        osc2.frequency.setValueAtTime(3920, now + startOffset);

        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.14, now + startOffset + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + 0.42);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);

        osc1.start(now + startOffset);
        osc2.start(now + startOffset);
        osc1.stop(now + startOffset + 0.45);
        osc2.stop(now + startOffset + 0.45);
      };
      strike(0);
      strike(0.14);
    } catch (_) {
      // Ignore audio errors if blocked by browser autoplay policy
    }
  }

  function triggerBell() {
    bellPulseTime = elapsedTime;
    bellWavesEl.classList.remove("bell-wave-active");
    bellWavesEl.setAttribute("opacity", "1");
    void bellWavesEl.getBoundingClientRect();
    bellWavesEl.classList.add("bell-wave-active");
    playBrassBellSound();
  }

  function exportCurrentSvg() {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "1200");
    clone.setAttribute("height", "760");
    const serializer = new XMLSerializer();
    const source = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(clone);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pelican-bicycle-${currentMode}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function togglePlayback() {
    isPlaying = !isPlaying;
    btnTogglePlay.setAttribute("aria-pressed", String(isPlaying));
    playIconEl.textContent = isPlaying ? "❚❚" : "▶";
    playLabelEl.textContent = isPlaying ? "暂停骑行" : "继续骑行";
  }

  function animationLoop(timestamp) {
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }
    const dt = Math.min(0.05, Math.max(0, (timestamp - lastTimestamp) / 1000));
    lastTimestamp = timestamp;
    updateScene(dt);
    requestAnimationFrame(animationLoop);
  }

  // Event Bindings
  btnTogglePlay.addEventListener("click", togglePlayback);
  btnBell.addEventListener("click", triggerBell);
  bellHitEl.addEventListener("click", triggerBell);
  headGroupEl.addEventListener("click", triggerBell);

  sliderSpeed.addEventListener("input", (e) => {
    speedMult = parseFloat(e.target.value);
    speedValueEl.textContent = `${speedMult.toFixed(1)}×`;
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setAtmosphere(btn.dataset.mode);
    });
  });

  toggleScarf.addEventListener("change", (e) => {
    scarfEl.setAttribute("opacity", e.target.checked ? "1" : "0");
  });

  toggleGoggles.addEventListener("change", (e) => {
    gogglesEl.setAttribute("opacity", e.target.checked ? "1" : "0");
  });

  toggleBreeze.addEventListener("change", (e) => {
    breezeLayerEl.setAttribute("opacity", e.target.checked ? "0.72" : "0");
  });

  btnDownloadSvg.addEventListener("click", exportCurrentSvg);

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      togglePlayback();
    }
  });

  // Boot
  buildParallaxScenery();
  fixParallaxPaversWidth();
  setAtmosphere("morning");
  updateScene(0);
  requestAnimationFrame(animationLoop);
})();
