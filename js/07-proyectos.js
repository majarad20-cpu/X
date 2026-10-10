'use strict';

// ---------- Proyectos ----------
let projectFilter = 'active';
let openProjectId = null;
const PROJECT_COLORS = ['indigo', 'blue', 'teal', 'fuchsia', 'orange', 'slate'];
const PROJECT_STATUS = { active: 'Activo', paused: 'En pausa', done: 'Completado' };
const DAY_MS = 24 * 60 * 60 * 1000;

const projectTasks = (p) => allTasks().concat(noteTasks()).filter((t) => t.projectId === p.id);

// Avance: a mano si se fijó; si no, tareas completadas sobre el total (las que se repiten no cuentan,
// porque nunca terminan). Un proyecto completado está al 100 %.
function projectProgress(p) {
  if (p.status === 'done') return 100;
  if (p.manual !== null && p.manual !== undefined) return p.manual;
  const tasks = projectTasks(p).filter((t) => !t.repeat);
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100);
}

function daysLeft(p) {
  if (!p.deadline) return null;
  return Math.round((parseKey(p.deadline) - parseKey(dateKey())) / DAY_MS);
}

function deadlineText(p) {
  const d = daysLeft(p);
  if (d === null) return '';
  if (p.status === 'done') return `Fecha límite: ${formatDue(p.deadline)}`;
  if (d < 0) return `Venció hace ${-d} ${d === -1 ? 'día' : 'días'}`;
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  return `Vence en ${d} días`;
}

// "Va con retraso" cuando el tiempo consumido supera al avance en más de 20 puntos.
function projectRisk(p) {
  if (p.status !== 'active' || !p.deadline) return null;
  const pct = projectProgress(p);
  const start = parseKey(dateKey(new Date(p.createdAt)));
  const end = parseKey(p.deadline);
  const today = parseKey(dateKey());
  if (today > end && pct < 100) return { level: 'late', text: `La fecha límite ya pasó y el avance es del ${pct} %.` };
  const total = end - start;
  if (total <= 0) return null;
  const timePct = Math.round(((today - start) / total) * 100);
  if (timePct - pct > 20) return { level: 'behind', text: `Ha pasado el ${timePct} % del plazo y el avance es del ${pct} %.` };
  return null;
}

function projectById(id) {
  return state.projects.find((p) => p.id === id);
}

function openProject(id) {
  openProjectId = id;
  showView('projects');
  renderProjects();
  $('#views-pane').scrollTop = 0;
}

$('#project-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#project-name').value.trim();
  if (!name) return;
  const used = state.projects.map((p) => p.color);
  state.projects.push({
    id: uid(),
    name,
    desc: '',
    status: 'active',
    deadline: $('#project-deadline').value || null,
    color: PROJECT_COLORS.find((c) => !used.includes(c)) || PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length],
    manual: null,
    milestone: 0,
    createdAt: Date.now(),
  });
  logEvent('project', `Nuevo proyecto: ${name}`, { ref: state.projects[state.projects.length - 1].id });
  save();
  e.target.reset();
  renderAll();
});

$$('[data-pfilter]').forEach((btn) =>
  btn.addEventListener('click', () => {
    projectFilter = btn.dataset.pfilter;
    $$('[data-pfilter]').forEach((b) => b.classList.toggle('active', b === btn));
    renderProjects();
  })
);

$('#project-back').addEventListener('click', () => {
  openProjectId = null;
  renderProjects();
});

function progressBar(pct, big = false) {
  return el('div', { className: `progress-track${big ? ' big' : ''}`, role: 'progressbar', ariaValueNow: String(pct), ariaValueMin: '0', ariaValueMax: '100' },
    el('div', { className: 'progress-fill', style: `width: ${pct}%` }));
}

function projectCard(p) {
  const tasks = projectTasks(p).filter((t) => !t.repeat);
  const pct = projectProgress(p);
  const risk = projectRisk(p);
  const card = el('button', { className: 'project-card' }, [
    el('div', { className: 'pc-head' }, [
      el('span', { className: 'pc-dot', ariaHidden: 'true' }),
      el('span', { className: 'pc-name' }, p.name),
      el('span', { className: `pill status-${p.status}` }, PROJECT_STATUS[p.status]),
    ]),
    el('div', { className: 'pc-progress' }, [progressBar(pct), el('span', { className: 'pc-pct' }, `${pct} %`)]),
    el('div', { className: 'pc-meta' }, [
      p.manual !== null && p.manual !== undefined && p.status !== 'done' ? 'Avance manual' : `${tasks.filter((t) => t.done).length}/${tasks.length} tareas`,
      p.deadline ? ` · ${deadlineText(p)}` : '',
    ]),
  ]);
  if (risk) card.append(el('div', { className: `pc-risk ${risk.level}` }, risk.level === 'late' ? '⚠ Fuera de plazo' : '⚠ Va con retraso'));
  card.dataset.pcolor = p.color;
  card.dataset.relType = 'project'; // clic derecho: «Enlazar con…», «Ver relacionado…»
  card.dataset.relId = p.id;
  card.addEventListener('click', () => openProject(p.id));
  return card;
}

function renderProjects() {
  const detailOpen = !!projectById(openProjectId);
  if (!detailOpen) openProjectId = null;
  $('#projects-list-pane').hidden = detailOpen;
  $('#project-detail').hidden = !detailOpen;
  if (detailOpen) return renderProjectDetail(projectById(openProjectId));

  const order = { active: 0, paused: 1, done: 2 };
  const list = state.projects
    .filter((p) => projectFilter === 'all' || p.status === projectFilter)
    .sort((a, b) => order[a.status] - order[b.status] || (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.createdAt - b.createdAt);
  $('#project-list').replaceChildren(...list.map(projectCard));
  $('#project-empty').hidden = list.length > 0;
}

function renderProjectDetail(p) {
  const focused = document.activeElement;
  const detail = $('#project-detail');
  detail.dataset.pcolor = p.color;
  // No se tocan los campos mientras se escribe en ellos.
  if (focused !== $('#pd-name')) $('#pd-name').value = p.name;
  if (focused !== $('#pd-desc')) $('#pd-desc').value = p.desc || '';
  $('#pd-status').value = p.status;
  $('#pd-deadline').value = p.deadline || '';

  $('#pd-colors').replaceChildren(
    ...PROJECT_COLORS.map((c) => {
      const b = el('button', { className: `pd-color${p.color === c ? ' on' : ''}`, role: 'radio', ariaChecked: String(p.color === c), ariaLabel: ACCENTS[c] });
      b.dataset.pcolor = c;
      b.addEventListener('click', () => {
        p.color = c;
        save();
        renderProjects();
      });
      return b;
    })
  );

  $('#pd-note').textContent = p.noteId && noteById(p.noteId) ? '📝 Abrir la nota del proyecto' : '📝 Crear la nota del proyecto';
  const pct = projectProgress(p);
  const manual = p.manual !== null && p.manual !== undefined;
  $('#pd-percent').textContent = `${pct} %`;
  $('#pd-bar').style.width = `${pct}%`;
  const tasks = projectTasks(p);
  const counted = tasks.filter((t) => !t.repeat);
  $('#pd-status-text').textContent = [
    p.status === 'done' ? 'Proyecto completado' : manual ? 'Avance fijado a mano' : `${counted.filter((t) => t.done).length} de ${counted.length} tareas completadas`,
    deadlineText(p),
  ].filter(Boolean).join(' · ');
  $('#pd-manual').checked = manual;
  $('#pd-manual').disabled = p.status === 'done';
  $('#pd-slider').hidden = !manual || p.status === 'done';
  if (focused !== $('#pd-slider')) $('#pd-slider').value = manual ? p.manual : pct;
  const risk = projectRisk(p);
  $('#pd-risk').hidden = !risk;
  $('#pd-risk').textContent = risk ? `⚠ ${risk.text}` : '';

  const sorted = tasks.slice().sort(byImportance);
  $('#pd-tasks').replaceChildren(...sorted.map((t) => taskItem(t)));
  $('#pd-tasks-empty').hidden = tasks.length > 0;
  $('#pd-count').textContent = tasks.length ? `${tasks.filter((t) => t.done).length}/${tasks.length}` : '';
  // Enlaces y «Relacionado» (60-relaciones.js); las tareas del proyecto ya están arriba.
  detail.dataset.relType = 'project';
  detail.dataset.relId = p.id;
  let rel = $('#pd-related');
  if (!rel) $('#pd-tasks-empty').after((rel = el('div', { id: 'pd-related', className: 'pd-related' })));
  rel.replaceChildren(relItemPanel('project', p, { skipChildren: true }));
}

function currentProject() {
  return projectById(openProjectId);
}

let pdTimer = null;
['#pd-name', '#pd-desc'].forEach((sel) =>
  $(sel).addEventListener('input', () => {
    clearTimeout(pdTimer);
    pdTimer = setTimeout(() => {
      const p = currentProject();
      if (!p) return;
      p.name = $('#pd-name').value.trim() || p.name;
      p.desc = $('#pd-desc').value;
      save();
    }, 400);
  })
);
$('#pd-name').addEventListener('blur', () => {
  const p = currentProject();
  if (p && !$('#pd-name').value.trim()) $('#pd-name').value = p.name;
  renderAll();
});
$('#pd-status').addEventListener('change', (e) => {
  const p = currentProject();
  if (e.target.value === 'done' && p.status !== 'done') logEvent('project', `Proyecto completado: ${p.name}`, { ref: p.id });
  if (e.target.value !== 'done' && p.status === 'done') unlogEvent('project', p.id, dateKey());
  p.status = e.target.value;
  save();
  renderAll();
});
$('#pd-deadline').addEventListener('change', (e) => {
  const p = currentProject();
  p.deadline = e.target.value || null;
  save();
  renderAll();
});
$('#pd-manual').addEventListener('change', (e) => {
  const p = currentProject();
  p.manual = e.target.checked ? projectProgress(p) : null;
  save();
  renderAll();
});
$('#pd-slider').addEventListener('input', (e) => {
  const p = currentProject();
  p.manual = Number(e.target.value);
  $('#pd-percent').textContent = `${p.manual} %`;
  $('#pd-bar').style.width = `${p.manual}%`;
});
$('#pd-slider').addEventListener('change', () => {
  save();
  renderAll();
});
$('#pd-task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#pd-task-title').value.trim();
  if (!text) return;
  addTask(text, { projectId: openProjectId });
  e.target.reset();
  $('#pd-task-title').focus();
});
$('#pd-note').addEventListener('click', () => {
  const p = currentProject();
  if (p) openProjectNote(p);
});
$('#today-daily').addEventListener('click', () => openDailyNote());
$('#import-notes').addEventListener('click', () => importToNotes());
$('#pd-delete').addEventListener('click', () => {
  const p = currentProject();
  if (!p) return;
  withUndo(`Proyecto "${p.name}" eliminado (sus tareas se conservan)`, () => {
    state.projects = state.projects.filter((x) => x.id !== p.id);
    allTasks().forEach((t) => {
      if (t.projectId === p.id) t.projectId = null;
    });
    openProjectId = null;
  });
});
