'use strict';

// ---------- Revisión semanal guiada ----------
// Seis pasos: vencidas → sin fecha → proyectos → próxima semana → hábitos → reflexión.
// Al terminar se guarda una nota en Revisiones/ con las decisiones y las prioridades.
const REVIEW_STEPS = [
  { id: 'overdue', title: 'Tareas vencidas', hint: 'Decide qué hacer con cada una: hecha, moverla o borrarla.' },
  { id: 'inbox', title: 'Tareas sin fecha', hint: 'Dale fecha a lo que toque esta semana; lo demás puede esperar en «Algún día».' },
  { id: 'projects', title: 'Proyectos', hint: 'Repasa cómo va cada proyecto activo. Pausa o cierra los que ya no avanzan.' },
  { id: 'next', title: 'Próxima semana', hint: 'Lo que ya tienes en agenda. Añade lo que falte.' },
  { id: 'habits', title: 'Hábitos', hint: 'Cómo fue la constancia esta semana.' },
  { id: 'reflect', title: 'Reflexión y prioridades', hint: 'Cierra la semana y elige tus 3 prioridades.' },
];
const review = { step: 0, decisions: [], reflection: { good: '', bad: '', p1: '', p2: '', p3: '' } };

function nextMonday() {
  return addDays(weekStart(new Date()), 7);
}

function setTaskDue(t, due) {
  if (t.virtual) {
    const note = noteById(t.noteId);
    const lines = note.body.split('\n');
    const line = lines[t.line].replace(/\s*📅\s*([^#!⏰📅✅+]+?)\s*(?=[#!⏰📅✅+]|$)/u, ' ').replace(/\s+$/, '');
    lines[t.line] = `${line} 📅 ${due}`;
    note.body = lines.join('\n');
    note.updatedAt = Date.now();
  } else {
    t.due = due;
  }
}

function decide(t, action, label) {
  review.decisions.push(`${label}: ${t.title}`);
  if (action === 'done') {
    if (t.virtual) toggleNoteTask(t.noteId, t.line, true);
    else toggleDone(t, true);
    renderReviewStep();
    return;
  }
  if (action === 'tomorrow') setTaskDue(t, dateKey(addDays(new Date(), 1)));
  // El viernes de esta semana; en fin de semana, hoy (el viernes ya pasó).
  if (action === 'week') setTaskDue(t, [dateKey(addDays(nextMonday(), -3)), dateKey()].sort()[1]);
  if (action === 'nextweek') setTaskDue(t, dateKey(nextMonday()));
  if (action === 'someday') {
    if (t.virtual) {
      const note = noteById(t.noteId);
      const lines = note.body.split('\n');
      if (!/#algun-dia\b/.test(lines[t.line])) lines[t.line] += ' #algun-dia';
      note.body = lines.join('\n');
    } else if (!(t.tags || []).includes('algun-dia')) t.tags = [...(t.tags || []), 'algun-dia'];
  }
  if (action === 'delete' && !t.virtual) state.tasks = state.tasks.filter((x) => x.id !== t.id);
  save();
  renderAll();
  renderReviewStep();
}

function reviewTaskRow(t, actions) {
  const src = t.virtual ? ` · 📝 ${baseName(noteById(t.noteId)?.path || '')}` : '';
  const meta = [PRIORITY_LABEL[t.priority], t.due && formatDue(t.due), projectById(t.projectId) && `📁 ${projectById(t.projectId).name}`].filter(Boolean).join(' · ') + src;
  return el('li', { className: 'rv-row' }, [
    el('div', { className: 'rv-body' }, [el('span', { className: 'rv-title' }, t.title), el('span', { className: 'muted' }, meta)]),
    el(
      'div',
      { className: 'rv-actions' },
      actions
        .filter(([a]) => !(a === 'delete' && t.virtual))
        .map(([a, label]) => {
          const b = el('button', { className: a === 'done' ? 'chip primary-chip' : 'chip' }, label);
          b.addEventListener('click', () => decide(t, a, label));
          return b;
        })
    ),
  ]);
}

function renderReviewStep() {
  const step = REVIEW_STEPS[review.step];
  const today = dateKey();
  const pending = allTasks().concat(noteTasks()).filter((t) => !t.done);
  $('#review-steps').replaceChildren(
    ...REVIEW_STEPS.map((s, i) => {
      const b = el('button', { className: `rv-step${i === review.step ? ' active' : ''}${i < review.step ? ' done' : ''}`, ariaCurrent: i === review.step ? 'step' : null }, [el('span', { className: 'rv-num' }, i < review.step ? '✓' : String(i + 1)), el('span', { className: 'rv-label' }, s.title)]);
      b.addEventListener('click', () => {
        review.step = i;
        renderReviewStep();
      });
      return b;
    })
  );
  $('#review-title').textContent = `${review.step + 1}. ${step.title}`;
  $('#review-hint').textContent = step.hint;
  const body = $('#review-body');
  const empty = (text) => el('p', { className: 'empty' }, text);

  if (step.id === 'overdue') {
    const list = pending.filter((t) => t.due && t.due < today).sort(byImportance);
    body.replaceChildren(list.length ? el('ul', { className: 'rv-list' }, list.map((t) => reviewTaskRow(t, [['done', '✓ Hecha'], ['tomorrow', 'Mañana'], ['nextweek', 'Próx. semana'], ['someday', 'Algún día'], ['delete', 'Borrar']]))) : empty('No tienes tareas vencidas. 🎉'));
  } else if (step.id === 'inbox') {
    const list = pending.filter((t) => !t.due && !(t.tags || []).includes('algun-dia') && !t.repeat).sort(byImportance);
    body.replaceChildren(list.length ? el('ul', { className: 'rv-list' }, list.map((t) => reviewTaskRow(t, [['done', '✓ Hecha'], ['week', 'Esta semana'], ['nextweek', 'Próx. semana'], ['someday', 'Algún día'], ['delete', 'Borrar']]))) : empty('Todas tus tareas tienen fecha o están en «Algún día».'));
  } else if (step.id === 'projects') {
    const list = state.projects.filter((p) => p.status === 'active');
    body.replaceChildren(
      list.length
        ? el('ul', { className: 'rv-list' }, list.map((p) => {
            const risk = projectRisk(p);
            const row = el('li', { className: 'rv-row' }, [
              el('div', { className: 'rv-body' }, [el('span', { className: 'rv-title' }, p.name), el('span', { className: 'muted' }, `${projectProgress(p)} %${p.deadline ? ` · ${deadlineText(p)}` : ''}${risk ? ' · ⚠ va con retraso' : ''}`), progressBar(projectProgress(p))]),
            ]);
            row.dataset.pcolor = p.color;
            const actions = el('div', { className: 'rv-actions' });
            [['open', 'Abrir'], ['paused', 'Pausar'], ['done', 'Completado']].forEach(([a, label]) => {
              const b = el('button', { className: 'chip' }, label);
              b.addEventListener('click', () => {
                if (a === 'open') return openProject(p.id);
                review.decisions.push(`${label}: proyecto ${p.name}`);
                if (a === 'done') logEvent('project', `Proyecto completado: ${p.name}`, { ref: p.id });
                p.status = a;
                save();
                renderAll();
                renderReviewStep();
              });
              actions.append(b);
            });
            row.append(actions);
            return row;
          }))
        : empty('No tienes proyectos activos.')
    );
  } else if (step.id === 'next') {
    const from = dateKey(addDays(new Date(), 1));
    const to = dateKey(addDays(new Date(), 8));
    const list = pending.filter((t) => t.due && t.due >= from && t.due <= to).sort((a, b) => a.due.localeCompare(b.due) || byImportance(a, b));
    const days = calEnabled() ? [...cal.byDay].filter(([k]) => k >= from && k <= to).sort() : [];
    const input = el('input', { type: 'text', placeholder: 'Añadir tarea (p. ej. Preparar informe el martes !alta)', maxLength: 200, ariaLabel: 'Nueva tarea para la próxima semana' });
    const form = el('form', { className: 'row' }, [input, el('button', { type: 'submit', className: 'primary' }, 'Añadir')]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      addTask(input.value.trim(), { due: dateKey(nextMonday()) });
      const added = state.tasks[state.tasks.length - 1];
      review.decisions.push(`Añadida: ${added.title}${added.due ? ` (${formatDue(added.due)})` : ''}`);
      save();
      renderAll();
      renderReviewStep();
      $('#review-body input[type=text]')?.focus();
    });
    body.replaceChildren(
      ...(days.length ? [el('h4', { className: 'rv-sub' }, 'En tu calendario'), el('ul', { className: 'cal-list' }, days.flatMap(([k, evs]) => evs.map((ev) => eventItem({ ...ev, time: `${formatDue(k)} · ${ev.time}` }))))] : []),
      el('h4', { className: 'rv-sub' }, `Tareas con fecha (${list.length})`),
      list.length ? el('ul', { className: 'list' }, list.map((t) => taskItem(t))) : empty('Aún no hay tareas para los próximos días.'),
      form
    );
  } else if (step.id === 'habits') {
    const days = Array.from({ length: 7 }, (_, i) => dateKey(addDays(new Date(), i - 6)));
    body.replaceChildren(
      state.habits.length
        ? el('ul', { className: 'rv-list' }, state.habits.map((h) => {
            const done = days.filter((d) => h.log[d]).length;
            const target = goalOf(h);
            return el('li', { className: 'rv-row' }, el('div', { className: 'rv-body' }, [el('span', { className: 'rv-title' }, `${done >= target ? '✅' : '◻️'} ${h.name}`), el('span', { className: 'muted' }, `${done} de ${target} días esta semana · racha ${streakText(h, streak(h))}`)]));
          }))
        : empty('No tienes hábitos todavía.')
    );
  } else {
    const field = (key, label, rows = 2) => {
      const ta = el('textarea', { className: 'notes', rows, value: review.reflection[key], ariaLabel: label });
      ta.addEventListener('input', () => (review.reflection[key] = ta.value));
      return el('label', { className: 'prompt' }, [el('span', {}, label), ta]);
    };
    const prio = (key, n) => {
      const inp = el('input', { type: 'text', value: review.reflection[key], placeholder: `Prioridad ${n}`, maxLength: 140, ariaLabel: `Prioridad ${n}` });
      inp.addEventListener('input', () => (review.reflection[key] = inp.value));
      return inp;
    };
    body.replaceChildren(
      field('good', '¿Qué salió bien esta semana?'),
      field('bad', '¿Qué no salió como esperabas y por qué?'),
      el('div', { className: 'prompt' }, [el('span', {}, 'Las 3 prioridades de la próxima semana'), prio('p1', 1), prio('p2', 2), prio('p3', 3)]),
      el('label', { className: 'switch rv-tasks' }, [el('input', { type: 'checkbox', id: 'review-prio-tasks', checked: true }), 'Crear también las prioridades como tareas para el lunes'])
    );
  }
  // Antes de empezar, lo que quede en la Bandeja de entrada (57-papelera-captura.js).
  const inbox = review.step === 0 && typeof inboxReviewRow === 'function' && inboxReviewRow();
  if (inbox) body.prepend(inbox);
  $('#review-prev').disabled = review.step === 0;
  $('#review-next').hidden = review.step === REVIEW_STEPS.length - 1;
  $('#review-finish').hidden = review.step !== REVIEW_STEPS.length - 1;
  $('#review-plan').hidden = review.step !== REVIEW_STEPS.length - 1; // «Planificar la semana siguiente» (64-semana.js)
}

function finishReview() {
  const { year, week } = isoWeek(new Date());
  const title = `Revisión ${year}-W${String(week).padStart(2, '0')}`;
  const days = Array.from({ length: 7 }, (_, i) => dateKey(addDays(new Date(), i - 6)));
  const prios = ['p1', 'p2', 'p3'].map((k) => review.reflection[k].trim()).filter(Boolean);
  const monday = dateKey(nextMonday());
  if (prios.length && $('#review-prio-tasks')?.checked) prios.forEach((p) => addTask(p, { priority: 3, due: monday }));
  const done = days.reduce((n, d) => n + (state.completions[d] || 0), 0);
  const pomos = days.reduce((n, d) => n + (state.pomodoros[d] || 0), 0);
  const body = [
    `*Revisión semanal del ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}.* #revision`,
    '',
    '## 📊 La semana en números',
    `- Tareas completadas: ${done}`,
    `- Pomodoros: ${pomos}`,
    ...state.habits.map((h) => `- ${h.name}: ${days.filter((d) => h.log[d]).length}/${goalOf(h)}`),
    '',
    '## ✅ Lo que salió bien',
    review.reflection.good.trim() || '—',
    '',
    '## 🔧 Lo que no salió como esperaba',
    review.reflection.bad.trim() || '—',
    '',
    '## 🎯 Prioridades de la próxima semana',
    ...(prios.length ? prios.map((p) => `- [ ] ${p} 📅 ${monday}`) : ['—']),
    '',
    '## 🗂️ Decisiones tomadas',
    ...(review.decisions.length ? review.decisions.map((d) => `- ${d}`) : ['- Ninguna']),
    '',
  ].join('\n');
  if (!state.folders.includes('Revisiones')) state.folders.push('Revisiones');
  // Las prioridades ya se crearon como tareas: en la nota quedan como texto para no duplicarlas.
  const noteBody = prios.length && $('#review-prio-tasks')?.checked ? body.replace(/^- \[ \] (.*) 📅 .*$/gm, '- $1') : body;
  createNote({ folder: 'Revisiones', title, body: noteBody, edit: false, log: false });
  logEvent('goal', `Revisión semanal completada`, { ref: title, detail: `${review.decisions.length} decisiones` });
  state.settings.lastReview = dateKey();
  save();
  review.step = 0;
  review.decisions = [];
  review.reflection = { good: '', bad: '', p1: '', p2: '', p3: '' };
  showToastMessage('Revisión guardada en Revisiones/');
}

$('#review-prev').addEventListener('click', () => {
  review.step = Math.max(0, review.step - 1);
  renderReviewStep();
  $('#views-pane').scrollTop = 0;
});
$('#review-next').addEventListener('click', () => {
  review.step = Math.min(REVIEW_STEPS.length - 1, review.step + 1);
  renderReviewStep();
  $('#views-pane').scrollTop = 0;
});
$('#review-finish').addEventListener('click', finishReview);
$('#today-review').addEventListener('click', () => showView('review'));

// En Hoy, de viernes a domingo, se recuerda la revisión si no se hizo esta semana.
function renderReviewNudge() {
  const dow = new Date().getDay();
  const last = state.settings.lastReview;
  const doneThisWeek = last && last >= dateKey(weekStart(new Date()));
  $('#today-review').hidden = !([5, 6, 0].includes(dow) && !doneThisWeek);
}
