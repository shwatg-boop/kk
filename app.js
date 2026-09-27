// ============================================================================
// HIMALAYAN BEAN ODYSSEY — INTERACTIVE GAME & SENSORY CALCULATION ENGINE
// ============================================================================

(function () {
  const DATA = window.COFFEE_DATA;

  // Game State
  const state = {
    currentStage: 1,
    activeQuestId: "freeplay",
    varietalId: "bourbon",
    locationId: "gulmi_1050",
    mapRegionFilter: "all", // "all" | "western" | "central" | "eastern"
    mapZoomCoffeeBelt: false,
    fermentationId: "honey",
    roastSlider: 45, // 0..100 continuous spectrum
    brewMethodId: "v60",
    grindMicrons: 680, // 200..1200 microns
    brewTimeSec: 180,
    waterTempC: 94,
    highlightedCherryLayer: null,
    savedBrews: [],
    roasterSim: {
      running: false,
      timer: null
    }
  };

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  function getVarietal(id = state.varietalId) {
    return DATA.varietals.find((v) => v.id === id) || DATA.varietals[0];
  }
  function getLocation(id = state.locationId) {
    return DATA.nepalLocations.find((l) => l.id === id) || DATA.nepalLocations[3];
  }
  function getFermentation(id = state.fermentationId) {
    return DATA.fermentations.find((f) => f.id === id) || DATA.fermentations[0];
  }
  function getBrewMethod(id = state.brewMethodId) {
    return DATA.brewMethods.find((b) => b.id === id) || DATA.brewMethods[2];
  }
  function getRoastBenchmark(sliderVal = state.roastSlider) {
    for (const b of DATA.roastBenchmarks) {
      if (sliderVal >= b.range[0] && sliderVal <= b.range[1]) return b;
    }
    return DATA.roastBenchmarks[2];
  }

  // ==========================================================================
  // CORE SCIENTIFIC TASTE PROFILE METRIC ENGINE
  // ==========================================================================
  function calculateTasteProfile(customState = state) {
    const varietal = getVarietal(customState.varietalId);
    const location = getLocation(customState.locationId);
    const ferment = getFermentation(customState.fermentationId);
    const brew = getBrewMethod(customState.brewMethodId);
    const roastVal = customState.roastSlider;
    const r = roastVal / 100;

    // 1. BASELINE: Varietal Genetics
    const base = { ...varietal.baseScores };

    // 2. ALTITUDE MODIFIERS (600m to 1800m in Nepal)
    // NOTE: location.slopeAngle is strictly excluded from taste profile math!
    const altNorm = (location.altitude - 600) / 1200;
    const altDelta = {
      acidity: Math.round(-12 + 32 * altNorm),
      sweetness: Math.round(-6 + 20 * altNorm),
      body: Math.round(+6 - 8 * altNorm),
      fruityFloral: Math.round(-14 + 36 * altNorm),
      chocoNut: Math.round(+14 - 22 * altNorm),
      funkSpice: Math.round(+2 - 2 * altNorm),
      bitterness: Math.round(+5 - 8 * altNorm),
      clarity: Math.round(-6 + 18 * altNorm)
    };

    if (varietal.id === "gesha") {
      if (location.altitude >= 1450) {
        altDelta.fruityFloral += 6;
        altDelta.clarity += 4;
      } else if (location.altitude < 1100) {
        altDelta.fruityFloral -= 12;
        altDelta.sweetness -= 8;
      }
    }

    // 3. FERMENTATION MODIFIERS
    const fermDelta = { ...ferment.modifiers };

    // 4. ROASTING SPECTRUM CHEMISTRY (Continuous 0..100%)
    const originRetention = 1 - 0.52 * Math.pow(r, 1.65);
    const caramelBell = Math.exp(-Math.pow((r - 0.46) / 0.28, 2));
    const maillardBell = Math.exp(-Math.pow((r - 0.62) / 0.30, 2));

    const roastDelta = {
      acidity: Math.round(14 * (1 - r) - 38 * Math.pow(r, 1.35)),
      sweetness: Math.round(16 * caramelBell - 22 * Math.pow(Math.max(0, r - 0.55), 1.4)),
      body: Math.round(-12 * (1 - r) + 24 * Math.sin(Math.min(1, r * 1.15) * (Math.PI / 2))),
      fruityFloral: Math.round(10 * (1 - r) - 42 * Math.pow(r, 1.4)),
      chocoNut: Math.round(24 * maillardBell - 14 * (1 - r)),
      funkSpice: Math.round(-12 * Math.pow(r, 1.3) + (r > 0.7 ? 8 : 0)),
      bitterness: Math.round(-6 * (1 - r) + 54 * Math.pow(r, 1.75)),
      clarity: Math.round(10 * (1 - r) - 24 * Math.pow(r, 1.5))
    };

    const preBrew = {
      acidity: base.acidity + altDelta.acidity * originRetention + fermDelta.acidity * originRetention + roastDelta.acidity,
      sweetness: base.sweetness + altDelta.sweetness * originRetention + fermDelta.sweetness * originRetention + roastDelta.sweetness,
      body: base.body + altDelta.body + fermDelta.body + roastDelta.body,
      fruityFloral: (base.fruityFloral + altDelta.fruityFloral + fermDelta.fruityFloral) * originRetention + roastDelta.fruityFloral,
      chocoNut: base.chocoNut + altDelta.chocoNut + fermDelta.chocoNut + roastDelta.chocoNut,
      funkSpice: (base.funkSpice + altDelta.funkSpice + fermDelta.funkSpice) * (0.45 + 0.55 * originRetention) + roastDelta.funkSpice,
      bitterness: base.bitterness + altDelta.bitterness + fermDelta.bitterness + roastDelta.bitterness,
      clarity: base.clarity + altDelta.clarity + fermDelta.clarity + roastDelta.clarity
    };

    // 5. GRINDING & EXTRACTION PHYSICS
    const grindRatio = brew.sweetSpotMicron / customState.grindMicrons;
    const timeRatio = Math.pow(customState.brewTimeSec / brew.defaultTimeSec, 0.48);
    const tempFactor = 1 + 0.016 * (customState.waterTempC - brew.defaultTempC);
    const roastPorosity = 1 + 0.08 * (r - 0.45);

    const rawEY = 20.0 * Math.pow(grindRatio, 0.62) * timeRatio * tempFactor * roastPorosity;
    const extractionYield = Number(clamp(rawEY, 11.5, 27.5).toFixed(2));

    let ratioDivisor = 15.5;
    if (brew.id === "espresso") ratioDivisor = 2.15;
    else if (brew.id === "aeropress") ratioDivisor = 11.5;
    else if (brew.id === "v60") ratioDivisor = 16.0;
    else if (brew.id === "frenchpress") ratioDivisor = 15.0;

    const tds = Number((extractionYield / ratioDivisor).toFixed(2));

    const underExt = Math.max(0, 18.2 - extractionYield);
    const overExt = Math.max(0, extractionYield - 21.8);
    const sweetSpotBonus = (underExt === 0 && overExt === 0)
      ? Math.round(8 * (1 - Math.abs(extractionYield - 20.0) / 2.0))
      : 0;

    const brewDelta = {
      acidity: (brew.modifiers.acidity || 0) + Math.round(underExt * 4.2 - overExt * 2.5),
      sweetness: (brew.modifiers.sweetness || 0) + sweetSpotBonus - Math.round(underExt * 4.5 + overExt * 4.0),
      body: (brew.modifiers.body || 0) + Math.round(-underExt * 3.8 + overExt * 1.5),
      fruityFloral: sweetSpotBonus - Math.round(underExt * 2.0 + overExt * 4.2),
      chocoNut: Math.round(sweetSpotBonus * 0.6 - underExt * 3.2 - overExt * 1.5),
      funkSpice: Math.round(overExt * 1.2 - underExt * 1.0),
      bitterness: (brew.modifiers.bitterness || 0) + Math.round(overExt * 7.5 - underExt * 2.0),
      clarity: (brew.modifiers.clarity || 0) + Math.round(sweetSpotBonus * 0.5 - overExt * 4.8 - underExt * 1.5)
    };

    const finalScores = {};
    const keys = ["acidity", "sweetness", "body", "fruityFloral", "chocoNut", "funkSpice", "bitterness", "clarity"];
    keys.forEach((k) => {
      finalScores[k] = clamp(Math.round(preBrew[k] + brewDelta[k]), 5, 99);
    });

    const effectiveAltDelta = {
      acidity: Math.round(altDelta.acidity * originRetention),
      sweetness: Math.round(altDelta.sweetness * originRetention),
      body: altDelta.body,
      fruityFloral: Math.round(altDelta.fruityFloral * originRetention),
      chocoNut: altDelta.chocoNut,
      funkSpice: Math.round(altDelta.funkSpice * (0.45 + 0.55 * originRetention)),
      bitterness: altDelta.bitterness,
      clarity: altDelta.clarity
    };

    const effectiveFermDelta = {
      acidity: Math.round(fermDelta.acidity * originRetention),
      sweetness: Math.round(fermDelta.sweetness * originRetention),
      body: fermDelta.body,
      fruityFloral: Math.round(fermDelta.fruityFloral * originRetention),
      chocoNut: fermDelta.chocoNut,
      funkSpice: Math.round(fermDelta.funkSpice * (0.45 + 0.55 * originRetention)),
      bitterness: fermDelta.bitterness,
      clarity: fermDelta.clarity
    };

    let extractionStatus = "Ideal Balanced Extraction (Sweet Spot)";
    let extractionBadgeColor = "#4ea063";
    let extractionAdvice = "Your grind size and contact time hit the 18–22% SCA extraction sweet spot, harmonizing early acids, middle sugars, and clean structure.";

    if (extractionYield < 16.5) {
      extractionStatus = "Severely Under-Extracted (Sour & Grassy)";
      extractionBadgeColor = "#d1433f";
      extractionAdvice = `At ${extractionYield}% EY, water rushed past too-coarse grounds (${customState.grindMicrons} µm) or brewed too briefly. Only fast-dissolving sour acids extracted! Grind finer or brew longer.`;
    } else if (extractionYield < 18.2) {
      extractionStatus = "Slightly Under-Extracted (Bright / Tart)";
      extractionBadgeColor = "#e8a838";
      extractionAdvice = `At ${extractionYield}% EY, your brew leans slightly tart and thin. Try grinding 50–100 µm finer or extending contact time to unlock fuller caramel sweetness.`;
    } else if (extractionYield > 23.2) {
      extractionStatus = "Severely Over-Extracted (Harsh, Bitter & Astringent)";
      extractionBadgeColor = "#d1433f";
      extractionAdvice = `At ${extractionYield}% EY, your grind (${customState.grindMicrons} µm) is too fine for ${brew.name} or steeped too long. Late-extracting bitter phenols and dry tannins overwhelmed the cup! Grind coarser.`;
    } else if (extractionYield > 21.8) {
      extractionStatus = "Slightly Over-Extracted (Bold / Roasty Edge)";
      extractionBadgeColor = "#e8a838";
      extractionAdvice = `At ${extractionYield}% EY, extraction pushed slightly past 22%, adding extra body and a dry cocoa-tannin finish. Coarsen the grind slightly for cleaner sweetness.`;
    }

    const balancePenalty = Math.round(underExt * 3.2 + overExt * 3.6);
    const excessBitternessPenalty = Math.max(0, Math.round((finalScores.bitterness - 55) * 0.25));
    const qualityRaw =
      72 +
      (finalScores.sweetness - 55) * 0.18 +
      (finalScores.acidity - 50) * 0.10 +
      (finalScores.fruityFloral - 50) * 0.11 +
      (finalScores.clarity - 50) * 0.09 +
      (finalScores.body - 50) * 0.08 -
      balancePenalty -
      excessBitternessPenalty;
    const scaScore = Number(clamp(qualityRaw, 62, 96.5).toFixed(1));

    const tastingNotes = synthesizeTastingNotes(
      varietal,
      location,
      ferment,
      getRoastBenchmark(roastVal),
      finalScores,
      extractionYield
    );

    return {
      varietal,
      location,
      ferment,
      roastBenchmark: getRoastBenchmark(roastVal),
      roastVal,
      brew,
      grindMicrons: customState.grindMicrons,
      brewTimeSec: customState.brewTimeSec,
      waterTempC: customState.waterTempC,
      base,
      effectiveAltDelta,
      effectiveFermDelta,
      roastDelta,
      brewDelta,
      finalScores,
      extractionYield,
      tds,
      extractionStatus,
      extractionBadgeColor,
      extractionAdvice,
      scaScore,
      tastingNotes,
      originRetentionPct: Math.round(originRetention * 100)
    };
  }

  function synthesizeTastingNotes(varietal, location, ferment, roastBench, scores, ey) {
    const notes = [];
    if (ey < 16.2) {
      notes.push({ label: "Sour Green Lemon (Under-Extracted)", color: "#d1433f", icon: "🍋" });
      notes.push({ label: "Grassy / Herbal", color: "#7a8c50", icon: "🌱" });
    } else if (ey > 23.5) {
      notes.push({ label: "Dry Walnut Skin (Astringent)", color: "#d1433f", icon: "🍂" });
      notes.push({ label: "Charred Tannin", color: "#5e3315", icon: "🔥" });
    }

    if (roastBench.id === "dark") {
      notes.push({ label: "Smoky Espresso", color: "#3d2314", icon: "🔥" });
      notes.push({ label: "85% Dark Bakers Chocolate", color: "#4a2c18", icon: "🍫" });
      notes.push({ label: "Burnt Molasses", color: "#5c3419", icon: "🍯" });
    } else if (roastBench.id === "med_dark") {
      notes.push({ label: "Bittersweet Dark Cocoa", color: "#5e3315", icon: "🍫" });
      notes.push({ label: "Roasted Hazelnut", color: "#8c5327", icon: "🌰" });
      notes.push({ label: "Clove & Baking Spice", color: "#9b5b2e", icon: "✨" });
    } else {
      notes.push({ label: varietal.signatureNotes[0], color: varietal.color, icon: varietal.icon });
      if (location.altitude >= 1450) {
        notes.push({ label: "Himalayan Bergamot & Citrus", color: "#5da4e3", icon: "🏔️" });
      } else if (location.altitude <= 850) {
        notes.push({ label: "Toasted Malt & Earthy Walnut", color: "#8c6239", icon: "🌾" });
      } else {
        notes.push({ label: varietal.signatureNotes[1], color: "#d97724", icon: "🍎" });
      }
      notes.push({ label: ferment.flavorNotes[0], color: ferment.color, icon: ferment.icon });
    }

    if (scores.funkSpice >= 62 && !notes.some((n) => n.label.includes("Wine") || n.label.includes("Passionfruit"))) {
      notes.push({ label: ferment.flavorNotes[1] || "Spiced Tropical Wine", color: "#ab74b0", icon: "🍷" });
    }
    if (scores.sweetness >= 75) {
      notes.push({ label: "Himalayan Cane Sugar", color: "#e8a838", icon: "🍯" });
    }
    if (scores.chocoNut >= 72 && roastBench.id !== "dark") {
      notes.push({ label: "Creamy Milk Chocolate", color: "#7d4b22", icon: "🍫" });
    }
    return notes.slice(0, 6);
  }

  // ==========================================================================
  // INITIALIZATION & STAGE ROUTING
  // ==========================================================================
  function init() {
    renderStepper();
    renderQuestBar();
    renderStage1();
    renderStage2();
    renderStage3();
    renderStage4();
    renderStage5();
    updateLiveSidebar();
  }

  window.goToStage = function (stageNum) {
    state.currentStage = stageNum;
    document.querySelectorAll(".stage-panel").forEach((el, idx) => {
      el.classList.toggle("active", idx + 1 === stageNum);
    });
    renderStepper();
    if (stageNum === 4) drawGrindParticles();
    if (stageNum === 5) renderStage5();
    updateLiveSidebar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function renderStepper() {
    const steps = [
      { num: 1, title: "1. Varietal & Nepal Map" },
      { num: 2, title: "2. Fermentation Lab" },
      { num: 3, title: "3. Drum Roaster" },
      { num: 4, title: "4. Grind & Extraction" },
      { num: 5, title: "5. Final Taste Profile" }
    ];
    const container = document.getElementById("stage-stepper");
    container.innerHTML = steps
      .map(
        (s) => `
      <button class="step-btn ${state.currentStage === s.num ? "active" : ""}" onclick="goToStage(${s.num})">
        <span class="step-num">${s.num}</span>
        <span>${s.title.split(". ")[1]}</span>
      </button>
    `
      )
      .join("");
  }

  function renderQuestBar() {
    const bar = document.getElementById("quest-bar-content");
    const activeQuest = DATA.quests.find((q) => q.id === state.activeQuestId) || DATA.quests[0];
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.65rem;flex-wrap:wrap;">
        <span style="font-weight:700;color:var(--accent-gold);">🎯 Mode / Challenge:</span>
        <div class="quest-selector">
          ${DATA.quests
            .map(
              (q) => `
            <button class="quest-pill ${q.id === state.activeQuestId ? "active" : ""}" onclick="selectQuest('${q.id}')">
              ${q.icon} ${q.name}
            </button>
          `
            )
            .join("")}
        </div>
      </div>
      <div style="font-size:0.8rem;color:var(--text-main);max-width:650px;">
        <span>${activeQuest.description}</span>
        ${activeQuest.hint ? `<div style="color:var(--accent-gold);font-size:0.74rem;margin-top:0.12rem;">💡 <em>Hint: ${activeQuest.hint}</em></div>` : ""}
      </div>
    `;
  }

  window.selectQuest = function (questId) {
    state.activeQuestId = questId;
    renderQuestBar();
    updateLiveSidebar();
    if (state.currentStage === 5) renderStage5();
  };

  // ==========================================================================
  // STAGE 1: COMPACT HOVER-POPOVER VARIETALS + INTERACTIVE NEPAL MAP
  // ==========================================================================
  function renderStage1() {
    // 1A: Varietal Cards — Compact by default (Name + Altitude + Notes), Pop-out Description on Hover!
    const varietalContainer = document.getElementById("varietal-grid");
    varietalContainer.innerHTML = DATA.varietals
      .map((v) => {
        const isSel = v.id === state.varietalId;
        return `
        <div class="interactive-hover-card ${isSel ? "selected" : ""}" onclick="selectVarietal('${v.id}')">
          <div class="check-indicator">✓</div>
          <div style="display:flex;align-items:center;gap:0.7rem;">
            <span class="card-icon-anim">${v.icon}</span>
            <div>
              <h4 style="font-size:1.06rem;color:var(--cream);font-weight:700;">${v.name}</h4>
              <div style="font-size:0.74rem;color:var(--accent-gold);font-weight:600;">⛰️ Optimal: ${v.optimalAltitude}</div>
            </div>
          </div>

          <!-- Always visible: Signature Tasting Notes -->
          <div class="tag-row">
            ${v.signatureNotes.map((n) => `<span class="mini-tag highlight">${n}</span>`).join("")}
          </div>

          <div class="hover-hint-pill">✨ Hover to reveal botanical story & genetics</div>

          <!-- Pop-Out Drawer on Mouse Hover -->
          <div class="hover-popout-drawer">
            <p style="font-size:0.8rem;color:var(--text-main);line-height:1.48;margin-bottom:0.5rem;">
              ${v.summary}
            </p>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.45rem;">
              <div>🧬 <strong>Lineage:</strong> ${v.lineage}</div>
              <div>🇳🇵 <strong>Nepal:</strong> ${v.nepalPrevalence}</div>
              <div>🫘 <strong>Bean:</strong> ${v.beanShape}</div>
            </div>
            <!-- Mini Genetic Trait Preview Bars -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.35rem;text-align:center;font-size:0.66rem;background:rgba(0,0,0,0.35);padding:0.4rem;border-radius:7px;">
              <div><div style="color:#5da4e3;font-weight:700;">${v.baseScores.acidity}</div><div style="color:var(--text-dim);">Acidity</div></div>
              <div><div style="color:#e8a838;font-weight:700;">${v.baseScores.sweetness}</div><div style="color:var(--text-dim);">Sweet</div></div>
              <div><div style="color:#d97724;font-weight:700;">${v.baseScores.body}</div><div style="color:var(--text-dim);">Body</div></div>
              <div><div style="color:#ab74b0;font-weight:700;">${v.baseScores.fruityFloral}</div><div style="color:var(--text-dim);">Floral</div></div>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    renderInteractiveNepalMap();
    renderHimalayanVisualizer();
  }

  function renderInteractiveNepalMap() {
    const mapBox = document.getElementById("nepal-interactive-map-box");
    if (!mapBox) return;
    const activeLoc = getLocation();

    const nepalPolygonPath =
      "M 51,183 L 65,135 L 78,103 L 69,75 L 92,69 L 127,63 L 154,84 L 185,103 L 225,112 L 265,105 L 306,112 L 340,126 L 372,135 L 405,138 L 424,167 L 465,169 L 502,188 L 543,210 L 580,224 L 617,246 L 652,240 L 689,255 L 732,265 L 781,274 L 820,278 L 855,286 L 882,293 L 905,305 L 908,366 L 891,390 L 820,398 L 755,382 L 678,366 L 620,358 L 570,348 L 512,332 L 453,308 L 395,308 L 325,305 L 265,278 L 220,256 L 177,239 L 125,222 L 72,202 Z";

    // Build SVG pins + non-overlapping leader-line callout pills for all 13 locations
    const pinsHtml = DATA.nepalLocations
      .map((loc) => {
        const isSel = loc.id === state.locationId;
        const isDimmed =
          state.mapRegionFilter !== "all" && loc.regionGroup !== state.mapRegionFilter && !isSel;
        const px = loc.pinX || 480;
        const py = loc.pinY || 260;
        const lx = loc.labelX || px;
        const ly = loc.labelY || py - 28;
        const shortName = loc.shortName || loc.name.split(",")[0];

        // Color code pin by elevation tier
        const pinColor =
          loc.altitude >= 1500 ? "#5da4e3" : loc.altitude >= 1150 ? "#e8a838" : "#4ea063";

        const pillW = 122;
        const pillH = 23;

        return `
          <g class="map-pin-group ${isDimmed ? "dimmed" : ""}" onclick="selectLocation('${loc.id}')">
            <title>${loc.name} (${loc.province}) — ${loc.altitude}m MASL • Slope: ${loc.slopeAngle}° ${loc.slopeAspect}</title>

            <!-- Leader Line from True Geographical Pin to Non-Overlapping Callout Pill -->
            <line x1="${px}" y1="${py}" x2="${lx}" y2="${ly}"
              stroke="${isSel ? "#ffd166" : pinColor}"
              stroke-width="${isSel ? "2.2" : "1.35"}"
              stroke-dasharray="${isSel ? "none" : "3,2"}"
              opacity="${isSel ? "1" : "0.78"}" />

            <!-- Pulse Ring & Geographical District Pin -->
            ${
              isSel
                ? `<circle cx="${px}" cy="${py}" r="18" fill="none" stroke="#ffd166" stroke-width="2.4" class="pin-pulse-circle" />
                   <circle cx="${px}" cy="${py}" r="11" fill="rgba(255, 209, 102, 0.32)" />`
                : `<circle cx="${px}" cy="${py}" r="11" fill="none" stroke="${pinColor}" stroke-width="1.3" opacity="0.55" class="pin-pulse-circle" />`
            }
            <circle cx="${px}" cy="${py}" r="${isSel ? 7.5 : 5.8}"
              fill="${isSel ? "#ffd166" : pinColor}"
              stroke="#0b131e"
              stroke-width="2"
              class="map-pin-dot" />

            <!-- Non-Overlapping Callout Badge -->
            <g transform="translate(${lx}, ${ly})">
              <rect x="${-pillW / 2}" y="${-pillH / 2}" width="${pillW}" height="${pillH}" rx="6"
                fill="${isSel ? "#e8a838" : "rgba(12, 18, 28, 0.92)"}"
                stroke="${isSel ? "#ffffff" : pinColor}"
                stroke-width="${isSel ? "1.8" : "1.1"}"
                class="map-callout-box" />
              <text x="0" y="4"
                fill="${isSel ? "#120d0b" : "#f7efe9"}"
                font-size="10.2"
                font-weight="${isSel ? "800" : "700"}"
                text-anchor="middle">
                ${isSel ? "★ " : ""}${shortName} • ${loc.altitude}m
              </text>
            </g>
          </g>
        `;
      })
      .join("");

    // Filter locations for the spacious multi-column selector grid below the map
    const filteredLocations = DATA.nepalLocations.filter(
      (loc) => state.mapRegionFilter === "all" || loc.regionGroup === state.mapRegionFilter
    );

    const wideCardsHtml = filteredLocations
      .map((loc) => {
        const isSel = loc.id === state.locationId;
        const tierColor =
          loc.altitude >= 1500 ? "#5da4e3" : loc.altitude >= 1150 ? "#e8a838" : "#4ea063";
        const tierLabel =
          loc.altitude >= 1500
            ? "High Alpine (SHG)"
            : loc.altitude >= 1150
            ? "Mid-Hill Sweet Spot"
            : "Low River Basin";

        return `
          <div class="loc-card-wide ${isSel ? "active" : ""}" onclick="selectLocation('${loc.id}')">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.4rem;">
                <div>
                  <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;color:${isSel ? "#ffd166" : "var(--text-dim)"};font-weight:700;">
                    ${loc.province}
                  </div>
                  <h4 style="font-size:0.96rem;color:var(--cream);font-weight:700;margin-top:0.1rem;">
                    📍 ${loc.name}
                  </h4>
                </div>
                <span style="background:rgba(0,0,0,0.45);border:1px solid ${tierColor};color:${tierColor};padding:0.18rem 0.5rem;border-radius:999px;font-size:0.74rem;font-weight:800;white-space:nowrap;">
                  ${loc.altitude}m
                </span>
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.55rem;font-size:0.73rem;color:var(--text-muted);">
                <span>📐 Slope: <strong style="color:#ffd166;">${loc.slopeAngle}°</strong></span>
                <span style="color:${tierColor};font-weight:600;">${tierLabel}</span>
              </div>
            </div>

            <div class="loc-hover-drawer">
              <div style="margin-bottom:0.25rem;color:var(--cream);">
                🫘 <strong>${loc.beanDensity}</strong> • 🌡️ ${loc.avgTempC}°C • ⏳ ${loc.maturationMonths} mo
              </div>
              <div style="line-height:1.38;">
                ${loc.terroirStory.slice(0, 110)}…
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    const svgViewBox = state.mapZoomCoffeeBelt ? "250 125 690 295" : "0 0 960 440";

    mapBox.innerHTML = `
      <!-- Top Map Toolbar: Title, Region Filter Tabs, Zoom Toggle & Legend -->
      <div class="map-toolbar">
        <div>
          <span class="stage-badge" style="margin-bottom:0.2rem;">🗺️ Geographical Map of Nepal • 13 Coffee Terroirs</span>
          <div style="font-size:0.81rem;color:var(--text-muted);">
            Click any <strong>glowing district pin or callout badge</strong> on the Nepal map—or choose from the spacious district grid below!
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:0.65rem;flex-wrap:wrap;">
          <div class="map-region-filters">
            <button class="map-filter-btn ${state.mapRegionFilter === "all" ? "active" : ""}" onclick="setMapRegionFilter('all')">
              🇳🇵 All Nepal (13)
            </button>
            <button class="map-filter-btn ${state.mapRegionFilter === "western" ? "active" : ""}" onclick="setMapRegionFilter('western')">
              🏔️ Lumbini & Gandaki West (5)
            </button>
            <button class="map-filter-btn ${state.mapRegionFilter === "central" ? "active" : ""}" onclick="setMapRegionFilter('central')">
              🏛️ Bagmati Central (5)
            </button>
            <button class="map-filter-btn ${state.mapRegionFilter === "eastern" ? "active" : ""}" onclick="setMapRegionFilter('eastern')">
              🌧️ Koshi Far-East (3)
            </button>
          </div>

          <button class="map-zoom-toggle ${state.mapZoomCoffeeBelt ? "active" : ""}" onclick="toggleMapZoom()">
            ${state.mapZoomCoffeeBelt ? "🗺️ Show Full Nepal Map" : "🔍 Zoom to Coffee Belt"}
          </button>
        </div>
      </div>

      <!-- Elevation Tier Legend Strip -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.65rem;font-size:0.75rem;color:var(--text-muted);padding:0 0.25rem;">
        <div style="display:flex;gap:1.1rem;flex-wrap:wrap;">
          <span><strong style="color:#4ea063;">● Low Basin (600–1,100m):</strong> Earthy, Nutty, Low Acid</span>
          <span><strong style="color:#e8a838;">● Mid-Hills (1,150–1,450m):</strong> Sweet Caramel, Orange, Chocolate</span>
          <span><strong style="color:#5da4e3;">● High Himalaya (1,500–1,800m):</strong> Dense SHG, Floral, Sparkling Citrus</span>
        </div>
        <div style="color:#ffd166;font-weight:700;">
          Selected: 📍 ${activeLoc.name} (${activeLoc.altitude}m • θ=${activeLoc.slopeAngle}°)
        </div>
      </div>

      <!-- Full-Width Realistic Geographical SVG Map of Nepal -->
      <svg viewBox="${svgViewBox}" class="nepal-svg-canvas">
        <defs>
          <linearGradient id="nepalTopoGrad" x1="0.15" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2c4863" />
            <stop offset="38%" stop-color="#23473b" />
            <stop offset="74%" stop-color="#2b422b" />
            <stop offset="100%" stop-color="#3a2d1e" />
          </linearGradient>

          <linearGradient id="coffeeBeltGlow" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0%" stop-color="rgba(78, 160, 99, 0.08)" />
            <stop offset="35%" stop-color="rgba(78, 160, 99, 0.30)" />
            <stop offset="70%" stop-color="rgba(232, 168, 56, 0.26)" />
            <stop offset="100%" stop-color="rgba(93, 164, 227, 0.30)" />
          </linearGradient>

          <clipPath id="nepalBorderClip">
            <path d="${nepalPolygonPath}" />
          </clipPath>
        </defs>

        <!-- Subtle Longitude / Latitude Graticule Grid -->
        <g stroke="rgba(255,255,255,0.045)" stroke-width="1" stroke-dasharray="4,4">
          <line x1="0" y1="110" x2="960" y2="110" />
          <line x1="0" y1="200" x2="960" y2="200" />
          <line x1="0" y1="290" x2="960" y2="290" />
          <line x1="0" y1="380" x2="960" y2="380" />
          <line x1="180" y1="0" x2="180" y2="440" />
          <line x1="360" y1="0" x2="360" y2="440" />
          <line x1="540" y1="0" x2="540" y2="440" />
          <line x1="720" y1="0" x2="720" y2="440" />
          <line x1="880" y1="0" x2="880" y2="440" />
        </g>

        <!-- Compass Rose & Scale Reference (Top Right) -->
        <g transform="translate(895, 58)" opacity="0.75">
          <circle cx="0" cy="0" r="22" fill="rgba(12,18,28,0.8)" stroke="rgba(93,164,227,0.4)" stroke-width="1.2" />
          <polygon points="0,-16 4,-4 0,-7 -4,-4" fill="#ffd166" />
          <polygon points="0,16 4,4 0,7 -4,4" fill="#8cc4f7" opacity="0.6" />
          <text x="0" y="-20" fill="#ffd166" font-size="9" font-weight="800" text-anchor="middle">N</text>
          <text x="0" y="34" fill="#8cc4f7" font-size="8.5" text-anchor="middle">80°E — 88°E (~885 km)</text>
        </g>

        <!-- Drop Shadow under Nepal Silhouette -->
        <path d="${nepalPolygonPath}" fill="rgba(0,0,0,0.55)" transform="translate(4, 7)" />

        <!-- Clipped Interior Topographical Belts & Rivers of Nepal -->
        <g clip-path="url(#nepalBorderClip)">
          <!-- Base Topographical Fill -->
          <path d="${nepalPolygonPath}" fill="url(#nepalTopoGrad)" />

          <!-- Northern High Himalayan Alpine Snow Zone (>3,500m) -->
          <path d="M 40,55 L 920,275 L 920,210 L 40,20 Z" fill="rgba(210, 235, 255, 0.12)" />

          <!-- Middle Pahad / Mahabharat Coffee Belt (600m – 1,800m) -->
          <path d="M 45,155 Q 260,205 480,255 T 915,345 L 915,285 Q 640,245 450,195 T 45,115 Z"
            fill="url(#coffeeBeltGlow)" />

          <!-- Southern Terai Subtropical Plains (<300m) -->
          <path d="M 45,195 Q 320,295 570,342 T 915,392 L 915,430 L 45,430 Z"
            fill="rgba(217, 119, 36, 0.10)" />

          <!-- Major Himalayan River Systems (Karnali, Kali Gandaki, Trishuli, Sun Koshi, Tamor) -->
          <g fill="none" stroke="rgba(93, 164, 227, 0.32)" stroke-width="1.8" stroke-linecap="round">
            <!-- Karnali River (West) -->
            <path d="M 155,85 Q 168,145 142,225" />
            <!-- Kali Gandaki Gorge (Deepest Gorge, Past Mustang to Gulmi/Palpa/Syangja) -->
            <path d="M 424,167 Q 410,218 425,298" />
            <!-- Marshyangdi / Seti / Trishuli (Central-West to Chitwan) -->
            <path d="M 555,215 Q 525,260 505,328" />
            <!-- Sun Koshi & Indrawati (Central-East Bagmati) -->
            <path d="M 665,248 Q 685,295 735,355" />
            <!-- Arun & Tamor Rivers (Koshi East: Sankhuwasabha / Taplejung / Panchthar) -->
            <path d="M 805,276 Q 795,325 775,382" />
            <path d="M 882,296 Q 852,338 802,382" />
          </g>

          <!-- Subtle Province Region Watermarks -->
          <text x="125" y="162" fill="rgba(255,255,255,0.15)" font-size="11" font-weight="800" letter-spacing="1.5">SUDURPASHCHIM</text>
          <text x="255" y="175" fill="rgba(255,255,255,0.16)" font-size="12" font-weight="800" letter-spacing="1.8">KARNALI</text>
          <text x="330" y="278" fill="rgba(255,255,255,0.17)" font-size="11" font-weight="800" letter-spacing="1.5">LUMBINI</text>
          <text x="455" y="212" fill="rgba(255,255,255,0.19)" font-size="12" font-weight="800" letter-spacing="1.8">GANDAKI</text>
          <text x="615" y="286" fill="rgba(255,255,255,0.19)" font-size="11.5" font-weight="800" letter-spacing="1.5">BAGMATI</text>
          <text x="805" y="332" fill="rgba(255,255,255,0.19)" font-size="12" font-weight="800" letter-spacing="1.8">KOSHI</text>
        </g>

        <!-- Crisp Outer National Border of Nepal -->
        <path d="${nepalPolygonPath}"
          fill="none"
          stroke="#7bc0f7"
          stroke-width="2.4"
          stroke-linejoin="round" />

        <!-- Iconic 8,000m Himalayan Peaks along the Northern Border -->
        <g>
          <!-- Dhaulagiri (8,167m) -->
          <polygon points="366,148 378,124 390,148" fill="rgba(255,255,255,0.45)" stroke="#a8d5ff" stroke-width="0.8" />
          <text x="378" y="119" fill="#b8dcff" font-size="8.5" font-weight="600" text-anchor="middle">▲ Dhaulagiri (8167m)</text>

          <!-- Annapurna I (8,091m) -->
          <polygon points="442,176 454,152 466,176" fill="rgba(255,255,255,0.48)" stroke="#a8d5ff" stroke-width="0.8" />
          <text x="454" y="147" fill="#b8dcff" font-size="8.5" font-weight="600" text-anchor="middle">▲ Annapurna (8091m)</text>

          <!-- Manaslu (8,163m) -->
          <polygon points="506,194 517,171 528,194" fill="rgba(255,255,255,0.45)" stroke="#a8d5ff" stroke-width="0.8" />
          <text x="517" y="166" fill="#b8dcff" font-size="8.5" font-weight="600" text-anchor="middle">▲ Manaslu</text>

          <!-- Ganesh / Langtang (7,227m) -->
          <polygon points="605,246 616,224 627,246" fill="rgba(255,255,255,0.45)" stroke="#a8d5ff" stroke-width="0.8" />
          <text x="616" y="219" fill="#b8dcff" font-size="8.5" font-weight="600" text-anchor="middle">▲ Langtang</text>

          <!-- Mt. Everest / Sagarmatha (8,848m) -->
          <polygon points="756,276 770,245 784,276" fill="rgba(255,255,255,0.65)" stroke="#ffd166" stroke-width="1" />
          <text x="770" y="239" fill="#ffd166" font-size="9.2" font-weight="800" text-anchor="middle">▲ Mt. Everest (8848m)</text>

          <!-- Mt. Kanchenjunga (8,586m - Taplejung Border) -->
          <polygon points="884,304 898,274 912,304" fill="rgba(255,255,255,0.6)" stroke="#ffd166" stroke-width="1" />
          <text x="892" y="268" fill="#ffd166" font-size="9" font-weight="700" text-anchor="middle">▲ Kanchenjunga (8586m)</text>
        </g>

        <!-- All 13 Interactive District Pins & Non-Overlapping Callouts -->
        ${pinsHtml}
      </svg>

      <!-- Spacious Multi-Column District Selector Cards -->
      <div class="wide-locations-section">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
          <div style="font-size:0.84rem;font-weight:700;color:var(--cream);">
            🧭 Browse & Select from ${filteredLocations.length} Nepal Coffee Districts <span style="font-weight:400;color:var(--text-muted);font-size:0.77rem;">(Hover any card for microclimate preview, click to select)</span>
          </div>
          <div style="font-size:0.74rem;color:var(--accent-gold);">
            Sorted from 600m (Subtropical Basin) → 1,800m (Alpine Frost Frontier)
          </div>
        </div>
        <div class="wide-locations-grid">
          ${wideCardsHtml}
        </div>
      </div>
    `;
  }

  window.setMapRegionFilter = function (region) {
    state.mapRegionFilter = region;
    renderInteractiveNepalMap();
  };

  window.toggleMapZoom = function () {
    state.mapZoomCoffeeBelt = !state.mapZoomCoffeeBelt;
    renderInteractiveNepalMap();
  };

  function renderHimalayanVisualizer() {
    const loc = getLocation();
    const varietal = getVarietal();
    const box = document.getElementById("himalayan-visualizer");
    if (!box) return;

    const angleRad = (loc.slopeAngle * Math.PI) / 180;
    const baseLen = 230;
    const peakHeight = Math.min(165, Math.round(Math.tan(angleRad) * baseLen));
    const slopeTopY = 195 - peakHeight;
    const altRatio = (loc.altitude - 600) / 1200;
    const fissureTightness = Math.round(14 - altRatio * 10);

    box.innerHTML = `
      <div class="selected-place-showcase" style="animation: fadeInSlide 0.3s ease;">
        <!-- Left Column: Animated Slope Angle Sunlight & Bean Fissure SVG -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.55rem;flex-wrap:wrap;gap:0.4rem;">
            <div>
              <span class="stage-badge" style="margin-bottom:0;">☀️ Animated Hillside Sunlight & Bean Density Sim</span>
              <h4 style="font-size:1.15rem;color:var(--cream);margin-top:0.2rem;">${loc.name} (${loc.province})</h4>
            </div>
            <div style="text-align:right;font-size:0.76rem;color:#8cc4f7;background:rgba(93,164,227,0.12);padding:0.32rem 0.7rem;border-radius:8px;border:1px solid rgba(93,164,227,0.3);">
              <strong>⛰️ ${loc.altitude}m MASL</strong> • <strong>📐 θ = ${loc.slopeAngle}°</strong>
            </div>
          </div>

          <svg viewBox="0 0 540 225" style="width:100%;height:auto;background:linear-gradient(180deg,#0f1c2e 0%,#1d2b3a 58%,#1a1412 100%);border-radius:12px;border:1px solid rgba(255,255,255,0.12);">
            <defs>
              <linearGradient id="sunGlow" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#ffd166" stop-opacity="0.9"/>
                <stop offset="100%" stop-color="#ffd166" stop-opacity="0.0"/>
              </linearGradient>
              <linearGradient id="slopeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#4ea063"/>
                <stop offset="50%" stop-color="#3b5e3c"/>
                <stop offset="100%" stop-color="#2a1e17"/>
              </linearGradient>
            </defs>

            <!-- Distant Snow-Capped Himalayan Peaks -->
            <polygon points="0,140 55,65 110,140" fill="rgba(255,255,255,0.12)" />
            <polygon points="75,140 145,42 215,140" fill="rgba(255,255,255,0.18)" />
            <polygon points="120,78 145,42 170,78 158,85 145,70 132,85" fill="#e8f1f8" opacity="0.7" />
            <polygon points="170,140 240,55 310,140" fill="rgba(255,255,255,0.14)" />

            <!-- Drifting Himalayan Valley Cloud Mist -->
            <g class="svg-cloud-drift" opacity="0.45">
              <ellipse cx="215" cy="82" rx="34" ry="10" fill="#d8ecff" />
              <ellipse cx="235" cy="78" rx="24" ry="12" fill="#ffffff" />
            </g>

            <!-- Altitude Reference Lines -->
            <line x1="15" y1="45" x2="320" y2="45" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3,3" />
            <text x="20" y="41" fill="#8cc4f7" font-size="9" opacity="0.8">1,800m (Alpine Frost Frontier)</text>
            <line x1="15" y1="115" x2="320" y2="115" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3,3" />
            <text x="20" y="111" fill="#8cc4f7" font-size="9" opacity="0.8">1,200m (Mid-Hill Sweet Zone)</text>
            <line x1="15" y1="185" x2="320" y2="185" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3,3" />
            <text x="20" y="181" fill="#8cc4f7" font-size="9" opacity="0.8">600m (Subtropical River Basin)</text>

            <!-- Animated Sun & Solar Rays Hitting the Mountain Slope -->
            <circle cx="52" cy="36" r="18" fill="#ffd166" />
            <circle cx="52" cy="36" r="28" fill="url(#sunGlow)" opacity="0.6" />
            <line x1="70" y1="48" x2="175" y2="${Math.round((195 + slopeTopY) / 2)}" stroke="#ffd166" stroke-width="1.8" class="svg-sun-ray" opacity="0.85" />
            <line x1="65" y1="55" x2="135" y2="${Math.round(195 - peakHeight * 0.3)}" stroke="#ffd166" stroke-width="1.4" class="svg-sun-ray" opacity="0.65" />
            <line x1="76" y1="42" x2="225" y2="${Math.round(195 - peakHeight * 0.75)}" stroke="#ffd166" stroke-width="1.4" class="svg-sun-ray" opacity="0.65" />

            <!-- Dynamic Mountain Slope Triangle based on location.slopeAngle -->
            <polygon points="85,195 ${85 + baseLen},195 ${85 + baseLen},${slopeTopY}" fill="url(#slopeGrad)" stroke="#6bbf7d" stroke-width="2" />

            <!-- Slope Angle Arc & Label -->
            <path d="M 135,195 A 50,50 0 0,0 ${Math.round(85 + 50 * Math.cos(angleRad))},${Math.round(195 - 50 * Math.sin(angleRad))}" fill="none" stroke="#ffd166" stroke-width="2" />
            <text x="142" y="188" fill="#ffd166" font-size="11" font-weight="bold">θ = ${loc.slopeAngle}° (Show Only)</text>

            <!-- Coffee Marker Pin on Elevation -->
            <circle cx="${Math.round(85 + baseLen * (0.25 + 0.65 * altRatio))}" cy="${Math.round(195 - peakHeight * (0.25 + 0.65 * altRatio))}" r="7.5" fill="#d1433f" stroke="#fff" stroke-width="2" />
            <text x="${Math.round(85 + baseLen * (0.25 + 0.65 * altRatio)) - 35}" y="${Math.round(195 - peakHeight * (0.25 + 0.65 * altRatio)) - 12}" fill="#fff" font-size="10" font-weight="bold">📍 ${loc.altitude}m</text>

            <!-- Right Panel inside SVG: Green Bean Density & Fissure Cross-Section -->
            <rect x="345" y="16" width="180" height="192" rx="10" fill="rgba(18,13,11,0.85)" stroke="rgba(255,255,255,0.14)" />
            <text x="435" y="36" fill="#f7efe9" font-size="11" font-weight="bold" text-anchor="middle">Bean Density & Fissure</text>
            <text x="435" y="51" fill="#bba69b" font-size="9.5" text-anchor="middle">${varietal.name.split(" ")[0]} @ ${loc.altitude}m</text>

            <ellipse cx="435" cy="110" rx="${varietal.id === "pacamara" ? 36 : 28}" ry="${varietal.id === "typica" || varietal.id === "gesha" ? 44 : 36}" fill="${altRatio > 0.6 ? "#5e8c6a" : "#829c68"}" stroke="#b5d6b2" stroke-width="2" />
            <path d="M 435,${110 - 28} C ${435 - fissureTightness},${110 - 10} ${435 + fissureTightness},${110 + 10} 435,${110 + 28}" fill="none" stroke="#233626" stroke-width="${3.8 - altRatio * 1.8}" stroke-linecap="round" />

            <text x="435" y="172" fill="#e8a838" font-size="10.5" font-weight="bold" text-anchor="middle">${loc.beanDensity}</text>
            <text x="435" y="188" fill="#bba69b" font-size="9" text-anchor="middle">☀️ ${loc.sunlightHours.split(" (")[0]} • 🌡️ ${loc.avgTempC}°C</text>
            <text x="435" y="201" fill="#8cc4f7" font-size="8.5" text-anchor="middle">${altRatio >= 0.6 ? "High Sucrose & Citric/Malic Acid" : altRatio >= 0.3 ? "Balanced Sugars & Smooth Cocoa" : "Fast Growth: Earthy & Nutty"}</text>
          </svg>
        </div>

        <!-- Right Column: Selected Place Terroir Story, Microclimate Grid & Slope Rule -->
        <div style="display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            <div style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:0.95rem 1.05rem;">
              <div style="font-size:0.75rem;text-transform:uppercase;color:var(--accent-gold);font-weight:700;margin-bottom:0.35rem;letter-spacing:0.04em;">
                📖 Regional Terroir & Microclimate Story — ${loc.shortName || loc.name}
              </div>
              <p style="font-size:0.86rem;color:var(--text-main);line-height:1.58;">
                ${loc.terroirStory}
              </p>
            </div>

            <div class="stat-pills-grid" style="margin-top:0.85rem;">
              <div class="stat-pill">
                <div class="stat-pill-label">Elevation (Active Metric)</div>
                <div class="stat-pill-val" style="color:#8cc4f7;">${loc.altitude}m MASL</div>
              </div>
              <div class="stat-pill">
                <div class="stat-pill-label">Slope Angle (Visual Only)</div>
                <div class="stat-pill-val" style="color:#ffd166;">${loc.slopeAngle}° ${loc.slopeAspect.split(" ")[0]}</div>
              </div>
              <div class="stat-pill">
                <div class="stat-pill-label">Cherry Maturation</div>
                <div class="stat-pill-val" style="color:var(--accent-leaf);">${loc.maturationMonths} Months</div>
              </div>
              <div class="stat-pill">
                <div class="stat-pill-label">Mean Temperature</div>
                <div class="stat-pill-val" style="color:var(--cream);">${loc.avgTempC}°C</div>
              </div>
              <div class="stat-pill">
                <div class="stat-pill-label">Daily Solar Aspect</div>
                <div class="stat-pill-val" style="color:var(--accent-gold);font-size:0.82rem;">${loc.sunlightHours.split(" (")[0]}</div>
              </div>
              <div class="stat-pill">
                <div class="stat-pill-label">Green Bean Grade</div>
                <div class="stat-pill-val" style="color:#6bbf7d;font-size:0.82rem;">${loc.beanDensity.split(" (")[0]}</div>
              </div>
            </div>
          </div>

          <div class="slope-notice-banner">
            <span style="font-size:1.3rem;">☀️</span>
            <div>
              <strong>Slope Sunlight Rule:</strong> The <strong>${loc.slopeAngle}° ${loc.slopeAspect}</strong> mountain slope angle controls solar ray incidence in the visualizer on the left. Per game rules, slope angle has <strong>0 weight</strong> in the sensory taste formula—only <strong>Elevation (${loc.altitude}m)</strong> modifies bean chemistry!
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.selectVarietal = function (id) {
    state.varietalId = id;
    renderStage1();
    updateLiveSidebar();
  };

  window.selectLocation = function (id) {
    state.locationId = id;
    renderInteractiveNepalMap();
    renderHimalayanVisualizer();
    updateLiveSidebar();
  };

  // ==========================================================================
  // STAGE 2: FERMENTATION LAB (HOVER-POPOVER CARDS + ANIMATED BIOREACTOR)
  // ==========================================================================
  function renderStage2() {
    const grid = document.getElementById("fermentation-grid");
    grid.innerHTML = DATA.fermentations
      .map((f) => {
        const isSel = f.id === state.fermentationId;
        return `
        <div class="interactive-hover-card ${isSel ? "selected" : ""}" onclick="selectFermentation('${f.id}')">
          <div class="check-indicator">✓</div>
          <div style="display:flex;align-items:center;gap:0.7rem;">
            <span class="card-icon-anim">${f.icon}</span>
            <div>
              <h4 style="font-size:1.06rem;color:var(--cream);font-weight:700;">${f.name}</h4>
              <div style="font-size:0.74rem;color:${f.color};font-weight:600;">☀️ Dry: ${f.dryingTime}</div>
            </div>
          </div>

          <div class="tag-row">
            ${f.flavorNotes.map((n) => `<span class="mini-tag highlight">${n}</span>`).join("")}
          </div>

          <div class="hover-hint-pill">✨ Hover to reveal microbiology & cup impact</div>

          <div class="hover-popout-drawer">
            <p style="font-size:0.79rem;color:var(--text-muted);margin-bottom:0.45rem;">
              🔬 <strong>Microbiology:</strong> ${f.microbiology}
            </p>
            <p style="font-size:0.79rem;color:var(--text-main);margin-bottom:0.45rem;">
              ☕ <strong>Sensory Impact:</strong> ${f.sensoryImpact}
            </p>
            <div style="font-size:0.72rem;color:var(--text-dim);">
              ⏱️ Fermentation: ${f.fermentTime}
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    renderFermentationVisualizer();
  }

  function renderFermentationVisualizer() {
    const f = getFermentation();
    const box = document.getElementById("fermentation-visualizer");

    const showSkin = f.id === "sundried" || f.id === "anaerobic";
    const showMucilage = f.id === "honey" || f.id === "sundried" || f.id === "anaerobic";

    box.innerHTML = `
      <div style="display:grid;grid-template-columns:1.05fr 1.15fr;gap:1.2rem;align-items:center;">
        <svg viewBox="0 0 310 230" style="width:100%;height:auto;background:#140f0d;border-radius:12px;border:1px solid rgba(255,255,255,0.1);">
          <text x="155" y="24" fill="#f7efe9" font-size="11.5" font-weight="bold" text-anchor="middle">Interactive Cherry Anatomy: ${f.name.split(" ")[0]}</text>

          <!-- Process-Specific Animated Background Effects -->
          ${
            f.id === "anaerobic"
              ? `
            <rect x="42" y="34" width="226" height="162" rx="14" fill="rgba(171,116,176,0.12)" stroke="#ab74b0" stroke-width="2" stroke-dasharray="5,3" />
            <text x="155" y="50" fill="#d3a6d6" font-size="9.5" font-weight="bold" text-anchor="middle">🔒 Sealed O₂-Free Bioreactor (CO₂ Bubbles)</text>
            <circle cx="78" cy="165" r="5" fill="#d3a6d6" class="svg-bubble-1" />
            <circle cx="232" cy="155" r="6" fill="#d3a6d6" class="svg-bubble-2" />
            <circle cx="95" cy="145" r="4" fill="#d3a6d6" class="svg-bubble-3" />
            <circle cx="212" cy="168" r="4.5" fill="#d3a6d6" class="svg-bubble-1" />
          `
              : f.id === "pulped"
              ? `
            <text x="155" y="48" fill="#8cc4f7" font-size="9.5" font-weight="bold" text-anchor="middle">💧 Mountain Spring Water Channel Washing</text>
            <circle cx="80" cy="160" r="4" fill="#5da4e3" class="svg-bubble-1" />
            <circle cx="230" cy="160" r="4" fill="#5da4e3" class="svg-bubble-2" />
          `
              : f.id === "sundried"
              ? `
            <text x="155" y="48" fill="#ffd166" font-size="9.5" font-weight="bold" text-anchor="middle">☀️ Whole Intact Cherry Solar Drying (22–30 Days)</text>
          `
              : `
            <text x="155" y="48" fill="#e8a838" font-size="9.5" font-weight="bold" text-anchor="middle">🍯 Sticky Golden Mucilage Caramelizing on Parchment</text>
          `
          }

          <!-- Layer 1: Outer Exocarp (Cherry Skin) -->
          <ellipse cx="155" cy="124" rx="84" ry="62"
            fill="${showSkin ? "rgba(209, 67, 63, 0.38)" : "none"}"
            stroke="${showSkin ? "#d1433f" : "rgba(255,255,255,0.15)"}"
            stroke-width="${showSkin ? "3" : "1"}"
            stroke-dasharray="${showSkin ? "none" : "4,4"}" />

          <!-- Layer 2: Mesocarp (Sticky Honey Mucilage) -->
          <ellipse cx="155" cy="124" rx="65" ry="48"
            fill="${showMucilage ? "rgba(232, 168, 56, 0.36)" : "none"}"
            stroke="${showMucilage ? "#e8a838" : "rgba(255,255,255,0.15)"}"
            stroke-width="${showMucilage ? "2.5" : "1"}"
            stroke-dasharray="${showMucilage ? "none" : "3,3"}" />

          <!-- Layer 3: Endocarp (Parchment Hull) -->
          <ellipse cx="155" cy="124" rx="46" ry="34"
            fill="rgba(235, 217, 185, 0.2)"
            stroke="#ebd9b9"
            stroke-width="2" />

          <!-- Layer 4: Twin Green Beans (Endosperm) -->
          <ellipse cx="138" cy="124" rx="16" ry="23" fill="#4ea063" stroke="#b5e5c3" stroke-width="1.5" />
          <line x1="138" y1="106" x2="138" y2="142" stroke="#1e3824" stroke-width="2" />
          <ellipse cx="172" cy="124" rx="16" ry="23" fill="#4ea063" stroke="#b5e5c3" stroke-width="1.5" />
          <line x1="172" y1="106" x2="172" y2="142" stroke="#1e3824" stroke-width="2" />

          <text x="155" y="214" fill="#bba69b" font-size="9.5" text-anchor="middle">
            ${showSkin ? "Skin + Pulp + Mucilage Intact" : showMucilage ? "Skin Pulped Off • Sticky Honey Mucilage Kept" : "Skin & Mucilage Washed Off • Clean Parchment"}
          </text>
        </svg>

        <div>
          <span class="stage-badge">Microbial & Sugar Diffusion Lab</span>
          <h4 style="font-size:1.15rem;color:var(--cream);margin:0.2rem 0 0.5rem;">How ${f.name} Transforms the Bean</h4>
          <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.6rem;">
            ${f.sensoryImpact}
          </p>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.7rem;background:rgba(0,0,0,0.28);padding:0.6rem 0.75rem;border-radius:9px;">
            <div style="margin-bottom:0.3rem;">✅ <strong>Layers Kept:</strong> <span style="color:var(--cream);">${f.keptLayers.join(" → ")}</span></div>
            <div>❌ <strong>Removed:</strong> <span style="color:#ff8a87;">${f.removedLayers.join(", ")}</span></div>
          </div>
          <div class="stat-pills-grid" style="grid-template-columns:repeat(4,1fr);">
            <div class="stat-pill">
              <div class="stat-pill-label">Acidity Δ</div>
              <div class="stat-pill-val" style="color:${f.modifiers.acidity >= 0 ? "#4ea063" : "#e8a838"};">${f.modifiers.acidity >= 0 ? "+" : ""}${f.modifiers.acidity}</div>
            </div>
            <div class="stat-pill">
              <div class="stat-pill-label">Sweetness Δ</div>
              <div class="stat-pill-val" style="color:${f.modifiers.sweetness >= 0 ? "#4ea063" : "#e8a838"};">${f.modifiers.sweetness >= 0 ? "+" : ""}${f.modifiers.sweetness}</div>
            </div>
            <div class="stat-pill">
              <div class="stat-pill-label">Body Δ</div>
              <div class="stat-pill-val" style="color:${f.modifiers.body >= 0 ? "#4ea063" : "#5da4e3"};">${f.modifiers.body >= 0 ? "+" : ""}${f.modifiers.body}</div>
            </div>
            <div class="stat-pill">
              <div class="stat-pill-label">Funk/Wine Δ</div>
              <div class="stat-pill-val" style="color:#ab74b0;">${f.modifiers.funkSpice >= 0 ? "+" : ""}${f.modifiers.funkSpice}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.selectFermentation = function (id) {
    state.fermentationId = id;
    renderStage2();
    updateLiveSidebar();
  };

  // ==========================================================================
  // STAGE 3: SPINNING DRUM ROASTER & HOVER SPECTRUM CARDS
  // ==========================================================================
  function renderStage3() {
    const bench = getRoastBenchmark();
    const r = state.roastSlider / 100;
    const tempC = Math.round(188 + 52 * r);
    const agtron = Math.round(88 - 62 * r);

    // Preset buttons with hover pop-up tooltips!
    const presetsEl = document.getElementById("roast-presets-bar");
    presetsEl.innerHTML = DATA.roastBenchmarks
      .map(
        (b) => `
      <div class="roast-preset-btn ${bench.id === b.id ? "active" : ""}" onclick="setRoastSlider(${b.sliderVal})">
        <div style="width:16px;height:16px;border-radius:50%;background:${b.beanColor};margin:0 auto 0.25rem;border:1px solid rgba(255,255,255,0.35);"></div>
        <div style="font-weight:700;font-size:0.72rem;">${b.name.split(" ")[0]}</div>
        <div style="font-size:0.65rem;opacity:0.8;">${b.tempC}°C</div>
        <div class="roast-hover-tip">
          <div style="font-weight:700;color:var(--accent-gold);margin-bottom:0.2rem;">${b.name} (${b.tempC}°C)</div>
          <div style="margin-bottom:0.25rem;color:var(--cream);">${b.crackStage} • Agtron #${b.agtron}</div>
          <div style="color:var(--text-muted);">${b.profileNote}</div>
        </div>
      </div>
    `
      )
      .join("");

    const sliderEl = document.getElementById("roast-spectrum-slider");
    if (sliderEl) sliderEl.value = state.roastSlider;

    const viz = document.getElementById("roast-visualizer");
    const oilOpacity = r > 0.7 ? (r - 0.7) * 2.8 : 0;
    const scaleFactor = (1 + 0.32 * r).toFixed(2);

    const originPct = Math.round((1 - 0.52 * Math.pow(r, 1.65)) * 100);
    const caramelPct = Math.round(Math.exp(-Math.pow((r - 0.46) / 0.28, 2)) * 100);
    const pyrolysisPct = Math.round(Math.pow(r, 1.75) * 100);

    viz.innerHTML = `
      <div class="roaster-dashboard">
        <div class="visualizer-box" style="text-align:center;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
            <span class="stage-badge" style="margin:0;">🔥 Drum Temp: ${tempC}°C</span>
            <span style="font-size:0.78rem;color:var(--text-muted);">Agtron Color: <strong>#${agtron}</strong></span>
          </div>

          <svg viewBox="0 0 260 185" style="width:100%;max-width:280px;height:auto;margin:0 auto;">
            <defs>
              <radialGradient id="beanOilSheen" cx="35%" cy="30%" r="50%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="${oilOpacity.toFixed(2)}" />
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
              </radialGradient>
            </defs>

            <!-- Rising Roast Aroma / Smoke Waves -->
            ${
              r > 0.35
                ? `
              <path d="M 95,35 Q 90,22 100,12" fill="none" stroke="rgba(255,255,255,${(0.15 + r * 0.35).toFixed(2)})" stroke-width="2" class="svg-steam-1" />
              <path d="M 130,30 Q 135,18 128,8" fill="none" stroke="rgba(255,255,255,${(0.15 + r * 0.35).toFixed(2)})" stroke-width="2" class="svg-steam-2" />
              <path d="M 165,35 Q 160,22 170,12" fill="none" stroke="rgba(255,255,255,${(0.15 + r * 0.35).toFixed(2)})" stroke-width="2" class="svg-steam-3" />
            `
                : ""
            }

            <!-- Rotating Drum Ring -->
            <circle cx="130" cy="92" r="72" fill="#181210" stroke="#4d382e" stroke-width="4" />
            <circle cx="130" cy="92" r="64" fill="none" stroke="rgba(232,168,56,0.28)" stroke-width="2" stroke-dasharray="8,6" class="svg-drum-spin" />

            <!-- Tumbling & Expanding Coffee Bean Inside Drum -->
            <g transform="translate(130, 92) scale(${scaleFactor})">
              <g class="svg-bean-tumble">
                <ellipse cx="0" cy="0" rx="24" ry="33" fill="${bench.beanColor}" stroke="rgba(255,255,255,0.22)" stroke-width="1.2" />
                <ellipse cx="0" cy="0" rx="24" ry="33" fill="url(#beanOilSheen)" />
                <path d="M 0,-25 C -5,-8 5,8 0,25" fill="none" stroke="#140904" stroke-width="2.6" stroke-linecap="round" />
              </g>
            </g>

            <!-- Crack Milestone Badge -->
            <rect x="22" y="154" width="216" height="23" rx="6" fill="rgba(0,0,0,0.75)" stroke="rgba(232,168,56,0.35)" />
            <text x="130" y="169" fill="#ffd166" font-size="10" font-weight="bold" text-anchor="middle">${bench.crackStage}</text>
          </svg>

          <div style="margin-top:0.6rem;display:flex;justify-content:center;gap:0.6rem;flex-wrap:wrap;">
            <button class="btn-primary" style="padding:0.48rem 0.95rem;font-size:0.8rem;" onclick="toggleRoasterSim()">
              ${state.roasterSim.running ? "🛑 Drop Beans to Cooling Tray!" : "🔥 Start Live Drum Roast"}
            </button>
          </div>
        </div>

        <div>
          <span class="stage-badge">${bench.name} (${state.roastSlider}% Roast Spectrum)</span>
          <h4 style="font-size:1.2rem;color:var(--cream);margin-top:0.2rem;">Thermal Chemistry & Maillard Transformation</h4>
          <p style="font-size:0.83rem;color:var(--text-muted);margin:0.45rem 0;">
            ${bench.chemistry}
          </p>
          <p style="font-size:0.83rem;color:var(--text-main);margin-bottom:0.85rem;">
            <strong>Sensory Result:</strong> ${bench.profileNote}
          </p>

          <div class="meter-bar-wrap">
            <div class="meter-label-row">
              <span>🌿 Origin Terroir & Floral Preservation</span>
              <strong style="color:#4ea063;">${originPct}%</strong>
            </div>
            <div class="meter-track"><div class="meter-fill" style="width:${originPct}%;background:#4ea063;"></div></div>
          </div>

          <div class="meter-bar-wrap">
            <div class="meter-label-row">
              <span>🍯 Sucrose Caramelization & Maillard Sweetness</span>
              <strong style="color:#e8a838;">${caramelPct}%</strong>
            </div>
            <div class="meter-track"><div class="meter-fill" style="width:${caramelPct}%;background:#e8a838;"></div></div>
          </div>

          <div class="meter-bar-wrap">
            <div class="meter-label-row">
              <span>🔥 Cellulose Pyrolysis & Roast Bitterness</span>
              <strong style="color:#d1433f;">${pyrolysisPct}%</strong>
            </div>
            <div class="meter-track"><div class="meter-fill" style="width:${pyrolysisPct}%;background:#d1433f;"></div></div>
          </div>

          <div class="stat-pills-grid">
            <div class="stat-pill">
              <div class="stat-pill-label">Weight Loss</div>
              <div class="stat-pill-val">${bench.massLoss}</div>
            </div>
            <div class="stat-pill">
              <div class="stat-pill-label">Bean Expansion</div>
              <div class="stat-pill-val" style="color:var(--accent-gold);">${bench.expansion}</div>
            </div>
            <div class="stat-pill">
              <div class="stat-pill-label">Surface Oils</div>
              <div class="stat-pill-val">${r > 0.72 ? "Glossy Oil Sheen" : r > 0.58 ? "Satin Finish" : "Dry Matte"}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.setRoastSlider = function (val) {
    if (state.roasterSim.running) stopRoasterSim();
    state.roastSlider = Number(val);
    renderStage3();
    updateLiveSidebar();
  };

  window.toggleRoasterSim = function () {
    if (state.roasterSim.running) {
      stopRoasterSim();
      return;
    }
    state.roasterSim.running = true;
    state.roastSlider = 2;
    renderStage3();
    state.roasterSim.timer = setInterval(() => {
      state.roastSlider += 2;
      if (state.roastSlider >= 100) {
        state.roastSlider = 100;
        stopRoasterSim();
      }
      renderStage3();
      updateLiveSidebar();
    }, 140);
  };

  function stopRoasterSim() {
    state.roasterSim.running = false;
    if (state.roasterSim.timer) {
      clearInterval(state.roasterSim.timer);
      state.roasterSim.timer = null;
    }
    renderStage3();
    updateLiveSidebar();
  }

  // ==========================================================================
  // STAGE 4: HOVER-POPOVER BREW METHODS & ANIMATED EXTRACTION LAB
  // ==========================================================================
  function renderStage4() {
    const brewGrid = document.getElementById("brew-methods-grid");
    brewGrid.innerHTML = DATA.brewMethods
      .map((b) => {
        const isSel = b.id === state.brewMethodId;
        return `
        <div class="interactive-hover-card ${isSel ? "selected" : ""}" onclick="selectBrewMethod('${b.id}')">
          <div class="check-indicator">✓</div>
          <div style="display:flex;align-items:center;gap:0.7rem;">
            <span class="card-icon-anim">${b.icon}</span>
            <div>
              <h4 style="font-size:1.05rem;color:var(--cream);font-weight:700;">${b.name}</h4>
              <div style="font-size:0.73rem;color:var(--accent-gold);font-weight:600;">🎯 Ideal Grind: ${b.idealMicrons[0]}–${b.idealMicrons[1]} µm</div>
            </div>
          </div>

          <div class="tag-row">
            <span class="mini-tag highlight">${b.ratioLabel}</span>
            <span class="mini-tag">${b.category.split(" / ")[1] || b.category}</span>
          </div>

          <div class="hover-hint-pill">✨ Hover to reveal extraction & filtration physics</div>

          <div class="hover-popout-drawer">
            <p style="font-size:0.8rem;color:var(--text-main);margin-bottom:0.4rem;">
              ${b.science}
            </p>
            <div style="font-size:0.72rem;color:#8cc4f7;">
              ⏳ Default Contact Time: <strong>${formatSeconds(b.defaultTimeSec)}</strong> @ <strong>${b.defaultTempC}°C</strong>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    renderExtractionControls();
    drawGrindParticles();
  }

  function renderExtractionControls() {
    const brew = getBrewMethod();
    const report = calculateTasteProfile();
    const micron = state.grindMicrons;

    let grindLabel = "Medium (Filter Drip)";
    if (micron < 260) grindLabel = "Extra-Fine (Turkish / Ristretto)";
    else if (micron <= 390) grindLabel = "Fine (Espresso)";
    else if (micron <= 560) grindLabel = "Medium-Fine (AeroPress / Cone V60)";
    else if (micron <= 760) grindLabel = "Medium (Pour-Over / Flat Drip)";
    else if (micron <= 940) grindLabel = "Medium-Coarse (Chemex / Clever)";
    else grindLabel = "Coarse (French Press / Immersion)";

    const inSweetSpot = micron >= brew.idealMicrons[0] && micron <= brew.idealMicrons[1];

    const panel = document.getElementById("extraction-controls-panel");
    panel.innerHTML = `
      <div style="display:grid;grid-template-columns:1.15fr 1fr;gap:1.25rem;align-items:start;">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.35rem;">
            <label style="font-weight:700;color:var(--cream);font-size:0.95rem;">⚙️ Burr Grinder Setting: <span style="color:var(--accent-gold);">${micron} µm (${grindLabel})</span></label>
          </div>
          <input type="range" min="200" max="1200" step="10" value="${micron}" class="custom-slider grind-slider" oninput="setGrindMicrons(this.value)" />
          <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem;">
            <span>200 µm (Fine Espresso Powder)</span>
            <span>680 µm (Medium Filter)</span>
            <span>1,200 µm (Coarse Sea Salt)</span>
          </div>

          <div style="margin-top:0.85rem;display:flex;gap:0.45rem;flex-wrap:wrap;">
            <button class="quest-pill" onclick="setGrindMicrons(${brew.sweetSpotMicron})">
              🎯 Snap to ${brew.name.split(" ")[0]} Sweet Spot (${brew.sweetSpotMicron} µm)
            </button>
            <button class="quest-pill" onclick="setGrindMicrons(260)">Fine (260 µm)</button>
            <button class="quest-pill" onclick="setGrindMicrons(680)">Medium (680 µm)</button>
            <button class="quest-pill" onclick="setGrindMicrons(1020)">Coarse (1020 µm)</button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1.1rem;">
            <div style="background:var(--bg-panel);padding:0.75rem;border-radius:10px;border:1px solid var(--border-subtle);">
              <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.35rem;">
                <span>⏱️ Contact Time</span>
                <strong style="color:var(--accent-gold);">${formatSeconds(state.brewTimeSec)}</strong>
              </div>
              <input type="range" min="${brew.timeRangeSec[0]}" max="${brew.timeRangeSec[1]}" step="5" value="${state.brewTimeSec}" style="width:100%;accent-color:var(--accent-gold);" oninput="setBrewTime(this.value)" />
              <div style="font-size:0.7rem;color:var(--text-dim);margin-top:0.2rem;">Default for ${brew.name.split(" ")[0]}: ${formatSeconds(brew.defaultTimeSec)}</div>
            </div>

            <div style="background:var(--bg-panel);padding:0.75rem;border-radius:10px;border:1px solid var(--border-subtle);">
              <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.35rem;">
                <span>🌡️ Water Temperature</span>
                <strong style="color:#8cc4f7;">${state.waterTempC}°C</strong>
              </div>
              <input type="range" min="85" max="98" step="1" value="${state.waterTempC}" style="width:100%;accent-color:#5da4e3;" oninput="setWaterTemp(this.value)" />
              <div style="font-size:0.7rem;color:var(--text-dim);margin-top:0.2rem;">Higher temp accelerates extraction kinetics</div>
            </div>
          </div>

          <div style="margin-top:1rem;padding:0.9rem;border-radius:10px;background:rgba(0,0,0,0.35);border-left:4px solid ${report.extractionBadgeColor};">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem;">
              <strong style="color:${report.extractionBadgeColor};font-size:0.9rem;">${report.extractionStatus}</strong>
              <span style="font-size:0.82rem;font-weight:700;color:var(--cream);">EY: ${report.extractionYield}% | TDS: ${report.tds}%</span>
            </div>
            <p style="font-size:0.8rem;color:var(--text-muted);">${report.extractionAdvice}</p>
          </div>
        </div>

        <div class="visualizer-box" style="text-align:center;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.45rem;">
            <span style="font-size:0.8rem;font-weight:700;color:var(--cream);">🔬 Burr Particles & Live Brew Stream</span>
            <span style="font-size:0.72rem;padding:0.15rem 0.5rem;border-radius:99px;background:${inSweetSpot ? "rgba(78,160,99,0.22)" : "rgba(209,67,63,0.22)"};color:${inSweetSpot ? "#6bbf7d" : "#ff8a87"};">
              ${inSweetSpot ? "✓ Grind Matches Method" : "⚠️ Grind / Method Mismatch"}
            </span>
          </div>
          <canvas id="grind-particles-canvas" width="320" height="155" style="width:100%;height:auto;border-radius:8px;background:#0c0908;border:1px solid rgba(255,255,255,0.08);"></canvas>

          <!-- Animated Drip / Espresso Stream Indicator -->
          <svg viewBox="0 0 320 72" style="width:100%;height:auto;margin-top:0.4rem;background:#16100e;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
            <text x="16" y="24" fill="#f7efe9" font-size="10" font-weight="bold">${brew.icon} ${brew.name.split(" ")[0]} Extraction Flow</text>
            <text x="16" y="42" fill="#bba69b" font-size="8.8">1️⃣ Acids (Early) → 2️⃣ Sugars (Mid) → 3️⃣ Tannins (Late)</text>
            <text x="16" y="58" fill="${report.extractionBadgeColor}" font-size="9" font-weight="bold">Yield: ${report.extractionYield}% (Ideal: 18%–22%)</text>
            <!-- Animated Falling Coffee Drops into Cup -->
            <circle cx="275" cy="14" r="3.5" fill="${report.roastBenchmark.beanColor}" class="svg-drip" />
            <rect x="255" y="42" width="40" height="22" rx="5" fill="${report.roastBenchmark.beanColor}" stroke="#e8a838" stroke-width="1.5" />
            <path d="M 295,46 C 304,46 304,58 295,58" fill="none" stroke="#e8a838" stroke-width="2" />
          </svg>
        </div>
      </div>
    `;
  }

  function drawGrindParticles() {
    const canvas = document.getElementById("grind-particles-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bench = getRoastBenchmark();
    const micron = state.grindMicrons;
    const baseRadius = 2.0 + ((micron - 200) / 1000) * 9.5;
    const count = Math.round(230 - ((micron - 200) / 1000) * 175);

    let seed = micron * 13 + state.roastSlider * 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < count; i++) {
      const cx = 16 + rand() * (w - 32);
      const cy = 16 + rand() * (h - 32);
      const r = baseRadius * (0.75 + rand() * 0.55);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rand() * Math.PI * 2);
      ctx.beginPath();
      const sides = 6;
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2;
        const rad = r * (0.78 + rand() * 0.35);
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = bench.beanColor;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  window.selectBrewMethod = function (id) {
    state.brewMethodId = id;
    const brew = getBrewMethod(id);
    state.brewTimeSec = brew.defaultTimeSec;
    state.waterTempC = brew.defaultTempC;
    renderStage4();
    updateLiveSidebar();
  };

  window.setGrindMicrons = function (val) {
    state.grindMicrons = Number(val);
    renderExtractionControls();
    drawGrindParticles();
    updateLiveSidebar();
  };

  window.setBrewTime = function (val) {
    state.brewTimeSec = Number(val);
    renderExtractionControls();
    drawGrindParticles();
    updateLiveSidebar();
  };

  window.setWaterTemp = function (val) {
    state.waterTempC = Number(val);
    renderExtractionControls();
    drawGrindParticles();
    updateLiveSidebar();
  };

  function formatSeconds(sec) {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m 00s`;
  }

  // ==========================================================================
  // STAGE 5: FINAL TASTE PROFILE & CUPPING REPORT
  // ==========================================================================
  function renderStage5() {
    const report = calculateTasteProfile();
    const container = document.getElementById("stage-5-report-container");
    const questEvalHtml = renderQuestEvaluation(report);

    container.innerHTML = `
      ${questEvalHtml}

      <div class="card" style="background:linear-gradient(135deg, #261b16 0%, #18110e 100%);border-color:var(--accent-gold);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
          <div style="display:flex;align-items:center;gap:1rem;">
            <!-- Animated Steaming Brew Cup SVG -->
            <svg viewBox="0 0 76 76" style="width:68px;height:68px;flex-shrink:0;">
              <path d="M 26,22 Q 23,12 29,6" fill="none" stroke="#ffd166" stroke-width="2" stroke-linecap="round" class="svg-steam-1" />
              <path d="M 38,20 Q 41,10 35,4" fill="none" stroke="#ffd166" stroke-width="2" stroke-linecap="round" class="svg-steam-2" />
              <path d="M 50,22 Q 47,12 53,6" fill="none" stroke="#ffd166" stroke-width="2" stroke-linecap="round" class="svg-steam-3" />
              <path d="M 14,28 L 62,28 L 56,58 C 55,64 48,68 38,68 C 28,68 21,64 20,58 Z" fill="#2b1e19" stroke="#e8a838" stroke-width="2.2" />
              <ellipse cx="38" cy="28" rx="24" ry="5.5" fill="${report.roastBenchmark.beanColor}" stroke="#e8a838" stroke-width="1.5" />
              <path d="M 60,34 C 70,34 70,50 57,50" fill="none" stroke="#e8a838" stroke-width="3" stroke-linecap="round" />
            </svg>
            <div>
              <span class="stage-badge">🏆 Final Sensory Cupping Report</span>
              <h2 style="font-size:1.55rem;color:var(--cream);">
                ${report.location.name.split(",")[0]} ${report.varietal.name.split(" ")[0]} — ${report.ferment.name.split(" ")[0]} ${report.roastBenchmark.name.split(" ")[0]}
              </h2>
              <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0.2rem;">
                📍 ${report.location.altitude}m MASL (Slope ${report.location.slopeAngle}° Visual) • ${report.ferment.name} • ${report.roastBenchmark.name} (${report.roastBenchmark.tempC}°C) • ${report.brew.name} @ ${report.grindMicrons} µm
              </p>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:1rem;">
            <div style="text-align:center;background:rgba(232,168,56,0.14);border:1.5px solid var(--accent-gold);padding:0.65rem 1.1rem;border-radius:14px;">
              <div style="font-size:0.7rem;text-transform:uppercase;color:var(--accent-gold);font-weight:700;">Cupping Score</div>
              <div style="font-size:1.85rem;font-weight:800;color:var(--cream);line-height:1.1;">${report.scaScore}</div>
              <div style="font-size:0.68rem;color:var(--text-muted);">SCA Scale / 100</div>
            </div>
            <button class="btn-primary" onclick="saveCurrentBrew()">
              📌 Save to Flight (${state.savedBrews.length})
            </button>
          </div>
        </div>

        <div style="margin-top:1rem;padding-top:0.85rem;border-top:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;">
            ✨ Dominant Cup Tasting Notes & Aromatics:
          </div>
          <div class="flavor-wheel-tags">
            ${report.tastingNotes
              .map(
                (n) => `
              <span class="tasting-note-chip" style="background:${n.color}28;border:1px solid ${n.color};color:var(--cream);">
                <span>${n.icon}</span>
                <span>${n.label}</span>
              </span>
            `
              )
              .join("")}
          </div>
        </div>
      </div>

      <div class="report-grid">
        <div class="card">
          <div class="card-header">
            <div>
              <span class="stage-badge">Sensory Polygon</span>
              <h3 class="card-title" style="font-size:1.2rem;">8-Axis Taste Profile Radar</h3>
            </div>
          </div>
          <div style="text-align:center;">
            ${buildRadarChartSVG(report.finalScores)}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <span class="stage-badge">Physics of Extraction</span>
              <h3 class="card-title" style="font-size:1.2rem;">SCA Brewing Control Chart</h3>
            </div>
            <span style="font-size:0.78rem;color:${report.extractionBadgeColor};font-weight:700;">EY: ${report.extractionYield}%</span>
          </div>
          <div style="text-align:center;">
            ${buildBrewControlChartSVG(report)}
          </div>
          <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.65rem;">
            ${report.extractionAdvice}
          </p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <span class="stage-badge">Transparent Calculation Metric</span>
            <h3 class="card-title" style="font-size:1.25rem;">How Your Coffee's Taste Profile Was Calculated</h3>
            <p class="card-desc">
              Every sensory dimension (0–100) is computed from your 5 stage choices. Notice that <strong>Origin Retention is ${report.originRetentionPct}%</strong> at your chosen roast level, and <strong>Slope Angle (${report.location.slopeAngle}°)</strong> contributes <strong>0</strong> as a visual-only sunlight indicator.
            </p>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table class="metric-table">
            <thead>
              <tr>
                <th>Sensory Attribute</th>
                <th>1. Varietal (${report.varietal.name.split(" ")[0]})</th>
                <th>2a. Altitude (${report.location.altitude}m)</th>
                <th>2b. Slope (${report.location.slopeAngle}° Show Only)</th>
                <th>3. Process (${report.ferment.name.split(" ")[0]})</th>
                <th>4. Roast (${report.roastBenchmark.name.split(" ")[0]})</th>
                <th>5. Grind & Brew (${report.grindMicrons}µm)</th>
                <th>Final Score (0–100)</th>
              </tr>
            </thead>
            <tbody>
              ${renderBreakdownRows(report)}
            </tbody>
          </table>
        </div>
      </div>

      ${renderSavedFlightSection()}
    `;
  }

  function renderQuestEvaluation(report) {
    const quest = DATA.quests.find((q) => q.id === state.activeQuestId);
    if (!quest || !quest.target) return "";

    const checks = [];
    const s = report.finalScores;
    for (const [k, rule] of Object.entries(quest.target)) {
      if (k === "eyBalanced") {
        const pass = report.extractionYield >= 18.0 && report.extractionYield <= 22.0;
        checks.push({ label: "Extraction Yield 18%–22%", pass, actual: `${report.extractionYield}%` });
      } else {
        const labelName = formatMetricName(k);
        if (rule.min !== undefined) {
          checks.push({ label: `${labelName} ≥ ${rule.min}`, pass: s[k] >= rule.min, actual: s[k] });
        }
        if (rule.max !== undefined) {
          checks.push({ label: `${labelName} ≤ ${rule.max}`, pass: s[k] <= rule.max, actual: s[k] });
        }
      }
    }

    const allPassed = checks.every((c) => c.pass);
    return `
      <div class="card" style="border-color:${allPassed ? "#4ea063" : "#e8a838"};background:${allPassed ? "rgba(78,160,99,0.12)" : "rgba(232,168,56,0.1)"};">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;">
          <div>
            <span class="stage-badge">${quest.icon} ${quest.name}</span>
            <h3 style="font-size:1.15rem;color:var(--cream);">
              ${allPassed ? "🎉 Quest Completed! Master Himalayan Roaster-Barista!" : "🔬 Quest Progress — Adjust Stages to Hit All Targets:"}
            </h3>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            ${checks
              .map(
                (c) => `
              <span style="padding:0.35rem 0.7rem;border-radius:8px;font-size:0.78rem;font-weight:700;background:rgba(0,0,0,0.4);border:1px solid ${c.pass ? "#4ea063" : "#d1433f"};color:${c.pass ? "#6bbf7d" : "#ff8a87"};">
                ${c.pass ? "✓" : "✗"} ${c.label} (Yours: ${c.actual})
              </span>
            `
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderBreakdownRows(r) {
    const metrics = [
      { key: "acidity", label: "🍋 Acidity (Brightness)" },
      { key: "sweetness", label: "🍯 Sweetness (Sugars)" },
      { key: "body", label: "☕ Body (Mouthfeel)" },
      { key: "fruityFloral", label: "🌸 Fruity & Floral" },
      { key: "chocoNut", label: "🍫 Chocolate & Nutty" },
      { key: "funkSpice", label: "🍷 Ferment Funk & Spice" },
      { key: "bitterness", label: "🔥 Bitterness (Roast/Tannin)" },
      { key: "clarity", label: "💎 Clarity (Cleanliness)" }
    ];

    const fmtDelta = (val) => {
      if (val > 0) return `<span style="color:#6bbf7d;font-weight:600;">+${val}</span>`;
      if (val < 0) return `<span style="color:#ff8a87;font-weight:600;">${val}</span>`;
      return `<span style="color:var(--text-dim);">0</span>`;
    };

    return metrics
      .map(
        (m) => `
      <tr>
        <td style="font-weight:600;color:var(--cream);">${m.label}</td>
        <td>${r.base[m.key]}</td>
        <td>${fmtDelta(r.effectiveAltDelta[m.key])}</td>
        <td><span style="color:var(--text-dim);font-style:italic;">0 (Excluded)</span></td>
        <td>${fmtDelta(r.effectiveFermDelta[m.key])}</td>
        <td>${fmtDelta(r.roastDelta[m.key])}</td>
        <td>${fmtDelta(r.brewDelta[m.key])}</td>
        <td><strong style="color:var(--accent-gold);font-size:0.95rem;">${r.finalScores[m.key]} / 100</strong></td>
      </tr>
    `
      )
      .join("");
  }

  function buildRadarChartSVG(scores) {
    const axes = [
      { key: "acidity", label: "Acidity" },
      { key: "sweetness", label: "Sweetness" },
      { key: "body", label: "Body" },
      { key: "fruityFloral", label: "Fruity/Floral" },
      { key: "chocoNut", label: "Choco/Nut" },
      { key: "funkSpice", label: "Funk/Spice" },
      { key: "bitterness", label: "Bitterness" },
      { key: "clarity", label: "Clarity" }
    ];

    const cx = 175;
    const cy = 155;
    const maxR = 105;
    const n = axes.length;

    const rings = [25, 50, 75, 100];
    const ringsSvg = rings
      .map((pct) => {
        const rad = (pct / 100) * maxR;
        const pts = axes
          .map((_, i) => {
            const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
            return `${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`;
          })
          .join(" ");
        return `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1" />`;
      })
      .join("");

    const spokesSvg = axes
      .map((a, i) => {
        const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
        const x2 = cx + Math.cos(ang) * maxR;
        const y2 = cy + Math.sin(ang) * maxR;
        const lx = cx + Math.cos(ang) * (maxR + 28);
        const ly = cy + Math.sin(ang) * (maxR + 22);
        return `
          <line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(255,255,255,0.12)" />
          <text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" fill="#f7efe9" font-size="10" font-weight="600" text-anchor="middle">${a.label} (${scores[a.key]})</text>
        `;
      })
      .join("");

    const dataPts = axes
      .map((a, i) => {
        const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
        const valR = (scores[a.key] / 100) * maxR;
        return `${(cx + Math.cos(ang) * valR).toFixed(1)},${(cy + Math.sin(ang) * valR).toFixed(1)}`;
      })
      .join(" ");

    const dotsSvg = axes
      .map((a, i) => {
        const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
        const valR = (scores[a.key] / 100) * maxR;
        const dx = cx + Math.cos(ang) * valR;
        const dy = cy + Math.sin(ang) * valR;
        return `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="4.5" fill="#ffd166" stroke="#120d0b" stroke-width="1.5" />`;
      })
      .join("");

    return `
      <svg viewBox="0 0 350 310" style="width:100%;max-width:360px;height:auto;">
        ${ringsSvg}
        ${spokesSvg}
        <polygon points="${dataPts}" fill="rgba(232, 168, 56, 0.32)" stroke="#e8a838" stroke-width="2.5" />
        ${dotsSvg}
      </svg>
    `;
  }

  function buildBrewControlChartSVG(report) {
    const ey = report.extractionYield;
    const xPx = 45 + ((ey - 12) / 16) * 260;

    const isEspresso = report.brew.id === "espresso";
    const idealTds = isEspresso ? 9.3 : 1.32;
    const normStrength = clamp(report.tds / idealTds, 0.55, 1.45);
    const yPx = 225 - ((normStrength - 0.55) / 0.9) * 180;

    const idealX1 = 45 + ((18 - 12) / 16) * 260;
    const idealX2 = 45 + ((22 - 12) / 16) * 260;

    return `
      <svg viewBox="0 0 330 260" style="width:100%;max-width:350px;height:auto;background:#120d0b;border-radius:10px;border:1px solid rgba(255,255,255,0.08);">
        <rect x="45" y="25" width="${idealX1 - 45}" height="200" fill="rgba(209,67,63,0.08)" />
        <rect x="${idealX2}" y="25" width="${305 - idealX2}" height="200" fill="rgba(171,116,176,0.08)" />

        <rect x="${idealX1.toFixed(1)}" y="75" width="${(idealX2 - idealX1).toFixed(1)}" height="95" fill="rgba(78,160,99,0.22)" stroke="#4ea063" stroke-width="1.5" stroke-dasharray="4,2" />
        <text x="${((idealX1 + idealX2) / 2).toFixed(1)}" y="122" fill="#6bbf7d" font-size="9.5" font-weight="bold" text-anchor="middle">SCA IDEAL</text>
        <text x="${((idealX1 + idealX2) / 2).toFixed(1)}" y="134" fill="#6bbf7d" font-size="8.5" text-anchor="middle">SWEET SPOT</text>

        <text x="90" y="55" fill="#ff8a87" font-size="9.5" font-weight="bold" text-anchor="middle">UNDER-EXTRACTED</text>
        <text x="90" y="68" fill="#bba69b" font-size="8.5" text-anchor="middle">(Sour, Salty, Grassy)</text>

        <text x="256" y="55" fill="#d3a6d6" font-size="9.5" font-weight="bold" text-anchor="middle">OVER-EXTRACTED</text>
        <text x="256" y="68" fill="#bba69b" font-size="8.5" text-anchor="middle">(Bitter, Dry, Astringent)</text>

        <line x1="45" y1="225" x2="305" y2="225" stroke="#877267" stroke-width="1.5" />
        <line x1="45" y1="25" x2="45" y2="225" stroke="#877267" stroke-width="1.5" />

        <text x="45" y="242" fill="#bba69b" font-size="9" text-anchor="middle">12%</text>
        <text x="${idealX1.toFixed(1)}" y="242" fill="#6bbf7d" font-size="9" font-weight="bold" text-anchor="middle">18%</text>
        <text x="${idealX2.toFixed(1)}" y="242" fill="#6bbf7d" font-size="9" font-weight="bold" text-anchor="middle">22%</text>
        <text x="305" y="242" fill="#bba69b" font-size="9" text-anchor="middle">28%</text>
        <text x="175" y="255" fill="#f7efe9" font-size="9.5" font-weight="bold" text-anchor="middle">Soluble Extraction Yield (EY%)</text>

        <text x="16" y="125" fill="#f7efe9" font-size="9.5" font-weight="bold" text-anchor="middle" transform="rotate(-90 16,125)">Strength / Concentration (TDS%)</text>

        <line x1="${xPx.toFixed(1)}" y1="225" x2="${xPx.toFixed(1)}" y2="${yPx.toFixed(1)}" stroke="#ffd166" stroke-dasharray="3,3" />
        <circle cx="${xPx.toFixed(1)}" cy="${yPx.toFixed(1)}" r="7" fill="#e8a838" stroke="#fff" stroke-width="2" />
        <text x="${clamp(xPx, 75, 265).toFixed(1)}" y="${(yPx - 11).toFixed(1)}" fill="#fff" font-size="9.5" font-weight="bold" text-anchor="middle">Your Brew (${ey}%)</text>
      </svg>
    `;
  }

  window.saveCurrentBrew = function () {
    const report = calculateTasteProfile();
    state.savedBrews.unshift({
      id: Date.now(),
      title: `${report.location.name.split(",")[0]} (${report.location.altitude}m) • ${report.varietal.name.split(" ")[0]}`,
      sub: `${report.ferment.name.split(" ")[0]} • ${report.roastBenchmark.name.split(" ")[0]} • ${report.brew.name.split(" ")[0]} (${report.grindMicrons}µm)`,
      scaScore: report.scaScore,
      ey: report.extractionYield,
      scores: { ...report.finalScores },
      notes: report.tastingNotes.slice(0, 3).map((n) => n.label).join(", ")
    });
    if (state.savedBrews.length > 5) state.savedBrews.pop();
    renderStage5();
  };

  function renderSavedFlightSection() {
    if (state.savedBrews.length === 0) return "";
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <span class="stage-badge">Cupping Table History</span>
            <h3 class="card-title" style="font-size:1.2rem;">Your Saved Tasting Flight (${state.savedBrews.length})</h3>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table class="metric-table">
            <thead>
              <tr>
                <th>Origin & Varietal</th>
                <th>Process, Roast & Grind</th>
                <th>EY%</th>
                <th>Acidity</th>
                <th>Sweetness</th>
                <th>Body</th>
                <th>Fruity/Floral</th>
                <th>Funk</th>
                <th>Bitterness</th>
                <th>SCA Score</th>
              </tr>
            </thead>
            <tbody>
              ${state.savedBrews
                .map(
                  (b) => `
                <tr>
                  <td><strong style="color:var(--cream);">${b.title}</strong><div style="font-size:0.72rem;color:var(--accent-gold);">${b.notes}</div></td>
                  <td>${b.sub}</td>
                  <td>${b.ey}%</td>
                  <td>${b.scores.acidity}</td>
                  <td>${b.scores.sweetness}</td>
                  <td>${b.scores.body}</td>
                  <td>${b.scores.fruityFloral}</td>
                  <td>${b.scores.funkSpice}</td>
                  <td>${b.scores.bitterness}</td>
                  <td><strong style="color:#6bbf7d;">${b.scaScore}</strong></td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // LIVE PASSPORT SIDEBAR
  // ==========================================================================
  function updateLiveSidebar() {
    const report = calculateTasteProfile();
    const sidebar = document.getElementById("live-passport-sidebar");
    if (!sidebar) return;

    const barItems = [
      { key: "acidity", label: "🍋 Acidity", color: "#5da4e3" },
      { key: "sweetness", label: "🍯 Sweetness", color: "#e8a838" },
      { key: "body", label: "☕ Body", color: "#d97724" },
      { key: "fruityFloral", label: "🌸 Fruity / Floral", color: "#e07a5f" },
      { key: "chocoNut", label: "🍫 Choco / Nutty", color: "#8c5327" },
      { key: "funkSpice", label: "🍷 Ferment / Funk", color: "#ab74b0" },
      { key: "bitterness", label: "🔥 Bitterness", color: "#d1433f" },
      { key: "clarity", label: "💎 Cup Clarity", color: "#4ea063" }
    ];

    sidebar.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
        <div>
          <span class="stage-badge" style="margin-bottom:0.15rem;">Live Bean Passport</span>
          <h3 style="font-size:1.15rem;color:var(--cream);">Real-Time Sensory Twin</h3>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.3rem;font-weight:800;color:var(--accent-gold);">${report.scaScore}</div>
          <div style="font-size:0.65rem;color:var(--text-muted);">Cupping Score</div>
        </div>
      </div>

      <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:0.65rem 0.8rem;margin-bottom:0.9rem;border:1px solid rgba(255,255,255,0.06);">
        <div class="passport-row">
          <span style="color:var(--text-muted);">1. Varietal:</span>
          <strong style="color:var(--cream);">${report.varietal.icon} ${report.varietal.name.split(" ")[0]}</strong>
        </div>
        <div class="passport-row">
          <span style="color:var(--text-muted);">2. Nepal Origin:</span>
          <strong style="color:#8cc4f7;">${report.location.shortName || report.location.name.split(",")[0]} (${report.location.altitude}m)</strong>
        </div>
        <div class="passport-row">
          <span style="color:var(--text-muted);">📐 Slope (Visual):</span>
          <span style="color:#ffd166;font-size:0.78rem;">${report.location.slopeAngle}° ${report.location.slopeAspect.split(" ")[0]} (0 wt)</span>
        </div>
        <div class="passport-row">
          <span style="color:var(--text-muted);">3. Fermentation:</span>
          <strong style="color:var(--cream);">${report.ferment.icon} ${report.ferment.name.split(" ")[0]}</strong>
        </div>
        <div class="passport-row">
          <span style="color:var(--text-muted);">4. Roast Level:</span>
          <strong style="color:var(--accent-gold);">${report.roastBenchmark.name.split(" ")[0]} (${report.roastBenchmark.tempC}°C)</strong>
        </div>
        <div class="passport-row">
          <span style="color:var(--text-muted);">5. Grind & Brew:</span>
          <strong style="color:var(--cream);">${report.grindMicrons}µm • ${report.brew.name.split(" ")[0]}</strong>
        </div>
      </div>

      <div style="margin-bottom:0.85rem;">
        ${barItems
          .map(
            (item) => `
          <div class="meter-bar-wrap">
            <div class="meter-label-row">
              <span>${item.label}</span>
              <strong>${report.finalScores[item.key]}/100</strong>
            </div>
            <div class="meter-track">
              <div class="meter-fill" style="width:${report.finalScores[item.key]}%;background:${item.color};"></div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>

      <div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:0.75rem;">
        <strong>Active Notes:</strong> ${report.tastingNotes.map((n) => n.label).join(" • ")}
      </div>

      <button class="btn-primary" style="width:100%;justify-content:center;" onclick="goToStage(5)">
        📊 View Full Cupping Report & Math →
      </button>
    `;
  }

  function formatMetricName(k) {
    const map = {
      acidity: "Acidity",
      sweetness: "Sweetness",
      body: "Body",
      fruityFloral: "Fruity/Floral",
      chocoNut: "Choco/Nut",
      funkSpice: "Funk/Spice",
      bitterness: "Bitterness",
      clarity: "Clarity"
    };
    return map[k] || k;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
