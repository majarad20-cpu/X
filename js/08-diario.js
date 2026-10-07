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
  state.journal.push(entry);
  const words = `${entry.text || ''} ${(entry.sections || []).map((s) => s.a).join(' ')}`.split(/\s+/).filter(Boolean).length;
  logEvent('journal', JOURNAL_KINDS[entry.kind].label, { ref: entry.id, detail: [MOODS.find((m) => m.v === entry.mood)?.e, plural(words, 'palabra', 'palabras')].filter(Boolean).join(' · ') });
  save();
  writeDraft({});
  journalMood = null;
  renderComposer();
  renderAll();
  if (entry.kind === 'dump') showDumpConvert(entry);
  $('#journal-draft').textContent = 'Entrada guardada';
});

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
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

function journalStreak() {
  const days = new Set(state.journal.map((e) => e.date));
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

function renderJournal() {
  // Semana de ánimo: el ánimo de la última entrada de cada día.
  const today = new Date();
  $('#journal-week').replaceChildren(
    ...Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => {
      const key = dateKey(d);
      const entries = state.journal.filter((e) => e.date === key).sort((a, b) => a.createdAt - b.createdAt);
      const withMood = entries.filter((e) => e.mood).pop();
      const mood = withMood && MOODS.find((m) => m.v === withMood.mood);
      return el('div', { className: `jw-day${key === dateKey() ? ' today' : ''}`, title: mood ? mood.l : entries.length ? 'Escribiste' : 'Sin entrada' }, [
        el('span', { className: 'jw-name' }, d.toLocaleDateString('es', { weekday: 'narrow' })),
        el('span', { className: `jw-mark${entries.length ? ' wrote' : ''}` }, mood ? mood.e : entries.length ? '✓' : ''),
      ]);
    })
  );
  const streak = journalStreak();
  const month = dateKey().slice(0, 7);
  const words = state.journal
    .filter((e) => monthOf(e.date) === month)
    .reduce((n, e) => n + `${e.text || ''} ${(e.sections || []).map((s) => s.a).join(' ')}`.split(/\s+/).filter(Boolean).length, 0);
  $('#journal-stats').textContent = state.journal.length
    ? `${state.journal.length} ${state.journal.length === 1 ? 'entrada' : 'entradas'} · ${streak ? `racha de ${streak} ${streak === 1 ? 'día' : 'días'}` : 'sin racha activa'} · ${words} palabras este mes`
    : 'Escribir unos minutos al día ayuda a ordenar la cabeza.';

  const q = journalSearch;
  const list = state.journal
    .filter((e) => !q || `${e.text || ''} ${(e.sections || []).map((s) => `${s.q} ${s.a}`).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const shown = list.slice(0, journalLimit);
  const groups = [];
  shown.forEach((e) => {
    const g = groups[groups.length - 1];
    if (g && g.date === e.date) g.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  });
  const nodes = groups.map((g) => el('section', { className: 'entry-day' }, [el('h3', { className: 'section-title' }, dayLabel(g.date)), ...g.items.map(entryCard)]));
  if (list.length > shown.length) {
    const more = el('button', { className: 'link' }, `Ver ${Math.min(20, list.length - shown.length)} entradas más`);
    more.addEventListener('click', () => {
      journalLimit += 20;
      renderJournal();
    });
    nodes.push(more);
  }
  $('#journal-list').replaceChildren(...nodes);
  $('#journal-empty').hidden = list.length > 0;
  $('#journal-empty').textContent = state.journal.length ? 'Ninguna entrada coincide con la búsqueda.' : 'Tu diario está vacío. Escribe la primera entrada arriba.';
}

$('#today-journal').addEventListener('click', () => {
  showView('journal');
  journalKind = 'dump';
  renderComposer();
  $('#journal-fields textarea')?.focus();
});
