'use strict';

// ---------- Claude dentro de una nota ----------
// Un panel al pie de la nota (botón ✨, «/claude» o Ctrl+J) que resume, continúa, mejora, corrige,
// saca tareas, traduce o hace lo que se le pida, sobre el texto seleccionado o sobre toda la nota.
// El resultado se ve antes de aplicarlo y lo anterior queda en el historial de versiones.
// Las notas con contraseña quedan fuera: su texto no sale del dispositivo.
const NOTE_AI_MAX = 30000;
const noteAI = { noteId: null, sel: null, action: null, result: '', busy: false, ctl: null, lang: 'inglés', prompt: '' };

const NOTE_AI_ACTIONS = {
  summary: {
    label: 'Resumir',
    place: 'below',
    heading: '## Resumen',
    ask: (t) => `Resume este texto en español en 3 a 6 viñetas claras («- »), con lo esencial y sin introducción.\n\n<texto>\n${t}\n</texto>`,
  },
  continue: {
    label: 'Continuar escribiendo',
    place: 'cursor',
    ask: (t, ctx) => `Continúa escribiendo este texto desde donde termina, con el mismo tono, idioma y formato Markdown. Escribe uno o dos párrafos (o los elementos de lista que falten). Devuelve solo la continuación, sin repetir lo anterior.\n\n<texto_anterior>\n${ctx.before}\n</texto_anterior>${ctx.after.trim() ? `\n\n<texto_posterior>\n${ctx.after}\n</texto_posterior>` : ''}`,
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
    ask: (t) => `${noteAI.prompt}\n\nResponde en español (salvo que se pida otro idioma), en Markdown, sin introducción ni despedida.\n\n<texto>\n${t}\n</texto>`,
  },
};

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
  const start = editing ? (document.activeElement === ta ? ta.selectionStart : Number(ta.dataset.caret ?? ta.selectionStart)) : note.body.length;
  const end = editing && document.activeElement === ta ? ta.selectionEnd : start;
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
  const scope = noteAI.sel ? `Sobre el texto seleccionado (${plural(noteAI.sel.text.split(/\s+/).filter(Boolean).length, 'palabra', 'palabras')})` : 'Sobre toda la nota';
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
  $('#note-ai-insert').textContent = action?.place === 'cursor' ? 'Insertar en el cursor' : noteAI.sel ? 'Insertar debajo de la selección' : action?.place === 'replace' ? 'Reemplazar la nota' : 'Añadir al final';
  $('#note-ai-copy').hidden = !done;
  $('#note-ai-retry').hidden = !done && !noteAI.error;
}

async function runNoteAI(key) {
  const note = noteById(noteAI.noteId);
  const action = NOTE_AI_ACTIONS[key];
  if (!note || !action || noteAI.busy) return;
  if (key === 'custom' && !noteAI.prompt.trim()) return $('#note-ai-input').focus();
  const source = (noteAI.sel ? noteAI.sel.text : note.body).slice(0, NOTE_AI_MAX);
  if (!source.trim() && key !== 'continue' && key !== 'custom') {
    noteAI.error = 'La nota está vacía: escribe algo primero.';
    return renderNoteAI();
  }
  const ctx = { before: note.body.slice(Math.max(0, noteAI.caret - NOTE_AI_MAX), noteAI.caret), after: note.body.slice(noteAI.caret, noteAI.caret + 4000) };
  noteAI.action = key;
  noteAI.result = '';
  noteAI.error = '';
  noteAI.busy = true;
  noteAI.ctl = new AbortController();
  renderNoteAI();
  try {
    const { text } = await ai.sample(action.ask(source, ctx), {
      signal: noteAI.ctl.signal,
      onText: ({ text: t }) => {
        noteAI.result = t;
        $('#note-ai-result').innerHTML = renderMd(t, { noTasks: true });
      },
    });
    noteAI.result = cleanAIText(text);
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
  note.body = next;
  note.updatedAt = Date.now();
  save();
  await snapshotNote(note, { force: true });
  closeNoteAI();
  if (noteMode.get(note.id) === 'edit') {
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
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'j' && activeNote()) {
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
SLASH_ITEMS.unshift({ when: () => noteAIAvailable(activeNote()), icon: '✨', label: 'Claude…', detail: 'Resumir, continuar, mejorar, sacar tareas, traducir…', keys: 'claude ia ai asistente resumir continuar mejorar', run: () => openNoteAI() });
