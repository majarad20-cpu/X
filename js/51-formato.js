'use strict';

// ---------- Herramientas de escritura ----------
// Bloques del menú «/» que piden algo (tipo de recuadro, color, nota, archivo…), estilos HTML desde la
// barra de formato («Aa»), estilo del párrafo («¶» o clic derecho) y archivos de audio, vídeo o PDF
// guardados en la app como ![nombre.ext](file:ID).

const CALLOUT_TYPES = [
  ['note', 'Nota'], ['abstract', 'Resumen'], ['info', 'Información'], ['todo', 'Por hacer'], ['tip', 'Consejo'], ['success', 'Hecho'], ['question', 'Pregunta'],
  ['warning', 'Advertencia'], ['failure', 'Fallo'], ['danger', 'Peligro'], ['bug', 'Error'], ['example', 'Ejemplo'], ['quote', 'Cita'],
];
// Los mismos colores que los recuadros en styles.css.
const CALLOUT_COLOR = { note: '#448aff', abstract: '#00b0c8', info: '#0284c7', todo: '#6366f1', tip: '#10a39a', success: '#16a34a', question: '#d4a106', warning: '#ea7a0c', failure: '#e5484d', danger: '#c81e3a', bug: '#d6409f', example: '#8b5cf6', quote: '#8b8f98' };
// Tonos medios: se leen sobre fondo claro y oscuro. Los resaltados llevan transparencia por lo mismo.
const TEXT_COLORS = [['Rojo', '#e5484d'], ['Naranja', '#e8590c'], ['Ámbar', '#c48a00'], ['Verde', '#2f9e44'], ['Turquesa', '#0c8599'], ['Azul', '#1c7ed6'], ['Índigo', '#5c7cfa'], ['Morado', '#ae3ec9'], ['Rosa', '#d6336c'], ['Gris', '#868e96']];
const MARK_COLORS = [['Amarillo', '#ffd43b66'], ['Verde', '#69db7c66'], ['Turquesa', '#3bc9db66'], ['Azul', '#4dabf766'], ['Morado', '#b197fc66'], ['Rosa', '#f783ac66'], ['Rojo', '#ff6b6b66'], ['Naranja', '#ffa94d66'], ['Gris', '#adb5bd66']];
const FILE_LIMIT_MB = 15;
const FILE_ACCEPT = 'audio/*,video/*,application/pdf,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.epub';
const isEmbedFile = (f) => /^(audio|video)\//.test(f.type) || f.type === 'application/pdf';

// ---------- Insertar en el editor ----------
// El editor listo para escribir (si la nota se está leyendo, pasa a edición).
function fmtEditor() {
  const note = activeNote();
  if (!note || noteText(note) === null) {
    showToastMessage('Abre (o desbloquea) una nota para insertar.');
    return null;
  }
  if (!blockEdit && !isEditing(note.id)) {
    noteMode.set(note.id, preferredEditMode());
    renderNotePane(note);
  }
  return $('#note-editor');
}
// Dónde insertar: el cursor, o donde estaba antes de abrir un selector.
const fmtCaret = (ta) => (document.activeElement === ta || !ta.dataset.caret ? ta.selectionStart : Math.min(Number(ta.dataset.caret), ta.value.length));

// Inserta texto con «‸» como cursor; los bloques van en una línea propia.
function insertBlockText(raw) {
  const ta = fmtEditor();
  if (!ta) return;
  const from = fmtCaret(ta);
  const lineStart = ta.value.lastIndexOf('\n', from - 1) + 1;
  const text = (SLASH_LINE_RE.test(raw) && ta.value.slice(lineStart, from).trim() ? '\n' : '') + raw;
  const k = text.indexOf('‸');
  const clean = text.replace('‸', '');
  editorInsert(ta, clean, from, from, from + (k < 0 ? clean.length : k));
}

// ---------- Selectores ----------
// Las filas del selector con «color» llevan una franja de ese color.
new MutationObserver(() => {
  $$('#picker-list .pk-item').forEach((li, i) => {
    const c = picker?.list[i]?.color;
    li.classList.toggle('pk-colored', !!c);
    if (c) li.style.setProperty('--pk-color', c);
  });
}).observe($('#picker-list'), { childList: true });

const pickFrom = (placeholder, list, hint = '<kbd>↑↓</kbd> moverse · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> cancelar') =>
  openPicker({ placeholder, hint, items: (q) => list.filter((it) => fold(`${it.label} ${it.detail || ''}`).includes(fold(q))) });

// Tipo de recuadro y después cómo se ve: fijo, plegado o desplegable. onPick(tipo, '' | '-' | '+').
function pickCallout(onPick) {
  pickFrom(
    'Tipo de recuadro…',
    CALLOUT_TYPES.map(([type, name]) => ({
      label: `${CALLOUT_ICONS[type] || 'ℹ️'} ${name}`,
      detail: type,
      color: CALLOUT_COLOR[type] || 'var(--accent)',
      action: () =>
        pickFrom(`Recuadro «${name}»…`, [
          { label: 'Fijo', detail: 'Siempre abierto', action: () => onPick(type, '') },
          { label: 'Plegado', detail: 'Empieza cerrado; se abre al tocarlo', action: () => onPick(type, '-') },
          { label: 'Desplegable', detail: 'Empieza abierto; se puede cerrar', action: () => onPick(type, '+') },
        ]),
    }))
  );
}

function pickColor(kind, onPick) {
  const list = kind === 'mark' ? MARK_COLORS : TEXT_COLORS;
  pickFrom(kind === 'mark' ? 'Color de resaltado…' : 'Color de texto…', list.map(([name, c]) => ({ label: name, detail: c, color: c, action: () => onPick(c) })));
}

// Nombre con el que se enlaza una nota (la ruta si hay otra con el mismo nombre).
const linkNameOf = (n) => (findNoteByName(baseName(n.path)) === n ? baseName(n.path) : n.path);

function pickNoteFor(placeholder, onPick) {
  openPicker({
    placeholder,
    hint: '<kbd>↑↓</kbd> moverse · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> cancelar',
    items: (q) =>
      state.notes
        .filter((n) => !n.enc)
        .map((n) => ({ n, s: q ? scoreNote(n, q.toLowerCase()) : 1 }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || b.n.updatedAt - a.n.updatedAt)
        .slice(0, 40)
        .map(({ n }) => ({ label: baseName(n.path), detail: folderOf(n.path), action: () => onPick(n) })),
  });
}

function pickEmbedSection() {
  pickNoteFor('Incrustar una sección de…', (n) => {
    const heads = headingsIn(n.body);
    if (!heads.length) {
      insertBlockText(`![[${linkNameOf(n)}]]‸`);
      return showToastMessage('Esa nota no tiene títulos: se incrusta entera.');
    }
    pickFrom(`Sección de «${baseName(n.path)}»…`, heads.map((h) => ({ label: `${'  '.repeat(h.level - 1)}${h.text}`, detail: `H${h.level}`, action: () => insertBlockText(`![[${linkNameOf(n)}#${h.text}]]‸`) })));
  });
}

// Bloques de una nota que se pueden citar: párrafos y elementos de lista (fuera del código y las propiedades).
function noteBlocks(body) {
  const lines = body.split('\n');
  const out = [];
  let fence = false;
  let start = -1;
  let k = 0;
  if (lines[0] === '---') {
    k = lines.indexOf('---', 1) + 1;
    if (!k) k = 0;
  }
  const close = (end) => {
    if (start >= 0) out.push({ from: start, to: end, text: lines.slice(start, end + 1).join(' ') });
    start = -1;
  };
  for (; k < lines.length; k++) {
    const l = lines[k];
    if (/^\s*(```|\$\$)/.test(l)) {
      close(k - 1);
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (!l.trim() || /^(#{1,6}\s|\||<\/?(details|summary|p|div)\b|---\s*$|\^[\w-]+\s*$)/.test(l)) {
      close(k - 1);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s/.test(l)) {
      close(k - 1);
      start = k;
      close(k);
      continue;
    }
    if (start < 0) start = k;
  }
  close(lines.length - 1);
  return out;
}

// Pone «^id» al final del bloque si no lo tiene (como Obsidian) y devuelve el texto nuevo y el id.
function ensureBlockId(body, blk) {
  const lines = body.split('\n');
  const m = lines[blk.to].match(BLOCK_ID_RE);
  if (m) return { body, id: m[1] };
  const id = Math.random().toString(36).slice(2, 8);
  lines[blk.to] = `${lines[blk.to].replace(/\s+$/, '')} ^${id}`;
  return { body: lines.join('\n'), id };
}

function pickEmbedBlock() {
  pickNoteFor('Incrustar un bloque de…', (n) => {
    const blocks = noteBlocks(n.body);
    if (!blocks.length) return showToastMessage('Esa nota no tiene párrafos que incrustar.');
    pickFrom(
      `Bloque de «${baseName(n.path)}»…`,
      blocks.map((blk) => ({ label: blk.text.replace(BLOCK_ID_RE, '').slice(0, 90), detail: blk.text.match(BLOCK_ID_RE)?.[0].trim() || '', action: () => embedBlock(n, blk) }))
    );
  });
}

function embedBlock(n, blk) {
  const ta = fmtEditor();
  if (!ta) return;
  const same = n === activeNote();
  // En la propia nota, el editor tiene la versión más reciente (si contiene la nota entera).
  if (same && blockEdit) return showToastMessage('Para incrustar un bloque de esta misma nota, edita la nota entera (Ctrl+E).');
  const { body, id } = ensureBlockId(same ? ta.value : n.body, blk);
  if (same && body !== ta.value) {
    const at = fmtCaret(ta);
    ta.value = body;
    ta.dataset.caret = String(at + (at > body.indexOf(` ^${id}`) ? id.length + 2 : 0));
    ta.dispatchEvent(new Event('input'));
  } else if (!same && body !== n.body) {
    n.body = body;
    n.updatedAt = Date.now();
    save();
  }
  insertBlockText(`![[${linkNameOf(n)}#^${id}]]‸`);
}

async function pickEmbedDrawing() {
  const used = new Set();
  state.notes.forEach((n) => n.body?.replace(/\(img:([a-z0-9]+)\)/gi, (_, id) => used.add(id)));
  const list = (await allFiles()).filter((f) => (f.drawing || xdDrawingIds.has(f.id)) && used.has(f.id)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!list.length) return showToastMessage('Aún no tienes dibujos. Crea uno con «/dibujo».');
  pickFrom('Incrustar dibujo…', list.map((f) => ({ label: f.name || 'Dibujo', detail: f.createdAt ? new Date(f.createdAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '', action: () => insertBlockText(`![${f.name || 'Dibujo'}](img:${f.id})\n‸`) })));
}

function promptEmbedUrl() {
  promptText({
    placeholder: 'Pega un enlace: YouTube o Vimeo (se reproduce en la nota), .mp4, .mp3, PDF o una web',
    action: 'Insertar',
    onSubmit: (v) => {
      const url = v.trim();
      if (!/^https?:\/\/\S+$/i.test(url)) return showToastMessage('Escribe una dirección que empiece por https://');
      insertBlockText(`![](${url})\n‸`);
    },
  });
}

// Nota al pie: [^n] en el cursor y su definición al final.
function insertFootnote() {
  const ta = fmtEditor();
  if (!ta) return;
  const all = noteText(activeNote()) ?? ta.value;
  const n = Math.max(0, ...[...all.matchAll(/\[\^(\d+)\]/g)].map((m) => +m[1])) + 1;
  const at = fmtCaret(ta);
  editorInsert(ta, `[^${n}]`, at, at);
  const end = ta.value.length;
  const def = `${/\n\n$/.test(ta.value) || !ta.value ? '' : ta.value.endsWith('\n') ? '\n' : '\n\n'}[^${n}]: `;
  editorInsert(ta, def, end, end, end + def.length);
}

// ---------- Archivos: audio, vídeo, PDF… ----------
function pickMediaFile() {
  const note = activeNote();
  if (note?.enc) return showToastMessage('Las notas con contraseña no admiten archivos.');
  let input = $('#note-file-input');
  if (!input) {
    input = el('input', { id: 'note-file-input', type: 'file', accept: FILE_ACCEPT, multiple: true, hidden: true });
    input.addEventListener('change', (e) => insertMediaFiles(e.target.files));
    document.body.append(input);
  }
  input.value = '';
  input.click();
}

const readDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

async function insertMediaFiles(list) {
  const note = activeNote();
  const all = [...list];
  const ids = [];
  if (!note || !all.length) return ids;
  if (note.enc) {
    showToastMessage('Las notas con contraseña no admiten archivos.');
    return ids;
  }
  const ta = fmtEditor();
  if (!ta) return ids;
  let pos = fmtCaret(ta);
  let local = false;
  for (const file of all) {
    if (file.size > FILE_LIMIT_MB * 1024 * 1024) {
      showToastMessage(`«${file.name}» pesa más de ${FILE_LIMIT_MB} MB. Para vídeos grandes, súbelos a YouTube o Vimeo y pega el enlace con «/vídeo».`);
      continue;
    }
    try {
      let data = await readDataUrl(file);
      // Algunos archivos llegan sin tipo: se guardan como binarios.
      if (/^data:;base64,|^data:base64,/.test(data)) data = data.replace(/^data:(;)?base64,/, 'data:application/octet-stream;base64,');
      const name = (file.name || 'archivo').replace(/[[\]|\n]/g, ' ').trim().slice(0, 80) || 'archivo';
      const rec = { id: uid(), name, type: file.type || 'application/octet-stream', size: file.size, data, createdAt: Date.now() };
      if (!(await putFile(rec))) throw new Error('no guardado');
      if (activeNote() !== note) return ids;
      if (data.length > FILE_SYNC_MAX) local = true;
      pos = Math.min(pos, ta.value.length);
      const before = ta.value.slice(0, pos);
      const text = `${before && !before.endsWith('\n') ? '\n' : ''}![${name}](file:${rec.id})\n`;
      editorInsert(ta, text, pos, pos);
      pos += text.length;
      ids.push(rec.id);
    } catch {
      showToastMessage(`No se pudo guardar «${file.name || 'el archivo'}» (¿falta espacio?).`);
      return ids;
    }
  }
  if (ids.length) {
    scheduleFilesSync();
    showToastMessage(local ? 'Se guarda solo en este dispositivo: los archivos de más de 250 KB no se sincronizan con la nube.' : ids.length > 1 ? `${ids.length} archivos añadidos` : 'Archivo añadido');
  }
  return ids;
}

// ---------- Estilos en línea ----------
// Envuelve con <etiqueta style="prop: valor">; si ya lo tenía, cambia el valor (o lo quita si es el mismo).
function wrapStyled(ta, tag, prop, val) {
  const open = `<${tag} style="${prop}: ${val}">`;
  const close = `</${tag}>`;
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const re = `<${tag} style="${prop}: ?([^"]*)">`;
  const out = (from, to, inner, cur) => {
    const same = cur.trim().toLowerCase() === val.toLowerCase();
    const at = same ? from : from + open.length;
    editorInsert(ta, same ? inner : open + inner + close, from, to, at, at + inner.length);
  };
  const m = value.slice(0, s).match(new RegExp(`${re}$`));
  if (m && value.startsWith(close, e)) return out(s - m[0].length, e + close.length, value.slice(s, e), m[1]);
  const m2 = value.slice(s, e).match(new RegExp(`^${re}([\\s\\S]*)${close}$`));
  if (m2) return out(s, e, m2[2], m2[1]);
  toggleWrap(ta, open, close);
}

const STYLE_TAGS = 'u|sub|sup|kbd|small|mark|span|s|b|i|ins';
// Quita etiquetas y marcas de la selección (y las que la rodean).
function clearFormat(ta) {
  let { selectionStart: s, selectionEnd: e, value } = ta;
  const outer = new RegExp(`(<(${STYLE_TAGS})\\b[^>]*>|\\*\\*|==|~~|\\*|\`)$`);
  for (let m; (m = value.slice(0, s).match(outer)); ) {
    const close = m[2] ? `</${m[2]}>` : m[1];
    if (!value.startsWith(close, e)) break;
    s -= m[0].length;
    e += close.length;
  }
  const inner = value
    .slice(s, e)
    .replace(new RegExp(`</?(${STYLE_TAGS})\\b[^>]*>`, 'g'), '')
    .replace(/\*\*|==|~~/g, '')
    .replace(/(^|[^\\*])\*(?=\S)([^*\n]*?\S)\*/g, '$1$2');
  editorInsert(ta, inner, s, e, s, s + inner.length);
}

const MORE_STYLES = [
  ['U', 'Subrayado (Ctrl+U)', (ta) => toggleWrap(ta, '<u>', '</u>'), 'fb-u'],
  ['x²', 'Superíndice', (ta) => toggleWrap(ta, '<sup>', '</sup>'), ''],
  ['x₂', 'Subíndice', (ta) => toggleWrap(ta, '<sub>', '</sub>'), ''],
  ['⌨', 'Tecla', (ta) => toggleWrap(ta, '<kbd>', '</kbd>'), ''],
  ['a', 'Texto pequeño', (ta) => toggleWrap(ta, '<small>', '</small>'), 'fm-small'],
  ['A', 'Texto grande', (ta) => toggleWrap(ta, '<span style="font-size: 130%">', '</span>'), 'fm-big'],
];

function fmtButton(label, title, fn, cls = '') {
  const b = el('button', { className: cls, title, ariaLabel: title, type: 'button' }, label);
  // pointerdown evita que el editor pierda el foco y la selección.
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    fn($('#note-editor'));
    requestAnimationFrame(showFmtBar);
  });
  return b;
}

function buildFmtMore() {
  const swatches = (list, kind) =>
    el('div', { className: 'fm-swatches' }, list.map(([name, c]) => {
      const b = fmtButton('', `${kind === 'mark' ? 'Resaltar' : 'Texto'}: ${name.toLowerCase()}`, (ta) => (kind === 'mark' ? wrapStyled(ta, 'mark', 'background', c) : wrapStyled(ta, 'span', 'color', c)), `fm-sw${kind === 'mark' ? ' mark' : ''}`);
      b.style.setProperty('--sw', c);
      if (kind !== 'mark') b.textContent = 'A';
      return b;
    }));
  return el('div', { className: 'fmt-more', hidden: true }, [
    el('div', { className: 'fm-row' }, MORE_STYLES.map(([l, t, f, c]) => fmtButton(l, t, f, c))),
    el('div', { className: 'fm-label' }, 'Color de texto'),
    swatches(TEXT_COLORS, 'text'),
    el('div', { className: 'fm-label' }, 'Resaltado'),
    swatches(MARK_COLORS, 'mark'),
    fmtButton('Quitar formato', 'Quita negrita, colores, tamaños… de la selección', clearFormat, 'fm-clear'),
  ]);
}

function toggleFmtMore() {
  const bar = $('#fmt-bar');
  let pop = bar.querySelector('.fmt-more');
  if (!pop) bar.append((pop = buildFmtMore()));
  pop.hidden = !pop.hidden;
}

FMT_BUTTONS.push(
  ['Aa', 'Más estilos: subrayado, índices, tamaño, colores…', toggleFmtMore, 'fb-more'],
  ['¶', 'Estilo del párrafo: título, cita, recuadro, lista, alineación…', (ta) => showMenu($('#fmt-bar .fb-para'), paragraphMenuItems(ta)), 'fb-para']
);

// ---------- Estilo del párrafo ----------
// Líneas [a, b] del bloque donde está el cursor (o de la selección).
function paraRange(ta, lineOnly = false) {
  const lines = ta.value.split('\n');
  const lineAt = (pos) => ta.value.slice(0, pos).split('\n').length - 1;
  let a = lineAt(ta.selectionStart);
  let b = lineAt(ta.selectionEnd);
  if (a !== b || lineOnly || !lines[a].trim()) return [a, b];
  // Dentro de <details>…</details>, la sección entera.
  for (let k = a; k >= 0; k--) {
    if (k < a && /^<\/details>\s*$/.test(lines[k])) break;
    if (/^<details\b[^>]*>\s*$/.test(lines[k])) {
      const end = lines.findIndex((l, j) => j >= a && /^<\/details>\s*$/.test(l));
      if (end >= 0) return [k, end];
      break;
    }
  }
  while (a > 0 && lines[a - 1].trim()) a--;
  while (b < lines.length - 1 && lines[b + 1].trim()) b++;
  return [a, b];
}

const ALIGN_OPEN = /^<p align="\w+">/;
function unalign(ls) {
  if (!ALIGN_OPEN.test(ls[0]) || !/<\/p>\s*$/.test(ls[ls.length - 1])) return ls;
  const x = [...ls];
  x[0] = x[0].replace(ALIGN_OPEN, '');
  x[x.length - 1] = x[x.length - 1].replace(/<\/p>\s*$/, '');
  return x;
}

// Quita sección desplegable, alineación, cita o recuadro: queda el texto de dentro.
function unwrapLines(ls) {
  let x = unalign(ls);
  if (x.length >= 2 && /^<details\b[^>]*>\s*$/.test(x[0]) && /^<\/details>\s*$/.test(x[x.length - 1])) {
    x = x.slice(1, -1);
    const m = x[0]?.match(/^<summary>(.*)<\/summary>\s*$/);
    if (m) x[0] = m[1];
  }
  if (x.length && x.every((l) => /^>/.test(l))) {
    const c = x[0].match(/^>\s*\[!([\w-]+)\][+-]?\s*(.*)$/);
    x = x.map((l) => l.replace(/^>\s?/, ''));
    if (c) {
      if (c[2].trim()) x[0] = c[2];
      else x.shift();
    }
  }
  x = x.filter((l, i) => l.trim() || (i > 0 && i < x.length - 1));
  return x.length ? x : [''];
}
const bareLine = (l) => l.replace(/^#{1,6}\s+/, '').replace(/^\s*(?:[-*+]\s+\[.\]\s+|[-*+]\s+|\d+[.)]\s+)/, '');
// Texto de una línea sin marcas de bloque (para volver a encontrarla).
const coreLine = (l) => bareLine(l.replace(/^>\s?(\[![\w-]+\][+-]?\s*)?/, '').replace(ALIGN_OPEN, '').replace(/^<summary>/, '').replace(/(<\/p>|<\/summary>)\s*$/, ''));

function convertLines(ls, kind, arg) {
  if (kind === 'align') {
    const x = unalign(ls);
    if (arg === 'left') return x;
    return [`<p align="${arg}">${x[0]}`, ...x.slice(1)].map((l, i, all) => (i === all.length - 1 ? `${l}</p>` : l));
  }
  const bare = unwrapLines(ls).map(bareLine);
  if (kind === 'h') return bare.map((l) => `${'#'.repeat(arg)} ${l}`);
  if (kind === 'ul') return bare.map((l) => `- ${l}`);
  if (kind === 'ol') return bare.map((l, i) => `${i + 1}. ${l}`);
  if (kind === 'task') return bare.map((l) => `- [ ] ${l}`);
  if (kind === 'quote') return bare.map((l) => (l ? `> ${l}` : '>'));
  if (kind === 'callout') return [`> [!${arg.type}]${arg.fold} ${bare[0]}`.trimEnd(), ...(bare.length > 1 ? bare.slice(1) : ['']).map((l) => (l ? `> ${l}` : '> '))];
  if (kind === 'details') return ['<details>', `<summary>${bare[0]}</summary>`, ...(bare.length > 1 ? bare.slice(1) : ['']), '</details>'];
  return bare;
}

// Cambia el bloque del cursor: «p», «h» (1–6), «quote», «callout» ({type, fold}), «ul», «ol», «task», «details», «align» (left|center|right|justify).
function restyleParagraph(ta, kind, arg) {
  const lines = ta.value.split('\n');
  // Un título es de una línea, salvo que la línea esté dentro de una cita, un recuadro, una sección o una alineación.
  let [a, b] = paraRange(ta);
  const wrapped = (ls) => ls.every((l) => /^>/.test(l)) || unwrapLines(ls).length !== ls.length || unalign(ls) !== ls;
  if (kind === 'h' && !wrapped(lines.slice(a, b + 1))) [a, b] = paraRange(ta, true);
  const cur = coreLine(lines[ta.value.slice(0, ta.selectionStart).split('\n').length - 1] || '');
  const out = convertLines(lines.slice(a, b + 1), kind, arg);
  const start = lines.slice(0, a).join('\n').length + (a ? 1 : 0);
  const end = start + lines.slice(a, b + 1).join('\n').length;
  // El cursor vuelve al final de su línea (en una sección nueva de una línea, al contenido).
  let k = kind === 'details' && out.length === 4 && !out[2] ? 2 : kind === 'callout' && out.length === 2 && out[1] === '> ' ? 1 : out.findIndex((l) => cur && coreLine(l) === cur);
  if (k < 0) k = out.length - 1;
  const caret = start + out.slice(0, k).join('\n').length + (k ? 1 : 0) + out[k].replace(/(<\/p>|<\/summary>)\s*$/, '').length;
  editorInsert(ta, out.join('\n'), start, end, caret);
}

function paragraphMenuItems(ta) {
  const go = (kind, arg) => () => restyleParagraph(ta, kind, arg);
  return [
    { label: '¶ Párrafo', action: go('p') },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: `H${n} Título ${n}`, action: go('h', n) })),
    { label: '❝ Cita', action: go('quote') },
    { label: '▣ Recuadro…', action: () => {
      ta.dataset.caret = String(ta.selectionStart);
      pickCallout((type, fold) => {
        ta.focus({ preventScroll: true });
        restyleParagraph(ta, 'callout', { type, fold });
      });
    } },
    { label: '• Lista', action: go('ul') },
    { label: '1. Lista numerada', action: go('ol') },
    { label: '☐ Tarea', action: go('task') },
    { label: '▾ Sección desplegable', action: go('details') },
    { sep: true },
    { label: '⇤ Alinear a la izquierda', action: go('align', 'left') },
    { label: '↔ Centrar', action: go('align', 'center') },
    { label: '⇥ Alinear a la derecha', action: go('align', 'right') },
    { label: '☰ Justificar', action: go('align', 'justify') },
  ];
}

// Clic derecho en el editor (43-menu-contextual.js): cortar, copiar, pegar y estilo del párrafo.
// Con Mayús se deja el menú del navegador (ortografía…).
function editorMenuItems(ta) {
  const sel = ta.selectionStart !== ta.selectionEnd;
  const cmd = (c) => () => {
    ta.focus({ preventScroll: true });
    document.execCommand(c);
  };
  return [
    { label: 'Cortar', kbd: 'Ctrl+X', disabled: !sel, action: cmd('cut') },
    { label: 'Copiar', kbd: 'Ctrl+C', disabled: !sel, action: cmd('copy') },
    ...(navigator.clipboard?.readText ? [{ label: 'Pegar', kbd: 'Ctrl+V', action: () => navigator.clipboard.readText().then((t) => t && editorInsert(ta, t, ta.selectionStart, ta.selectionEnd, ta.selectionStart + t.length)).catch(() => showToastMessage('Usa Ctrl+V para pegar.')) }] : []),
    ...(sel ? [{ label: 'Quitar formato', action: () => clearFormat(ta) }] : []),
    { sep: true },
    ...paragraphMenuItems(ta),
  ];
}

// ---------- Comandos ----------
COMMANDS_EXTRA.push((note) => (note && noteText(note) !== null ? [
  { label: 'Insertar sección desplegable', action: () => insertBlockText('<details>\n<summary>‸</summary>\n\n</details>') },
  { label: 'Insertar recuadro…', action: () => pickCallout((type, fold) => insertBlockText(`> [!${type}]${fold} ‸\n> `)) },
  { label: 'Incrustar vídeo de YouTube/Vimeo o enlace…', action: promptEmbedUrl },
  ...(note.enc ? [] : [{ label: 'Incrustar archivo (audio, vídeo o PDF)…', action: pickMediaFile }]),
  { label: 'Incrustar sección de una nota…', action: pickEmbedSection },
  { label: 'Incrustar bloque de una nota…', action: pickEmbedBlock },
] : []));
