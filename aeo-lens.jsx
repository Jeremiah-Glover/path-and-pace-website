import React, { useState, useEffect } from "react";

// AEO LENS v4 (model cascade) — hardened transport: reads raw response text first,
// shows a diagnostic dump on failure so we can see exactly what the bridge returned.

const S = {
  page: { minHeight: "100vh", background: "#10222B", color: "#E8E2D6",
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", padding: "0 16px 64px" },
  wrap: { maxWidth: 760, margin: "0 auto" },
  eyebrow: { fontSize: 11, letterSpacing: "0.25em", color: "#7C97A3", textTransform: "uppercase", paddingTop: 36 },
  h1: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "clamp(30px, 6vw, 44px)",
    fontWeight: 500, lineHeight: 1.1, margin: "10px 0 6px", letterSpacing: "-0.01em" },
  sub: { color: "#7C97A3", fontSize: 13, lineHeight: 1.6, maxWidth: 560 },
  inputRow: { display: "flex", gap: 8, marginTop: 28 },
  input: { flex: 1, background: "#16303B", border: "1px solid #284654", color: "#E8E2D6",
    padding: "13px 14px", fontSize: 14, fontFamily: "inherit", borderRadius: 2, outline: "none" },
  btn: (busy) => ({ background: busy ? "#284654" : "#F2A33C", color: busy ? "#7C97A3" : "#10222B",
    border: "none", padding: "13px 20px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
    cursor: busy ? "default" : "pointer", borderRadius: 2, fontFamily: "inherit", textTransform: "uppercase" }),
  chip: { background: "transparent", border: "1px solid #284654", color: "#7C97A3",
    padding: "6px 10px", fontSize: 11, cursor: "pointer", borderRadius: 2, fontFamily: "inherit" },
  panel: { background: "#16303B", border: "1px solid #284654", borderRadius: 2, padding: 18, marginTop: 20 },
  label: { fontSize: 10, letterSpacing: "0.22em", color: "#7C97A3", textTransform: "uppercase", marginBottom: 12 },
  statusLine: { fontSize: 12, color: "#F2A33C", marginTop: 18, minHeight: 16, wordBreak: "break-word" },
  answer: { fontSize: 13, lineHeight: 1.75, whiteSpace: "pre-wrap", color: "#CFE0E6" },
  diag: { fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#7C97A3",
    maxHeight: 220, overflow: "auto", wordBreak: "break-all" },
  brandRow: { marginBottom: 14 },
  brandName: { fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 5 },
  barTrack: { height: 6, background: "#10222B", borderRadius: 1, overflow: "hidden" },
  bar: (pct, top) => ({ height: "100%", width: pct + "%", background: top ? "#F2A33C" : "#4E7484",
    transition: "width 700ms cubic-bezier(.2,.8,.2,1)" }),
  foot: { marginTop: 28, fontSize: 11, color: "#4E7484", lineHeight: 1.7 },
};

const PRESETS = [
  "best protein powder that doesn't clump",
  "tumbler that won't hold coffee smell",
  "best paper plates for a cookout",
];

// Reads raw text first so a non-JSON bridge response can't crash parsing silently.
async function callClaude(body) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const rawText = await r.text();
  let data;
  try { data = JSON.parse(rawText); }
  catch { throw Object.assign(new Error("Bridge returned non-JSON (HTTP " + r.status + ")"), { raw: rawText.slice(0, 1200) }); }
  if (data.error) throw Object.assign(new Error(data.error.message || "API error"), { raw: rawText.slice(0, 1200) });
  if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { raw: rawText.slice(0, 1200) });
  return data;
}


const MODELS = [
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-3-5-sonnet-20241022",
];

// Tries model IDs in order until one works; remembers the winner.
let lockedModel = null;
async function callAny(payload, onTry) {
  if (lockedModel) return callClaude({ ...payload, model: lockedModel });
  let lastErr;
  for (const m of MODELS) {
    try {
      if (onTry) onTry(m);
      const data = await callClaude({ ...payload, model: m });
      lockedModel = m;
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const getText = (data) =>
  (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

export default function AEOLens() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState("");
  const [brands, setBrands] = useState(null);
  const [busy, setBusy] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [diag, setDiag] = useState("");

  useEffect(() => {
    if (brands) {
      setAnimate(false);
      const t = setTimeout(() => setAnimate(true), 60);
      return () => clearTimeout(t);
    }
  }, [brands]);

  async function run(query) {
    const question = (query || q).trim();
    if (!question || busy) return;
    setBusy(true);
    setAnswer(""); setBrands(null); setMode(""); setDiag("");
    setStatus("◉ Step 1 of 3 · minimal connectivity check…");

    try {
      // STEP 1 — barest possible call. If this fails, it's the bridge, not the payload.
      const ping = await callAny({
        max_tokens: 1000,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
      }, (m) => setStatus("◉ Step 1 of 3 · testing model " + m + "…"));
      if (!getText(ping)) {
        setDiag(JSON.stringify(ping, null, 2).slice(0, 1200));
        throw new Error("Connectivity check returned no text");
      }

      // STEP 2 — the real question, web search if available
      const prompt = `You are an AI shopping assistant. A consumer asks: "${question}". Answer naturally and concretely in under 150 words, recommending specific brands/products by name like you would in a real chat. No disclaimers.`;
      let text = "";
      try {
        setStatus("◉ Step 2 of 3 · querying with live web search…");
        const r1 = await callAny({
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        });
        text = getText(r1);
        if (!text) throw new Error("empty");
        setMode("live web search · " + lockedModel);
      } catch {
        setStatus("◉ Step 2 of 3 · search blocked here, using model knowledge…");
        const r1b = await callAny({
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        });
        text = getText(r1b);
        if (!text) throw new Error("Answer call returned no text");
        setMode("model knowledge · " + lockedModel);
      }
      setAnswer(text);

      // STEP 3 — extract citations
      setStatus("◉ Step 3 of 3 · extracting brand citations…");
      const r2 = await callAny({
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Here is an AI assistant's answer to a consumer question:\n\n"""${text}"""\n\nList every brand or branded product mentioned. Respond with ONLY raw JSON, no markdown fences:\n{"brands":[{"name":"...","mentions":2,"position":"first|middle|last","sentiment":"recommended|neutral|negative"}]}\nOrder by prominence.`,
        }],
      });
      const raw = getText(r2).replace(/```json|```/g, "").trim();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const parsed = JSON.parse(raw.slice(start, end + 1));
      setBrands(parsed.brands || []);
      setStatus("");
    } catch (e) {
      setStatus("✕ " + (e.message || "Unknown failure"));
      setDiag(e.raw || ("No raw body captured. Error object: " + String(e)));
    }
    setBusy(false);
  }

  const maxM = brands && brands.length ? Math.max(...brands.map((b) => b.mentions || 1)) : 1;

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <div style={S.eyebrow}>Path &amp; Pace · Live Instrument</div>
        <h1 style={S.h1}>AEO Lens</h1>
        <p style={S.sub}>
          A live AI model runs inside this app. Ask a consumer question — it answers like a
          shopping assistant, then audits its own answer for which brands got cited, how
          often, and in what position.
        </p>

        <div style={S.inputRow}>
          <input style={S.input} value={q} placeholder="ask like a shopper would…"
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
          <button style={S.btn(busy)} onClick={() => run()} disabled={busy}>
            {busy ? "Probing" : "Probe"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button key={p} style={S.chip} onClick={() => { setQ(p); run(p); }}>{p}</button>
          ))}
        </div>

        <div style={S.statusLine}>{status}</div>

        {diag && (
          <div style={S.panel}>
            <div style={S.label}>Diagnostic · raw bridge response</div>
            <div style={S.diag}>{diag}</div>
          </div>
        )}

        {answer && (
          <div style={S.panel}>
            <div style={S.label}>What the answer engine said · {mode}</div>
            <div style={S.answer}>{answer}</div>
          </div>
        )}

        {brands && (
          <div style={S.panel}>
            <div style={S.label}>Citation share · this answer</div>
            {brands.length === 0 && (
              <div style={{ fontSize: 13, color: "#7C97A3" }}>
                No brands cited — category answer only. That's white space.
              </div>
            )}
            {brands.map((b, i) => {
              const pct = animate ? Math.max(12, ((b.mentions || 1) / maxM) * 100) : 0;
              return (
                <div key={i} style={S.brandRow}>
                  <div style={S.brandName}>
                    <span style={{ color: i === 0 ? "#F2A33C" : "#E8E2D6" }}>{b.name}</span>
                    <span style={{ color: "#7C97A3", fontSize: 11 }}>
                      {b.mentions}× · {b.position} · {b.sentiment}
                    </span>
                  </div>
                  <div style={S.barTrack}>
                    <div style={S.bar(pct, i === 0)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={S.foot}>
          Probe runs a connectivity check, an answer call, and a citation-extraction call.
          Run the same question twice and watch the share shift.
        </div>
      </div>
    </div>
  );
}
