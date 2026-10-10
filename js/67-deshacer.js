'use strict';

// ---------- Deshacer y rehacer en el editor de notas ----------
// Historial propio de cada nota, en memoria y solo durante la sesión: instantáneas del texto entero
// y de la selección. Se toma una al dejar de escribir (~600 ms), al acabar una palabra o al pasar de
// escribir a borrar, y otra antes y después de cada cambio que hace la app (formato, «/», fechas que
// se fijan, propiedades…), que el Ctrl+Z del navegador no sabe deshacer. Los cambios hechos por otro
// camino (casillas, sincronización…) también quedan como un paso. El historial de versiones
// (28-historial.js) sigue siendo el de largo plazo.
const NOTE_HIST_MAX = 200;
const noteHist = new Map(); // id -> { cur: { text, sel }, undo: [], redo: [], live, liveSel, kind, ws, before }
let noteHistTimer = null;
let noteHistApplying = false;

// Selección en el texto entero (al editar un bloque, el editor tiene solo ese trozo).
function histSel(note) {
  const ta = $('#note-editor');
  if (ta.dataset.note !== note.id || ta.hidden) return null;
  const off = blockEdit?.noteId === note.id ? blockEdit.before.length : 0;
  return [off + ta.selectionStart, off + ta.selectionEnd];
}

function histOf(note) {
  const text = noteText(note);
  if (text === null) {
    noteHist.delete(note.id); // nota protegida bloqueada: fuera el texto en claro
    return null;
  }
  let h = noteHist.get(note.id);
  if (!h) {
    const sel = histSel(note) || [text.length, text.length];
    h = { cur: { text, sel }, undo: [], redo: [], live: text, liveSel: sel, kind: '' };
    noteHist.set(note.id, h);
  }
  return h;
}

function histPush(h, text, sel) {
  if (text === h.cur.text) return;
  h.undo.push(h.cur);
  if (h.undo.length > NOTE_HIST_MAX) h.undo.shift();
  h.cur = { text, sel: sel || [text.length, text.length] };
  h.redo = [];
}

// La nota cambió sin pasar por el editor: lo de antes y lo de ahora van en pasos propios.
function histSync(note, h = noteHist.get(note.id)) {
  const text = noteText(note);
  if (!h || text === null || text === h.live || noteHistApplying) return;
  histPush(h, h.live, h.liveSel);
  histPush(h, text, histSel(note) || h.liveSel);
  h.live = text;
}

// Guarda el estado actual como un paso. Los módulos que cambian el texto la llaman antes (y después).
function noteHistoryCheckpoint(note) {
  if (!note || noteHistApplying) return;
  const h = histOf(note);
  if (!h) return;
  clearTimeout(noteHistTimer);
  histSync(note, h);
  const sel = histSel(note) || h.liveSel;
  histPush(h, noteText(note), sel);
  h.liveSel = sel;
  h.kind = '';
  histButtons();
}

function histCan(note) {
  const h = note && noteHist.get(note.id);
  const text = note && noteText(note);
  if (!h || text === null) return [false, false];
  return [h.undo.length > 0 || text !== h.cur.text, h.redo.length > 0 && text === h.cur.text];
}

// Dónde queda el cursor: al final de lo que cambia entre a y b (medido en b).
function histCaret(a, b) {
  const n = Math.min(a.length, b.length);
  let p = 0;
  while (p < n && a[p] === b[p]) p++;
  let q = 0;
  while (q < n - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  return b.length - q;
}

const noteUndo = (note = activeNote()) => histStep(note, true);
const noteRedo = (note = activeNote()) => histStep(note, false);

function histStep(note, back) {
  if (!note) return;
  const h = histOf(note);
  if (!h) return histButtons();
  noteHistoryCheckpoint(note); // lo escrito desde el último paso cuenta como uno
  const from = back ? h.undo : h.redo;
  if (!from.length) return histButtons();
  const now = noteText(note);
  (back ? h.redo : h.undo).push(h.cur);
  h.cur = from.pop();
  const at = now === h.cur.text ? h.cur.sel[1] : histCaret(now, h.cur.text);
  histApply(note, h.cur.text, at);
  h.live = noteText(note) ?? h.cur.text;
  h.liveSel = [at, at];
  h.kind = '';
  histButtons();
}

// Pone el texto por el camino normal del editor (guardado, cifrado, vista previa), o directamente
// en la nota si no está en el editor. Editando un bloque: si el cambio cae dentro de él se queda
// abierto; si no, se cierra y se aplica a la nota entera.
function histApply(note, text, at) {
  const ta = $('#note-editor');
  noteHistApplying = true;
  try {
    let b = blockEdit?.noteId === note.id ? blockEdit : null;
    if (b && blockEditBody(note, ta.value) === null) b = null; // se re-sitúa si la nota cambió por otro lado
    const fits = b && blockEdit === b && text.length >= b.before.length + b.after.length && text.startsWith(b.before) && text.endsWith(b.after);
    if (fits) {
      ta.value = text.slice(b.before.length, text.length - b.after.length);
      const pos = Math.max(0, Math.min(at - b.before.length, ta.value.length));
      ta.dispatchEvent(new Event('input'));
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(pos, pos);
      autosize(ta);
    } else {
      if (blockEdit?.noteId === note.id) endBlockEdit({ render: false });
      if (ta.dataset.note === note.id && !ta.hidden) {
        ta.value = text;
        ta.dispatchEvent(new Event('input'));
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(at, at);
      } else {
        if (note.enc) {
          unlockedNotes.set(note.id, text);
          scheduleEncrypt(note);
        } else note.body = text;
        note.updatedAt = Date.now();
        dataRev++;
        save();
        ta.value = text;
        ta.dataset.note = note.id;
        ta.dataset.caret = String(at);
        if (activeNote()?.id === note.id) renderNotePane(note);
      }
    }
    hideSuggest();
  } finally {
    noteHistApplying = false;
  }
}

// ---------- Editor ----------
// Antes de que la nota recoja lo escrito (fase de captura): si cambió por otro lado, se guarda.
window.addEventListener('input', (e) => {
  if (e.target.id !== 'note-editor' || noteHistApplying) return;
  const note = activeNote();
  const h = note && histOf(note);
  if (!h) return;
  histSync(note, h);
  h.before = noteText(note);
}, true);

$('#note-editor').addEventListener('input', (e) => {
  const note = activeNote();
  const h = note && histOf(note);
  if (!h) return;
  const text = noteText(note);
  const sel = histSel(note) || [text.length, text.length];
  const before = h.before ?? h.live;
  h.before = undefined;
  if (!noteHistApplying) {
    const type = e.inputType || '';
    if (!e.isTrusted || !/^(insertText|insertCompositionText|insertLineBreak|insertParagraph|delete)/.test(type)) {
      // Cambio de la app (Enter en una lista, «/», Tab…) o pegado: paso propio.
      clearTimeout(noteHistTimer);
      histPush(h, before, h.liveSel);
      histPush(h, text, sel);
      h.kind = '';
      h.ws = false;
    } else {
      // Escribiendo: un paso por palabra (al llegar un espacio o salto se guarda lo de antes),
      // al pasar de escribir a borrar (o al revés) y tras ~600 ms sin teclear.
      const kind = type.startsWith('delete') ? 'del' : 'ins';
      const ws = kind === 'ins' && (/\s/.test(e.data || '') || /LineBreak|Paragraph/.test(type));
      if ((h.kind && kind !== h.kind) || (ws && !h.ws)) histPush(h, before, h.liveSel);
      h.ws = ws;
      h.kind = kind;
      clearTimeout(noteHistTimer);
      noteHistTimer = setTimeout(() => noteHistoryCheckpoint(note), 600);
    }
  }
  h.live = text;
  h.liveSel = sel;
  histButtons();
});

// Ctrl/Cmd+Z deshace; Ctrl/Cmd+Mayús+Z y Ctrl/Cmd+Y rehacen (con este historial, no el del navegador).
$('#note-editor').addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.isComposing) return;
  const altGr = e.getModifierState?.('AltGraph') || (e.ctrlKey && e.altKey);
  if (!(e.ctrlKey || e.metaKey) || altGr || e.altKey) return;
  const k = e.key.toLowerCase();
  const redo = (k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey);
  if (k !== 'z' && !redo) return;
  e.preventDefault();
  e.stopPropagation();
  if (redo) noteRedo();
  else noteUndo();
});

$('#note-editor').addEventListener('focus', () => {
  const note = activeNote();
  if (note && histOf(note)) histSync(note);
  histButtons();
});

// ---------- Botones, menú y paleta ----------
function histButtons() {
  const note = activeNote();
  const on = !!note && noteText(note) !== null && (isEditing(note.id) || blockEdit?.noteId === note.id);
  $('#note-undo-group').hidden = !on;
  if (!on) return;
  const [u, r] = histCan(note);
  $('#note-undo').disabled = !u;
  $('#note-redo').disabled = !r;
  $('#note-versions').hidden = !!note.enc;
}

[['#note-undo', () => noteUndo()], ['#note-redo', () => noteRedo()], ['#note-versions', () => activeNote() && openHistory(activeNote())]].forEach(([sel, fn]) => {
  const b = $(sel);
  // Sin quitar el foco al editor ni cerrar el bloque que se edita (40-edicion-bloques.js).
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  b.addEventListener('click', fn);
});

NOTE_PANE_EXTRA.push((note, text) => {
  if (text === null) noteHist.delete(note.id);
  else histSync(note);
  histButtons();
});

CTX_MENU_EXTRA.push((kind) => {
  const note = kind === 'editor' && activeNote();
  if (!note || noteText(note) === null) return [];
  const [u, r] = histCan(note);
  return [
    { sep: true },
    { label: '↶ Deshacer cambio', kbd: 'Ctrl+Z', disabled: !u, action: () => noteUndo(note) },
    { label: '↷ Rehacer', kbd: 'Ctrl+Mayús+Z', disabled: !r, action: () => noteRedo(note) },
    ...(note.enc ? [] : [{ label: '🕘 Ver versiones anteriores…', action: () => openHistory(note) }]),
  ];
});

COMMANDS_EXTRA.push((note) => (note && noteText(note) !== null && (isEditing(note.id) || blockEdit?.noteId === note.id) ? [
  { label: 'Deshacer cambio en la nota', kbd: 'Ctrl+Z', action: () => noteUndo(note) },
  { label: 'Rehacer cambio en la nota', kbd: 'Ctrl+Mayús+Z', action: () => noteRedo(note) },
] : []));
