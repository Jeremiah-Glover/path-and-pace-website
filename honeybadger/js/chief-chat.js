// ── Chief chat (streaming) ────────────────────────────────────────────────────
// Streams from the callClaudeStream Cloud Function (Groq/Llama) using the same
// recall memory the iOS app uses (record:true), so web conversations and phone
// conversations share one brain. Reads the text/event-stream response via fetch
// + ReadableStream (EventSource can't POST or send auth headers).
import { auth, FUNCTIONS_BASE } from './firebase.js';
import { store } from './store.js';
import { esc } from './util.js';

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
        <div class="chat-title" id="chatTitle">Chief</div>
        <div class="chat-sub">Same brain as your phone · conversations are remembered</div>
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

  let full = '';
  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: history,
        system: systemPrompt(),
        max_tokens: 600,
        record: true,
      }),
    });

    if (!res.ok) {
      bodyEl.parentElement.classList.remove('streaming');
      if (res.status === 403) bodyEl.textContent = "Chief chat needs a premium or tester account.";
      else if (res.status === 429) bodyEl.textContent = "You've hit today's usage limit. Try again tomorrow.";
      else bodyEl.textContent = `Couldn't reach Chief (${res.status}).`;
      finish();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let firstToken = true;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();   // keep partial line
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const obj = JSON.parse(payload);
          if (obj.error) { full += `\n[${obj.error}]`; }
          if (obj.text) {
            if (firstToken) { bodyEl.textContent = ''; firstToken = false; }
            full += obj.text;
            bodyEl.textContent = full;
            scroll();
          }
        } catch (_) { /* ignore keep-alive / partial */ }
      }
    }
    if (firstToken) bodyEl.textContent = full || '…';
  } catch (err) {
    bodyEl.textContent = full || 'Connection interrupted. Try again.';
  }
  bodyEl.parentElement.classList.remove('streaming');
  if (full.trim()) history.push({ role: 'assistant', content: full.trim() });
  finish();
}

function finish() {
  sending = false;
  document.getElementById('chatSend').disabled = false;
  document.getElementById('chatInput').focus();
}
