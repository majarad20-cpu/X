'use strict';

// ---------- Tareas dentro de las notas ----------
// Cualquier línea "- [ ] texto" de una nota es una tarea. Admite:
//   📅 2026-10-08  o  📅 mañana   fecha     ⏰ 17:30  hora      !alta  prioridad
//   #etiqueta                     etiquetas +proyecto proyecto  ✅ 2026-10-07  completada ese día
// En una nota diaria (Diario/AAAA-MM-DD), las tareas sin fecha son de ese día.
//
// findNoteTaskLine(noteId, line, title = null) -> número de línea actual o -1.
//   Antes de tocar una tarea de nota por su número de línea, comprueba que esa línea sigue siendo
//   la tarea (mismo título, como lo da parseNoteTask). Si se movió, busca la más cercana con ese
//   título. Sin `title`, solo comprueba que la línea es una tarea. Notas protegidas: siempre -1.
const NOTE_TASK_RE = /^(\s*)[-*+]\s+\[([ xX/])\]\s+(.*)$/;
let noteTaskCache = { stamp: '', list: [] };

function projectFromToken(text) {
  const m = text.match(/(?:^|\s)\+([\p{L}\p{N}_-]+)/u);
  if (!m) return null;
  const norm = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toLowerCase();
  return state.projects.find((p) => norm(p.name) === norm(m[1])) || state.projects.find((p) => norm(p.name).startsWith(norm(m[1]))) || null;
}

// Al terminar de escribir, las fechas relativas de las tareas («📅 mañana») se fijan como AAAA-MM-DD,
// para que no cambien con los días. En la nota diaria se cuentan desde su día.
function pinNoteDates(note) {
  if (!note || note.enc || !note.body.includes('📅')) return false;
  const daily = note.path.match(/^Diario\/(\d{4}-\d{2}-\d{2})$/);
  let changed = false;
  let fence = false;
  const body = note.body.split('\n').map((line) => {
    if (/^\s*```/.test(line)) fence = !fence;
    if (fence || !NOTE_TASK_RE.test(line)) return line;
    return line.replace(/(📅\s*)([^#!⏰📅✅+]+?)(\s*)(?=[#!⏰📅✅+]|$)/u, (all, mark, v, sp) => {
      // Solo se cambian las palabras de la fecha; lo que sigue («a Juan [[…]]») se queda.
      const d = noteDueSpan(v, daily ? parseKey(daily[1]) : null);
      if (!d || d.iso) return all;
      changed = true;
      return mark + d.due + v.slice(d.len) + sp;
    });
  }).join('\n');
  if (!changed) return false;
  if (typeof noteHistoryCheckpoint === 'function') noteHistoryCheckpoint(note); // Ctrl+Z vuelve al texto escrito (67)
  note.body = body;
  note.updatedAt = Date.now();
  save();
  if (typeof noteHistoryCheckpoint === 'function') noteHistoryCheckpoint(note);
  return true;
}

// Fecha al principio del texto que sigue a 📅: { due, len, iso } o null. Se prueba con las primeras
// palabras (de más a menos) y vale la más larga que sea solo una fecha («mañana», «15 de octubre»).
function noteDueSpan(v, at) {
  const iso = v.match(/^\d{4}-\d{2}-\d{2}(?=\s|$)/);
  if (iso) return { due: iso[0], len: 10, iso: true };
  const ends = [...v.matchAll(/\S+/g)].slice(0, 6).map((m) => m.index + m[0].length);
  for (let k = ends.length - 1; k >= 0; k--) {
    const p = v.slice(0, ends[k]).replace(/[,.;:]+$/, '');
    const r = p && parseInputAt(p, at);
    if (r?.due && !r.time && !r.repeat && !r.priority && !r.projectId && r.title === p.trim()) return { due: r.due, len: p.length, iso: false };
  }
  return null;
}

function parseNoteTask(note, idx, raw) {
  const m = raw.match(NOTE_TASK_RE);
  if (!m || !m[3].trim()) return null;
  let text = m[3];
  let due = null;
  const daily = note.path.match(/^Diario\/(\d{4}-\d{2}-\d{2})$/);
  const dm = text.match(/📅\s*([^#!⏰📅✅+]+?)\s*(?=[#!⏰📅✅+]|$)/u);
  let rest = text;
  if (dm) {
    // Las relativas («mañana», «viernes») se cuentan desde el día de la nota diaria o desde que se creó la nota.
    const d = noteDueSpan(dm[1], daily ? parseKey(daily[1]) : note.createdAt || null);
    due = d?.due || null;
    // Lo que sigue a la fecha es parte del título.
    rest = `${text.slice(0, dm.index)} ${d ? dm[1].slice(d.len) : ''} ${text.slice(dm.index + dm[0].length)}`;
  }
  const time = text.match(/⏰\s*(\d{1,2}:\d{2})/u)?.[1] || null;
  const pr = text.match(/(?:^|\s)!(alta|media|baja)\b/i);
  const doneOn = text.match(/✅\s*(\d{4}-\d{2}-\d{2})/u)?.[1] || null;
  const tags = [...text.matchAll(/(?:^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu)].map((x) => x[1].toLowerCase());
  const project = projectFromToken(text) || state.projects.find((p) => p.noteId === note.id) || null;
  const title = rest
    .replace(/⏰\s*\d{1,2}:\d{2}/u, ' ')
    .replace(/✅\s*\d{4}-\d{2}-\d{2}/u, ' ')
    .replace(/(?:^|\s)!(alta|media|baja)\b/gi, ' ')
    .replace(/(?:^|\s)#[\p{L}_][\p{L}\p{N}_/-]*/gu, ' ')
    .replace(/(?:^|\s)\+[\p{L}\p{N}_-]+/u, ' ')
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    id: `n:${note.id}:${idx}`,
    virtual: true,
    noteId: note.id,
    line: idx,
    title: title || text.trim(),
    done: m[2].toLowerCase() === 'x',
    status: m[2] === '/' ? 'doing' : null,
    doneOn,
    due: due || (daily ? daily[1] : null),
    time,
    priority: pr ? PRIORITY_WORDS[pr[1].toLowerCase()] : 2,
    tags,
    projectId: project?.id || null,
    createdAt: note.createdAt,
  };
}

function noteTasks() {
  const stamp = `${dataRev}:${state.notes.length}:${state.projects.length}`;
  if (noteTaskCache.stamp === stamp) return noteTaskCache.list;
  const list = [];
  // Cada nota se vuelve a leer solo si cambió su texto, su ruta, los proyectos o el día.
  const ctx = `${state.projects.map((p) => `${p.id}=${p.name}`).join('|')}#${dateKey()}`;
  const perNote = new Map();
  state.notes.forEach((note) => {
    const prev = noteTaskCache.perNote?.get(note.id);
    if (prev && prev.body === note.body && prev.path === note.path && prev.ctx === ctx) {
      perNote.set(note.id, prev);
      list.push(...prev.tasks);
      return;
    }
    const tasks = [];
    if (note.body.includes('[')) {
      let inCode = false;
      note.body.split('\n').forEach((line, idx) => {
        if (/^\s*```/.test(line)) inCode = !inCode;
        if (inCode) return;
        const t = parseNoteTask(note, idx, line);
        if (t) tasks.push(t);
      });
    }
    perNote.set(note.id, { body: note.body, path: note.path, ctx, tasks });
    list.push(...tasks);
  });
  noteTaskCache = { stamp, list, perNote };
  return list;
}

// Línea actual de una tarea de nota (ver arriba): la indicada si sigue siendo esa tarea o, si se movió,
// la más cercana con el mismo título (fuera de bloques de código). -1 si ya no está.
function findNoteTaskLine(noteId, line, title = null) {
  const note = noteById(noteId);
  if (!note || note.enc) return -1;
  const lines = note.body.split('\n');
  const ok = (i) => {
    const t = i >= 0 && i < lines.length ? parseNoteTask(note, i, lines[i]) : null;
    return !!t && (title === null || title === undefined || t.title === title);
  };
  const code = new Set();
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) fence = !fence;
    else if (fence) code.add(i);
  });
  if (!code.has(line) && ok(line)) return line;
  if (title === null || title === undefined) return -1;
  for (let d = 1; d < lines.length; d++) {
    for (const i of [line - d, line + d]) if (!code.has(i) && ok(i)) return i;
  }
  return -1;
}

// Marca o desmarca la casilla en el texto de la nota y la cuenta en estadísticas y bitácora.
// Con `title`, si la línea se movió se busca la tarea (findNoteTaskLine); si ya no está, no se toca nada.
function toggleNoteTask(noteId, line, done, title = null) {
  const note = noteById(noteId);
  if (!note) return;
  line = findNoteTaskLine(noteId, line, title);
  if (line < 0) return showToastMessage('La línea cambió: ábrela en su nota.');
  const lines = note.body.split('\n');
  const t = parseNoteTask(note, line, lines[line]);
  if (!t || t.done === done) return;
  const today = dateKey();
  if (done) {
    lines[line] = `${lines[line].replace(/\[[ /]\]/, '[x]').replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u, '')} ✅ ${today}`;
    bump(state.completions, today, 1);
    logEvent('task', t.title, { ref: `${noteId}:${t.title}`, detail: `📝 ${baseName(note.path)}` });
  } else {
    lines[line] = lines[line].replace(/\[[xX]\]/, '[ ]').replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u, '');
    if (t.doneOn) {
      bump(state.completions, t.doneOn, -1);
      unlogEvent('task', `${noteId}:${t.title}`, t.doneOn);
    }
  }
  note.body = lines.join('\n');
  note.updatedAt = Date.now();
  save();
  renderAll();
}

// Quita de su nota la línea de una tarea (con «Deshacer»). Si la línea cambió, no se toca.
function deleteNoteTaskLine(t) {
  const note = noteById(t.noteId);
  const at = findNoteTaskLine(t.noteId, t.line, t.title);
  if (at < 0) return showToastMessage('La línea cambió: ábrela en su nota.');
  const lines = note.body.split('\n');
  if (typeof noteHistoryCheckpoint === 'function') noteHistoryCheckpoint(note);
  withUndo('Línea de la nota borrada', () => {
    lines.splice(at, 1);
    note.body = lines.join('\n');
    note.updatedAt = Date.now();
  });
}

// Abre la nota en modo edición con el cursor en esa línea.
function openNoteAtLine(noteId, line, { newTab = false } = {}) {
  const note = noteById(noteId);
  if (!note) return;
  noteMode.set(note.id, 'edit');
  openNote(note, { newTab });
  const ta = $('#note-editor');
  const pos = note.body.split('\n').slice(0, line).join('\n').length + (line ? 1 : 0);
  const end = pos + (note.body.split('\n')[line] || '').length;
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(end, end);
  $('#note-scroll').scrollTop = Math.max(0, ta.offsetTop + (line / Math.max(1, note.body.split('\n').length)) * ta.scrollHeight - 120);
}

// Tarjeta de una tarea que vive en una nota: se marca aquí, se edita en su nota.
function noteTaskItem(t) {
  const note = noteById(t.noteId);
  const check = el('input', { type: 'checkbox', checked: t.done, ariaLabel: 'Completar' });
  check.addEventListener('change', () => toggleNoteTask(t.noteId, t.line, check.checked, t.title));
  const meta = el('div', { className: 'meta' }, PRIORITY_LABEL[t.priority]);
  if (t.status === 'doing' && !t.done) meta.prepend(el('span', { className: 'doing-badge' }, '◐ En curso'), ' · ');
  if (t.due) {
    const overdue = !t.done && t.due < dateKey();
    meta.append(' · ', el('span', { className: overdue ? 'overdue' : '' }, (overdue ? 'Vencida: ' : '') + formatDue(t.due)));
  }
  if (t.time) meta.append(' · ', el('span', { className: 'at-time' }, `⏰ ${t.time}`));
  const title = el('button', { className: 'title', title: 'Editar en su nota' }, t.title);
  title.addEventListener('click', (e) => openNoteAtLine(t.noteId, t.line, { newTab: e.ctrlKey || e.metaKey }));
  const chips = el('div', { className: 'tags' }, (t.tags || []).map(tagChip));
  const src = el('button', { className: 'tag note-tag', title: `Abrir ${note.path}` }, `📝 ${baseName(note.path)}`);
  src.addEventListener('click', (e) => openNoteAtLine(t.noteId, t.line, { newTab: e.ctrlKey || e.metaKey }));
  chips.prepend(src);
  const project = t.projectId && projectById(t.projectId);
  if (project && openProjectId !== project.id) {
    const pc = el('button', { className: 'tag project-tag', title: `Abrir proyecto ${project.name}` }, `📁 ${project.name}`);
    pc.dataset.pcolor = project.color;
    pc.addEventListener('click', () => openProject(project.id));
    chips.prepend(pc);
  }
  const row = [check, el('div', { className: 'body' }, [title, meta, chips])];
  if (t.done) {
    const drop = el('button', { className: 'done-act danger', title: 'Quitar esta línea de la nota' }, '🗑 Eliminar');
    drop.addEventListener('click', () => deleteNoteTaskLine(t));
    row.push(el('span', { className: 'done-acts' }, drop));
  }
  const li = el('li', { className: `task from-note p${t.priority}${t.done ? ' done' : ''}` }, el('div', { className: 'task-row' }, row));
  li.dataset.id = t.id;
  return li;
}

// ---------- Nota de cada proyecto ----------
function openProjectNote(p) {
  const existing = p.noteId && noteById(p.noteId);
  if (existing) return openNote(existing);
  if (!state.folders.includes('Proyectos')) state.folders.push('Proyectos');
  const note = createNote({
    folder: 'Proyectos',
    title: p.name,
    body: `${p.desc ? `**Objetivo:** ${p.desc}\n\n` : ''}## Tareas\n- [ ] \n\n## Notas\n\n## Enlaces\n`,
    open: false,
  });
  p.noteId = note.id;
  save();
  noteMode.set(note.id, 'edit');
  openNoteAtLine(note.id, note.body.split('\n').findIndex((l) => l.startsWith('- [ ]')));
}

// ---------- Pasar diario, ideas y mapas a notas ----------
function dailyBody(key) {
  const long = parseKey(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const prev = dateKey(addDays(parseKey(key), -1));
  const next = dateKey(addDays(parseKey(key), 1));
  return `# ${long.charAt(0).toUpperCase() + long.slice(1)}\n\n← [[${prev}]] · [[${next}]] →\n\n## 🧠 Vaciado mental\n- \n\n## ✅ Tareas\n- [ ] \n\n## 📝 Notas\n\n`;
}

function dailyNoteFor(key) {
  const existing = findNoteByName(`Diario/${key}`);
  if (existing) return existing;
  if (!state.folders.includes('Diario')) state.folders.push('Diario');
  return createNote({ folder: 'Diario', title: key, body: dailyBody(key), open: false, log: false });
}

function mapToOutline(map) {
  const lines = [];
  const walk = (id, depth) =>
    map.nodes.filter((n) => n.parent === id).forEach((n) => {
      lines.push(`${'  '.repeat(depth)}- ${n.text}`);
      walk(n.id, depth + 1);
    });
  walk('root', 0);
  return lines.join('\n');
}

function importToNotes() {
  const since = state.settings.importedAt || 0;
  const now = Date.now();
  let entries = 0;
  let ideas = 0;
  let maps = 0;
  ['Diario', 'Ideas', 'Mapas'].forEach((f) => {
    if (!state.folders.includes(f)) state.folders.push(f);
  });

  // Diario: cada entrada se añade a la nota diaria de su día, bajo «Diario».
  const byDay = new Map();
  state.journal.filter((e) => e.createdAt > since).sort((a, b) => a.createdAt - b.createdAt).forEach((e) => byDay.set(e.date, [...(byDay.get(e.date) || []), e]));
  byDay.forEach((list, key) => {
    const note = dailyNoteFor(key);
    const blocks = list.map((e) => {
      const time = new Date(e.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      const mood = MOODS.find((m) => m.v === e.mood);
      const head = `### ${JOURNAL_KINDS[e.kind]?.label || 'Entrada'} · ${time}${mood ? ` · ${mood.e}` : ''}`;
      const body = e.text || (e.sections || []).filter((s) => s.a).map((s) => `**${s.q}** ${s.a}`).join('\n\n');
      entries++;
      return `${head}\n${body}`;
    });
    note.body = `${note.body.replace(/\s*$/, '')}\n\n## ✍️ Diario\n${blocks.join('\n\n')}\n`;
    note.updatedAt = now;
  });

  // Ideas: una nota por idea, con su primera línea como título.
  state.ideas.filter((i) => i.createdAt > since).forEach((i) => {
    const [first, ...rest] = i.text.split('\n');
    createNote({
      folder: 'Ideas',
      title: first.slice(0, 60) || 'Idea',
      body: `${rest.join('\n').trim()}${i.tags.length ? `\n\n${i.tags.map((t) => `#${t}`).join(' ')}` : ''}\n`.replace(/^\n+/, ''),
      open: false,
      log: false,
    });
    ideas++;
  });

  // Mapas mentales: como esquema de viñetas.
  state.maps.filter((m) => m.createdAt > since).forEach((m) => {
    createNote({ folder: 'Mapas', title: m.title, body: `${mapToOutline(m)}\n`, open: false, log: false });
    maps++;
  });

  state.settings.importedAt = now;
  save();
  renderAll();
  const parts = [entries && plural(entries, 'entrada del diario', 'entradas del diario'), ideas && plural(ideas, 'idea', 'ideas'), maps && plural(maps, 'mapa', 'mapas')].filter(Boolean);
  $('#import-message').textContent = parts.length ? `Copiado a notas: ${parts.join(', ')}. Los originales siguen en sus secciones.` : 'No hay nada nuevo que copiar desde la última vez.';
  if (parts.length) showLeftPane('files');
}
