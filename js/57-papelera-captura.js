'use strict';

// ---------- Papelera de notas ----------
// Las notas borradas (sueltas, con su carpeta o al fusionarlas) pasan 30 días aquí antes de
// desaparecer: { id (el de la nota), note, deletedAt, from: ruta original }.
// Cada elemento se sincroniza como un bloque «trash-<id>» (19-sincronizacion.js) y las notas
// protegidas siguen cifradas. Al restaurar, la nota recupera su id: enlaces y marcadores vuelven a valer.
const TRASH_DAYS = 30;
DATA_KEYS.push('trash'); // entra en «Deshacer», en la exportación y en las copias de seguridad
const trashList = () => (Array.isArray(state.trash) ? state.trash : (state.trash = []));
const trashLeft = (it) => Math.max(0, Math.ceil((it.deletedAt + TRASH_DAYS * 864e5 - Date.now()) / 864e5));
let trashSel = null; // elemento cuya vista previa se ve

// Llamada desde deleteNote, deleteFolder y mergeNotes, dentro de su withUndo.
function trashNotes(notes) {
  if (!notes.length) return;
  flushNoteSave();
  const ids = new Set(notes.map((n) => n.id));
  const list = trashList().filter((t) => !ids.has(t.id));
  const now = Date.now();
  notes.forEach((n) => {
    // Una nota protegida se guarda tal cual (cifrada); su texto en claro se olvida.
    if (unlockedNotes.has(n.id)) {
      clearTimeout(encryptTimers.get(n.id));
      encryptTimers.delete(n.id);
      unlockedNotes.delete(n.id);
      lockKeys.delete(n.id);
    }
    list.push({ id: n.id, note: JSON.parse(JSON.stringify(n)), deletedAt: now, from: n.path });
  });
  state.trash = list;
}

function restoreFromTrash(id, { open = false } = {}) {
  const it = trashList().find((t) => t.id === id);
  if (!it) return null;
  const note = JSON.parse(JSON.stringify(it.note));
  if (noteById(note.id)) note.id = uid(); // ya hay otra nota con ese id
  const folder = folderOf(it.from);
  note.path = uniquePath(folder, baseName(it.from));
  note.updatedAt = Date.now();
  if (folder && !allFolders().includes(folder)) state.folders.push(folder);
  state.trash = trashList().filter((t) => t !== it);
  state.notes.push(note);
  noteIndex.key = '';
  save();
  if (open) openNote(note);
  else renderAll();
  toastAction(`«${baseName(note.path)}» restaurada${folder ? ` en ${folder}` : ''}`, open ? null : 'Abrir', () => openNote(note));
  return note;
}

function deleteForever(id) {
  const it = trashList().find((t) => t.id === id);
  if (!it) return;
  withUndo(`«${baseName(it.from)}» eliminada definitivamente`, () => {
    state.trash = trashList().filter((t) => t.id !== id);
  });
}

function emptyTrash() {
  const n = trashList().length;
  if (!n) return;
  withUndo(`Papelera vaciada (${plural(n, 'nota', 'notas')})`, () => {
    state.trash = [];
  });
}

// Lo que lleva más de 30 días se borra (al arrancar y cada vez que llegan datos).
function purgeTrash() {
  const limit = Date.now() - TRASH_DAYS * 864e5;
  if (!trashList().some((t) => t.deletedAt < limit)) return false;
  state.trash = trashList().filter((t) => t.deletedAt >= limit);
  save();
  return true;
}

// Aviso con un botón (como el de «Deshacer»).
function toastAction(message, label, fn) {
  if (!label) return showToastMessage(message);
  const b = el('button', { className: 'toast-action' }, label);
  b.addEventListener('click', () => {
    hideToast();
    fn();
  });
  $('#toast').replaceChildren(el('span', {}, message), b);
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(hideToast, 6000);
}

// No hay limpieza de imágenes sin usar, pero la copia de seguridad solo lleva las de las notas:
// se le añaden las de las notas en la papelera.
const backupNoteFiles = backupFiles;
backupFiles = async () => {
  const list = await backupNoteFiles();
  const have = new Set(list.map((f) => f.id));
  const used = new Set();
  trashList().forEach((t) => (t.note.body || '').replace(/\((?:img|audio|file):([a-z0-9]+)\)/gi, (_, id) => !have.has(id) && used.add(id)));
  return used.size ? list.concat((await allFiles()).filter((f) => used.has(f.id))) : list;
};

// ---------- Vista «Papelera» ----------
const trashWhen = (at) => new Date(at).toLocaleString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function trashMenuItems(it) {
  return [
    { label: '👁 Ver el contenido', action: () => ((trashSel = it.id), showView('trash')) },
    { label: '↩ Restaurar', action: () => restoreFromTrash(it.id) },
    { label: '↩ Restaurar y abrir', action: () => restoreFromTrash(it.id, { open: true }) },
    { sep: true },
    { label: 'Eliminar definitivamente', danger: true, action: () => deleteForever(it.id) },
    { label: 'Vaciar la papelera', danger: true, action: emptyTrash },
  ];
}

function trashRow(it) {
  const restore = el('button', { className: 'chip primary-chip' }, '↩ Restaurar');
  restore.addEventListener('click', () => restoreFromTrash(it.id));
  const del = el('button', { className: 'chip danger-chip', title: 'Eliminar definitivamente' }, 'Eliminar');
  del.addEventListener('click', () => deleteForever(it.id));
  const left = trashLeft(it);
  const li = el('li', { className: `trash-row${it.id === trashSel ? ' active' : ''}`, tabIndex: 0, title: 'Ver el contenido' }, [
    el('div', { className: 'trash-info' }, [
      el('span', { className: 'trash-name' }, `${it.note.enc ? '🔒 ' : ''}${baseName(it.from)}`),
      el('span', { className: 'muted trash-meta' }, `📁 ${folderOf(it.from) || 'raíz'} · borrada el ${trashWhen(it.deletedAt)} · ${left ? `quedan ${plural(left, 'día', 'días')}` : 'se borra hoy'}`),
    ]),
    el('div', { className: 'trash-actions' }, [restore, del]),
  ]);
  li.dataset.trash = it.id;
  const pick = () => {
    trashSel = it.id;
    renderTrash();
  };
  li.addEventListener('click', (e) => !e.target.closest('button') && pick());
  li.addEventListener('keydown', (e) => e.key === 'Enter' && e.target === li && pick());
  return li;
}

function trashPreview(it) {
  const body = el('div', { className: 'trash-preview-body md' });
  if (it.note.enc) body.append(el('p', { className: 'muted' }, '🔒 Nota protegida con contraseña. Restáurala para abrirla.'));
  else if (!(it.note.body || '').trim()) body.append(el('p', { className: 'muted' }, 'Nota vacía.'));
  else {
    body.innerHTML = renderMd(it.note.body, { noTasks: true, depth: 1 });
    hydrateImages(body);
  }
  const open = el('button', { className: 'chip' }, '↩ Restaurar y abrir');
  open.addEventListener('click', () => restoreFromTrash(it.id, { open: true }));
  return el('div', { className: 'card trash-preview', ariaLabel: 'Vista previa (solo lectura)' }, [
    el('div', { className: 'trash-preview-head' }, [el('strong', {}, baseName(it.from)), open]),
    body,
  ]);
}

function renderTrash() {
  purgeTrash();
  const box = $('#view-trash');
  const list = trashList().slice().sort((a, b) => b.deletedAt - a.deletedAt);
  const empty = el('button', { className: 'chip danger-chip', disabled: !list.length }, '🗑 Vaciar papelera');
  empty.addEventListener('click', emptyTrash);
  const head = el('div', { className: 'trash-head' }, [el('p', { className: 'muted' }, `Las notas borradas se guardan ${TRASH_DAYS} días. Restáuralas a su carpeta o elimínalas para siempre.`), empty]);
  if (!list.length) return box.replaceChildren(head, el('p', { className: 'empty' }, 'La papelera está vacía.'));
  const sel = list.find((t) => t.id === trashSel) || list[0];
  trashSel = sel.id;
  box.replaceChildren(head, el('div', { className: 'trash-main' }, [el('ul', { className: 'trash-list', ariaLabel: 'Notas en la papelera' }, list.map(trashRow)), trashPreview(sel)]));
}

// ---------- Bandeja de entrada ----------
// Lo que se captura con ＋ (o Ctrl+Mayús+Espacio) va sin preguntar a la bandeja:
//   Tarea → tarea con #bandeja · Nota → viñeta con fecha en la nota «Bandeja de entrada» · Idea → idea con #bandeja.
// Al procesarlo se quita la etiqueta (o la viñeta).
const INBOX_TAG = 'bandeja';
const INBOX_NOTE = 'Bandeja de entrada';
const INBOX_STAMP = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · /;
const CAPTURE_KINDS = [['task', '✅', 'Tarea'], ['note', '📝', 'Nota'], ['idea', '💡', 'Idea']];
// Otros módulos añaden tipos: CAPTURE_KINDS.push([kind, icono, nombre, etiqueta del menú]) y CAPTURE_HOOKS[kind] = (texto) => guardado.
const CAPTURE_HOOKS = {};
const hasInboxTag = (x) => (x.tags || []).includes(INBOX_TAG);
const untagInbox = (x) => (x.tags = (x.tags || []).filter((g) => g !== INBOX_TAG));
const inboxNote = () => state.notes.find((n) => n.path === INBOX_NOTE && !n.enc) || null;
const hmNow = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Viñetas de la nota de la bandeja (con sus líneas sangradas); las casillas [ ] son tareas, no cuentan.
function inboxBullets(note = inboxNote()) {
  if (!note) return [];
  const lines = note.body.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^[-*+] (?!\[[ xX]\])(.*\S.*)$/);
    if (!m) continue;
    let end = i;
    while (end + 1 < lines.length && /^[ \t]+\S/.test(lines[end + 1])) end++;
    const text = [m[1], ...lines.slice(i + 1, end + 1).map((l) => l.trim())].join('\n');
    const st = text.match(INBOX_STAMP);
    out.push({ kind: 'note', start: i, end, raw: lines.slice(i, end + 1).join('\n'), stamp: st?.[1] || '', text: st ? text.slice(st[0].length) : text });
    i = end;
  }
  return out;
}

const inboxTasks = () => state.tasks.filter((t) => !t.done && hasInboxTag(t));
const inboxIdeas = () => state.ideas.filter(hasInboxTag);
const inboxCount = () => inboxTasks().length + inboxBullets().length + inboxIdeas().length;

// Texto de varias líneas como viñeta: la primera con el guion, las demás sangradas.
const asBullet = (text, prefix = '') => {
  const [first, ...rest] = text.split('\n').filter((l) => l.trim());
  return [`- ${prefix}${first.trim()}`, ...rest.map((l) => `  ${l.trim()}`)].join('\n');
};

function appendToNote(note, block) {
  flushNoteSave();
  const body = note.body.replace(/\s+$/, '');
  const last = body.split('\n').pop();
  note.body = `${body}${!body ? '' : /^([-*+] |[ \t]+\S)/.test(last) ? '\n' : '\n\n'}${block}\n`;
  note.updatedAt = Date.now();
}

function captureNote(text) {
  const note = inboxNote() || createNote({ title: INBOX_NOTE, body: 'Lo que apuntas con ＋ como «Nota» llega aquí. Repásalo en 📥 Bandeja.\n', open: false, log: false });
  appendToNote(note, asBullet(text, `${dateKey()} ${hmNow()} · `));
}

function captureItem(kind, text) {
  text = text.trim();
  if (!text) return false;
  if (CAPTURE_HOOKS[kind]) return CAPTURE_HOOKS[kind](text);
  if (kind === 'note') captureNote(text);
  else if (kind === 'idea') {
    const idea = { id: uid(), ...extractTags(`${text} #${INBOX_TAG}`), pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
    state.ideas.push(idea);
    logEvent('idea', idea.text.split('\n')[0], { ref: idea.id, detail: idea.tags.map((t) => `#${t}`).join(' ') });
  } else {
    // Fechas («mañana a las 5») y prioridades («!alta») se entienden como en Tareas.
    const [first, ...rest] = text.split('\n');
    addTask(`${first.trim()} #${INBOX_TAG}`);
    const t = state.tasks[state.tasks.length - 1];
    if (!hasInboxTag(t)) t.tags = [...(t.tags || []), INBOX_TAG];
    if (rest.join('').trim()) t.notes = rest.join('\n').trim();
  }
  save();
  renderAll();
  toastAction(`${CAPTURE_KINDS.find(([k]) => k === kind)[2]} guardada en la bandeja`, 'Ver', () => showView('inbox'));
  return true;
}

// Quita una viñeta de la nota de la bandeja (se busca de nuevo por su texto: la nota pudo cambiar).
function removeInboxBullet(b) {
  const note = inboxNote();
  if (!note) return false;
  flushNoteSave();
  const cur = inboxBullets(note).find((x) => x.raw === b.raw);
  if (!cur) return false;
  const lines = note.body.split('\n');
  lines.splice(cur.start, cur.end - cur.start + 1);
  note.body = lines.join('\n');
  note.updatedAt = Date.now();
  return true;
}

// ---------- Procesar ----------
const inboxDone = (msg) => {
  save();
  renderAll();
  if (msg) showToastMessage(msg);
};

function inboxTaskDate(t, key) {
  setTaskDue(t, key);
  untagInbox(t);
  inboxDone(`«${t.title}» para ${formatDue(key).toLowerCase()}`);
}

function inboxDateItems(t) {
  return [
    { label: '📅 Para hoy', action: () => inboxTaskDate(t, dateKey()) },
    { label: '📅 Para mañana', action: () => inboxTaskDate(t, dateKey(addDays(new Date(), 1))) },
    { label: '📅 La próxima semana (lunes)', action: () => inboxTaskDate(t, dateKey(nextMonday())) },
    { label: '📅 Otra fecha…', action: () => promptText({ placeholder: 'Fecha (p. ej. el viernes, 15 de noviembre, 2026-11-15)', action: 'Poner fecha', onSubmit: (q) => {
      const key = /^\d{4}-\d{2}-\d{2}$/.test(q.trim()) ? q.trim() : parseInput(`x ${q}`).due;
      if (key) inboxTaskDate(t, key);
      else showToastMessage('No entendí esa fecha');
    } }) },
  ];
}

function inboxProjectItems(t) {
  const list = state.projects.filter((p) => p.status !== 'done');
  if (!list.length) return [{ label: 'Aún no tienes proyectos', disabled: true, action: () => {} }];
  return list.map((p) => ({ label: `📁 ${p.name}`, action: () => {
    t.projectId = p.id;
    untagInbox(t);
    inboxDone(`«${t.title}» movida a ${p.name}`);
  } }));
}

function moveBulletToNote(b) {
  openPicker({
    placeholder: 'Mover a la nota…',
    items: (q) => {
      const ql = q.toLowerCase();
      const list = state.notes
        .filter((n) => !n.enc && n.path !== INBOX_NOTE && (!ql || scoreNote(n, ql) > 0))
        .sort((a, c) => (ql ? scoreNote(c, ql) - scoreNote(a, ql) : 0) || c.updatedAt - a.updatedAt)
        .slice(0, 30)
        .map((n) => ({ label: baseName(n.path), detail: folderOf(n.path), action: () => bulletTo(b, n) }));
      if (q && !findNoteByName(q)) list.push({ label: `Crear nota «${cleanName(q)}»`, create: true, action: () => bulletTo(b, createNote({ folder: folderOf(q), title: baseName(q), open: false })) });
      return list;
    },
  });
}

function bulletTo(b, note) {
  if (!removeInboxBullet(b)) return;
  appendToNote(note, asBullet(b.text));
  save();
  renderAll();
  toastAction(`Movido a «${baseName(note.path)}»`, 'Abrir', () => openNote(note));
}

function bulletToTask(b) {
  if (!removeInboxBullet(b)) return;
  const [first, ...rest] = b.text.split('\n');
  addTask(first);
  if (rest.length) state.tasks[state.tasks.length - 1].notes = rest.join('\n');
  inboxDone(`Tarea creada: ${state.tasks[state.tasks.length - 1].title}`);
}

function ideaToTask(idea) {
  withUndo('Idea convertida en tarea', () => {
    addTask(idea.text.split('\n')[0]);
    state.ideas = state.ideas.filter((x) => x.id !== idea.id);
  });
}

function openInboxIdea(idea) {
  untagInbox(idea);
  editingIdeaId = idea.id;
  save();
  showView('ideas');
  updateInboxBadges();
}

// Acciones de cada elemento: botones de la fila y clic derecho. `sub` abre un menú con más opciones.
function inboxActions(item) {
  if (item.kind === 'task') {
    const t = item.t;
    return [
      { label: '📅 Fecha…', sub: () => inboxDateItems(t) },
      { label: '📁 Proyecto…', sub: () => inboxProjectItems(t) },
      { label: '✓ Hecha', primary: true, action: () => {
        untagInbox(t);
        toggleDone(t, true);
      } },
      { label: '→ A Tareas', title: 'Dejarla en Tareas, sin fecha', action: () => (untagInbox(t), inboxDone(`«${t.title}» pasa a Tareas`)) },
      { label: 'Borrar', danger: true, action: () => deleteTask(t) },
    ];
  }
  if (item.kind === 'idea') {
    const idea = item.idea;
    return [
      { label: '💡 Abrir en Ideas', primary: true, action: () => openInboxIdea(idea) },
      { label: '→ Tarea', action: () => ideaToTask(idea) },
      { label: 'Borrar', danger: true, action: () => withUndo('Idea borrada', () => (state.ideas = state.ideas.filter((x) => x.id !== idea.id))) },
    ];
  }
  return [
    { label: '📝 Mover a una nota…', primary: true, action: () => moveBulletToNote(item) },
    { label: '→ Convertir en tarea', action: () => bulletToTask(item) },
    { label: 'Borrar', danger: true, action: () => withUndo('Apunte borrado', () => removeInboxBullet(item)) },
  ];
}

// En el menú del clic derecho los submenús se despliegan en su sitio.
const inboxMenuItems = (item) => inboxActions(item).flatMap((a) => (a.sub ? [{ sep: true }, ...a.sub(), { sep: true }] : [a]));

const inboxRowItem = new WeakMap();
function inboxRow(item) {
  const title = item.kind === 'task' ? item.t.title : item.kind === 'idea' ? item.idea.text : item.text;
  const meta = item.kind === 'task'
    ? [PRIORITY_LABEL[item.t.priority], item.t.due && formatDue(item.t.due), item.t.notes && '📝'].filter(Boolean).join(' · ')
    : item.kind === 'idea'
      ? [new Date(item.idea.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' }), ...item.idea.tags.filter((g) => g !== INBOX_TAG).map((g) => `#${g}`)].join(' · ')
      : item.stamp;
  const actions = inboxActions(item).map((a) => {
    const b = el('button', { className: `chip${a.primary ? ' primary-chip' : ''}${a.danger ? ' danger-chip' : ''}`, title: a.title || '' }, a.label);
    b.addEventListener('click', () => (a.sub ? showMenu(b, a.sub()) : a.action()));
    return b;
  });
  const li = el('li', { className: 'inbox-row', tabIndex: -1 }, [
    el('div', { className: 'inbox-body' }, [el('span', { className: 'inbox-text' }, title), meta ? el('span', { className: 'muted inbox-meta' }, meta) : '']),
    el('div', { className: 'inbox-actions' }, actions),
  ]);
  li.dataset.inbox = item.kind;
  inboxRowItem.set(li, item);
  return li;
}

function renderInbox() {
  const box = $('#view-inbox');
  const tasks = inboxTasks().map((t) => ({ kind: 'task', t }));
  const notes = inboxBullets();
  const ideas = inboxIdeas().map((idea) => ({ kind: 'idea', idea }));
  const add = el('button', { className: 'primary' }, '＋ Capturar');
  add.addEventListener('click', () => openCapture());
  const head = el('div', { className: 'inbox-head' }, [el('p', { className: 'muted' }, 'Lo que capturas con ＋ (o Ctrl+Mayús+Espacio) llega aquí. Decide qué hacer con cada cosa.'), add]);
  const group = (title, list) => (list.length ? [el('h2', { className: 'section-title' }, `${title} (${list.length})`), el('ul', { className: 'inbox-list' }, list.map(inboxRow))] : []);
  const open = inboxNote();
  const link = el('button', { className: 'link' }, `Abrir la nota «${INBOX_NOTE}»`);
  link.addEventListener('click', () => openNote(inboxNote()));
  box.replaceChildren(
    head,
    ...(tasks.length + notes.length + ideas.length ? [...group('Tareas', tasks), ...group('Apuntes', notes), ...group('Ideas', ideas)] : [el('p', { className: 'empty' }, 'La bandeja está vacía. 🎉')]),
    ...(open ? [el('p', { className: 'inbox-foot' }, link)] : [])
  );
}

// Fila de la revisión semanal (22-revision.js).
function inboxReviewRow() {
  const n = inboxCount();
  if (!n) return null;
  const b = el('button', { className: 'journal-nudge rv-inbox' }, [
    el('span', { className: 'jn-icon', ariaHidden: 'true' }, '📥'),
    el('span', {}, [el('strong', {}, `Vaciar la bandeja (${n})`), ' Decide qué hacer con lo que capturaste antes de repasar la semana.']),
  ]);
  b.addEventListener('click', () => showView('inbox'));
  return b;
}

// ---------- Captura rápida ----------
let captureKind = 'task';
let captureReturn = null;

function captureModal() {
  let back = $('#capture');
  if (back) return back;
  const close = el('button', { className: 'iv-close modal-x', type: 'button', ariaLabel: 'Cerrar' }, '✕');
  const text = el('textarea', { id: 'capture-text', className: 'capture-text', rows: 3, placeholder: '¿Qué tienes en la cabeza?', ariaLabel: 'Qué quieres capturar' });
  const kinds = el('div', { className: 'capture-kinds', role: 'group', ariaLabel: 'Guardar como' }, CAPTURE_KINDS.map(([k, icon, name]) => {
    const b = el('button', { type: 'button', className: 'chip' }, `${icon} ${name}`);
    b.dataset.kind = k;
    b.addEventListener('click', () => {
      setCaptureKind(k);
      text.focus();
    });
    return b;
  }));
  const ok = el('button', { id: 'capture-save', className: 'primary', type: 'button' }, 'Guardar en la bandeja');
  const dialog = el('div', { className: 'modal capture-modal', role: 'dialog' }, [
    el('header', { className: 'modal-head' }, [el('h3', { id: 'capture-title' }, '📥 Captura rápida'), close]),
    el('div', { className: 'capture-main' }, [text, kinds, el('div', { className: 'capture-foot' }, [el('span', { className: 'muted capture-hint' }, 'Enter guarda · Mayús+Enter, otra línea · Esc cierra'), ok])]),
  ]);
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'capture-title');
  back = el('div', { id: 'capture', className: 'modal-back capture-back', hidden: true }, dialog);
  close.addEventListener('click', closeCapture);
  ok.addEventListener('click', submitCapture);
  back.addEventListener('click', (e) => e.target === back && closeCapture());
  // Las teclas no siguen hasta los atajos de la app.
  back.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCapture();
    } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submitCapture();
    }
  });
  document.body.append(back);
  return back;
}

function setCaptureKind(k) {
  captureKind = k;
  $$('#capture .capture-kinds .chip').forEach((b) => {
    b.classList.toggle('active', b.dataset.kind === k);
    b.ariaPressed = String(b.dataset.kind === k);
  });
  $('#capture-save').textContent = CAPTURE_HOOKS[k] ? 'Guardar' : 'Guardar en la bandeja';
}

function openCapture(kind = 'task') {
  const back = captureModal();
  if (!$('#note-menu').hidden) hideMenu();
  if (picker) closePicker();
  if (back.hidden) captureReturn = document.activeElement;
  back.hidden = false;
  $('#capture-text').value = '';
  setCaptureKind(kind);
  $('#capture-text').focus();
}

function closeCapture() {
  $('#capture').hidden = true;
  const back = captureReturn;
  captureReturn = null;
  if (back?.isConnected && back !== document.body && back.offsetParent !== null) back.focus({ preventScroll: true });
}

function submitCapture() {
  const ta = $('#capture-text');
  if (!ta.value.trim()) return ta.focus();
  closeCapture();
  captureItem(captureKind, ta.value);
}

// Ctrl/Cmd+Mayús+Espacio desde cualquier sitio (también escribiendo en una nota).
document.addEventListener(
  'keydown',
  (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || (e.code !== 'Space' && e.key !== ' ')) return;
    if (!$('#draw').hidden || !$('#capture')?.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    openCapture();
  },
  true
);

// ---------- Botones, vistas y menús ----------
ICONS.trash = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>';
ICONS.inbox = '<path d="M3 13h5l1 3h6l1-3h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>';
Object.assign(VIEW_TITLES, { inbox: 'Bandeja', trash: 'Papelera' });
Object.assign(VIEW_ICONS, { inbox: 'inbox', trash: 'trash' });
Object.assign(VIEW_RENDER, { inbox: renderInbox, trash: renderTrash });
$('#views-pane main').append(el('section', { id: 'view-inbox', className: 'view' }), el('section', { id: 'view-trash', className: 'view' }));

function ribButton(view, icon, label, title) {
  const b = el('button', { className: 'rib', title, ariaLabel: label }, [ico(icon), el('span', { className: 'rib-label' }, label)]);
  b.dataset.view = view;
  b.addEventListener('click', (e) => showView(view, { newTab: e.ctrlKey || e.metaKey }));
  return b;
}
const inboxRib = ribButton('inbox', 'inbox', 'Bandeja', 'Bandeja de entrada');
inboxRib.append(el('span', { className: 'rib-badge', hidden: true }));
$('.rib-group[data-group="plan"] .rib-gitems [data-view="review"]')?.before(inboxRib);
const trashRib = ribButton('trash', 'trash', 'Papelera', 'Papelera de notas');
$('.rib-group[data-group="more"] .rib-gitems')?.append(trashRib);

// Abajo del explorador.
const trashEntry = el('button', { id: 'trash-entry', className: 'trash-entry', title: 'Notas borradas en los últimos 30 días' }, [el('span', {}, '🗑 Papelera'), el('span', { className: 'tree-count' })]);
trashEntry.addEventListener('click', (e) => {
  showView('trash', { newTab: e.ctrlKey || e.metaKey });
  if (isNarrow()) closeDrawers();
});
$('#left-panel').append(trashEntry);

// En Hoy.
const todayInbox = el('button', { id: 'today-inbox', className: 'chip' }, '📥 Bandeja');
todayInbox.addEventListener('click', () => showView('inbox'));
$('#today-monthly')?.after(todayInbox);

// Botón flotante: clic para capturar; clic derecho para elegir el tipo.
const captureFab = el('button', { id: 'capture-fab', className: 'capture-fab', title: 'Captura rápida (Ctrl+Mayús+Espacio)', ariaLabel: 'Captura rápida' }, ico('plus'));
captureFab.addEventListener('click', () => openCapture());
captureFab.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  showMenu(captureFab, [
    ...CAPTURE_KINDS.map(([k, icon, name, menu]) => ({ label: menu || `${icon} Nueva ${name.toLowerCase()}…`, action: () => openCapture(k) })),
    { sep: true },
    { label: '📥 Abrir la bandeja', action: () => showView('inbox') },
  ]);
});
document.body.append(captureFab);

function updateInboxBadges() {
  const n = inboxCount();
  const badge = inboxRib.querySelector('.rib-badge');
  badge.hidden = !n;
  badge.textContent = n > 99 ? '99+' : String(n);
  inboxRib.title = n ? `Bandeja de entrada (${n} sin procesar)` : 'Bandeja de entrada';
  todayInbox.textContent = n ? `📥 Bandeja (${n})` : '📥 Bandeja';
  trashEntry.lastChild.textContent = trashList().length ? String(trashList().length) : '';
}
RENDER_HOOKS.push(() => {
  purgeTrash();
  updateInboxBadges();
});

// Clic derecho en las filas de la papelera y de la bandeja.
function rowMenu(e, items) {
  e.preventDefault();
  e.stopPropagation();
  let { clientX: x, clientY: y } = e;
  if (!x && !y) {
    const r = e.target.getBoundingClientRect();
    x = r.left + 12;
    y = r.bottom;
  }
  showMenuAt(x, y, items);
}
$('#view-trash').addEventListener('contextmenu', (e) => {
  const row = e.target.closest('[data-trash]');
  const it = row && trashList().find((t) => t.id === row.dataset.trash);
  if (it) rowMenu(e, trashMenuItems(it));
});
$('#view-inbox').addEventListener('contextmenu', (e) => {
  const item = inboxRowItem.get(e.target.closest('.inbox-row'));
  if (item) rowMenu(e, inboxMenuItems(item));
});
trashEntry.addEventListener('contextmenu', (e) =>
  rowMenu(e, [
    { label: 'Abrir la papelera', action: () => showView('trash') },
    { label: 'Vaciar la papelera', danger: true, disabled: !trashList().length, action: emptyTrash },
  ])
);

COMMANDS_EXTRA.push(() => [
  { label: 'Captura rápida…', kbd: 'Ctrl+Mayús+Espacio', action: () => openCapture() },
  { label: 'Vaciar la papelera', action: emptyTrash },
]);
