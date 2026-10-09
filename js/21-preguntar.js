'use strict';

// ---------- Pregúntale a tus notas ----------
// Un chat con Claude sobre tus notas, tareas y diario. Claude busca y lee lo que necesita con
// herramientas de esta página y responde citando las notas con [[enlaces]]. Si esta vista no
// admite herramientas, se le envían de entrada los fragmentos más relevantes.
const askState = { turns: [], busy: false, ctl: null, tools: null };

const ASK_RULES = `Eres el asistente de la app de notas y productividad de esta persona. Responde en español, de forma breve y concreta, usando solo lo que encuentres en sus notas, tareas y diario.

Reglas:
- Busca antes de responder. Si no encuentras nada, dilo con claridad; no inventes.
- Cita las notas de donde sacas cada dato con el formato [[Título de la nota]] (el título exacto).
- Para tareas, indica su fecha si la tienen y si están hechas.
- Usa Markdown sencillo: párrafos cortos y listas.
Hoy es ${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;

function scoreText(text, terms) {
  const t = text.toLowerCase();
  return terms.reduce((n, w) => n + (t.includes(w) ? 1 + Math.min(4, t.split(w).length - 2) : 0), 0);
}

const termsOf = (q) => String(q || '').toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}#+-]+/u).filter((w) => w.length > 2);

function searchNotesForAI(query, limit = 8) {
  const terms = termsOf(query);
  return state.notes
    .map((n) => ({ n, s: scoreText(baseName(n.path), terms) * 3 + scoreText(n.body, terms) }))
    .filter((x) => x.s > 0 || !terms.length)
    .sort((a, b) => b.s - a.s || b.n.updatedAt - a.n.updatedAt)
    .slice(0, limit)
    .map(({ n }) => ({
      titulo: baseName(n.path),
      ruta: n.path,
      modificada: dateKey(new Date(n.updatedAt)),
      fragmentos: n.body.split('\n').filter((l) => terms.some((w) => l.toLowerCase().includes(w))).slice(0, 4).map((l) => l.trim().slice(0, 240)),
    }));
}

function tasksForAI({ consulta = '', estado = 'pendientes' } = {}) {
  const terms = termsOf(consulta);
  return allTasks()
    .concat(noteTasks())
    .filter((t) => (estado === 'hechas' ? t.done : estado === 'todas' ? true : !t.done))
    .filter((t) => !terms.length || terms.some((w) => `${t.title} ${(t.tags || []).join(' ')} ${projectById(t.projectId)?.name || ''}`.toLowerCase().includes(w)))
    .sort(byImportance)
    .slice(0, 40)
    .map((t) => ({
      tarea: t.title,
      hecha: !!t.done,
      fecha: t.due || null,
      prioridad: PRIORITY_LABEL[t.priority].toLowerCase(),
      proyecto: projectById(t.projectId)?.name || null,
      nota: t.virtual ? baseName(noteById(t.noteId)?.path || '') : null,
    }));
}

function journalForAI({ consulta = '', desde = '', hasta = '' } = {}) {
  const terms = termsOf(consulta);
  return state.journal
    .filter((e) => (!desde || e.date >= desde) && (!hasta || e.date <= hasta))
    .map((e) => ({ e, text: e.text || (e.sections || []).map((s) => `${s.q} ${s.a}`).join(' ') }))
    .filter(({ text }) => !terms.length || terms.some((w) => text.toLowerCase().includes(w)))
    .sort((a, b) => b.e.createdAt - a.e.createdAt)
    .slice(0, 12)
    .map(({ e, text }) => ({ fecha: e.date, tipo: JOURNAL_KINDS[e.kind]?.label, animo: MOODS.find((m) => m.v === e.mood)?.l || null, texto: text.slice(0, 600) }));
}

function askTools() {
  const progress = (text) => ($('#ask-progress').textContent = text);
  return [
    {
      name: 'buscar_notas',
      description: 'Busca en las notas por palabras clave. Devuelve hasta 8 notas con título, ruta, fecha de modificación y las líneas que coinciden.',
      inputSchema: { type: 'object', properties: { consulta: { type: 'string', description: 'Palabras a buscar' } }, required: ['consulta'] },
      execute: ({ consulta }) => {
        progress(`Buscando «${String(consulta).slice(0, 40)}» en tus notas…`);
        return searchNotesForAI(String(consulta));
      },
    },
    {
      name: 'leer_nota',
      description: 'Devuelve el texto completo (hasta 8.000 caracteres) de una nota por su título o ruta.',
      inputSchema: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] },
      execute: ({ titulo }) => {
        const n = findNoteByName(String(titulo));
        if (!n) throw new Error(`No existe una nota llamada «${titulo}»`);
        progress(`Leyendo [[${baseName(n.path)}]]…`);
        return { titulo: baseName(n.path), ruta: n.path, texto: n.body.slice(0, 8000) };
      },
    },
    {
      name: 'buscar_tareas',
      description: 'Lista tareas (de la lista de tareas y de las casillas de las notas). estado: "pendientes" (por defecto), "hechas" o "todas". consulta opcional filtra por palabras.',
      inputSchema: { type: 'object', properties: { consulta: { type: 'string' }, estado: { type: 'string', enum: ['pendientes', 'hechas', 'todas'] } } },
      execute: (input) => {
        progress('Revisando tus tareas…');
        return tasksForAI({ consulta: String(input.consulta || ''), estado: String(input.estado || 'pendientes') });
      },
    },
    {
      name: 'buscar_diario',
      description: 'Busca entradas del diario. consulta opcional; desde y hasta opcionales en formato AAAA-MM-DD. Devuelve hasta 12 entradas recientes.',
      inputSchema: { type: 'object', properties: { consulta: { type: 'string' }, desde: { type: 'string' }, hasta: { type: 'string' } } },
      execute: (input) => {
        progress('Leyendo tu diario…');
        return journalForAI({ consulta: String(input.consulta || ''), desde: String(input.desde || ''), hasta: String(input.hasta || '') });
      },
    },
  ];
}

// Sin herramientas: se adjuntan los fragmentos más relevantes a la pregunta.
function contextFor(question) {
  const notes = searchNotesForAI(question, 6).map((n) => {
    const full = findNoteByName(n.ruta)?.body || '';
    return `### [[${n.titulo}]] (${n.ruta})\n${full.slice(0, 2500)}`;
  });
  const tasks = tasksForAI({ consulta: question, estado: 'todas' }).slice(0, 20).map((t) => `- ${t.hecha ? '[x]' : '[ ]'} ${t.tarea}${t.fecha ? ` (📅 ${t.fecha})` : ''}${t.nota ? ` — en [[${t.nota}]]` : ''}`);
  const journal = journalForAI({ consulta: question }).slice(0, 5).map((e) => `- ${e.fecha}: ${e.texto.slice(0, 300)}`);
  return `Notas relevantes:\n${notes.join('\n\n') || '(ninguna)'}\n\nTareas relacionadas:\n${tasks.join('\n') || '(ninguna)'}\n\nDiario relacionado:\n${journal.join('\n') || '(nada)'}`;
}

function renderAsk() {
  const list = $('#ask-messages');
  list.replaceChildren(
    ...askState.turns.map((t, i) => {
      const bubble = el('div', { className: `ask-msg ${t.role}` });
      if (t.role === 'user') bubble.textContent = t.content;
      else {
        bubble.classList.add('md');
        bubble.innerHTML = renderMd(t.content || '…', { noTasks: true, noExternalImages: true });
        if (t.error) bubble.append(el('p', { className: 'ask-error' }, t.error));
      }
      bubble.dataset.i = i;
      return bubble;
    })
  );
  $('#ask-empty').hidden = askState.turns.length > 0 || !aiReady();
  $('#ask-save').hidden = !askState.turns.some((t) => t.role === 'assistant' && t.content);
  $('#ask-clear').hidden = !askState.turns.length;
  reveal(list.lastElementChild, { block: 'end' });
}

async function sendQuestion(question) {
  if (!aiReady() || askState.busy || !question.trim()) return;
  askState.busy = true;
  askState.ctl = new AbortController();
  askState.turns.push({ role: 'user', content: question.trim() });
  const answer = { role: 'assistant', content: '' };
  askState.turns.push(answer);
  renderAsk();
  $('#ask-send').disabled = true;
  $('#ask-stop').hidden = false;
  $('#ask-progress').textContent = 'Pensando…';
  const bubble = () => $('#ask-messages').lastElementChild;

  // Instrucciones como primer turno; el historial reciente detrás (sin la respuesta en curso).
  const history = askState.turns.slice(0, -1).filter((t) => t.content).slice(-8).map((t) => ({ role: t.role, content: t.content }));
  if (askState.tools === null) askState.tools = !!(await ai.sample.limits().catch(() => null))?.tools;
  const first = askState.tools ? ASK_RULES : `${ASK_RULES}\n\n${contextFor(question)}`;
  const input = [{ role: 'user', content: first }, ...history];
  try {
    const { text } = await ai.sample(input, {
      signal: askState.ctl.signal,
      ...(askState.tools ? { tools: askTools() } : { cache: false }),
      onText: ({ text: t }) => {
        answer.content = t;
        $('#ask-progress').textContent = '';
        const b = bubble();
        if (b) b.innerHTML = renderMd(t, { noTasks: true, noExternalImages: true });
      },
    });
    answer.content = text;
  } catch (e) {
    answer.content = e?.text || answer.content;
    if (e?.code !== 'cancelled') answer.error = aiErrorText(e);
    if (AI_FATAL.includes(e?.code)) {
      ai.unavailable = true;
      renderAIControls();
    }
  } finally {
    askState.busy = false;
    askState.ctl = null;
    $('#ask-send').disabled = false;
    $('#ask-stop').hidden = true;
    $('#ask-progress').textContent = '';
    renderAsk();
  }
}

$('#ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#ask-input').value;
  $('#ask-input').value = '';
  sendQuestion(q);
});
$('#ask-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('#ask-form').requestSubmit();
  }
});
$('#ask-stop').addEventListener('click', () => askState.ctl?.abort());
$('#ask-clear').addEventListener('click', () => {
  askState.turns = [];
  renderAsk();
});
$$('.ask-example').forEach((b) =>
  b.addEventListener('click', () => {
    $('#ask-input').value = b.textContent;
    $('#ask-input').focus();
  })
);
$('#ask-save').addEventListener('click', () => {
  if (!state.folders.includes('Preguntas')) state.folders.push('Preguntas');
  const firstQ = askState.turns.find((t) => t.role === 'user')?.content || 'Pregunta';
  const body = askState.turns.map((t) => (t.role === 'user' ? `> **Pregunta:** ${t.content}` : t.content)).join('\n\n');
  createNote({ folder: 'Preguntas', title: firstQ.slice(0, 60), body: `*Conversación con Claude del ${new Date().toLocaleDateString('es')}.*\n\n${body}\n`, edit: false });
});
// Los [[enlaces]] de las respuestas abren la nota.
$('#ask-messages').addEventListener('click', (e) => {
  const link = e.target.closest('a.wikilink');
  if (link) {
    e.preventDefault();
    openNoteByLink(link.dataset.target, { heading: link.dataset.heading, newTab: true });
  }
});
