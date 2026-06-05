// ── Beta NDA gate ─────────────────────────────────────────────────────────────
// Every signed-in user must sign before the dashboard loads. The legal text lives
// in dashboard.html; this module handles the check + signing flow.
import { db, doc, getDoc, setDoc, serverTimestamp, signOut, auth } from './firebase.js';

export async function checkNDA(uid) {
  try {
    const snap = await getDoc(doc(db, 'ndaSignatures', uid));
    return snap.exists() && snap.data()?.signed === true;
  } catch { return false; }
}

// Shows the gate and resolves true once signed (so boot can continue).
export function showNDA(user) {
  return new Promise(resolve => {
    const overlay   = document.getElementById('ndaOverlay');
    const nameInput = document.getElementById('ndaFullName');
    const checkbox  = document.getElementById('ndaAgreeCheck');
    const signBtn   = document.getElementById('ndaSignBtn');
    const errEl     = document.getElementById('ndaError');

    overlay.style.display = 'block';
    overlay.scrollTop = 0;

    if (overlay.dataset.wired === '1') return;   // bind once
    overlay.dataset.wired = '1';

    const updateBtn = () => { signBtn.disabled = !(nameInput.value.trim() && checkbox.checked); };
    nameInput.addEventListener('input', updateBtn);
    checkbox.addEventListener('change', updateBtn);

    signBtn.addEventListener('click', async () => {
      const fullName = nameInput.value.trim();
      if (!fullName || !checkbox.checked) return;
      signBtn.disabled = true;
      signBtn.textContent = 'Signing…';
      errEl.style.display = 'none';
      try {
        await setDoc(doc(db, 'ndaSignatures', user.uid), {
          signed: true, fullName, uid: user.uid, email: user.email || '',
          timestamp: serverTimestamp(), userAgent: navigator.userAgent, version: '1.0',
        });
        overlay.style.display = 'none';
        resolve(true);
      } catch (err) {
        errEl.textContent = `Error saving signature: ${err.code || err.message}`;
        errEl.style.display = 'block';
        signBtn.disabled = false;
        signBtn.textContent = 'Sign Agreement & Enter HoneyBadger';
      }
    });

    document.getElementById('ndaDeclineBtn').addEventListener('click', async () => {
      await signOut(auth).catch(() => {});
      window.location.replace('index.html?declined=1');
    });
  });
}
