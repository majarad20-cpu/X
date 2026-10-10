'use strict';

// ---------- Más cosas de las notas ----------
// Notas semanales (Semanal/AAAA-Wss) y mensuales (Mensual/AAAA-MM) con cabecera ‹ anterior · siguiente ›,
// extraer texto o un bloque a una nota nueva, fusionar dos notas, presentar una nota como diapositivas
// (separadas por «---»), nota aleatoria y meta de palabras (propiedad «meta_palabras»).

Object.assign(ICONS, {
  'cal-week': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 15h10"/>',
  'cal-month': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>',
});

// ---------- Notas periódicas ----------
const pad2 = (n) => String(n).padStart(2, '0');
const mondayOf = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
const weekKeyOf = (d) => {
  const { year, week } = isoWeek(d);
  return `${year}-W${pad2(week)}`;
};
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const shortDay = (d) => `${d.getDate()} ${MONTHS_ES[d.getMonth()].slice(0, 3)}`;
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Cada tipo: carpeta, plantilla, nombre de un día, día de referencia de un nombre y paso.
const PERIODS = {
  week: {
    folder: 'Semanal',
    tpl: 'Semanal',
    key: weekKeyOf,
    // El jueves de la semana: su año y su mes son los de la semana ISO.
    ref: (d) => addDays(mondayOf(d), 3),
    parse: (name) => {
      const m = name.match(/^(\d{4})-W(\d{2})$/);
      if (!m) return null;
      const d = addDays(mondayOf(new Date(Number(m[1]), 0, 4)), (Number(m[2]) - 1) * 7 + 3);
      return weekKeyOf(d) === name ? d : null;
    },
    step: (d, n) => addDays(d, 7 * n),
    label: (d) => {
      const mon = mondayOf(d);
      return `Semana ${isoWeek(d).week} · ${shortDay(mon)} – ${shortDay(addDays(mon, 6))} ${d.getFullYear()}`;
    },
    now: 'Esta semana',
  },
  month: {
    folder: 'Mensual',
    tpl: 'Mensual',
    key: (d) => dateKey(d).slice(0, 7),
    ref: (d) => new Date(d.getFullYear(), d.getMonth(), 1),
    parse: (name) => {
      const m = name.match(/^(\d{4})-(\d{2})$/);
      return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : null;
    },
    step: (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1),
    label: (d) => `${capFirst(MONTHS_ES[d.getMonth()])} de ${d.getFullYear()}`,
    now: 'Este mes',
  },
};

// Tipo y día de referencia de una nota periódica (o null).
function periodOf(note) {
  if (!note) return null;
  const kind = Object.keys(PERIODS).find((k) => folderOf(note.path) === PERIODS[k].folder);
  const date = kind && PERIODS[kind].parse(baseName(note.path));
  return date ? { kind, date } : null;
}

function weeklyDefault(d) {
  const mon = mondayOf(d);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const x = addDays(mon, i);
    return `- [[${dateKey(x)}|${capFirst(x.toLocaleDateString('es', { weekday: 'long' }))} ${x.getDate()}]]`;
  });
  return `# ${PERIODS.week.label(d)}\n\nMes: [[${PERIODS.month.key(d)}]]\n\n## 📅 Días\n${days.join('\n')}\n\n## 🎯 Objetivos\n- [ ] \n\n## ✅ Tareas de la semana\n\`\`\`tareas\nsemana\n\`\`\`\n\n## 📝 Notas\n\n`;
}

function monthlyDefault(d) {
  const weeks = [];
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  for (let mon = mondayOf(d); mon <= last; mon = addDays(mon, 7)) weeks.push(`- [[${weekKeyOf(mon)}]] · ${shortDay(mon)} – ${shortDay(addDays(mon, 6))}`);
  return `# ${PERIODS.month.label(d)}\n\n## 🗓️ Semanas\n${weeks.join('\n')}\n\n## 🎯 Objetivos del mes\n- [ ] \n\n## 📝 Notas\n\n`;
}

// Abre (o crea) la nota semanal o mensual del día `when`.
function openPeriodicNote(kind, when = new Date(), { newTab = false } = {}) {
  const P = PERIODS[kind];
  const ref = P.ref(when);
  const key = P.key(ref);
  const existing = findNoteByName(`${P.folder}/${key}`);
  if (existing) return openNote(existing, { newTab }), existing;
  if (!state.folders.includes(P.folder)) state.folders.push(P.folder);
  const tpl = findNoteByName(`${TEMPLATE_FOLDER}/${P.tpl}`);
  const body = tpl ? fillTemplate(tpl.body, key, ref) : kind === 'week' ? weeklyDefault(ref) : monthlyDefault(ref);
  return createNote({ folder: P.folder, title: key, body, newTab, edit: false });
}
const openWeeklyNote = (o) => openPeriodicNote('week', new Date(), o);
const openMonthlyNote = (o) => openPeriodicNote('month', new Date(), o);

// Cabecera ‹ anterior · siguiente › en las notas periódicas.
function renderPeriodicBar(note) {
  const bar = $('#periodic-bar');
  const p = noteText(note) === null ? null : periodOf(note);
  bar.hidden = !p;
  if (!p) return bar.replaceChildren();
  const P = PERIODS[p.kind];
  const go = (d) => () => (flushNoteSave(), openPeriodicNote(p.kind, d));
  const btn = (txt, title, fn, cls = '') => {
    const b = el('button', { className: `chip ${cls}`, type: 'button', title }, txt);
    b.addEventListener('click', fn);
    return b;
  };
  const prev = P.step(p.date, -1);
  const next = P.step(p.date, 1);
  const isNow = P.key(P.ref(new Date())) === P.key(p.date);
  bar.replaceChildren(
    btn(`‹ ${P.key(prev)}`, 'Anterior', go(prev), 'pb-prev'),
    el('span', { className: 'pb-label' }, P.label(p.date)),
    ...(p.kind === 'week' ? [btn('Mes', `Nota de ${P.label(p.date).split(' · ')[0]}`, () => (flushNoteSave(), openPeriodicNote('month', p.date)), 'pb-up')] : []),
    ...(isNow ? [] : [btn(P.now, P.now, go(new Date()), 'pb-now')]),
    btn(`${P.key(next)} ›`, 'Siguiente', go(next), 'pb-next')
  );
}

$('#rib-weekly').addEventListener('click', (e) => openWeeklyNote({ newTab: e.ctrlKey || e.metaKey }));
$('#rib-monthly').addEventListener('click', (e) => openMonthlyNote({ newTab: e.ctrlKey || e.metaKey }));
$('#today-weekly').addEventListener('click', () => openWeeklyNote());
$('#today-monthly').addEventListener('click', () => openMonthlyNote());

// ---------- Extraer a una nota nueva ----------
// Nombre propuesto: la primera línea con texto, sin marcas de título, lista o cita.
function extractName(text) {
  const first = text.split('\n').find((l) => l.trim()) || '';
  const name = cleanName(first.replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)/, '').replace(/[*_=~`]/g, ''));
  return name.slice(0, 60).replace(/[.,;:!?…\s]+$/, '') || 'Sin título';
}

// Crea la nota con el texto y devuelve el enlace que lo sustituye.
function extractTo(from, text, name, embed) {
  const n = createNote({ folder: folderOf(from.path), title: name, body: `${text.replace(/^\n+|\s+$/g, '')}\n`, open: false });
  return { n, link: `${embed ? '!' : ''}[[${baseName(n.path)}]]` };
}

// Desde el editor: la selección pasa a la nota nueva. Sin `name`, se pregunta (propone la primera línea).
function extractSelection(ta, embed, name) {
  const note = activeNote();
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const text = ta.value.slice(s, e);
  if (!note || !text.trim()) return showToastMessage('Selecciona el texto que quieres extraer.');
  const go = (title) => {
    // El selector pudo mover el cursor: se busca el texto de nuevo si ya no está en su sitio.
    let a = s;
    if (ta.value.slice(s, e) !== text) a = ta.value.indexOf(text);
    if (a < 0) return showToastMessage('La selección ha cambiado; vuelve a intentarlo.');
    const { n, link } = extractTo(note, text, title, embed);
    editorInsert(ta, link, a, a + text.length, a + link.length);
    flushNoteSave();
    renderAll();
    showToastMessage(`Extraído a «${baseName(n.path)}»`);
    return n;
  };
  if (name) return go(name);
  promptText({ placeholder: 'Nombre de la nota nueva', initial: extractName(text), action: 'Extraer a', onSubmit: go });
}

// Desde la lectura: las líneas [from, to] del bloque pasan a la nota nueva.
function extractBlock(note, from, to, embed, name) {
  const go = (title) => {
    flushNoteSave();
    const lines = note.body.split('\n');
    const text = lines.slice(from, to + 1).join('\n');
    if (!text.trim()) return null;
    let made = null;
    withUndo(`Bloque extraído a «${cleanName(title)}»`, () => {
      const { n, link } = extractTo(note, text, title, embed);
      made = n;
      lines.splice(from, to - from + 1, link);
      note.body = lines.join('\n');
      note.updatedAt = Date.now();
      dataRev++;
    });
    return made;
  };
  if (name) return go(name);
  const text = note.body.split('\n').slice(from, to + 1).join('\n');
  promptText({ placeholder: 'Nombre de la nota nueva', initial: extractName(text), action: 'Extraer a', onSubmit: go });
}

const extractItems = (fn) => [
  { label: '⤴ Extraer a una nota nueva (incrustada ![[…]])', action: () => fn(true) },
  { label: '⤴ Extraer a una nota nueva (enlace [[…]])', action: () => fn(false) },
];

CTX_MENU_EXTRA.push((kind, x) => {
  if (kind === 'editor') {
    const note = activeNote();
    return note && x.selectionStart !== x.selectionEnd ? [{ sep: true }, ...extractItems((embed) => extractSelection(x, embed))] : [];
  }
  if (kind === 'block' && !x.note.enc) {
    const [from, to] = x.block.dataset.src.split('-').map(Number);
    return [
      { label: '⤴ Extraer este bloque a una nota nueva', action: () => extractBlock(x.note, from, to, true) },
      { label: '⤴ Extraer este bloque (dejar solo un enlace)', action: () => extractBlock(x.note, from, to, false) },
    ];
  }
  return [];
});

FMT_BUTTONS.push(['⤴', 'Extraer la selección a una nota nueva', (ta) => showMenu($('#fmt-bar .fb-extract'), extractItems((embed) => extractSelection(ta, embed))), 'fb-extract']);

// ---------- Fusionar dos notas ----------
// El texto de `gone` va al final de `keep`; sus propiedades que falten pasan a `keep`; los enlaces a
// `gone` apuntan a `keep` y `gone` se borra (con Deshacer).
function mergeNotes(keep, gone) {
  if (keep === gone || keep.enc || gone.enc) return false;
  flushNoteSave();
  if (typeof blockEdit !== 'undefined' && blockEdit) endBlockEdit({ render: false });
  const reopen = activeNote()?.id === gone.id;
  withUndo(`«${baseName(gone.path)}» fusionada en «${baseName(keep.path)}»`, () => {
    const { props, end } = parseProps(gone.body);
    const rest = (end > 0 ? gone.body.split('\n').slice(end + 1).join('\n') : gone.body).trim();
    props.forEach((p) => {
      if (!propOf(keep, p.key) && p.value) setProp(keep, p.key, p.value);
    });
    keep.body = `${keep.body.replace(/\s+$/, '')}\n\n## ${baseName(gone.path)}\n\n${rest}\n`;
    keep.updatedAt = Date.now();
    trashNotes([gone]); // por si hace falta recuperarla tal como estaba
    state.notes = state.notes.filter((n) => n !== gone);
    noteIndex.key = '';
    dataRev++;
    relinkAll(gone.path, keep.path);
    const ta = $('#note-editor');
    if (ta.dataset.note === keep.id) ta.value = keep.body;
  });
  if (reopen) openNote(keep);
  return true;
}

function pickMerge(note) {
  if (note.enc) return showToastMessage('Las notas protegidas no se pueden fusionar.');
  openPicker({
    placeholder: `Fusionar «${baseName(note.path)}» con…`,
    items: (q) =>
      state.notes
        .filter((n) => n !== note && !n.enc && (!q || scoreNote(n, q.toLowerCase()) > 0))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 30)
        .map((n) => ({ label: baseName(n.path), detail: folderOf(n.path), action: () => pickMergeWay(note, n) })),
  });
}

function pickMergeWay(note, other) {
  const a = baseName(note.path);
  const b = baseName(other.path);
  openPicker({
    placeholder: '¿Qué nota se queda?',
    hint: 'La otra se borra; sus enlaces pasan a la que se queda · <kbd>Esc</kbd> cancelar',
    items: () => [
      { label: `Añadir «${b}» al final de «${a}» (se borra «${b}»)`, action: () => mergeNotes(note, other) },
      { label: `Añadir «${a}» al final de «${b}» (se borra «${a}»)`, action: () => mergeNotes(other, note) },
    ],
  });
}

// ---------- Presentar ----------
// Diapositivas: se separan por líneas «---» (fuera de las propiedades y del código).
function splitSlides(text) {
  const lines = text.split('\n');
  let i = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) i = end + 1;
  }
  const slides = [[]];
  let fence = null;
  for (; i < lines.length; i++) {
    const l = lines[i];
    const f = l.match(/^\s*(`{3,}|~{3,})/);
    if (f && (!fence || f[1][0] === fence[0] && f[1].length >= fence.length)) fence = fence ? null : f[1];
    if (!fence && l.trim() === '---' && !f) slides.push([]);
    else slides.at(-1).push(l);
  }
  const out = slides.map((s) => s.join('\n').trim()).filter(Boolean);
  return out.length ? out : [''];
}

const present = { slides: [], i: 0, noteId: null, full: false };

function startPresentation(note) {
  const text = noteText(note);
  if (text === null) return showToastMessage('Desbloquea la nota para presentarla.');
  flushNoteSave();
  hideMenu();
  Object.assign(present, { slides: splitSlides(text), i: 0, noteId: note.id, full: false });
  const box = $('#present');
  box.hidden = false;
  box.focus({ preventScroll: true });
  showSlide(0);
  if (box.requestFullscreen && !document.fullscreenElement) {
    box.requestFullscreen().then(() => (present.full = true)).catch(() => {});
  }
}

function showSlide(i) {
  present.i = Math.max(0, Math.min(present.slides.length - 1, i));
  const s = $('#present-slide');
  const src = present.slides[present.i];
  s.innerHTML = src ? renderMd(src, { noteId: present.noteId }) : '<p class="muted">Nota vacía</p>';
  hydrateQueries(s, present.noteId);
  s.scrollTop = 0;
  $('#present-count').textContent = `${present.i + 1} / ${present.slides.length}`;
  $('#present-prev').disabled = present.i === 0;
  $('#present-next').disabled = present.i === present.slides.length - 1;
}

function endPresentation() {
  if ($('#present').hidden) return;
  $('#present').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  present.full = false;
}

const presenting = () => !$('#present').hidden;

// Teclado: antes que los atajos de la app.
document.addEventListener('keydown', (e) => {
  if (!presenting()) return;
  const k = e.key;
  const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k);
  const prev = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k);
  if (!next && !prev && !['Escape', 'Home', 'End'].includes(k)) return;
  e.preventDefault();
  e.stopPropagation();
  if (k === 'Escape') endPresentation();
  else if (k === 'Home') showSlide(0);
  else if (k === 'End') showSlide(present.slides.length - 1);
  else showSlide(present.i + (next ? 1 : -1));
}, true);

// Al salir de pantalla completa (Esc del navegador) termina la presentación.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && present.full) {
    present.full = false;
    endPresentation();
  }
});

$('#present-prev').addEventListener('click', (e) => (e.stopPropagation(), showSlide(present.i - 1)));
$('#present-next').addEventListener('click', (e) => (e.stopPropagation(), showSlide(present.i + 1)));
$('#present-close').addEventListener('click', (e) => (e.stopPropagation(), endPresentation()));

// Clic: en el cuarto izquierdo, atrás; en el resto, adelante. Deslizar: a un lado o al otro.
let presentSwipe = null;
$('#present').addEventListener('pointerdown', (e) => (presentSwipe = { x: e.clientX, y: e.clientY, moved: false }));
$('#present').addEventListener('pointerup', (e) => {
  if (!presentSwipe) return;
  const dx = e.clientX - presentSwipe.x;
  const dy = e.clientY - presentSwipe.y;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    presentSwipe.moved = true;
    showSlide(present.i + (dx < 0 ? 1 : -1));
  }
});
$('#present').addEventListener('click', (e) => {
  const swiped = presentSwipe?.moved;
  presentSwipe = null;
  if (swiped || e.target.closest('a, button, input, summary, .present-bar')) return;
  showSlide(present.i + (e.clientX < window.innerWidth / 4 ? -1 : 1));
});

// ---------- Nota aleatoria ----------
function openRandomNote() {
  const cur = activeNote();
  const list = state.notes.filter((n) => n !== cur && !n.path.startsWith(`${TEMPLATE_FOLDER}/`));
  if (!list.length) return showToastMessage('No hay otras notas.');
  const n = list[Math.floor(Math.random() * list.length)];
  openNote(n);
  return n;
}
$('#rib-random').addEventListener('click', () => openRandomNote());

// ---------- Meta de palabras ----------
const GOAL_KEY = 'meta_palabras';
const wordGoalOf = (note) => {
  const text = noteText(note);
  if (text === null) return 0;
  return Math.max(0, parseInt(parseProps(text).props.find((p) => p.key.toLowerCase() === GOAL_KEY)?.value, 10) || 0);
};
// Palabras sin contar las propiedades.
function bodyWords(text) {
  const { end } = parseProps(text);
  const rest = end > 0 ? text.split('\n').slice(end + 1).join('\n') : text;
  return rest.split(/\s+/).filter(Boolean).length;
}
function wordGoalProgress(note, text = noteText(note)) {
  const goal = wordGoalOf(note);
  if (!goal || text === null) return null;
  const words = bodyWords(text);
  return { words, goal, pct: Math.min(100, Math.round((words / goal) * 100)) };
}

function setWordGoal(note, value) {
  const n = parseInt(String(value).replace(/\D/g, ''), 10) || 0;
  if (n > 0) peSet(note, GOAL_KEY, 'number', n);
  else peDelete(note, GOAL_KEY);
  renderGoal(note);
}

function promptWordGoal(note) {
  const cur = wordGoalOf(note);
  promptText({ placeholder: 'Meta de palabras (p. ej. 1000; 0 la quita)', initial: cur ? String(cur) : '', action: 'Fijar la meta', onSubmit: (v) => setWordGoal(note, v) });
}

function renderGoal(note, text) {
  const box = $('#status-goal');
  const p = note && activeNote()?.id === note.id ? wordGoalProgress(note, text ?? noteText(note)) : null;
  box.hidden = !p;
  if (!p) return box.replaceChildren();
  const bar = el('span', { className: 'goal-bar' }, el('span', { className: 'goal-fill' }));
  bar.firstChild.style.width = `${p.pct}%`;
  box.classList.toggle('done', p.pct >= 100);
  box.title = `Meta de palabras: ${p.words} de ${p.goal} (${p.pct} %)`;
  box.replaceChildren(bar, el('span', {}, `${p.words} / ${p.goal}`));
}

// Al escribir, la barra sigue al texto del editor (en un bloque, a la nota entera al guardarse).
let goalTimer = null;
$('#note-editor').addEventListener('input', () => {
  clearTimeout(goalTimer);
  goalTimer = setTimeout(() => {
    const note = activeNote();
    if (note) renderGoal(note, blockEdit ? noteText(note) : $('#note-editor').value);
  }, 300);
});
// Fuera de las notas, la barra se esconde.
new MutationObserver(() => $('#note-pane').hidden && renderGoal(null)).observe($('#note-pane'), { attributes: true, attributeFilter: ['hidden'] });

NOTE_PANE_EXTRA.push((note, text) => {
  renderPeriodicBar(note);
  renderGoal(note, text ?? undefined);
});

// ---------- Menús y paleta ----------
NOTE_MENU_EXTRA.push(
  (note) => ({ label: '▶ Presentar', action: () => startPresentation(note) }),
  (note) => (note.enc ? null : { label: 'Fusionar con otra nota…', action: () => pickMerge(note) }),
  (note) => ({ label: `Meta de palabras…${wordGoalOf(note) ? ` (${wordGoalOf(note)})` : ''}`, action: () => promptWordGoal(note) })
);

COMMANDS_EXTRA.push((note) => [
  { label: 'Nota de esta semana', action: ({ newTab } = {}) => openWeeklyNote({ newTab }) },
  { label: 'Nota de este mes', action: ({ newTab } = {}) => openMonthlyNote({ newTab }) },
  { label: 'Nota aleatoria', action: openRandomNote },
  ...(note
    ? [
        { label: 'Presentar la nota', action: () => startPresentation(note) },
        { label: 'Meta de palabras…', action: () => promptWordGoal(note) },
        ...(note.enc ? [] : [{ label: 'Fusionar con otra nota…', action: () => pickMerge(note) }]),
        ...(isEditing(note.id) ? extractItems((embed) => extractSelection($('#note-editor'), embed)).map((x) => ({ ...x, label: x.label.replace('⤴ Extraer', 'Extraer la selección') })) : []),
      ]
    : []),
]);
