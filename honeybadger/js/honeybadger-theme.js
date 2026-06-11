/* ============================================================
   HONEYBADGER THEME ENGINE
   Six palettes as CSS custom properties + a floating switcher.
   Load once per page (in a DC <helmet>):
     <script src="./honeybadger-theme.js"></script>
   Then style with var(--hb-*) tokens — see CLAUDE.md for the list.
   Dark default = Deep Teal Ink (C). Light default = Clean Warm White (D).
   ============================================================ */
(function () {
  if (window.__hbThemeLoaded) return;
  window.__hbThemeLoaded = true;

  /* ---- Palette token sets ---------------------------------- */
  var THEMES = {
    "near-black":  { label: "Near-Black", group: "dark", swatch: "oklch(0.09 0.015 42)" },
    "espresso":    { label: "Warm Espresso", group: "dark", swatch: "oklch(0.16 0.022 50)" },
    "teal-ink":    { label: "Deep Teal Ink", group: "dark", swatch: "oklch(0.17 0.038 220)" },
    "warm-white":  { label: "Clean Warm White", group: "light", swatch: "oklch(0.97 0.008 80)" },
    "sand":        { label: "Warm Sand", group: "light", swatch: "oklch(0.92 0.024 75)" },
    "slate":       { label: "Cool Slate", group: "light", swatch: "oklch(0.94 0.008 240)" }
  };

  /* ---- The CSS: token values per [data-hb-theme] ----------- */
  var CSS = `
  :root,
  :root[data-hb-theme="teal-ink"] {
    --hb-bg: oklch(0.17 0.038 220);
    --hb-bg-2: oklch(0.20 0.038 220);
    --hb-surface: oklch(0.22 0.038 220);
    --hb-surface-2: oklch(0.14 0.035 222);
    --hb-border: oklch(0.32 0.03 220);
    --hb-border-strong: oklch(0.38 0.03 220);
    --hb-text: oklch(0.97 0.01 210);
    --hb-text-dim: oklch(0.70 0.03 210);
    --hb-text-faint: oklch(0.50 0.03 214);
    --hb-accent: oklch(0.64 0.18 42);
    --hb-accent-ink: #ffffff;
    --hb-teal: oklch(0.74 0.13 195);
    --hb-spark: oklch(0.87 0.22 128);
    --hb-grad: linear-gradient(110deg, oklch(0.70 0.18 45), oklch(0.80 0.13 190));
    --hb-glow-orange: oklch(0.64 0.18 42 / 0.14);
    --hb-glow-teal: oklch(0.62 0.13 200 / 0.16);
    --hb-shadow: oklch(0.08 0.04 232 / 0.6);
  }
  :root[data-hb-theme="near-black"] {
    --hb-bg: oklch(0.09 0.015 42);
    --hb-bg-2: oklch(0.11 0.012 42);
    --hb-surface: oklch(0.12 0.012 42);
    --hb-surface-2: oklch(0.08 0.014 42);
    --hb-border: oklch(0.20 0.01 42);
    --hb-border-strong: oklch(0.26 0.01 42);
    --hb-text: oklch(0.97 0.008 42);
    --hb-text-dim: oklch(0.60 0.01 42);
    --hb-text-faint: oklch(0.40 0.01 42);
    --hb-accent: oklch(0.62 0.18 42);
    --hb-accent-ink: #ffffff;
    --hb-teal: oklch(0.62 0.15 195);
    --hb-spark: oklch(0.87 0.22 128);
    --hb-grad: linear-gradient(110deg, oklch(0.66 0.18 42), oklch(0.66 0.15 195));
    --hb-glow-orange: oklch(0.62 0.18 42 / 0.12);
    --hb-glow-teal: oklch(0.62 0.15 195 / 0.10);
    --hb-shadow: oklch(0 0 0 / 0.5);
  }
  :root[data-hb-theme="espresso"] {
    --hb-bg: oklch(0.16 0.022 50);
    --hb-bg-2: oklch(0.19 0.022 50);
    --hb-surface: oklch(0.21 0.022 50);
    --hb-surface-2: oklch(0.13 0.02 50);
    --hb-border: oklch(0.30 0.02 50);
    --hb-border-strong: oklch(0.36 0.02 50);
    --hb-text: oklch(0.96 0.012 70);
    --hb-text-dim: oklch(0.66 0.02 55);
    --hb-text-faint: oklch(0.46 0.02 52);
    --hb-accent: oklch(0.64 0.18 45);
    --hb-accent-ink: #ffffff;
    --hb-teal: oklch(0.66 0.15 195);
    --hb-spark: oklch(0.87 0.22 128);
    --hb-grad: linear-gradient(110deg, oklch(0.68 0.18 45), oklch(0.66 0.15 195));
    --hb-glow-orange: oklch(0.64 0.18 45 / 0.14);
    --hb-glow-teal: oklch(0.66 0.15 195 / 0.10);
    --hb-shadow: oklch(0 0 0 / 0.5);
  }
  :root[data-hb-theme="warm-white"] {
    --hb-bg: oklch(0.97 0.008 80);
    --hb-bg-2: oklch(0.94 0.01 80);
    --hb-surface: #ffffff;
    --hb-surface-2: oklch(0.95 0.01 80);
    --hb-border: oklch(0.88 0.01 80);
    --hb-border-strong: oklch(0.82 0.012 80);
    --hb-text: oklch(0.20 0.02 50);
    --hb-text-dim: oklch(0.46 0.02 55);
    --hb-text-faint: oklch(0.60 0.015 60);
    --hb-accent: oklch(0.58 0.18 42);
    --hb-accent-ink: #ffffff;
    --hb-teal: oklch(0.52 0.14 195);
    --hb-spark: oklch(0.72 0.20 128);
    --hb-grad: linear-gradient(110deg, oklch(0.58 0.18 42), oklch(0.52 0.14 195));
    --hb-glow-orange: oklch(0.62 0.18 42 / 0.10);
    --hb-glow-teal: oklch(0.55 0.14 195 / 0.08);
    --hb-shadow: oklch(0.50 0.05 60 / 0.12);
  }
  :root[data-hb-theme="sand"] {
    --hb-bg: oklch(0.92 0.024 75);
    --hb-bg-2: oklch(0.89 0.026 73);
    --hb-surface: oklch(0.97 0.015 78);
    --hb-surface-2: oklch(0.94 0.02 76);
    --hb-border: oklch(0.85 0.022 70);
    --hb-border-strong: oklch(0.79 0.024 68);
    --hb-text: oklch(0.26 0.03 50);
    --hb-text-dim: oklch(0.45 0.03 55);
    --hb-text-faint: oklch(0.58 0.025 58);
    --hb-accent: oklch(0.56 0.18 40);
    --hb-accent-ink: #ffffff;
    --hb-teal: oklch(0.50 0.14 195);
    --hb-spark: oklch(0.70 0.20 128);
    --hb-grad: linear-gradient(110deg, oklch(0.56 0.18 40), oklch(0.50 0.14 195));
    --hb-glow-orange: oklch(0.60 0.18 42 / 0.10);
    --hb-glow-teal: oklch(0.52 0.14 195 / 0.08);
    --hb-shadow: oklch(0.45 0.06 60 / 0.12);
  }
  :root[data-hb-theme="slate"] {
    --hb-bg: oklch(0.94 0.008 240);
    --hb-bg-2: oklch(0.91 0.01 240);
    --hb-surface: #ffffff;
    --hb-surface-2: oklch(0.96 0.008 240);
    --hb-border: oklch(0.87 0.01 240);
    --hb-border-strong: oklch(0.81 0.012 240);
    --hb-text: oklch(0.22 0.02 250);
    --hb-text-dim: oklch(0.46 0.02 250);
    --hb-text-faint: oklch(0.60 0.015 245);
    --hb-accent: oklch(0.58 0.18 42);
    --hb-accent-ink: #ffffff;
    --hb-teal: oklch(0.50 0.14 200);
    --hb-spark: oklch(0.70 0.20 128);
    --hb-grad: linear-gradient(110deg, oklch(0.58 0.18 42), oklch(0.50 0.14 200));
    --hb-glow-orange: oklch(0.60 0.18 42 / 0.09);
    --hb-glow-teal: oklch(0.52 0.14 200 / 0.08);
    --hb-shadow: oklch(0.40 0.04 250 / 0.12);
  }
  /* base reset so body + scrollbar follow the theme */
  html { background: var(--hb-bg); }
  body { background: var(--hb-bg); color: var(--hb-text); transition: background 0.35s ease, color 0.35s ease; }

  /* ---- switcher widget ---- */
  #hb-theme-switcher { position: fixed; right: 18px; bottom: 18px; z-index: 99999;
    font-family: 'DM Sans', system-ui, sans-serif; }
  #hb-theme-switcher .hb-ts-panel {
    display: flex; flex-direction: column; gap: 10px;
    background: var(--hb-surface); border: 1px solid var(--hb-border);
    border-radius: 16px; padding: 14px; box-shadow: 0 16px 44px var(--hb-shadow);
    width: 188px; transform-origin: bottom right;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  #hb-theme-switcher.hb-collapsed .hb-ts-panel { opacity: 0; transform: scale(0.9) translateY(8px); pointer-events: none; }
  #hb-theme-switcher .hb-ts-row { display: flex; gap: 7px; }
  #hb-theme-switcher .hb-ts-label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
    font-weight: 700; color: var(--hb-text-faint); margin-bottom: 2px; }
  #hb-theme-switcher .hb-sw { width: 1fr; flex: 1; height: 34px; border-radius: 9px; cursor: pointer;
    border: 2px solid transparent; position: relative; transition: transform 0.15s ease; }
  #hb-theme-switcher .hb-sw:hover { transform: translateY(-2px); }
  #hb-theme-switcher .hb-sw.hb-active { border-color: var(--hb-accent); }
  #hb-theme-switcher .hb-sw.hb-active::after { content: ""; position: absolute; right: 4px; top: 4px;
    width: 6px; height: 6px; border-radius: 50%; background: var(--hb-accent); }
  #hb-theme-switcher .hb-ts-toggle {
    margin-top: 2px; align-self: flex-end; display: flex; align-items: center; gap: 8px;
    background: var(--hb-accent); color: var(--hb-accent-ink); border: none; cursor: pointer;
    border-radius: 100px; padding: 9px 16px; font-family: 'Syne', 'DM Sans', sans-serif;
    font-weight: 700; font-size: 12px; box-shadow: 0 8px 22px var(--hb-shadow);
  }
  #hb-theme-switcher.hb-collapsed { right: 18px; bottom: 18px; }
  `;

  /* ---- inject style ---------------------------------------- */
  var style = document.createElement("style");
  style.id = "hb-theme-style";
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  /* ---- pick initial theme ---------------------------------- */
  var saved = null;
  try { saved = localStorage.getItem("hb-theme"); } catch (e) {}
  var initial;
  if (saved && THEMES[saved]) {
    initial = saved;
  } else {
    initial = "warm-white";   // Web default: Clean Warm White (the app defaults to Deep Teal Ink natively)
  }
  function apply(name) {
    document.documentElement.setAttribute("data-hb-theme", name);
    try { localStorage.setItem("hb-theme", name); } catch (e) {}
    window.__hbTheme = name;
    document.querySelectorAll("#hb-theme-switcher .hb-sw").forEach(function (el) {
      el.classList.toggle("hb-active", el.getAttribute("data-theme") === name);
    });
  }
  apply(initial);

  /* ---- build switcher widget ------------------------------- */
  function buildWidget() {
    if (document.getElementById("hb-theme-switcher")) return;
    var wrap = document.createElement("div");
    wrap.id = "hb-theme-switcher";
    wrap.className = "hb-collapsed";

    var panel = document.createElement("div");
    panel.className = "hb-ts-panel";

    function group(title, names) {
      var lbl = document.createElement("div");
      lbl.className = "hb-ts-label";
      lbl.textContent = title;
      panel.appendChild(lbl);
      var row = document.createElement("div");
      row.className = "hb-ts-row";
      names.forEach(function (n) {
        var sw = document.createElement("div");
        sw.className = "hb-sw";
        sw.setAttribute("data-theme", n);
        sw.title = THEMES[n].label;
        sw.style.background = THEMES[n].swatch;
        if (THEMES[n].group === "light") sw.style.boxShadow = "inset 0 0 0 1px rgba(0,0,0,0.10)";
        sw.addEventListener("click", function () { apply(n); });
        row.appendChild(sw);
      });
      panel.appendChild(row);
    }
    group("Dark", ["near-black", "espresso", "teal-ink"]);
    group("Light", ["warm-white", "sand", "slate"]);
    wrap.appendChild(panel);

    var btn = document.createElement("button");
    btn.className = "hb-ts-toggle";
    btn.innerHTML = '<span style="font-size:13px;">◐</span> Theme';
    btn.addEventListener("click", function () { wrap.classList.toggle("hb-collapsed"); });
    wrap.appendChild(btn);

    document.body.appendChild(wrap);
    apply(window.__hbTheme || initial);
  }
  if (document.body) buildWidget();
  else document.addEventListener("DOMContentLoaded", buildWidget);
})();
