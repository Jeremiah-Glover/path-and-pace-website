// AI helpers. Keys live only in Cloudflare (Pages > Settings > Variables and Secrets):
//   ANTHROPIC_API_KEY            interview questions, artist brief, blank sourcing (web search)
//   OPENAI_API_KEY               concept art with GPT Image
//   HF_API_KEY_ID + HF_API_KEY_SECRET   concept art through the Higgsfield API instead
// Optional: CLAUDE_MODEL, WEB_SEARCH_TOOL, IMAGE_PROVIDER (openai|higgsfield),
//           OPENAI_IMAGE_MODEL, OPENAI_IMAGE_QUALITY, HF_IMAGE_MODEL
import { randomHex } from './core.js';

const err = (message, status = 400) => Object.assign(new Error(message), { expose: true, status });

export function aiStatus(env) {
  return {
    text: !!env.ANTHROPIC_API_KEY,
    source: !!env.ANTHROPIC_API_KEY,
    image: imageProvider(env),
    imageModel: imageProvider(env) === 'openai' ? (env.OPENAI_IMAGE_MODEL || 'gpt-image-1') : imageProvider(env) === 'higgsfield' ? (env.HF_IMAGE_MODEL || 'higgsfield-ai/soul/standard') : null,
  };
}
function imageProvider(env) {
  const want = (env.IMAGE_PROVIDER || '').toLowerCase();
  const hasO = !!env.OPENAI_API_KEY, hasH = !!(env.HF_API_KEY_ID && env.HF_API_KEY_SECRET);
  if (want === 'higgsfield' && hasH) return 'higgsfield';
  if (want === 'openai' && hasO) return 'openai';
  return hasO ? 'openai' : hasH ? 'higgsfield' : null;
}

async function claude(env, { system, user, tools, maxTokens = 2000 }) {
  if (!env.ANTHROPIC_API_KEY) throw err('Add ANTHROPIC_API_KEY in Cloudflare to turn this on.', 503);
  const messages = [{ role: 'user', content: user }];
  let out = '';
  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages, ...(tools ? { tools } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw err('Claude: ' + ((data.error && data.error.message) || res.status), 502);
    out += (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    // A web-search turn can pause mid-search; send it back until it really finishes.
    if (data.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: data.content }); continue; }
    return out;
  }
  return out;
}
function pullJson(text) {
  const tag = text.match(/<json>([\s\S]*?)<\/json>/);
  const raw = tag ? tag[1] : (text.match(/[\[{][\s\S]*[\]}]/) || [''])[0];
  try { return JSON.parse(raw); } catch { throw err('The AI answer came back in the wrong shape. Try again.', 502); }
}
const projLine = (p) => `Project: ${p.name || ''} · Brand: ${p.brand || ''} · Products: ${p.products || ''} · Owner: ${(p.owner && p.owner.name) || ''} (${(p.owner && p.owner.role) || ''})`;

export async function aiText(env, body) {
  const p = body.project || {};
  const piece = body.piece || {};
  const voice = 'Write in plain, warm, direct English. Short sentences. No hype, no jargon, no emoji.';
  if (body.task === 'questions') {
    const pieces = (p.pieces || []).map((x) => `${x.n || ''} ${x.name || ''} (${x.garment || ''})`).join('\n');
    const text = await claude(env, {
      system: `You help a design studio interview the owner of a brand so the story behind each product is real. ${voice}`,
      user: `${projLine(p)}\nPieces:\n${pieces}\n\nWrite ONE open interview question per piece that draws out the true personal story the piece should carry. Ask about a moment, not an opinion. Return <json>[{"pieceId":"...","question":"..."}]</json> using these ids in order: ${(p.pieces || []).map((x) => x.id).join(', ')}.`,
      maxTokens: 1200,
    });
    return { questions: pullJson(text) };
  }
  if (body.task === 'brief') {
    const text = await claude(env, {
      system: `You write artist briefs for an apparel and product studio. ${voice} Never invent facts about the owner; use only what is given. Mark anything missing as [NEEDED].`,
      user: `${projLine(p)}\nPiece: ${piece.n || ''} ${piece.name || ''}\nProduct/blank: ${piece.garment || ''} · Color: ${piece.color || ''}\nPlacement and print sizes: ${piece.placement || ''}\nOwner's story for this piece: ${piece.answer || '[NEEDED]'}\nConcept direction notes: ${piece.direction || ''}\nDue: ${p.due || '[NEEDED]'}\n\nWrite the brief in Markdown with these sections: The story, What the piece should feel like, Placement and sizes, Palette and references, Files to deliver (print-ready, 300 dpi, transparent PNG plus layered source), Timeline, Rights (the work is made for hire for Path & Pace LLC; a signed agreement comes before payment). Keep it under 350 words.`,
      maxTokens: 1500,
    });
    return { markdown: text.trim() };
  }
  if (body.task === 'prompt') {
    const text = await claude(env, {
      system: 'You write image-generation prompts for apparel concept art. Let the model interpret; describe mood, subject, palette and composition, not shape-by-shape instructions.',
      user: `${projLine(p)}\nPiece: ${piece.name}\nProduct: ${piece.garment}\nStory: ${piece.answer || ''}\nDirection: ${piece.direction || ''}\nWrite one prompt (max 90 words) for a flat-lay product concept showing the artwork on the product, feature Black people or a Black cultural lens where people appear, avoid black-and-gold palettes. Return only the prompt.`,
      maxTokens: 400,
    });
    return { prompt: text.trim() };
  }
  throw err('Unknown task.');
}

export async function aiImage(env, body) {
  const prompt = String(body.prompt || '').slice(0, 3000);
  if (!prompt) throw err('Write a prompt first.');
  const provider = imageProvider(env);
  if (!provider) throw err('Add OPENAI_API_KEY (GPT Image) or your Higgsfield API keys in Cloudflare to turn this on.', 503);
  if (!env.FILES) throw err('File storage is not configured.', 503);
  let bytes, type = 'image/png';
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1536', quality: env.OPENAI_IMAGE_QUALITY || 'low', n: 1 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw err('GPT Image: ' + ((data.error && data.error.message) || res.status), 502);
    const item = data.data && data.data[0];
    if (item && item.b64_json) bytes = Uint8Array.from(atob(item.b64_json), (c) => c.charCodeAt(0));
    else if (item && item.url) { const r = await fetch(item.url); bytes = new Uint8Array(await r.arrayBuffer()); type = r.headers.get('content-type') || type; }
    else throw err('GPT Image returned no picture.', 502);
  } else {
    const auth = `Key ${env.HF_API_KEY_ID}:${env.HF_API_KEY_SECRET}`;
    const model = env.HF_IMAGE_MODEL || 'higgsfield-ai/soul/standard';
    const sub = await fetch(`https://api.higgsfield.ai/${model}`, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json', 'idempotency-key': randomHex(12) },
      body: JSON.stringify({ prompt, aspect_ratio: '3:4' }),
    });
    const s = await sub.json().catch(() => ({}));
    if (!sub.ok || !s.request_id) throw err('Higgsfield: ' + (s.detail || s.message || sub.status), 502);
    let url = null;
    for (let i = 0; i < 40 && !url; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const st = await (await fetch(`https://api.higgsfield.ai/requests/${s.request_id}/status`, { headers: { authorization: auth } })).json().catch(() => ({}));
      if (st.status === 'completed') url = st.images && st.images[0] && st.images[0].url;
      else if (['failed', 'nsfw', 'canceled'].includes(st.status)) throw err('Higgsfield could not make that one (' + st.status + ').', 502);
    }
    if (!url) throw err('Higgsfield is taking too long. Try again in a minute.', 504);
    const r = await fetch(url);
    bytes = new Uint8Array(await r.arrayBuffer());
    type = r.headers.get('content-type') || type;
  }
  const id = randomHex(24);
  await env.FILES.put(id, bytes, { metadata: { type } });
  return { id, url: `/product-design/api/files/${id}`, provider };
}

export async function aiSource(env, body) {
  const q = String(body.query || '').trim().slice(0, 120);
  if (!q) throw err('Type what you are looking for.');
  const where = body.region === 'overseas' ? 'overseas manufacturers and wholesalers (for example Alibaba, DHgate, factory sites)' : body.region === 'us' ? 'US-based wholesalers and blank suppliers that ship from US warehouses' : 'both US wholesalers and overseas manufacturers';
  const text = await claude(env, {
    system: 'You source blank products (items to be decorated) for a small brand. Use web search. Report only facts you saw on the supplier page; use null for anything not shown. Never estimate a price.',
    user: `Find up to 8 real blank "${q}" products from ${where}, suited to be decorated (heat press, sublimation, DTF, UV DTF, embroidery or screen print). Prefer listings that show a unit price, minimum order, and shipping or production time.\nReturn <json>[{"name":"","seller":"","url":"","image":"direct image URL or null","unitPrice":number|null,"priceNote":"price breaks as written","moq":number|null,"shipsDays":number|null,"origin":"US"|"Overseas","shipsFrom":"","colors":number|null,"sizes":"","sample":true|false|null,"decoration":"how it is usually decorated"}]</json>`,
    tools: [{ type: env.WEB_SEARCH_TOOL || 'web_search_20250305', name: 'web_search', max_uses: 6 }],
    maxTokens: 4000,
  });
  const items = pullJson(text);
  return { items: Array.isArray(items) ? items.filter((x) => x && x.url && /^https?:\/\//.test(x.url)) : [] };
}
