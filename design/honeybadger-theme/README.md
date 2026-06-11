# Handoff: Honeybadger Theme System

## Overview
This package contains the complete **Honeybadger** color-theme system: six interchangeable palettes (three dark, three light) exposed as CSS custom properties, plus a small runtime that switches and persists the active palette. Use it to theme the Honeybadger **app** and **marketing website** consistently.

The signature device is the **orange → teal arc**: orange = the chaos being managed, teal = the presence the product gives back, spark green = the single "it clicks" moment. Keep accent usage disciplined — orange for primary action/emphasis, teal for calm/secondary, spark for rare highlight moments only.

## About the Design Files
The HTML files this theme was built against are **design references** (prototypes of look & behavior), not production code. Your task is to **wire these tokens into the target codebase's existing styling layer** — CSS variables, Tailwind theme config, CSS-in-JS, SwiftUI color set, etc. — and refactor components to consume the tokens instead of hardcoded colors. Do **not** ship the prototype HTML directly.

## Fidelity
**High-fidelity.** All color values are final and exact (OKLCH). Reproduce them precisely. The two files in this bundle (`theme.css`, `honeybadger-theme.js`) are themselves drop-in usable in any web codebase.

## What's in this bundle
| File | Purpose |
|---|---|
| `theme.css` | All six palettes as `:root[data-hb-theme="…"]` blocks of CSS custom properties. Framework-agnostic — import once, globally. |
| `honeybadger-theme.js` | Zero-dependency runtime: injects the same tokens, renders an optional floating theme switcher, persists the choice to `localStorage["hb-theme"]`, and respects `prefers-color-scheme` on first load. |

## How to integrate

### Plain web / any framework (recommended baseline)
1. Import `theme.css` once at the app root (global stylesheet).
2. Set the active palette by writing a `data-hb-theme` attribute on `<html>`:
   ```js
   document.documentElement.dataset.hbTheme = 'teal-ink'; // or warm-white, etc.
   ```
3. Style everything with the tokens, e.g. `background: var(--hb-bg); color: var(--hb-text);`
4. (Optional) Persist the choice yourself, or just include `honeybadger-theme.js`, which handles switching + persistence + a built-in switcher widget. If you want token values but NOT the floating widget, use `theme.css` alone and drive the attribute from your own settings UI.

### Tailwind
Map the tokens in `tailwind.config.js` so utilities resolve to them:
```js
theme: { extend: { colors: {
  bg: 'var(--hb-bg)', surface: 'var(--hb-surface)', border: 'var(--hb-border)',
  text: 'var(--hb-text)', 'text-dim': 'var(--hb-text-dim)',
  accent: 'var(--hb-accent)', teal: 'var(--hb-teal)', spark: 'var(--hb-spark)',
}}}
```
Still import `theme.css` for the variable definitions; Tailwind just references them.

### React / Vue
Provide the current theme via context/store; on change, set `document.documentElement.dataset.hbTheme`. Components read tokens through CSS only — no per-component JS color logic.

### Native (SwiftUI / Android)
Web variables won't apply directly. Recreate each palette as a named color set / theme resource using the **exact OKLCH values** in `theme.css` (convert to your platform's color space). Mirror the same token names.

## Design Tokens

### Token roles (same names across all palettes)
| Token | Use |
|---|---|
| `--hb-bg` | page background |
| `--hb-bg-2` | alternate / banded section background |
| `--hb-surface` | card / panel background |
| `--hb-surface-2` | inset / deeper surface |
| `--hb-border` | hairline borders |
| `--hb-border-strong` | emphasized borders, dividers |
| `--hb-text` | primary text |
| `--hb-text-dim` | secondary text |
| `--hb-text-faint` | labels / captions (keep ≥ 12px) |
| `--hb-accent` | Badger Orange — primary CTA, emphasis |
| `--hb-accent-ink` | text/icon color ON an accent fill |
| `--hb-teal` | Present Teal — calm / secondary |
| `--hb-spark` | Spark green — rare highlight only |
| `--hb-grad` | headline gradient (orange→teal), use for `background-clip:text` |
| `--hb-glow-orange` / `--hb-glow-teal` | ambient radial-glow fills |
| `--hb-shadow` | themed shadow color |

### The six palettes (`data-hb-theme` value)
**Dark:** `near-black`, `espresso`, `teal-ink` *(dark default)*
**Light:** `warm-white` *(light default)*, `sand`, `slate`

Exact per-palette values are in `theme.css` (OKLCH). The defaults: with no attribute set, `:root` resolves to **teal-ink**; `honeybadger-theme.js` picks `warm-white` instead when the OS prefers light and nothing is saved.

## Typography (apply in-app with the codebase's font pipeline)
- **Display / headings / wordmark:** **Syne** (700, 800), letter-spacing tight/negative (≈ -0.02em to -0.045em on large sizes).
- **Body / UI:** **DM Sans** (400, 500, 600).
- Wordmark is always `HONEY` in `--hb-accent` + `BADGER` in `--hb-teal`.
- **Minimum text size: 12px.**

## Logo / Assets
- Mark: **The Badger Head** — geometric honey-badger face with the signature pale cap. The prototypes use an inline SVG placeholder; **final illustrated artwork is being produced in Adobe Firefly** and should replace the placeholder when ready (full-body mascot + transparent-background icon glyph).
- No other raster assets are required by the theme itself.

## Interactions & Behavior
- **Theme switch:** setting `data-hb-theme` recolors the whole tree instantly via CSS variables. `body` has a 0.35s background/color transition for a smooth flip — match this in-app if desired.
- **Persistence:** `honeybadger-theme.js` writes the active palette to `localStorage["hb-theme"]` and restores it on load. Replace with your app's settings store if you have one.
- **First-load default:** saved value → else `prefers-color-scheme: light` ? `warm-white` : `teal-ink`.

## Files in the broader project (reference prototypes — not shipped)
- `Honeybadger Brand Identity.dc.html` — logo, color, type, voice, personality
- `Honeybadger Landing Page.dc.html` — marketing site reference
- `Honeybadger Social Posts.dc.html` — social templates
- `Honeybadger Video Concepts.dc.html` — launch-film storyboards
These show the tokens in real use; consult them for component-level spacing, radii, and layout patterns.
