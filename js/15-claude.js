'use strict';

// ---------- Claude dentro de la app ----------
// Solo disponible dentro de Claude: cada llamada usa tu cuenta y la primera vez pide permiso.
const ai = { sample: null, unavailable: false };

const AI_ERRORS = {
  not_granted: 'No has permitido que esta app use Claude. Puedes activarlo en el menú de permisos de la página.',
  sampling_disabled: 'Claude no está disponible para esta cuenta.',
  rate_limited: 'Has hecho muchas peticiones seguidas o llegaste a tu límite de uso. Prueba de nuevo en un rato.',
  session_expired: 'Tu sesión de Claude caducó. Vuelve a iniciar sesión y prueba otra vez.',
  prompt_too_large: 'Hay demasiado texto para enviarlo de una vez. Prueba con menos.',
  refused: 'Claude no pudo responder a esta petición. Prueba a reformular el texto.',
  invalid_json: 'La respuesta no vino en el formato esperado. Prueba de nuevo.',
  empty_completion: 'Claude no devolvió nada. Prueba con un texto más concreto.',
};
const aiErrorText = (e) => AI_ERRORS[e?.code] || 'No se pudo completar. Comprueba la conexión y prueba de nuevo.';
// Estos errores no se arreglan reintentando: se oculta la función en esta sesión.
const AI_FATAL = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];

async function startAI() {
  if (!window.claude?.use) return;
  try {
    ai.sample = await window.claude.use('sample');
  } catch {
    ai.sample = null;
  }
  renderAIControls();
}

function aiReady() {
  return !!ai.sample && !ai.unavailable;
}

function renderAIControls() {
  const ok = aiReady();
  $$('.ai-only').forEach((n) => (n.hidden = !ok));
  $$('.ai-off-note').forEach((n) => (n.hidden = ok));
  if (activeNote()) syncNoteAI(activeNote());
}

function handleAIError(e, statusEl) {
  if (e?.code === 'cancelled') {
    statusEl.textContent = 'Cancelado.';
    return;
  }
  if (AI_FATAL.includes(e?.code)) {
    ai.unavailable = true;
    renderAIControls();
  }
  statusEl.textContent = aiErrorText(e);
}

// --- Del vaciado mental a un plan ---
function planPrompt(text) {
  const today = new Date();
  const projects = state.projects.filter((p) => p.status !== 'done').map((p) => p.name);
  return `Eres un asistente de productividad. Convierte este vaciado mental en tareas concretas.

Hoy es ${today.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${dateKey(today)}).
Proyectos existentes: ${projects.length ? projects.map((p) => `"${p}"`).join(', ') : 'ninguno'}.

Reglas:
- Solo crea tareas para acciones que la persona puede hacer. Las preocupaciones, ideas o reflexiones sin acción clara van en "otros".
- Redacta cada tarea como una acción breve que empieza por un verbo, en español.
- "due": fecha AAAA-MM-DD si el texto la indica o se deduce con claridad ("mañana", "el viernes"); si no, null.
- "time": hora HH:MM si se indica; si no, null.
- "priority": "alta", "media" o "baja" según la urgencia o importancia que se note en el texto; por defecto "media".
- "project": el nombre exacto de uno de los proyectos existentes si encaja claramente; si no, null. No inventes proyectos.
- "tags": 0 a 2 etiquetas cortas en minúsculas sin #, solo si son útiles.

Responde solo con JSON con esta forma:
{"tasks":[{"title":"Llamar al banco","due":"2026-10-08","time":null,"priority":"alta","project":null,"tags":["finanzas"]}],"otros":["Preocupación por la entrega del viernes"]}

Vaciado mental:
"""
${text.slice(0, 12000)}
"""`;
}

let planCtl = null;

async function planWithAI(entry, box) {
  const text = entry.text || (entry.sections || []).map((s) => s.a).join('\n');
  const status = box.querySelector('.ai-status');
  const result = box.querySelector('.ai-result');
  const stop = box.querySelector('.ai-stop');
  const go = box.querySelector('.ai-go');
  planCtl = new AbortController();
  go.disabled = true;
  stop.hidden = false;
  status.textContent = 'Claude está ordenando tu vaciado mental…';
  result.replaceChildren();
  try {
    const data = await ai.sample.json(planPrompt(text), { signal: planCtl.signal });
    const tasks = Array.isArray(data?.tasks) ? data.tasks.filter((t) => t && typeof t.title === 'string' && t.title.trim()) : [];
    const others = Array.isArray(data?.otros) ? data.otros.filter((o) => typeof o === 'string' && o.trim()) : [];
    status.textContent = tasks.length ? `Claude propone ${plural(tasks.length, 'tarea', 'tareas')}. Desmarca las que no quieras.` : 'Claude no encontró tareas concretas en este texto.';
    renderPlan(tasks, others, result, status);
  } catch (e) {
    handleAIError(e, status);
  } finally {
    go.disabled = false;
    stop.hidden = true;
    planCtl = null;
  }
}

function findProjectByName(name) {
  if (!name) return null;
  const n = String(name).toLowerCase().trim();
  return state.projects.find((p) => p.name.toLowerCase() === n) || state.projects.find((p) => p.name.toLowerCase().startsWith(n)) || null;
}

function renderPlan(tasks, others, container, status) {
  const rows = tasks.map((t) => {
    const prio = PRIORITY_WORDS[String(t.priority || '').toLowerCase()] || 2;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') ? t.due : null;
    const time = /^\d{1,2}:\d{2}$/.test(t.time || '') ? t.time.padStart(5, '0') : null;
    const project = findProjectByName(t.project);
    const tags = (Array.isArray(t.tags) ? t.tags : []).map((x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '')).filter(Boolean).slice(0, 3);
    const check = el('input', { type: 'checkbox', checked: true });
    const title = el('input', { type: 'text', value: t.title.trim().slice(0, 200), className: 'plan-title', ariaLabel: 'Título de la tarea' });
    const meta = [PRIORITY_LABEL[prio], due && formatDue(due), time && `⏰ ${time}`, project && `📁 ${project.name}`, ...tags.map((x) => `#${x}`)].filter(Boolean).join(' · ');
    return { check, title, prio, due, time, project, tags, row: el('label', { className: 'plan-row' }, [check, el('div', { className: 'plan-body' }, [title, el('span', { className: 'muted' }, meta)])]) };
  });
  const create = el('button', { className: 'primary', type: 'button' }, 'Crear tareas');
  const update = () => {
    const n = rows.filter((r) => r.check.checked).length;
    create.textContent = n ? `Crear ${plural(n, 'tarea', 'tareas')}` : 'Marca alguna tarea';
    create.disabled = !n;
  };
  rows.forEach((r) => r.check.addEventListener('change', update));
  create.addEventListener('click', () => {
    const chosen = rows.filter((r) => r.check.checked && r.title.value.trim());
    chosen.forEach((r, i) =>
      state.tasks.push({
        id: uid(),
        title: r.title.value.trim(),
        tags: r.tags,
        priority: r.prio,
        due: r.due,
        time: r.time,
        repeat: null,
        notes: '',
        projectId: r.project?.id || null,
        order: Date.now() + i,
        subtasks: [],
        done: false,
        pomodoros: 0,
        createdAt: Date.now() + i,
      })
    );
    save();
    renderAll();
    container.replaceChildren();
    status.textContent = `${plural(chosen.length, 'tarea creada', 'tareas creadas')} en Tareas.`;
  });
  const nodes = [...rows.map((r) => r.row)];
  if (rows.length) nodes.push(el('div', { className: 'row' }, create));
  if (others.length) nodes.push(el('div', { className: 'plan-others' }, [el('strong', {}, 'Sin tarea concreta: '), others.join(' · ')]));
  container.replaceChildren(...nodes);
  update();
}

function aiPlanBox(entry) {
  const go = el('button', { type: 'button', className: 'ai-go' }, '✨ Ordenar con Claude');
  const stop = el('button', { type: 'button', className: 'ai-stop', hidden: true }, 'Detener');
  const box = el('div', { className: 'ai-box ai-only' }, [
    el('div', { className: 'row' }, [go, stop, el('span', { className: 'muted ai-hint' }, 'Claude lee el texto y propone tareas con fecha, prioridad y proyecto.')]),
    el('p', { className: 'ai-status muted', role: 'status' }),
    el('div', { className: 'ai-result' }),
  ]);
  go.addEventListener('click', () => planWithAI(entry, box));
  stop.addEventListener('click', () => planCtl?.abort());
  box.hidden = !aiReady();
  return box;
}

// --- Resumen semanal ---
let summaryCtl = null;
let lastSummary = '';

function weekData() {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => dateKey(addDays(today, i - 6)));
  const inWeek = (k) => k >= days[0] && k <= days[6];
  const lines = [];
  lines.push(`Semana del ${days[0]} al ${days[6]}.`);
  lines.push(`Tareas completadas por día: ${days.map((d) => `${d}: ${state.completions[d] || 0}`).join(', ')}.`);
  lines.push(`Pomodoros por día: ${days.map((d) => `${d}: ${state.pomodoros[d] || 0}`).join(', ')}. Minutos de enfoque totales: ${days.reduce((n, d) => n + (state.focusMinutes[d] || 0), 0)}.`);
  const events = state.log.filter((e) => !e.removed && inWeek(e.date)).sort((a, b) => a.at - b.at);
  if (events.length) {
    lines.push('Hitos de la bitácora:');
    events.slice(-120).forEach((e) => lines.push(`- ${e.date} · ${LOG_TYPES[e.type]?.label || e.type}: ${e.text}${e.detail ? ` (${e.detail})` : ''}`));
  }
  if (state.habits.length) {
    lines.push('Hábitos (días cumplidos esta semana):');
    state.habits.forEach((h) => lines.push(`- ${h.name}: ${days.filter((d) => h.log[d]).length}/7 (objetivo: ${GOAL_LABEL(goalOf(h)).toLowerCase()})`));
  }
  const entries = state.journal.filter((e) => inWeek(e.date)).sort((a, b) => a.createdAt - b.createdAt);
  if (entries.length) {
    lines.push('Diario:');
    entries.forEach((e) => {
      const mood = MOODS.find((m) => m.v === e.mood);
      const text = (e.text || (e.sections || []).map((s) => `${s.q} ${s.a}`).join(' ')).replace(/\s+/g, ' ').slice(0, 400);
      lines.push(`- ${e.date} (${JOURNAL_KINDS[e.kind]?.label}${mood ? `, ánimo ${mood.l.toLowerCase()}` : ''}): ${text}`);
    });
  }
  const active = state.projects.filter((p) => p.status === 'active');
  if (active.length) {
    lines.push('Proyectos activos:');
    active.forEach((p) => lines.push(`- ${p.name}: ${projectProgress(p)} %${p.deadline ? `, vence ${p.deadline}` : ''}${projectRisk(p) ? ' (va con retraso)' : ''}`));
  }
  const pending = state.tasks.concat(noteTasks()).filter((t) => !t.done);
  const overdue = pending.filter((t) => t.due && t.due < dateKey());
  const next = pending.filter((t) => t.due && t.due >= dateKey() && t.due <= dateKey(addDays(today, 7)));
  lines.push(`Tareas pendientes: ${pending.length} (vencidas: ${overdue.length}).`);
  overdue.slice(0, 15).forEach((t) => lines.push(`- Vencida (${t.due}): ${t.title}`));
  next.slice(0, 15).forEach((t) => lines.push(`- Próxima semana (${t.due}): ${t.title}`));
  return lines.join('\n');
}

function summaryPrompt() {
  return `Eres un coach de productividad cercano y concreto. Escribe en español el resumen de la semana de esta persona a partir de sus datos.

Usa Markdown con exactamente estas secciones (títulos de nivel 2) y frases cortas:
## Logros
## En qué se fue el tiempo
## Ánimo y energía
## Lo que queda pendiente
## Para la próxima semana
(en esta última, 3 sugerencias concretas en lista)

No inventes datos que no aparezcan. Si una sección no tiene datos, dilo en una línea. Máximo unas 250 palabras.

Datos:
${weekData().slice(0, 20000)}`;
}

async function generateSummary() {
  const out = $('#summary-out');
  const status = $('#summary-status');
  summaryCtl = new AbortController();
  $('#summary-go').disabled = true;
  $('#summary-stop').hidden = false;
  $('#summary-save').hidden = true;
  status.textContent = 'Claude está leyendo tu semana…';
  out.innerHTML = '';
  try {
    const { text, truncated } = await ai.sample(summaryPrompt(), {
      signal: summaryCtl.signal,
      cache: false,
      onText: ({ text: t }) => {
        status.textContent = '';
        out.innerHTML = renderMd(t, { noTasks: true });
      },
    });
    lastSummary = text;
    out.innerHTML = renderMd(text, { noTasks: true });
    status.textContent = truncated ? 'El resumen quedó cortado. Puedes generarlo de nuevo.' : '';
    $('#summary-save').hidden = false;
  } catch (e) {
    if (e?.text) {
      lastSummary = e.text;
      out.innerHTML = renderMd(e.text, { noTasks: true });
    }
    handleAIError(e, status);
  } finally {
    $('#summary-go').disabled = false;
    $('#summary-stop').hidden = true;
    summaryCtl = null;
  }
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  return { year: y, week: Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7) };
}

$('#summary-go').addEventListener('click', generateSummary);
$('#summary-stop').addEventListener('click', () => summaryCtl?.abort());
$('#summary-save').addEventListener('click', () => {
  if (!lastSummary) return;
  const { year, week } = isoWeek(new Date());
  if (!state.folders.includes('Revisiones')) state.folders.push('Revisiones');
  const title = `Semana ${year}-W${String(week).padStart(2, '0')}`;
  const existing = findNoteByName(`Revisiones/${title}`);
  if (existing) {
    existing.body = `${existing.body.replace(/\s*$/, '')}\n\n---\n\n${lastSummary}\n`;
    existing.updatedAt = Date.now();
    save();
    noteMode.set(existing.id, 'read');
    openNote(existing);
  } else {
    createNote({ folder: 'Revisiones', title, body: `*Resumen generado por Claude el ${new Date().toLocaleDateString('es')}.*\n\n${lastSummary}\n`, edit: false });
  }
});
