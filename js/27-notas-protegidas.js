'use strict';

// ---------- Notas con contraseña ----------
// El texto se cifra en el dispositivo (AES-GCM de 256 bits con una clave derivada de la contraseña
// con PBKDF2) y solo se guarda y sincroniza cifrado. La contraseña no se guarda en ningún sitio:
// si se olvida, la nota no se puede recuperar.
const LOCKED_BODY = '🔒 Nota protegida con contraseña.';
const lockKeys = new Map(); // id de nota → clave, mientras está desbloqueada
const encryptTimers = new Map();
const lockUI = { mode: null, noteId: null, error: '' }; // mode: 'setup' al proteger una nota

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptWith(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: b64(iv), ct: b64(ct) };
}

async function decryptWith(key, enc) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv) }, key, unb64(enc.ct));
  return new TextDecoder().decode(plain);
}

async function protectNote(note, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const text = note.body;
  note.enc = { v: 1, salt: b64(salt), ...(await encryptWith(key, text)) };
  note.body = LOCKED_BODY;
  note.updatedAt = Date.now();
  unlockedNotes.set(note.id, text);
  lockKeys.set(note.id, key);
  forgetHistory(note.id); // las versiones anteriores estaban en claro
  delete state.syncMeta.sent[`note-${note.id}`]; // y la copia de lo último subido también (se volverá a subir cifrada)
  save();
  renderAll();
}

async function unlockNote(note, password) {
  try {
    const key = await deriveKey(password, unb64(note.enc.salt));
    const text = await decryptWith(key, note.enc);
    unlockedNotes.set(note.id, text);
    lockKeys.set(note.id, key);
    return true;
  } catch {
    return false;
  }
}

function lockNote(id) {
  flushEncrypt(id);
  unlockedNotes.delete(id);
  lockKeys.delete(id);
}

function lockAll() {
  [...lockKeys.keys()].forEach(lockNote);
  const note = activeNote();
  if (note?.enc) renderNotePane(note);
}

// Quitar la contraseña: la nota vuelve a ser normal (hace falta tenerla desbloqueada).
function unprotectNote(note) {
  const text = unlockedNotes.get(note.id);
  if (text === undefined) return;
  clearTimeout(encryptTimers.get(note.id));
  delete note.enc;
  note.body = text;
  note.updatedAt = Date.now();
  unlockedNotes.delete(note.id);
  lockKeys.delete(note.id);
  save();
  renderAll();
}

// Mientras se escribe, el texto se vuelve a cifrar poco después de cada cambio.
function scheduleEncrypt(note) {
  clearTimeout(encryptTimers.get(note.id));
  encryptTimers.set(note.id, setTimeout(() => flushEncrypt(note.id), 300));
}

async function flushEncrypt(id) {
  clearTimeout(encryptTimers.get(id));
  encryptTimers.delete(id);
  const note = noteById(id);
  const key = lockKeys.get(id);
  const text = unlockedNotes.get(id);
  if (!note?.enc || !key || text === undefined) return;
  Object.assign(note.enc, await encryptWith(key, text));
  note.body = LOCKED_BODY;
  save();
}

function renderLockPanel(note) {
  const box = $('#note-lock');
  const setup = lockUI.mode === 'setup' && lockUI.noteId === note.id;
  const pass = el('input', { type: 'password', autocomplete: setup ? 'new-password' : 'current-password', placeholder: 'Contraseña', ariaLabel: 'Contraseña', required: true, minLength: setup ? 4 : 1 });
  const again = setup ? el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repite la contraseña', ariaLabel: 'Repite la contraseña', required: true }) : null;
  const msg = el('p', { className: 'lock-error', role: 'alert' }, lockUI.noteId === note.id ? lockUI.error : '');
  const submit = el('button', { type: 'submit', className: 'primary' }, setup ? 'Proteger' : 'Desbloquear');
  const form = el('form', { className: 'lock-form' }, [pass, ...(again ? [again] : []), el('div', { className: 'row' }, [submit])]);
  if (setup) {
    const cancel = el('button', { type: 'button' }, 'Cancelar');
    cancel.addEventListener('click', () => {
      lockUI.mode = null;
      renderNotePane(note);
    });
    form.querySelector('.row').append(cancel);
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    lockUI.noteId = note.id;
    if (setup) {
      if (pass.value.length < 4) return showLockError(note, 'Usa al menos 4 caracteres.');
      if (pass.value !== again.value) return showLockError(note, 'Las contraseñas no coinciden.');
      submit.disabled = true;
      lockUI.mode = null;
      lockUI.error = '';
      await protectNote(note, pass.value);
      showToastMessage('Nota protegida. Sin la contraseña no se podrá abrir.');
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Comprobando…';
    if (await unlockNote(note, pass.value)) {
      lockUI.error = '';
      renderNotePane(note);
      renderRightPanel();
    } else showLockError(note, 'Contraseña incorrecta.');
  });
  box.replaceChildren(
    el('div', { className: 'lock-card' }, [
      el('div', { className: 'lock-icon', ariaHidden: 'true' }, '🔒'),
      el('h3', {}, setup ? 'Proteger esta nota con contraseña' : 'Nota protegida'),
      el('p', { className: 'muted' }, setup ? 'El texto se cifrará en este dispositivo y solo se guardará y sincronizará cifrado. Si olvidas la contraseña no se podrá recuperar.' : 'Escribe la contraseña para ver y editar la nota. Se vuelve a bloquear al cerrar la app o tras 5 minutos fuera de ella.'),
      form,
      msg,
    ])
  );
  setTimeout(() => pass.focus());
}

function showLockError(note, text) {
  lockUI.error = text;
  lockUI.noteId = note.id;
  renderLockPanel(note);
}

function startProtect(note) {
  flushNoteSave();
  lockUI.mode = 'setup';
  lockUI.noteId = note.id;
  lockUI.error = '';
  $('#note-editor').hidden = true;
  $('#note-reading').hidden = true;
  $('#note-lock').hidden = false;
  renderLockPanel(note);
}

NOTE_MENU_EXTRA.push((note) =>
  note.enc
    ? unlockedNotes.has(note.id)
      ? { label: '🔒 Bloquear ahora', action: () => lockAll() }
      : null
    : { label: '🔒 Proteger con contraseña…', action: () => startProtect(note) }
);
NOTE_MENU_EXTRA.push((note) => (note.enc && unlockedNotes.has(note.id) ? { label: 'Quitar la contraseña', action: () => unprotectNote(note) } : null));

// Se vuelve a bloquear todo tras 5 minutos con la app en segundo plano.
let hiddenSince = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenSince = Date.now();
    [...encryptTimers.keys()].forEach(flushEncrypt);
  } else if (hiddenSince && Date.now() - hiddenSince > 5 * 60 * 1000) lockAll();
});
