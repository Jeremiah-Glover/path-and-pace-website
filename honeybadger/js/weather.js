// ── Weather backdrop for the calendar ────────────────────────────────────────
// Pulls a daily forecast from Open-Meteo (free, no API key) for the user's
// location and maps each day to a condition category, so the calendar can render
// a subtle animated weather backdrop behind each day cell. Forecast only reaches
// ~16 days out; days outside that window simply get no backdrop.
const CACHE_KEY = 'hb_weather_v1';
const FRESH_MS = 2 * 60 * 60 * 1000;   // re-fetch at most every 2h
let cache = null;                      // { ts, days: {YYYY-MM-DD: category} }
let attempted = false;                 // only try once per page load (geo prompt)

// WMO weather code → a small set of animatable categories.
function categoryFor(code) {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return '';
}

// CSS class for a given day key, or '' when there's no forecast for it.
export function weatherClassFor(dayKey) {
  const c = cache?.days?.[dayKey];
  return c ? `wx-${c}` : '';
}

// Load the forecast once, then call onReady() so the caller can re-render. Safe
// to call on every render — it self-limits to one attempt per page load.
export function ensureWeather(onReady) {
  if (attempted) return;
  attempted = true;
  if (!cache) { try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) {} }
  if (cache && Date.now() - cache.ts < FRESH_MS) return; // current render already has it
  load().then(() => onReady && onReady()).catch(() => {});
}

function position() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject();
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject, { timeout: 8000, maximumAge: 60 * 60 * 1000 });
  });
}

async function load() {
  let lat, lon;
  try { ({ lat, lon } = await position()); }
  catch (_) { return; } // location denied/unavailable → no backdrop, silently
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code&forecast_days=16&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  const times = data?.daily?.time || [];
  const codes = data?.daily?.weather_code || [];
  const days = {};
  times.forEach((t, i) => { const c = categoryFor(codes[i]); if (c) days[t] = c; });
  cache = { ts: Date.now(), days };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
}
