// ── Chief chat (streaming) ────────────────────────────────────────────────────
// Streams from the callClaudeStream Cloud Function (Groq/Llama) using the same
// recall memory the iOS app uses (record:true), so web conversations and phone
// conversations share one brain. Reads the text/event-stream response via fetch
// + ReadableStream (EventSource can't POST or send auth headers).
import { auth, FUNCTIONS_BASE, functions, httpsCallable } from './firebase.js';
import { store } from './store.js';
import { esc, bluntness01 } from './util.js';
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
  let p = `You are ${name}, ${userName}'s AI chief of staff. At your core you carry honey-badger energy: fearless, unbothered, and you call things exactly as they are. You're warm and genuinely funny — real, observational, well-timed humor, never cheesy and never a pun machine. You're sharp and confident, you keep a clean mouth (no crude language or vulgarity), and when you tease it's playful, never mean. Never sand yourself down to bland 'nice': you still have bite and you still tell the hard truth — you just deliver it like the friend who's unmistakably on their side. Funny first, kind underneath, honest always. Keep replies concise and action-oriented; you help manage projects, tasks, and momentum.`;
  if (c.backstory) p += ` Backstory: ${c.backstory}`;
  if (c.communicationStyle) p += ` Communication style: ${c.communicationStyle}.`;
  if (typeof c.bluntness === 'number') p += ` Bluntness level: ${Math.round(bluntness01(c.bluntness) * 10)}/10.`;
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
  const bubble = bodyEl.parentElement;
  bubble.classList.add('streaming');
  bodyEl.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';

  // Agentic path: Chief can act (projects/tasks/vault) and search the web, then
  // reply. Non-streaming because of the tool loop — worth it for real actions.
  let full = '';
  try {
    const r = await httpsCallable(functions, 'chiefAgent')({
      messages: history.slice(-16),
      system: systemPrompt(),
      max_tokens: 700,
    });
    full = r?.data?.text || '';
    const actions = r?.data?.actions || [];
    bodyEl.textContent = full || '…';
    if (actions.length) renderActions(bubble, actions);
  } catch (err) {
    const code = err?.code || '';
    console.error('chiefAgent call failed', code, err?.message, err?.details, err);
    if (code.includes('permission-denied')) bodyEl.textContent = "Chief chat needs a premium or tester account.";
    else if (code.includes('resource-exhausted')) bodyEl.textContent = "You've hit today's usage limit. Try again tomorrow.";
    // Surface the real reason so we can diagnose instead of a generic message.
    else bodyEl.textContent = `Chief error — ${code || 'unknown'}: ${err?.message || 'no message'}`;
  }

  bubble.classList.remove('streaming');
  if (full.trim()) {
    history.push({ role: 'assistant', content: full.trim() });
    if (voiceOn()) speak(full.trim(), store.state.settings?.voiceId || 'amy');
  } else {
    history.pop();   // drop the user turn that produced nothing so retry is clean
  }
  finish();
}

// Render "Chief did X" confirmation chips under the reply (own row in the scroll).
function renderActions(bubble, actions) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-actions';
  wrap.innerHTML = actions.map(a => `<span class="chat-action">✓ ${esc(a)}</span>`).join('');
  bubble.insertAdjacentElement('afterend', wrap);
  scroll();
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
