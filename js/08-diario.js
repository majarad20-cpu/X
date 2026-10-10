'use strict';

// ---------- Diario ----------
const JOURNAL_KINDS = {
  dump: {
    label: 'Vaciado mental',
    hint: 'Saca de la cabeza todo lo que te ronda: pendientes, preocupaciones, ideas. Sin filtro ni orden, una cosa por línea. Al guardar podrás convertir líneas en tareas.',
    placeholder: 'Llamar al banco\nMe preocupa la entrega del viernes\nComprar regalo para Laura\nIdea: ordenar el trastero un sábado…',
  },
  free: { label: 'Libre', hint: 'Escribe lo que quieras sobre tu día, sin reglas.', placeholder: 'Hoy…' },
  gratitude: { label: 'Gratitud', hint: 'Tres cosas por las que dar las gracias hoy, grandes o pequeñas.', prompts: ['Hoy agradezco…', 'También agradezco…', 'Y además…'] },
  reflection: { label: 'Reflexión', hint: 'Unos minutos para cerrar el día con perspectiva.', prompts: ['¿Qué salió bien hoy?', '¿Qué me costó o qué aprendí?', '¿Qué haré mejor mañana?'] },
};
const MOODS = [
  { v: 1, e: '😞', l: 'Mal' },
  { v: 2, e: '😕', l: 'Regular' },
  { v: 3, e: '😐', l: 'Normal' },
  { v: 4, e: '🙂', l: 'Bien' },
  { v: 5, e: '😄', l: 'Genial' },
];
const DRAFT_KEY = 'enfoque:journal-draft';
let journalKind = 'dump';
let journalMood = null;
let journalSearch = '';
let journalLimit = 20;
let editingEntryId = null;
const expandedEntries = new Set();

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
  } catch {
    return {};
  }
}

function writeDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Sin almacenamiento: el borrador solo vive mientras la página está abierta.
  }
}

function moodPicker(current, onPick) {
  return MOODS.map((m) => {
    const b = el('button', { type: 'button', className: `mood${current === m.v ? ' on' : ''}`, role: 'radio', ariaChecked: String(current === m.v), title: m.l }, [
      el('span', { className: 'mood-e', ariaHidden: 'true' }, m.e),
      el('span', { className: 'mood-l' }, m.l),
    ]);
    b.addEventListener('click', () => onPick(current === m.v ? null : m.v));
    return b;
  });
}

// Campos del formulario según el tipo: un texto libre o varias preguntas.
function journalFields(kind, values = {}) {
  const k = JOURNAL_KINDS[kind];
  if (!k.prompts) {
    return [el('textarea', { className: 'notes journal-text', rows: kind === 'dump' ? 8 : 6, placeholder: k.placeholder, value: values.text || '', ariaLabel: k.label })];
  }
  return k.prompts.map((q, i) =>
    el('label', { className: 'prompt' }, [
      el('span', {}, q),
      el('textarea', { className: 'notes', rows: 2, value: values.sections?.[i]?.a || '', ariaLabel: q }),
    ])
  );
}

function readFields(container, kind) {
  const k = JOURNAL_KINDS[kind];
  if (!k.prompts) return { text: container.querySelector('textarea').value.trim(), sections: null };
  const answers = [...container.querySelectorAll('textarea')].map((t) => t.value.trim());
  return { text: '', sections: k.prompts.map((q, i) => ({ q, a: answers[i] })) };
}

const entryIsEmpty = (e) => !e.text && !(e.sections || []).some((s) => s.a);

function renderComposer() {
  $$('[data-jkind]').forEach((b) => b.classList.toggle('active', b.dataset.jkind === journalKind));
  $('#journal-hint').textContent = JOURNAL_KINDS[journalKind].hint;
  const draft = readDraft();
  const values = draft.kind === journalKind ? draft : {};
  $('#journal-fields').replaceChildren(...journalFields(journalKind, values));
  if (draft.mood !== undefined && journalMood === null) journalMood = draft.mood;
  $('#mood-picker').replaceChildren(...moodPicker(journalMood, (v) => {
    journalMood = v;
    saveDraftNow();
    renderComposerMood();
  }));
  $('#journal-draft').textContent = values.text || values.sections?.some((s) => s.a) ? 'Borrador recuperado' : '';
}

function renderComposerMood() {
  $('#mood-picker').replaceChildren(...moodPicker(journalMood, (v) => {
    journalMood = v;
    saveDraftNow();
    renderComposerMood();
  }));
}

function saveDraftNow() {
  writeDraft({ kind: journalKind, mood: journalMood, ...readFields($('#journal-fields'), journalKind) });
}

let draftTimer = null;
$('#journal-fields').addEventListener('input', () => {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    saveDraftNow();
    $('#journal-draft').textContent = 'Borrador guardado en este dispositivo';
  }, 500);
});

$$('[data-jkind]').forEach((b) =>
  b.addEventListener('click', () => {
    saveDraftNow();
    journalKind = b.dataset.jkind;
    renderComposer();
    $('#journal-fields textarea')?.focus();
  })
);

$('#journal-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const fields = readFields($('#journal-fields'), journalKind);
  const entry = { id: uid(), date: dateKey(), createdAt: Date.now(), updatedAt: Date.now(), kind: journalKind, mood: journalMood, ...fields };
  if (entryIsEmpty(entry)) {
    $('#journal-draft').textContent = 'Escribe algo antes de guardar.';
    return;
  }
  // Se escribe en la nota diaria; si está bloqueada (con contraseña), queda en el diario de siempre.
  const note = journalToNote(entry);
  if (!note) state.journal.push(entry);
  const words = `${entry.text || ''} ${(entry.sections || []).map((s) => s.a).join(' ')}`.split(/\s+/).filter(Boolean).length;
  logEvent('journal', JOURNAL_KINDS[entry.kind].label, { ref: note ? note.id : entry.id, detail: [MOODS.find((m) => m.v === entry.mood)?.e, plural(words, 'palabra', 'palabras')].filter(Boolean).join(' · ') });
  save();
  writeDraft({});
  journalMood = null;
  renderComposer();
  renderAll();
  if (entry.kind === 'dump') showDumpConvert(entry);
  const open = el('button', { type: 'button', className: 'link' }, 'Abrir la nota');
  open.addEventListener('click', () => note && openNote(note));
  $('#journal-draft').replaceChildren(note ? 'Guardado en la nota diaria de hoy · ' : 'Entrada guardada', ...(note ? [open] : []));
});

// ---------- El diario vive en las notas diarias (Diario/AAAA-MM-DD) ----------
// Cada entrada se añade bajo «## ✍️ Diario» (vale también «## Diario») y el ánimo va en la propiedad
// «animo» del principio. Las entradas antiguas de state.journal se siguen viendo y se pueden pasar.
const DJ_PATH_RE = /^Diario\/(\d{4}-\d{2}-\d{2})$/;
const DJ_HEAD_RE = /^##\s+(?:✍️\s*)?Diario\s*$/u;
const djKeyOf = (note) => note?.path.match(DJ_PATH_RE)?.[1] || null;
const djFind = (key) => state.notes.find((n) => n.path === `Diario/${key}`) || null;

// Nota diaria de ese día (se crea si falta: con la plantilla «Nota diaria» si es hoy).
function djNoteFor(key) {
  const found = djFind(key);
  if (found) return found;
  if (!state.folders.includes('Diario')) state.folders.push('Diario');
  const tpl = key === dateKey() && findNoteByName(`${TEMPLATE_FOLDER}/Nota diaria`);
  return createNote({ folder: 'Diario', title: key, body: tpl ? fillTemplate(tpl.body, key) : dailyBody(key), open: false, log: false });
}

// Líneas [inicio, fin) de la sección Diario (fin: el siguiente título # o ##).
function djRange(lines) {
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fence = !fence;
    if (fence || !DJ_HEAD_RE.test(lines[i].trim())) continue;
    let end = i + 1;
    while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
    return { i, end };
  }
  return null;
}

const djSection = (text) => {
  const lines = text.split('\n');
  const r = djRange(lines);
  return r ? lines.slice(r.i + 1, r.end).join('\n').trim() : '';
};

function djAppendText(text, block) {
  const lines = text.split('\n');
  const r = djRange(lines);
  if (!r) return `${text.replace(/\s*$/, '')}${text.trim() ? '\n\n' : ''}## ✍️ Diario\n${block}\n`;
  let end = r.end;
  while (end > r.i + 1 && !lines[end - 1].trim()) end--;
  const add = [...(end > r.i + 1 ? [''] : []), ...block.split('\n'), ...(end < lines.length && /^#/.test(lines[end]) ? [''] : [])];
  lines.splice(end, 0, ...add);
  return lines.join('\n').replace(/\s*$/, '\n');
}

// Ánimo del día: propiedad «animo» (emoji, nombre o número del 1 al 5).
function djMood(text) {
  const p = parseProps(text).props.find((x) => /^[aá]nimo$/i.test(x.key));
  const v = String(p?.value || '').trim().toLowerCase();
  return (v && MOODS.find((m) => v.startsWith(m.e) || v === m.l.toLowerCase() || v === String(m.v))) || null;
}

function djSetMood(text, emoji) {
  const { props, end } = parseProps(text);
  const lines = text.split('\n');
  const p = props.find((x) => /^[aá]nimo$/i.test(x.key));
  if (p) lines.splice(p.line, p.to - p.line + 1, `${p.key}: ${emoji}`);
  else if (end > 0) lines.splice(end, 0, `animo: ${emoji}`);
  else return `---\nanimo: ${emoji}\n---\n${text}`;
  return lines.join('\n');
}

// Cambia el texto de la nota con fn(texto) y deja el editor al día. Falso si está bloqueada.
function djEdit(note, fn) {
  if (typeof blockEdit !== 'undefined' && blockEdit) endBlockEdit({ render: false });
  flushNoteSave();
  const text = noteText(note);
  if (text === null) return false;
  const next = fn(text);
  if (next === text) return true;
  if (note.enc) {
    unlockedNotes.set(note.id, next);
    scheduleEncrypt(note);
  } else note.body = next;
  note.updatedAt = Date.now();
  dataRev++;
  if (typeof snapshotNote === 'function') snapshotNote(note);
  const ta = $('#note-editor');
  if (ta.dataset.note === note.id) ta.value = next;
  return true;
}

// Texto Markdown de una entrada: «### Tipo · hora · ánimo» y el texto.
function journalBlock(e) {
  const time = new Date(e.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const mood = MOODS.find((m) => m.v === e.mood);
  const body = e.text || (e.sections || []).filter((s) => s.a).map((s) => `**${s.q}** ${s.a}`).join('\n\n');
  return `### ${JOURNAL_KINDS[e.kind]?.label || 'Entrada'} · ${time}${mood ? ` · ${mood.e}` : ''}\n${body}`;
}

// Escribe la entrada en la nota diaria de su día. Devuelve la nota (o null si no se pudo).
function journalToNote(entry) {
  const note = djNoteFor(entry.date);
  const mood = MOODS.find((m) => m.v === entry.mood);
  return djEdit(note, (t) => {
    const x = djAppendText(t, journalBlock(entry));
    return mood ? djSetMood(x, mood.e) : x;
  }) ? note : null;
}

// Primeras líneas con contenido de una nota (sin propiedades, títulos ni viñetas vacías).
function djPreview(text) {
  const { end } = parseProps(text);
  return text.split('\n').slice(end > 0 ? end + 1 : 0)
    .filter((l) => l.trim() && !/^#/.test(l) && !/^\s*[-*+]\s*(\[.\]\s*)?$/.test(l) && !/^←\s*\[\[.*→$/.test(l.trim()))
    .slice(0, 6).join('\n').trim();
}

// Notas diarias con algo escrito: { date, note, section, preview, mood, locked }.
function journalNoteDays() {
  return state.notes.flatMap((note) => {
    const date = djKeyOf(note);
    if (!date) return [];
    const text = noteText(note);
    if (text === null) return [{ date, note, section: '', preview: '', mood: null, locked: true }];
    const section = djSection(text);
    const mood = djMood(text);
    const preview = section ? '' : djPreview(text);
    return section || preview || mood ? [{ date, note, section, preview, mood }] : [];
  });
}

// Entradas que hay en una sección Diario (cada «###» es una; sin ellos, una si hay texto).
const djCount = (section) => (section ? section.split('\n').filter((l) => /^###\s/.test(l)).length || 1 : 0);

// Días del diario: notas diarias y entradas antiguas juntas, del más reciente al más antiguo.
function journalTimeline() {
  const days = new Map();
  const day = (d) => days.get(d) || days.set(d, { date: d, entries: [] }).get(d);
  journalNoteDays().forEach((x) => Object.assign(day(x.date), x));
  state.journal.forEach((e) => day(e.date).entries.push(e));
  days.forEach((d) => {
    d.entries.sort((a, b) => b.createdAt - a.createdAt);
    const legacy = d.entries.find((e) => e.mood);
    d.dayMood = d.mood || (legacy && MOODS.find((m) => m.v === legacy.mood)) || null;
    d.wrote = !!d.section || d.entries.length > 0;
  });
  return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

function journalWroteOn(key) {
  if (state.journal.some((e) => e.date === key)) return true;
  const note = djFind(key);
  const text = note && noteText(note);
  return !!text && !!djSection(text);
}

// Pasa las entradas antiguas a sus notas diarias (con «Deshacer»). Lo que ya esté copiado en
// la nota (p. ej. con «Copiar a notas» de Ajustes) no se repite.
function migrateJournal() {
  const n = state.journal.length;
  if (!n) return;
  let moved = 0;
  withUndo(`${plural(n, 'entrada pasada', 'entradas pasadas')} a las notas diarias`, () => {
    const byDay = new Map();
    [...state.journal].sort((a, b) => a.createdAt - b.createdAt).forEach((e) => byDay.set(e.date, [...(byDay.get(e.date) || []), e]));
    const done = new Set();
    byDay.forEach((list, key) => {
      const note = djNoteFor(key);
      const ok = djEdit(note, (t) => {
        let x = t;
        list.forEach((e) => {
          const body = (e.text || (e.sections || []).filter((s) => s.a).map((s) => `**${s.q}** ${s.a}`).join('\n\n')).trim();
          if (!body || !x.includes(body)) x = djAppendText(x, journalBlock(e));
        });
        const last = list.filter((e) => e.mood).pop();
        if (last && !djMood(x)) x = djSetMood(x, MOODS.find((m) => m.v === last.mood).e);
        return x;
      });
      if (ok) list.forEach((e) => done.add(e.id));
    });
    moved = done.size;
    state.journal = state.journal.filter((e) => !done.has(e.id));
  });
  if (moved < n) showToastMessage(`${plural(n - moved, 'entrada se queda', 'entradas se quedan')} aquí: su nota diaria está bloqueada.`);
}

// Líneas de un texto que pueden convertirse en tareas.
function entryLines(entry) {
  const text = entry.text || (entry.sections || []).map((s) => s.a).join('\n');
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)]|\[ ?\])\s*/, '').trim())
    .filter((l) => l.length > 1);
}

function showDumpConvert(entry) {
  const lines = entryLines(entry);
  const box = $('#dump-convert');
  if (!lines.length && !aiReady()) {
    box.hidden = true;
    return;
  }
  const checks = lines.map((line) => {
    const p = parseInput(line);
    const extra = [p.due && `📅 ${formatDue(p.due)}`, p.time && `⏰ ${p.time}`, p.priority && `!${PRIORITY_LABEL[p.priority].toLowerCase()}`].filter(Boolean).join(' · ');
    const input = el('input', { type: 'checkbox' });
    return { line, input, row: el('label', { className: 'dc-line' }, [input, el('span', {}, line), extra ? el('span', { className: 'muted' }, extra) : '']) };
  });
  const create = el('button', { className: 'primary', type: 'button' }, 'Crear tareas');
  const skip = el('button', { type: 'button' }, 'Ahora no');
  const update = () => {
    const n = checks.filter((c) => c.input.checked).length;
    create.textContent = n ? `Crear ${n} ${n === 1 ? 'tarea' : 'tareas'}` : 'Marca las líneas que son tareas';
    create.disabled = !n;
  };
  checks.forEach((c) => c.input.addEventListener('change', update));
  create.addEventListener('click', () => {
    const chosen = checks.filter((c) => c.input.checked);
    chosen.forEach((c) => addTask(c.line));
    box.hidden = true;
    showToastMessage(`${chosen.length} ${chosen.length === 1 ? 'tarea creada' : 'tareas creadas'} en Tareas`);
  });
  skip.addEventListener('click', () => (box.hidden = true));
  box.replaceChildren(
    aiPlanBox(entry),
    el('h3', {}, aiReady() ? 'O marca tú las líneas que son tareas' : '¿Alguna de estas líneas es una tarea?'),
    el('p', { className: 'muted' }, 'Marca las que quieras pasar a Tareas. Se entienden fechas y horas como «mañana» o «a las 5».'),
    el('div', { className: 'dc-lines' }, checks.map((c) => c.row)),
    el('div', { className: 'row' }, [create, skip])
  );
  update();
  box.hidden = false;
  reveal(box, { smooth: true });
}

function showToastMessage(message) {
  $('#toast').replaceChildren(el('span', {}, message));
  $('#toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(hideToast, 4000);
}

$('#journal-search').addEventListener('input', (e) => {
  journalSearch = e.target.value.trim().toLowerCase();
  journalLimit = 20;
  renderJournal();
});

function journalStreak(days = new Set(journalTimeline().filter((d) => d.wrote).map((d) => d.date))) {
  let d = new Date();
  if (!days.has(dateKey(d))) d = addDays(d, -1);
  let n = 0;
  while (days.has(dateKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function dayLabel(key) {
  const today = dateKey();
  if (key === today) return 'Hoy';
  if (key === dateKey(addDays(new Date(), -1))) return 'Ayer';
  const s = parseKey(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: key.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function entryEditor(entry) {
  const fields = el('div', {}, journalFields(entry.kind, entry));
  let mood = entry.mood ?? null;
  const picker = el('div', { className: 'mood-picker' });
  const paint = () => picker.replaceChildren(...moodPicker(mood, (v) => {
    mood = v;
    paint();
  }));
  paint();
  const saveBtn = el('button', { className: 'primary' }, 'Guardar');
  const cancel = el('button', {}, 'Cancelar');
  saveBtn.addEventListener('click', () => {
    Object.assign(entry, readFields(fields, entry.kind), { mood, updatedAt: Date.now() });
    editingEntryId = null;
    save();
    renderJournal();
  });
  cancel.addEventListener('click', () => {
    editingEntryId = null;
    renderJournal();
  });
  setTimeout(() => fields.querySelector('textarea')?.focus());
  return el('article', { className: 'card entry editing' }, [fields, picker, el('div', { className: 'row' }, [saveBtn, cancel])]);
}

function entryCard(entry) {
  if (entry.id === editingEntryId) return entryEditor(entry);
  const mood = MOODS.find((m) => m.v === entry.mood);
  const time = new Date(entry.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const open = expandedEntries.has(entry.id);

  const body = el('div', { className: `entry-body${open ? ' open' : ''}` });
  if (entry.text) body.append(el('p', { className: 'entry-text' }, entry.text));
  (entry.sections || []).filter((s) => s.a).forEach((s) => body.append(el('p', { className: 'entry-q' }, s.q), el('p', { className: 'entry-text' }, s.a)));

  const long = (entry.text || '').split('\n').length > 6 || (entry.text || '').length > 420 || (entry.sections || []).filter((s) => s.a).length > 2;
  const more = el('button', { className: 'link' }, open ? 'Ver menos' : 'Ver más');
  more.addEventListener('click', () => {
    if (open) expandedEntries.delete(entry.id);
    else expandedEntries.add(entry.id);
    renderJournal();
  });

  const edit = el('button', { className: 'link' }, 'Editar');
  edit.addEventListener('click', () => {
    editingEntryId = entry.id;
    renderJournal();
  });
  const toTasks = el('button', { className: 'link' }, '→ Tareas');
  toTasks.addEventListener('click', () => showDumpConvert(entry));
  const del = el('button', { className: 'link danger-link' }, 'Borrar');
  del.addEventListener('click', () =>
    withUndo('Entrada borrada', () => {
      state.journal = state.journal.filter((x) => x.id !== entry.id);
    })
  );

  return el('article', { className: 'card entry' }, [
    el('header', { className: 'entry-head' }, [
      el('span', { className: `entry-kind kind-${entry.kind}` }, JOURNAL_KINDS[entry.kind].label),
      el('span', { className: 'muted' }, time),
      mood ? el('span', { className: 'entry-mood', title: mood.l }, mood.e) : '',
    ]),
    body,
    el('footer', { className: 'entry-actions' }, [long ? more : '', edit, toTasks, del]),
  ]);
}

// Tarjeta de un día con nota diaria: su sección Diario (o sus primeras líneas) y «Abrir nota».
function noteDayCard(d) {
  const key = `n:${d.date}`;
  const open = expandedEntries.has(key);
  const text = d.section || d.preview;
  const body = el('div', { className: `entry-body md${open ? ' open' : ''}` });
  if (d.locked) body.append(el('p', { className: 'muted' }, '🔒 Nota protegida con contraseña'));
  else body.innerHTML = renderMd(text, { noTasks: true });
  const long = text.split('\n').length > 6 || text.length > 420;
  const more = el('button', { className: 'link' }, open ? 'Ver menos' : 'Ver más');
  more.addEventListener('click', () => {
    if (open) expandedEntries.delete(key);
    else expandedEntries.add(key);
    renderJournal();
  });
  const go = el('button', { className: 'link' }, 'Abrir nota');
  go.addEventListener('click', () => openNote(d.note));
  return el('article', { className: 'card entry entry-note' }, [
    el('header', { className: 'entry-head' }, [
      el('span', { className: 'entry-kind' }, d.section ? 'Nota diaria · Diario' : 'Nota diaria'),
      d.mood ? el('span', { className: 'entry-mood', title: d.mood.l }, d.mood.e) : '',
    ]),
    body,
    el('footer', { className: 'entry-actions' }, [long ? more : '', go]),
  ]);
}

function renderJournalMigrate() {
  const box = $('#journal-migrate');
  const n = state.journal.length;
  box.hidden = !n;
  if (!n) return box.replaceChildren();
  const go = el('button', { type: 'button' }, 'Pasar las entradas antiguas a las notas diarias');
  go.addEventListener('click', migrateJournal);
  box.replaceChildren(el('span', { className: 'muted' }, `${plural(n, 'entrada antigua sigue', 'entradas antiguas siguen')} fuera de las notas diarias.`), go);
}

function renderJournal() {
  const days = journalTimeline();
  const byDate = new Map(days.map((d) => [d.date, d]));
  // Semana de ánimo: el de la nota diaria o el de la última entrada de cada día.
  const today = new Date();
  $('#journal-week').replaceChildren(
    ...Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => {
      const key = dateKey(d);
      const day = byDate.get(key);
      const mood = day?.dayMood;
      const wrote = !!day?.wrote;
      return el('div', { className: `jw-day${key === dateKey() ? ' today' : ''}`, title: mood ? mood.l : wrote ? 'Escribiste' : 'Sin entrada' }, [
        el('span', { className: 'jw-name' }, d.toLocaleDateString('es', { weekday: 'narrow' })),
        el('span', { className: `jw-mark${wrote ? ' wrote' : ''}` }, mood ? mood.e : wrote ? '✓' : ''),
      ]);
    })
  );
  const streak = journalStreak(new Set(days.filter((d) => d.wrote).map((d) => d.date)));
  const month = dateKey().slice(0, 7);
  const wordsOf = (s) => s.split(/\s+/).filter(Boolean).length;
  const words = days
    .filter((d) => monthOf(d.date) === month)
    .reduce((n, d) => n + wordsOf((d.section || '').replace(/^###.*$/gm, '')) + d.entries.reduce((m, e) => m + wordsOf(`${e.text || ''} ${(e.sections || []).map((s) => s.a).join(' ')}`), 0), 0);
  const total = days.reduce((n, d) => n + djCount(d.section) + d.entries.length, 0);
  $('#journal-stats').textContent = total
    ? `${total} ${total === 1 ? 'entrada' : 'entradas'} · ${streak ? `racha de ${streak} ${streak === 1 ? 'día' : 'días'}` : 'sin racha activa'} · ${words} palabras este mes`
    : 'Escribir unos minutos al día ayuda a ordenar la cabeza.';
  renderJournalMigrate();

  const q = journalSearch;
  const hit = (s) => !q || s.toLowerCase().includes(q);
  const list = days
    .map((d) => ({ ...d, showNote: !!d.note && hit(d.section || d.preview), shown: d.entries.filter((e) => hit(`${e.text || ''} ${(e.sections || []).map((s) => `${s.q} ${s.a}`).join(' ')}`)) }))
    .filter((d) => d.showNote || d.shown.length);
  const shown = list.slice(0, journalLimit);
  const nodes = shown.map((d) => {
    const go = d.note ? el('button', { className: 'link entry-open' }, 'Abrir nota') : '';
    if (go) go.addEventListener('click', () => openNote(d.note));
    return el('section', { className: 'entry-day' }, [
      el('h3', { className: 'section-title entry-day-head' }, [el('span', {}, dayLabel(d.date)), d.dayMood ? el('span', { className: 'entry-day-mood', title: d.dayMood.l }, d.dayMood.e) : '', go]),
      d.showNote ? noteDayCard(d) : '',
      ...d.shown.map(entryCard),
    ]);
  });
  if (list.length > shown.length) {
    const more = el('button', { className: 'link' }, `Ver ${Math.min(20, list.length - shown.length)} días más`);
    more.addEventListener('click', () => {
      journalLimit += 20;
      renderJournal();
    });
    nodes.push(more);
  }
  $('#journal-list').replaceChildren(...nodes);
  $('#journal-empty').hidden = list.length > 0;
  $('#journal-empty').textContent = days.length ? 'Ninguna entrada coincide con la búsqueda.' : 'Tu diario está vacío. Escribe la primera entrada arriba.';
}

$('#today-journal').addEventListener('click', () => {
  showView('journal');
  journalKind = 'dump';
  renderComposer();
  $('#journal-fields textarea')?.focus();
});
