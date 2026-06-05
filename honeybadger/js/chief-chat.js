// ── Chief chat (streaming) ────────────────────────────────────────────────────
// Streams from the callClaudeStream Cloud Function (Groq/Llama) using the same
// recall memory the iOS app uses (record:true), so web conversations and phone
// conversations share one brain. Reads the text/event-stream response via fetch
// + ReadableStream (EventSource can't POST or send auth headers).
import { auth, FUNCTIONS_BASE, functions, httpsCallable } from './firebase.js';
import { store } from './store.js';
import { esc } from './util.js';
import { speak, stop as stopVoice, voiceOn, setVoiceOn } from './voice.js';

const STREAM_URL = `${FUNCTIONS_BASE}/callClaudeStream`;
let history = [];      // [{role:'user'|'assistant', content}]
let built = false;
let sending = false;

// Build a compact persona from the user's Chief settings so the web Chief sounds
// identical to the phone. Recall is prepended server-side.
function systemPrompt() {
  const s = store.state.settings || {};
  const c = s.chief || {};
  const bio = s.userBio || {};
  const name = c.displayName || 'Chief';
  const userName = bio.fullName || bio.name || store.state.user?.displayName || 'the user';
  let p = `You are ${name}, ${userName}'s AI chief of staff. You are direct, opinionated, warm, and energy-aware. Keep replies concise and action-oriented. You help manage projects, tasks, and momentum.`;
  if (c.backstory) p += ` Backstory: ${c.backstory}`;
  if (c.communicationStyle) p += ` Communication style: ${c.communicationStyle}.`;
  if (typeof c.bluntness === 'number') p += ` Bluntness level: ${c.bluntness}/10.`;
  if (bio.bio) p += ` About ${userName}: ${bio.bio}`;

  // Give Chief light awareness of current work so web chat is grounded.
  const active = store.state.projects.filter(x => x.phase !== 'complete').slice(0, 12);
  if (active.length) {
    p += ` Current active projects: ` +
      active.map(x => `${x.name}${x.nextAction ? ` (next: ${x.nextAction})` : ''}`).join('; ') + '.';
  }
  return p;
}

export function renderChat() {
  // Build the chat shell once; subsequent store updates must not wipe the
  // in-progress transcript, so this is a no-op after the first build.
  if (!built) buildShell();
}

function buildShell() {
  const view = document.getElementById('viewChief');
  view.innerHTML = `
    <div class="chat-wrap">
      <div class="chat-header">
        <div>
          <div class="chat-title" id="chatTitle">Chief</div>
          <div class="chat-sub">Same brain as your phone · conversations are remembered</div>
        </div>
        <button class="chat-voice ${voiceOn() ? 'on' : ''}" id="chatVoice" title="Speak Chief's replies">${voiceOn() ? '🔊' : '🔇'} Voice</button>
      </div>
      <div class="chat-scroll" id="chatScroll">
        <div class="chat-empty" id="chatEmpty">
          <div class="chat-empty-badge"><img src="chief.png" width="34" height="34" style="border-radius:9px;object-fit:contain"></div>
          <div class="chat-empty-title">What are we tackling?</div>
          <div class="chat-empty-sub">Ask Chief to plan, prioritize, unblock, or think out loud with you.</div>
        </div>
      </div>
      <div class="chat-composer">
        <textarea id="chatInput" class="chat-input" rows="1" placeholder="Message Chief…"></textarea>
        <button id="chatSend" class="chat-send">↑</button>
      </div>
    </div>`;

  document.getElementById('chatTitle').textContent = store.state.settings?.chief?.displayName || 'Chief';

  const input = document.getElementById('chatInput');
  const send = document.getElementById('chatSend');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(160, input.scrollHeight) + 'px';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  send.addEventListener('click', doSend);

  const vbtn = document.getElementById('chatVoice');
  vbtn.addEventListener('click', () => {
    const on = !voiceOn();
    setVoiceOn(on);
    vbtn.classList.toggle('on', on);
    vbtn.innerHTML = on ? '🔊 Voice' : '🔇 Voice';
    if (!on) stopVoice();
  });

  // Re-render any existing transcript (e.g. switching away and back)
  history.forEach(m => addBubble(m.role, m.content));
  built = true;
  return view;
}

function scroll() {
  const s = document.getElementById('chatScroll');
  s.scrollTop = s.scrollHeight;
}

function addBubble(role, text) {
  document.getElementById('chatEmpty')?.remove();
  const wrap = document.createElement('div');
  wrap.className = `bubble bubble-${role}`;
  wrap.innerHTML = `<div class="bubble-body">${esc(text)}</div>`;
  document.getElementById('chatScroll').appendChild(wrap);
  scroll();
  return wrap.querySelector('.bubble-body');
}

async function doSend() {
  if (sending) return;
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; input.style.height = 'auto';

  addBubble('user', text);
  history.push({ role: 'user', content: text });

  sending = true;
  document.getElementById('chatSend').disabled = true;
  const bodyEl = addBubble('assistant', '');
  bodyEl.parentElement.classList.add('streaming');
  bodyEl.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';

  const payload = { messages: history, system: systemPrompt(), max_tokens: 600, record: true };
  let full = '';
  let httpError = null;   // set when the server explicitly rejected (don't retry)

  // 1) Try the streaming endpoint for token-by-token output.
  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, fast: false }),
    });
    if (!res.ok) { httpError = res.status; throw new Error('http ' + res.status); }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', firstToken = true;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const p = t.slice(5).trim();
        if (p === '[DONE]') continue;
        try {
          const obj = JSON.parse(p);
          if (obj.text) { if (firstToken) { bodyEl.textContent = ''; firstToken = false; } full += obj.text; bodyEl.textContent = full; scroll(); }
        } catch (_) {}
      }
    }
    if (firstToken) bodyEl.textContent = full || '…';
  } catch (streamErr) {
    // 2) Streaming unavailable (CORS not deployed, network, etc.). Fall back to the
    //    callable onCall endpoint, which needs no CORS and is always deployed.
    if (httpError === 403) { bodyEl.textContent = "Chief chat needs a premium or tester account."; bodyEl.parentElement.classList.remove('streaming'); history.pop(); finish(); return; }
    if (httpError === 429) { bodyEl.textContent = "You've hit today's usage limit. Try again tomorrow."; bodyEl.parentElement.classList.remove('streaming'); history.pop(); finish(); return; }
    try {
      const r = await httpsCallable(functions, 'callClaude')(payload);
      full = r?.data?.text || '';
      bodyEl.textContent = full || '…';
    } catch (callErr) {
      const code = callErr?.code || '';
      if (code.includes('permission-denied')) bodyEl.textContent = "Chief chat needs a premium or tester account.";
      else if (code.includes('resource-exhausted')) bodyEl.textContent = "You've hit today's usage limit. Try again tomorrow.";
      else bodyEl.textContent = "Couldn't reach Chief. Check your connection and try again.";
    }
  }

  bodyEl.parentElement.classList.remove('streaming');
  if (full.trim()) {
    history.push({ role: 'assistant', content: full.trim() });
    if (voiceOn()) speak(full.trim());
  } else {
    history.pop();   // drop the user turn that produced nothing so retry is clean
  }
  finish();
}

// Shared helper so the brain-dump (Burrow) can ask Chief without CORS too.
export async function askChiefJSON(systemText, userText) {
  const r = await httpsCallable(functions, 'callClaude')({
    messages: [{ role: 'user', content: userText }],
    system: systemText, max_tokens: 900, record: false,
  });
  return r?.data?.text || '';
}

function finish() {
  sending = false;
  document.getElementById('chatSend').disabled = false;
  document.getElementById('chatInput').focus();
}
