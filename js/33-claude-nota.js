'use strict';

// ---------- Claude dentro de una nota ----------
// Un panel al pie de la nota (botón ✨, «/claude» o Ctrl+J) que resume, continúa, mejora, corrige,
// saca tareas, traduce o hace lo que se le pida, sobre el texto seleccionado o sobre toda la nota.
// El resultado se ve antes de aplicarlo y lo anterior queda en el historial de versiones.
// Las notas con contraseña quedan fuera: su texto no sale del dispositivo.
const NOTE_AI_MAX = 30000;
const noteAI = { noteId: null, sel: null, action: null, result: '', busy: false, ctl: null, lang: 'inglés', prompt: '', kind: 'auto', used: [] };

// Tipos de nota para «Escribir esta nota»: cómo se organiza el texto.
const NOTE_AI_KINDS = {
  auto: 'Elige tú la estructura que mejor le sirva a una nota con este título (concepto, procedimiento, comparación…).',
  concepto: 'Es una nota de concepto: «## Definición» (2-3 frases), «## Ideas clave» (viñetas), «## Ejemplo» (uno concreto y realista) y «## Relación con otras notas».',
  procedimiento: 'Es una nota de procedimiento: «## Objetivo», «## Pasos» (lista numerada), «## Errores frecuentes» y «## Ejemplo».',
  moc: 'Es un MOC (mapa de contenido): una introducción de 2 frases y secciones «## » que agrupan enlaces [[ ]] a las notas del tema, cada uno con una frase de para qué sirve. Puedes proponer notas que aún no existen como enlaces si hacen falta para cubrir el tema.',
  resumen: 'Es un resumen: «## Idea central» (2-3 frases) y «## Puntos clave» (5 a 10 viñetas).',
  comparacion: 'Es una comparación: una frase de contexto, una tabla Markdown con las diferencias principales y «## Cuándo usar cada uno».',
};

const NOTE_AI_ACTIONS = {
  write: {
    label: 'Escribir esta nota',
    place: 'below',
    vault: true,
    ask: (t, ctx) => `Escribe el contenido de la nota «${ctx.title}»${ctx.folder ? ` (carpeta «${ctx.folder}»)` : ''} de una bóveda personal de notas en Markdown (estilo Obsidian, un «segundo cerebro»). ${NOTE_AI_KINDS[noteAI.kind] || NOTE_AI_KINDS.auto}

Reglas:
- En español, claro, preciso y útil para estudiar y consultar después.
- Empieza directamente con el contenido: sin repetir el título como encabezado, sin propiedades YAML, sin introducción ni despedida.
- Apóyate primero en las notas de la bóveda que te doy (si las hay): si dicen algo, respétalo; complétalo con conocimiento general.
- Enlaza con [[Nombre]] solo notas de la lista «notas existentes»; no inventes enlaces${noteAI.kind === 'moc' ? ' (salvo las notas nuevas que propongas para el MOC)' : ''}.
- No inventes cifras, artículos de ley, normas ni fechas concretas; si citas una norma que conviene comprobar, añade «(verificar)».
- Si usaste notas de la bóveda, termina con «## Fuentes» y una línea «- [[Nombre]]» por cada nota usada. Si no usaste ninguna, no pongas esa sección.${t.trim() ? `\n\nLa nota ya tiene este texto: mantenlo como base, no lo repitas y escribe solo lo que falta para completarla.\n\n<texto_actual>\n${t}\n</texto_actual>` : ''}${ctx.vault}`,
  },
  summary: {
    label: 'Resumir',
    place: 'below',
    heading: '## Resumen',
    ask: (t) => `Resume este texto en español en 3 a 6 viñetas claras («- »), con lo esencial y sin introducción.\n\n<texto>\n${t}\n</texto>`,
  },
  continue: {
    label: 'Continuar escribiendo',
    place: 'cursor',
    vault: true,
    ask: (t, ctx) => `Continúa escribiendo este texto de la nota «${ctx.title}» desde donde termina, con el mismo tono, idioma y formato Markdown. Escribe uno o dos párrafos (o los elementos de lista que falten). Si enlazas notas, usa solo las de la lista de notas existentes. Devuelve solo la continuación, sin repetir lo anterior.\n\n<texto_anterior>\n${ctx.before}\n</texto_anterior>${ctx.after.trim() ? `\n\n<texto_posterior>\n${ctx.after}\n</texto_posterior>` : ''}${ctx.vault}`,
  },
  improve: {
    label: 'Mejorar redacción',
    place: 'replace',
    ask: (t) => `Mejora la redacción de este texto: más claro, conciso y natural, en el mismo idioma. Mantén el significado, los datos, el formato Markdown, los [[enlaces]], las #etiquetas y las casillas «- [ ]». Devuelve solo el texto mejorado.\n\n<texto>\n${t}\n</texto>`,
  },
  fix: {
    label: 'Corregir ortografía',
    place: 'replace',
    ask: (t) => `Corrige la ortografía, la gramática y la puntuación de este texto sin cambiar el estilo ni el contenido. Mantén el formato Markdown, los [[enlaces]], las #etiquetas y las casillas. Devuelve solo el texto corregido.\n\n<texto>\n${t}\n</texto>`,
  },
  tasks: {
    label: 'Sacar tareas',
    place: 'below',
    heading: '## Tareas',
    ask: (t) => `Lee este texto y saca las acciones concretas que hay que hacer. Devuelve solo una lista, una tarea por línea, con este formato exacto: «- [ ] verbo + qué». Si el texto da una fecha, añade « 📅 AAAA-MM-DD» al final (hoy es ${dateKey()}, ${new Date().toLocaleDateString('es', { weekday: 'long' })}). Si es urgente o importante, añade « !alta». Si no hay ninguna acción, devuelve solo «(ninguna)».\n\n<texto>\n${t}\n</texto>`,
  },
  translate: {
    label: 'Traducir',
    place: 'below',
    ask: (t) => `Traduce este texto al ${noteAI.lang}. Mantén el formato Markdown, los [[enlaces]] y las #etiquetas tal cual. Devuelve solo la traducción.\n\n<texto>\n${t}\n</texto>`,
  },
  custom: {
    label: 'Petición',
    place: 'below',
    vault: true,
    ask: (t, ctx) => `${noteAI.prompt}\n\nEstás trabajando en la nota «${ctx.title}»${ctx.folder ? ` (carpeta «${ctx.folder}»)` : ''} de una bóveda personal de notas (estilo Obsidian). ${t.trim() ? 'Su texto va abajo.' : 'La nota está vacía (solo tiene el título): si se pide escribirla, crearla o desarrollarla, escribe su contenido completo a partir del título y de las notas de la bóveda.'} Responde en español (salvo que se pida otro idioma), en Markdown, sin introducción ni despedida, sin repetir el título como encabezado. Si enlazas notas con [[ ]], usa solo las de la lista de notas existentes.${t.trim() ? `\n\n<texto>\n${t}\n</texto>` : ''}${ctx.vault}`,
  },
};

// Lo que la nota tiene escrito, sin propiedades ni el título como «# encabezado».
function noteAIContent(note) {
  const { end } = parseProps(note.body);
  const rest = note.body.split('\n').slice(end >= 0 ? end + 1 : 0).join('\n').trim();
  return rest.replace(/^#\s+.*(\n|$)/, '').trim();
}

// Contexto de la bóveda: las notas que enlazan a esta (con el párrafo del enlace), las que enlaza,
// las que la mencionan y las de su carpeta, hasta ~12.000 caracteres; y una lista de notas que
// existen para que Claude enlace solo esas. Las notas protegidas nunca salen del dispositivo.
const NOTE_AI_CTX_MAX = 12000;
const NOTE_AI_CTX_NOTE = 1500;
function noteAIVaultContext(note) {
  const picks = new Map();
  const strip = (n) => {
    const { end } = parseProps(n.body);
    return n.body.split('\n').slice(end >= 0 ? end + 1 : 0).join('\n').trim();
  };
  const add = (n, why, text) => {
    if (!n || n.id === note.id || n.enc || picks.has(n.id)) return;
    const body = (text ?? strip(n)).trim();
    if (body) picks.set(n.id, { n, why, text: body.slice(0, NOTE_AI_CTX_NOTE) });
  };
  const around = (n, lines) => {
    const all = n.body.split('\n');
    const from = parseProps(n.body).end + 1;
    return [...new Set(lines.flatMap(({ i }) => Array.from({ length: 9 }, (_, k) => i - 2 + k)).filter((i) => i >= from && i < all.length))].sort((a, b) => a - b).map((i) => all[i]).join('\n');
  };
  const { linked, unlinked } = backlinksOf(note);
  // Primero los MOC y las notas con más enlaces a esta: suelen explicar mejor de qué va.
  linked.sort((a, b) => /moc/i.test(b.note.path) - /moc/i.test(a.note.path) || b.lines.length - a.lines.length).forEach(({ note: n, lines }) => add(n, 'enlaza a esta nota', around(n, lines)));
  linksIn(note.body).forEach((l) => l.target && add(findNoteByName(l.target), 'enlazada desde esta nota'));
  unlinked.slice(0, 6).forEach(({ note: n, lines }) => add(n, `menciona «${baseName(note.path)}»`, around(n, lines)));
  const folder = folderOf(note.path);
  const siblings = state.notes.filter((n) => n.id !== note.id && !n.enc && folderOf(n.path) === folder).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  siblings.slice(0, 4).forEach((n) => add(n, 'de la misma carpeta'));
  const used = [];
  let size = 0;
  for (const p of picks.values()) {
    if (used.length >= 12 || size + p.text.length > NOTE_AI_CTX_MAX) continue;
    used.push(p);
    size += p.text.length;
  }
  // Notas que se pueden enlazar: las del contexto, las de la carpeta (y la de arriba) y las enlazadas desde ellas.
  const names = new Set(used.map((p) => baseName(p.n.path)));
  siblings.forEach((n) => names.add(baseName(n.path)));
  const parent = folderOf(folder);
  state.notes.filter((n) => folder && !n.enc && folderOf(n.path) === parent).forEach((n) => names.add(baseName(n.path)));
  used.forEach((p) => linksIn(p.n.body).forEach((l) => l.target && findNoteByName(l.target) && !findNoteByName(l.target).enc && names.add(baseName(findNoteByName(l.target).path))));
  names.delete(baseName(note.path));
  const list = [...names].filter((x) => !x.startsWith('.')).slice(0, 150);
  const text = used.length || list.length
    ? `\n\n<boveda>\n${list.length ? `Notas existentes que puedes enlazar: ${list.map((x) => `[[${x}]]`).join(', ')}\n` : ''}${used.map((p) => `\n<nota titulo="${baseName(p.n.path)}" relacion="${p.why}">\n${p.text}\n</nota>`).join('\n')}\n</boveda>`
    : '';
  return { text, used: used.map((p) => p.n) };
}

// Los enlaces a notas que no existen se dejan como texto (en un MOC pueden ser notas por crear); en
// «Fuentes» se quitan las líneas que no apuntan a una nota real.
function tidyNoteAILinks(text, keepNew) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^##\s+Fuentes\s*$/i.test(l));
  const head = (at < 0 ? lines : lines.slice(0, at)).join('\n');
  const exists = (t) => !!findNoteByName(t.split('|')[0].split('#')[0]);
  const body = keepNew ? head : head.replace(/(?<!!)\[\[([^\]\n]+?)\]\]/g, (m, t) => (exists(t) ? m : t.split('|').pop()));
  if (at < 0) return body;
  const src = lines.slice(at + 1).filter((l) => l.trim() && (![...l.matchAll(/\[\[([^\]\n]+?)\]\]/g)].length || [...l.matchAll(/\[\[([^\]\n]+?)\]\]/g)].every((m) => exists(m[1]))));
  return src.length ? `${body.replace(/\s*$/, '')}\n\n${lines[at]}\n${src.join('\n')}` : body.replace(/\s*$/, '');
}

function noteAIAvailable(note) {
  return aiReady() && note && !note.enc;
}

function openNoteAI() {
  const note = activeNote();
  if (!note) return;
  if (note.enc) return showToastMessage('Claude no trabaja con notas protegidas con contraseña: su texto no sale del dispositivo.');
  if (!aiReady()) return showToastMessage('Claude solo está disponible al abrir la app desde Claude.');
  flushNoteSave();
  const ta = $('#note-editor');
  // Lo seleccionado en el editor (si lo hay) es el texto con el que trabaja Claude.
  const editing = !ta.hidden && ta.dataset.note === note.id;
  // Editando un solo bloque, el editor tiene solo ese trozo: las posiciones se pasan a la nota entera.
  const off = blockEdit?.noteId === note.id ? blockEdit.before.length : 0;
  const start = editing ? (document.activeElement === ta || off ? off + ta.selectionStart : Number(ta.dataset.caret ?? ta.selectionStart)) : note.body.length;
  const end = editing && (document.activeElement === ta || off) ? off + ta.selectionEnd : start;
  noteAI.noteId = note.id;
  noteAI.sel = end > start ? { start, end, text: note.body.slice(start, end) } : null;
  noteAI.caret = start;
  noteAI.action = null;
  noteAI.result = '';
  noteAI.error = '';
  $('#note-ai').hidden = false;
  layoutNoteAI();
  renderNoteAI();
  $('#note-ai-input').focus();
}

function closeNoteAI() {
  noteAI.ctl?.abort();
  noteAI.noteId = null;
  $('#note-ai').hidden = true;
  layoutNoteAI();
}

// Con sitio, el panel va al lado de la nota (que sigue entera a la vista); si no, debajo y compacto.
function layoutNoteAI() {
  const pane = $('#note-pane');
  pane.classList.toggle('ai-side', !$('#note-ai').hidden && pane.clientWidth >= 720);
}
new ResizeObserver(() => layoutNoteAI()).observe($('#note-pane'));

function renderNoteAI() {
  const note = noteById(noteAI.noteId);
  if (!note) return closeNoteAI();
  const empty = !noteAIContent(note);
  const scope = noteAI.sel ? `Sobre el texto seleccionado (${plural(noteAI.sel.text.split(/\s+/).filter(Boolean).length, 'palabra', 'palabras')})` : empty ? 'La nota está vacía: Claude puede escribirla a partir de su título' : 'Sobre toda la nota';
  $('#note-ai').classList.toggle('na-empty', empty && !noteAI.sel);
  $('#note-ai-write').textContent = empty ? '✍️ Escribir esta nota' : '✍️ Completar la nota';
  $('#note-ai-kind').value = noteAI.kind;
  $('#note-ai-vault').checked = state.settings.noteAIVault !== false;
  const ctxLine = $('#note-ai-ctx');
  ctxLine.hidden = !noteAI.used.length || !noteAI.result;
  ctxLine.textContent = noteAI.used.length ? `Contexto: ${plural(noteAI.used.length, 'nota', 'notas')} de tu bóveda` : '';
  ctxLine.title = noteAI.used.map((n) => baseName(n.path)).join('\n');
  $('#note-ai-scope').textContent = scope;
  $('#note-ai-note').textContent = `«${baseName(note.path)}»`;
  $('#note-ai-note').title = note.path;
  $$('#note-ai [data-ai-action]').forEach((b) => {
    b.disabled = noteAI.busy;
    b.classList.toggle('active', b.dataset.aiAction === noteAI.action);
  });
  $('#note-ai-lang').value = noteAI.lang;
  $('#note-ai-send').disabled = noteAI.busy;
  $('#note-ai-stop').hidden = !noteAI.busy;
  const out = $('#note-ai-out');
  out.hidden = !noteAI.result && !noteAI.busy && !noteAI.error;
  $('#note-ai-result').innerHTML = noteAI.result ? renderMd(noteAI.result, { noTasks: true }) : noteAI.busy ? '<p class="muted">Claude está escribiendo…</p>' : '';
  $('#note-ai-error').textContent = noteAI.error || '';
  const done = !!noteAI.result && !noteAI.busy;
  const action = NOTE_AI_ACTIONS[noteAI.action];
  const canReplace = done && !!noteAI.sel && action?.place !== 'cursor';
  $('#note-ai-replace').hidden = !canReplace;
  $('#note-ai-insert').hidden = !done;
  $('#note-ai-insert').textContent = action?.place === 'cursor' ? 'Insertar en el cursor' : noteAI.sel ? 'Insertar debajo de la selección' : action?.place === 'replace' ? 'Reemplazar la nota' : empty ? 'Escribir en la nota' : 'Añadir al final';
  $('#note-ai-copy').hidden = !done;
  $('#note-ai-retry').hidden = !done && !noteAI.error;
}

async function runNoteAI(key) {
  const note = noteById(noteAI.noteId);
  const action = NOTE_AI_ACTIONS[key];
  if (!note || !action || noteAI.busy) return;
  if (key === 'custom' && !noteAI.prompt.trim()) return $('#note-ai-input').focus();
  const source = (noteAI.sel ? noteAI.sel.text : note.body).slice(0, NOTE_AI_MAX);
  const content = noteAI.sel ? source : noteAIContent(note).slice(0, NOTE_AI_MAX);
  if (!content.trim() && !['continue', 'custom', 'write'].includes(key)) {
    noteAI.error = 'La nota está vacía: usa «✍️ Escribir esta nota» o pídeselo abajo.';
    return renderNoteAI();
  }
  const useVault = action.vault && state.settings.noteAIVault !== false;
  const vault = useVault ? noteAIVaultContext(note) : { text: '', used: [] };
  noteAI.used = vault.used;
  const ctx = { title: baseName(note.path), folder: folderOf(note.path), vault: vault.text, before: note.body.slice(Math.max(0, noteAI.caret - NOTE_AI_MAX), noteAI.caret), after: note.body.slice(noteAI.caret, noteAI.caret + 4000) };
  noteAI.action = key;
  noteAI.result = '';
  noteAI.error = '';
  noteAI.busy = true;
  noteAI.ctl = new AbortController();
  renderNoteAI();
  try {
    const { text } = await ai.sample(action.ask(key === 'write' || key === 'custom' ? content : source, ctx), {
      signal: noteAI.ctl.signal,
      onText: ({ text: t }) => {
        noteAI.result = t;
        $('#note-ai-result').innerHTML = renderMd(t, { noTasks: true });
      },
    });
    noteAI.result = cleanAIText(text);
    if (key === 'write') noteAI.result = tidyNoteAILinks(noteAI.result, noteAI.kind === 'moc');
  } catch (e) {
    noteAI.result = '';
    if (e?.code === 'cancelled') noteAI.error = 'Cancelado.';
    else {
      const status = { textContent: '' };
      handleAIError(e, status);
      noteAI.error = status.textContent;
    }
  } finally {
    noteAI.busy = false;
    noteAI.ctl = null;
    renderNoteAI();
  }
}

// Quita envoltorios que a veces añade el modelo (```markdown … ```).
function cleanAIText(text) {
  const t = String(text || '').trim();
  const fence = t.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/i);
  return fence ? fence[1].trim() : t;
}

async function applyNoteAI(mode) {
  const note = noteById(noteAI.noteId);
  const action = NOTE_AI_ACTIONS[noteAI.action];
  if (!note || !noteAI.result || note.enc) return;
  if (noteAI.action === 'tasks' && /^\(ninguna\)$/i.test(noteAI.result.trim())) {
    showToastMessage('Claude no encontró tareas en el texto.');
    return closeNoteAI();
  }
  if (blockEdit?.noteId === note.id) endBlockEdit({ render: false });
  await snapshotNote(note, { force: true });
  const body = note.body;
  const result = noteAI.result;
  const block = action.heading ? `${action.heading}\n${result}` : result;
  let next;
  let caret;
  if (mode === 'replace' && noteAI.sel && body.slice(noteAI.sel.start, noteAI.sel.end) === noteAI.sel.text) {
    next = body.slice(0, noteAI.sel.start) + result + body.slice(noteAI.sel.end);
    caret = noteAI.sel.start + result.length;
  } else if (action.place === 'cursor') {
    const at = Math.min(noteAI.caret, body.length);
    const sep = at && !/\s$/.test(body.slice(0, at)) ? (/\n/.test(result) ? '\n' : ' ') : '';
    next = body.slice(0, at) + sep + result + body.slice(at);
    caret = at + sep.length + result.length;
  } else if (action.place === 'replace' && !noteAI.sel) {
    next = result;
    caret = result.length;
  } else {
    const at = noteAI.sel ? noteAI.sel.end : body.length;
    const before = body.slice(0, at).replace(/\s*$/, '');
    const insert = `${before ? '\n\n' : ''}${block}\n`;
    next = before + insert + body.slice(at).replace(/^\s*/, body.slice(at).trim() ? '\n' : '');
    caret = before.length + insert.length;
  }
  // Lo escrito por Claude entra como borrador (si la nota no tiene ya un estado) para revisarlo después.
  if (noteAI.action === 'write' && !parseProps(next).props.some((p) => p.key.toLowerCase() === 'estado')) {
    const { end } = parseProps(next);
    const lines = next.split('\n');
    if (end > 0) lines.splice(end, 0, 'estado: borrador');
    else lines.unshift('---', 'estado: borrador', '---');
    const added = end > 0 ? 'estado: borrador\n'.length : '---\nestado: borrador\n---\n'.length;
    next = lines.join('\n');
    caret += added;
  }
  note.body = next;
  note.updatedAt = Date.now();
  save();
  await snapshotNote(note, { force: true });
  closeNoteAI();
  if (isEditing(note.id)) {
    const ta = $('#note-editor');
    ta.value = note.body;
    autosize(ta);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(caret, caret);
  }
  renderAll();
  showToastMessage('Hecho. Lo anterior queda en el historial de versiones.');
}

$('#note-ai-btn').addEventListener('click', () => ($('#note-ai').hidden || noteAI.noteId !== activeNote()?.id ? openNoteAI() : closeNoteAI()));
$('#note-ai-close').addEventListener('click', closeNoteAI);
$$('#note-ai [data-ai-action]').forEach((b) => b.addEventListener('click', () => runNoteAI(b.dataset.aiAction)));
$('#note-ai-lang').addEventListener('change', (e) => {
  noteAI.lang = e.target.value;
  runNoteAI('translate');
});
$('#note-ai-form').addEventListener('submit', (e) => {
  e.preventDefault();
  noteAI.prompt = $('#note-ai-input').value.trim();
  runNoteAI('custom');
});
$('#note-ai-kind').addEventListener('change', (e) => {
  noteAI.kind = e.target.value;
});
$('#note-ai-vault').addEventListener('change', (e) => {
  state.settings.noteAIVault = e.target.checked;
  save();
});
$('#note-ai-stop').addEventListener('click', () => noteAI.ctl?.abort());
$('#note-ai-retry').addEventListener('click', () => noteAI.action && runNoteAI(noteAI.action));
$('#note-ai-replace').addEventListener('click', () => applyNoteAI('replace'));
$('#note-ai-insert').addEventListener('click', () => applyNoteAI('insert'));
$('#note-ai-copy').addEventListener('click', () => copyText(noteAI.result, 'Copiado'));
$('#note-ai').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeNoteAI();
    $('#note-editor').hidden ? null : $('#note-editor').focus();
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'j' && activeNote() && $('#draw').hidden) {
    e.preventDefault();
    openNoteAI();
  }
});

// El panel es de una nota: al cambiar de nota se cierra; el botón ✨ se oculta en notas protegidas.
function syncNoteAI(note) {
  $('#note-ai-btn').hidden = !noteAIAvailable(note);
  if (noteAI.noteId && noteAI.noteId !== note?.id) closeNoteAI();
}

NOTE_MENU_EXTRA.push((note) => (noteAIAvailable(note) ? { label: '✨ Claude en esta nota… (Ctrl+J)', action: openNoteAI } : null));
// En una nota vacía, escribirla es lo primero que se ofrece.
NOTE_MENU_EXTRA.push((note) => (noteAIAvailable(note) && note.id === activeNote()?.id && !noteAIContent(note) ? { label: '✍️ Escribir esta nota con Claude', action: () => {
  openNoteAI();
  runNoteAI('write');
} } : null));
SLASH_ITEMS.unshift({ when: () => noteAIAvailable(activeNote()), icon: '✨', label: 'Claude…', detail: 'Resumir, continuar, mejorar, sacar tareas, traducir…', keys: 'claude ia ai asistente resumir continuar mejorar', run: () => openNoteAI() });
