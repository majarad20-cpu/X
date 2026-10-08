'use strict';

// ---------- Editar un solo bloque en la vista de lectura ----------
// Doble clic sobre un párrafo, una lista, un título, una cita… y solo ese trozo pasa a texto
// editable, en su sitio; el resto de la nota se sigue viendo como se lee. Se usa el mismo editor
// de siempre (con [[ ]], «/», imágenes, listas…), que mientras tanto contiene solo ese bloque:
// al escribir se recompone la nota entera (blockEditBody). Esc, Ctrl+Enter o un clic fuera lo cierran.
let blockEdit = null; // { noteId, from, to, before, after, last, expect }
let blockEndTimer = null;

// renderNotePane pregunta si debe dejar la nota como está (se está escribiendo en un bloque).
function blockEditKeeps(note) {
  if (!blockEdit) return false;
  if (blockEdit.noteId === note.id && document.activeElement === $('#note-editor')) return true;
  endBlockEdit({ render: false });
  return false;
}

// Texto completo de la nota con el bloque editado dentro (o null si ya no se puede encajar).
function blockEditBody(note, value) {
  const b = blockEdit;
  if (!b || b.noteId !== note.id) return value;
  const cur = noteText(note) ?? '';
  if (cur !== b.expect) {
    // La nota cambió por otro lado (otro dispositivo, Claude, una casilla…): se vuelve a situar el bloque.
    const k = b.last ? cur.indexOf(b.last) : -1;
    if (k < 0) {
      endBlockEdit();
      showToastMessage('La nota cambió mientras escribías: vuelve a abrir el bloque.');
      return null;
    }
    b.before = cur.slice(0, k);
    b.after = cur.slice(k + b.last.length);
  }
  b.last = value;
  b.expect = b.before + value + b.after;
  return b.expect;
}

// Posición en el texto fuente que corresponde al punto donde se hizo doble clic.
function caretFromPoint(anchor, point, source) {
  const r = point && document.caretRangeFromPoint?.(point.x, point.y);
  if (!r || !anchor.contains(r.startContainer)) return source.length;
  const pre = document.createRange();
  pre.setStart(anchor, 0);
  pre.setEnd(r.startContainer, r.startOffset);
  const seen = pre.toString();
  // Se busca en el texto fuente el final de lo que hay antes del cursor (sin las marcas de formato).
  for (const n of [12, 6, 3]) {
    const tail = seen.slice(-n);
    if (tail.trim().length < Math.min(n, 3)) continue;
    let best = -1;
    for (let k = source.indexOf(tail); k >= 0; k = source.indexOf(tail, k + 1)) {
      if (best < 0 || Math.abs(k + n - seen.length) < Math.abs(best + n - seen.length)) best = k;
    }
    if (best >= 0) return best + tail.length;
  }
  return seen.length ? source.length : 0;
}

function startBlockEdit(note, from, to, anchor, point) {
  const text = noteText(note);
  if (text === null) return;
  flushNoteSave();
  const lines = text.split('\n');
  let before = '';
  let block = '';
  let after = '';
  if (from === null) {
    // Bloque nuevo al final de la nota.
    const trimmed = text.replace(/\s+$/, '');
    before = trimmed ? `${trimmed}\n\n` : '';
  } else {
    before = lines.slice(0, from).join('\n') + (from ? '\n' : '');
    block = lines.slice(from, to + 1).join('\n');
    after = to + 1 < lines.length ? `\n${lines.slice(to + 1).join('\n')}` : '';
  }
  const pos = anchor ? caretFromPoint(anchor, point, block) : 0;
  const ta = $('#note-editor');
  blockEdit = { noteId: note.id, from, to, before, after, last: block, expect: text };
  ta.value = block;
  ta.dataset.note = note.id;
  ta.classList.add('block-editing');
  ta.placeholder = 'Escribe aquí… (Esc para terminar)';
  if (anchor) anchor.replaceWith(ta);
  else {
    $('#note-reading .note-empty')?.remove();
    $('#note-reading').append(ta);
  }
  ta.hidden = false;
  autosize(ta);
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(pos, pos);
  reveal(ta, { block: 'nearest' });
  $('#status-note').textContent = 'Editando un bloque · Esc o clic fuera para terminar · Ctrl+E edita la nota entera';
}

function endBlockEdit({ render = true } = {}) {
  clearTimeout(blockEndTimer);
  const b = blockEdit;
  if (!b) return;
  blockEdit = null;
  const ta = $('#note-editor');
  const caret = b.before.length + ta.selectionStart;
  ta.classList.remove('block-editing');
  ta.placeholder = '';
  ta.style.height = '';
  hideSuggest();
  hideFmtBar();
  // El editor vuelve a su sitio con la nota entera (así cualquier cambio posterior es coherente).
  $('.note-inner').insertBefore(ta, $('#note-lock'));
  ta.hidden = true;
  const note = noteById(b.noteId);
  if (note) {
    // Un bloque nuevo que se quedó vacío no deja líneas en blanco al final.
    if (b.from === null && !b.last.trim() && !note.enc && note.body !== note.body.replace(/\s+$/, '')) note.body = note.body.replace(/\s+$/, '');
    ta.value = noteText(note) ?? '';
    ta.dataset.note = note.id;
    ta.dataset.caret = String(caret);
  }
  flushNoteSave();
  if (render && note && activeNote()?.id === note.id) renderNotePane(note);
}

// Rango de líneas de un bloque teniendo en cuenta lo que creció o menguó el bloque que se editaba.
function shiftedRange(src) {
  let [from, to] = src.split('-').map(Number);
  const b = blockEdit;
  if (b && b.from !== null && from > b.to) {
    const delta = b.last.split('\n').length - (b.to - b.from + 1);
    from += delta;
    to += delta;
  }
  return [from, to];
}

$('#note-scroll').addEventListener('dblclick', (e) => {
  const note = activeNote();
  if (!note || noteMode.get(note.id) !== 'read' || noteText(note) === null) return;
  const reading = $('#note-reading');
  if (e.target.closest('a, input, button, audio, summary, .query, #note-editor, #note-title, #note-lock')) return;
  const blk = e.target.closest('[data-src]');
  const point = { x: e.clientX, y: e.clientY };
  if (blk && blk.parentElement === reading) {
    const [from, to] = shiftedRange(blk.dataset.src);
    if (blockEdit) {
      endBlockEdit();
      const again = $(`#note-reading > [data-src^="${from}-"]`);
      if (again) startBlockEdit(note, from, Number(again.dataset.src.split('-')[1]), again, point);
      return;
    }
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    startBlockEdit(note, from, to, blk, point);
  } else if (!blk && (e.target === reading || e.target.closest('.note-empty') || e.target.matches('.note-inner, .note-scroll'))) {
    endBlockEdit();
    startBlockEdit(note, null, null, null);
  }
});

// Un clic fuera del bloque lo cierra. Dentro de la nota se espera un poco, por si es el primer
// clic de un doble clic sobre otro bloque.
document.addEventListener('pointerdown', (e) => {
  if (!blockEdit || e.target.closest('#note-editor, #link-suggest, #fmt-bar')) return;
  clearTimeout(blockEndTimer);
  if ($('#note-reading').contains(e.target) || e.target.matches('.note-inner, .note-scroll')) blockEndTimer = setTimeout(() => endBlockEdit(), 320);
  else endBlockEdit();
});

$('#note-editor').addEventListener('keydown', (e) => {
  if (!blockEdit || e.defaultPrevented) return;
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault();
    e.stopPropagation();
    endBlockEdit();
  }
});

// ---------- Ayudas de escritura ----------
// Atajos de formato, cierre automático de [ ( { y envolver lo seleccionado, como en Obsidian.
// Se usa insertText para que Ctrl+Z deshaga cada paso.
function editorInsert(ta, text, start, end, selStart = null, selEnd = null) {
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(start, end);
  const ok = document.execCommand?.('insertText', false, text);
  if (!ok) {
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input'));
  }
  if (selStart !== null) ta.setSelectionRange(selStart, selEnd ?? selStart);
}

// Pone o quita las marcas alrededor de la selección (o de la palabra, si no hay selección).
function toggleWrap(ta, open, close = open) {
  let { selectionStart: s, selectionEnd: e, value } = ta;
  if (s === e) {
    // Sin selección: la palabra donde está el cursor; si no hay palabra, marcas vacías.
    const left = value.slice(0, s).match(/[\p{L}\p{N}_-]+$/u)?.[0].length || 0;
    const right = value.slice(s).match(/^[\p{L}\p{N}_-]+/u)?.[0].length || 0;
    if (!left && !right) return editorInsert(ta, open + close, s, e, s + open.length);
    s -= left;
    e += right;
  }
  const inner = value.slice(s, e);
  if (value.slice(s - open.length, s) === open && value.slice(e, e + close.length) === close) {
    editorInsert(ta, inner, s - open.length, e + close.length, s - open.length, e - open.length);
  } else if (inner.startsWith(open) && inner.endsWith(close) && inner.length >= open.length + close.length) {
    const bare = inner.slice(open.length, inner.length - close.length);
    editorInsert(ta, bare, s, e, s, s + bare.length);
  } else {
    editorInsert(ta, open + inner + close, s, e, s + open.length, e + open.length);
  }
}

// Ctrl+L: línea normal -> casilla -> casilla hecha -> casilla.
function toggleChecklist(ta) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const from = value.lastIndexOf('\n', s - 1) + 1;
  const toRaw = value.indexOf('\n', e);
  const to = toRaw < 0 ? value.length : toRaw;
  const out = value
    .slice(from, to)
    .split('\n')
    .map((l) => {
      if (/^\s*[-*+]\s+\[ \]\s/.test(l)) return l.replace('[ ]', '[x]');
      if (/^\s*[-*+]\s+\[[^\]]\]\s/.test(l)) return l.replace(/\[[^\]]\]/, '[ ]');
      if (/^\s*[-*+]\s/.test(l)) return l.replace(/^(\s*[-*+]\s+)/, '$1[ ] ');
      if (/^\s*\d+[.)]\s/.test(l)) return l.replace(/^(\s*)\d+[.)]\s+/, '$1- [ ] ');
      return l.trim() ? l.replace(/^(\s*)/, '$1- [ ] ') : l;
    })
    .join('\n');
  editorInsert(ta, out, from, to, from + out.length);
}

function insertLink(ta) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const sel = value.slice(s, e);
  if (/^https?:\/\/\S+$/.test(sel)) return editorInsert(ta, `[](${sel})`, s, e, s + 1);
  editorInsert(ta, `[${sel}]()`, s, e, s + sel.length + 3);
}

const FORMAT_KEYS = {
  b: (ta) => toggleWrap(ta, '**'),
  i: (ta) => toggleWrap(ta, '*'),
  u: (ta) => toggleWrap(ta, '<u>', '</u>'),
  k: insertLink,
  l: toggleChecklist,
  'shift+x': (ta) => toggleWrap(ta, '~~'),
  'shift+h': (ta) => toggleWrap(ta, '=='),
  'shift+c': (ta) => toggleWrap(ta, '`'),
  'shift+m': (ta) => toggleWrap(ta, '$'),
  'shift+[': (ta) => toggleWrap(ta, '[[', ']]'),
};
const PAIRS = { '[': ']', '(': ')', '{': '}' };
const WRAPS = { '*': '*', _: '_', '=': '=', '~': '~', '`': '`', '"': '"', $: '$', '[': ']', '(': ')', '{': '}' };

$('#note-editor').addEventListener('keydown', (e) => {
  const ta = e.target;
  if (e.defaultPrevented || e.isComposing) return;
  // AltGr (teclados españoles: [ { ~) llega como Ctrl+Alt: no es un atajo.
  const altGr = e.getModifierState?.('AltGraph') || (e.ctrlKey && e.altKey);
  const mod = (e.ctrlKey || e.metaKey) && !altGr;
  if (mod && !e.altKey) {
    const key = `${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`;
    const fn = FORMAT_KEYS[key] || (e.shiftKey && e.code === 'BracketLeft' ? FORMAT_KEYS['shift+['] : null);
    if (fn) {
      e.preventDefault();
      fn(ta);
    }
    return;
  }
  if (mod || (e.altKey && !altGr)) return;
  const { selectionStart: s, selectionEnd: end, value } = ta;
  // Con texto seleccionado, escribir * _ = ~ ` " $ [ ( lo envuelve (dos veces: **negrita**, [[enlace]]).
  if (s !== end && WRAPS[e.key]) {
    e.preventDefault();
    const inner = value.slice(s, end);
    editorInsert(ta, e.key + inner + WRAPS[e.key], s, end, s + 1, end + 1);
    return;
  }
  if (s !== end) return;
  // [ ( { se cierran solos; escribir el cierre cuando ya está delante solo avanza el cursor.
  if (PAIRS[e.key] && !/[\p{L}\p{N}]/u.test(value[s] || '')) {
    e.preventDefault();
    editorInsert(ta, e.key + PAIRS[e.key], s, s, s + 1);
    return;
  }
  if ([']', ')', '}'].includes(e.key) && value[s] === e.key) {
    e.preventDefault();
    ta.setSelectionRange(s + 1, s + 1);
    return;
  }
  // Borrar la apertura de un par vacío borra también el cierre.
  if (e.key === 'Backspace' && PAIRS[value[s - 1]] && value[s] === PAIRS[value[s - 1]]) {
    e.preventDefault();
    editorInsert(ta, '', s - 1, s + 1, s - 1);
  }
});

// ---------- Barra de formato al seleccionar texto ----------
const FMT_BUTTONS = [
  ['B', 'Negrita (Ctrl+B)', (ta) => toggleWrap(ta, '**'), 'fb-b'],
  ['I', 'Cursiva (Ctrl+I)', (ta) => toggleWrap(ta, '*'), 'fb-i'],
  ['U', 'Subrayado (Ctrl+U)', (ta) => toggleWrap(ta, '<u>', '</u>'), 'fb-u'],
  ['S', 'Tachado (Ctrl+Mayús+X)', (ta) => toggleWrap(ta, '~~'), 'fb-s'],
  ['▌', 'Resaltado (Ctrl+Mayús+H)', (ta) => toggleWrap(ta, '=='), 'fb-h'],
  ['</>', 'Código (Ctrl+Mayús+C)', (ta) => toggleWrap(ta, '`'), ''],
  ['[[ ]]', 'Enlace a una nota: crea la nota si no existe (Ctrl+Mayús+[)', (ta) => toggleWrap(ta, '[[', ']]'), ''],
  ['🔗', 'Enlace web (Ctrl+K)', insertLink, ''],
  ['☐', 'Casilla de tarea (Ctrl+L)', toggleChecklist, ''],
];

function showFmtBar() {
  const ta = $('#note-editor');
  if (document.activeElement !== ta || ta.selectionStart === ta.selectionEnd || !$('#link-suggest').hidden) return hideFmtBar();
  let bar = $('#fmt-bar');
  if (!bar) {
    bar = el(
      'div',
      { id: 'fmt-bar', className: 'fmt-bar', role: 'toolbar', ariaLabel: 'Formato' },
      FMT_BUTTONS.map(([label, title, fn, cls]) => {
        const b = el('button', { className: cls, title, ariaLabel: title, type: 'button' }, label);
        // pointerdown evita que el editor pierda la selección.
        b.addEventListener('pointerdown', (e) => e.preventDefault());
        b.addEventListener('click', () => {
          fn($('#note-editor'));
          requestAnimationFrame(showFmtBar);
        });
        return b;
      })
    );
    document.body.append(bar);
  }
  const { top, left } = caretCoords(ta, ta.selectionStart);
  bar.hidden = false;
  const w = bar.offsetWidth;
  const h = bar.offsetHeight;
  bar.style.left = `${Math.max(8, Math.min(left - 12, window.innerWidth - w - 8))}px`;
  bar.style.top = `${top - h - 8 < 8 ? top + 30 : top - h - 8}px`;
}
function hideFmtBar() {
  const bar = $('#fmt-bar');
  if (bar) bar.hidden = true;
}
let fmtTimer = null;
document.addEventListener('selectionchange', () => {
  clearTimeout(fmtTimer);
  fmtTimer = setTimeout(showFmtBar, 120);
});
$('#note-editor').addEventListener('blur', hideFmtBar);
$('#note-scroll').addEventListener('scroll', hideFmtBar, { passive: true });
