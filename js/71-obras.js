'use strict';

// ---------- Ideas: categorías ----------
// Cada idea lleva `cat` (id de la categoría; sin ella, «general»). Las categorías se pueden cambiar
// en este dispositivo y viajan con los ajustes (state.settings.ideaCats).
const IDEA_CATS_DEFAULT = [
  { id: 'general', icon: '💡', label: 'General' },
  { id: 'ensayo', icon: '✍️', label: 'Ensayo' },
  { id: 'libro', icon: '📚', label: 'Libro' },
  { id: 'relato', icon: '📖', label: 'Relato' },
  { id: 'poema', icon: '🎵', label: 'Poema / canción' },
  { id: 'negocio', icon: '💼', label: 'Negocio' },
  { id: 'investigacion', icon: '🎓', label: 'Investigación' },
  { id: 'creativo', icon: '🎬', label: 'Proyecto creativo' },
  { id: 'citas', icon: '🗣️', label: 'Frases y citas' },
];
let ideaCat = null; // filtro por categoría

const ideaCats = () => state.settings.ideaCats || IDEA_CATS_DEFAULT;
const ideaCatOf = (idea) => (ideaCats().some((c) => c.id === idea.cat) ? idea.cat : 'general');
const ideaCatInfo = (id) => ideaCats().find((c) => c.id === id) || ideaCats()[0] || IDEA_CATS_DEFAULT[0];

function setIdeaCats(list) {
  state.settings.ideaCats = list;
  save();
  renderIdeas();
}

function setIdeaCat(idea, cat) {
  if (cat === 'general') delete idea.cat;
  else idea.cat = cat;
  idea.updatedAt = Date.now();
  save();
  renderIdeas();
}

// Chips de categorías encima de las ideas (con cuántas hay) y el selector del formulario.
function renderIdeaCats() {
  const box = $('#idea-cats');
  if (!box) return;
  const cats = ideaCats();
  if (ideaCat && !cats.some((c) => c.id === ideaCat)) ideaCat = null;
  const count = (id) => state.ideas.filter((i) => ideaCatOf(i) === id).length;
  const chip = (id, text, title) => {
    const b = el('button', { className: `tag idea-cat${ideaCat === id ? ' active' : ''}`, title }, text);
    if (id) b.dataset.cat = id;
    b.addEventListener('click', () => {
      ideaCat = ideaCat === id ? null : id;
      syncIdeaCatSelect();
      renderIdeas();
    });
    return b;
  };
  const add = el('button', { className: 'tag idea-cat-add', title: 'Nueva categoría' }, '＋');
  add.addEventListener('click', newIdeaCat);
  box.replaceChildren(
    chip(null, `Todas · ${state.ideas.length}`, 'Todas las categorías'),
    ...cats.map((c) => chip(c.id, `${c.icon} ${c.label}${count(c.id) ? ` · ${count(c.id)}` : ''}`, 'Clic derecho: renombrar, cambiar icono o borrar')),
    add
  );
  const sel = $('#idea-cat');
  const keep = sel.value;
  sel.replaceChildren(...cats.map((c) => el('option', { value: c.id }, `${c.icon} ${c.label}`)));
  sel.value = cats.some((c) => c.id === keep) ? keep : ideaCat || 'general';
}
const syncIdeaCatSelect = () => ideaCat && ($('#idea-cat').value = ideaCat);

const catSlug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
// «🎨 Pintura» → icono y nombre; sin emoji delante, un icono por defecto.
function catFromText(text, fallbackIcon = '🏷️') {
  const m = text.trim().match(/^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.*)$/u);
  return m && m[2] ? { icon: m[1], label: m[2].trim() } : { icon: fallbackIcon, label: text.trim() };
}

function newIdeaCat() {
  promptText({
    placeholder: 'Nueva categoría (p. ej. «🎨 Pintura» o «Filosofía»)',
    action: 'Crear categoría',
    onSubmit: (q) => {
      const { icon, label } = catFromText(q);
      if (!label) return;
      const cats = ideaCats();
      let id = catSlug(label);
      if (cats.some((c) => c.id === id)) id = `${id}-${uid().slice(0, 4)}`;
      setIdeaCats([...cats, { id, icon, label }]);
    },
  });
}

function ideaCatMenu(id, anchor) {
  const cats = ideaCats();
  const c = cats.find((x) => x.id === id);
  if (!c) return;
  showMenu(anchor, [
    { label: '✏️ Renombrar o cambiar icono…', action: () => promptText({
      placeholder: 'Icono y nombre (p. ej. «📚 Novela»)',
      initial: `${c.icon} ${c.label}`,
      action: 'Guardar',
      onSubmit: (q) => {
        const v = catFromText(q, c.icon);
        if (v.label) setIdeaCats(cats.map((x) => (x.id === id ? { ...x, ...v } : x)));
      },
    }) },
    { label: '⬆ Mover antes', disabled: cats[0].id === id, action: () => {
      const i = cats.indexOf(c);
      const next = cats.slice();
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      setIdeaCats(next);
    } },
    { sep: true },
    { label: '🗑 Borrar categoría (sus ideas pasan a General)', danger: true, disabled: id === 'general', action: () => {
      state.ideas.forEach((i) => i.cat === id && (delete i.cat, (i.updatedAt = Date.now())));
      if (ideaCat === id) ideaCat = null;
      setIdeaCats(cats.filter((x) => x.id !== id));
    } },
    { label: '↺ Volver a las categorías de fábrica', action: () => {
      delete state.settings.ideaCats;
      save();
      renderIdeas();
    } },
  ]);
}
$('#idea-cats')?.addEventListener('contextmenu', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  ideaCatMenu(b.dataset.cat, { x: e.clientX, y: e.clientY });
});

// Etiqueta en la tarjeta (un clic filtra por esa categoría).
function ideaCatBadge(idea) {
  const c = ideaCatInfo(ideaCatOf(idea));
  const b = el('button', { className: 'idea-cat-badge', title: 'Filtrar por esta categoría (clic derecho en la idea para cambiarla)' }, `${c.icon} ${c.label}`);
  b.addEventListener('click', () => {
    ideaCat = c.id;
    renderIdeas();
  });
  return b;
}

const pickIdeaCat = (idea) => pickFrom('Categoría de la idea…', ideaCats().map((c) => ({ label: `${c.icon} ${c.label}${ideaCatOf(idea) === c.id ? '  ✓' : ''}`, action: () => setIdeaCat(idea, c.id) })));

// ---------- Mis obras ----------
// Cada obra es una nota «Obras/<Título>/<Título>» con las propiedades obra (tipo), estado y objetivo
// (palabras). Sus capítulos son las notas de esa carpeta, en el orden de la lista «## Capítulos».
// Así todo se sincroniza, va a Drive como .md y se abre en Obsidian sin nada especial.
const WORK_TYPES = [
  { id: 'libro', icon: '📚', label: 'Libro', goal: 50000, chapters: true },
  { id: 'ensayo', icon: '✍️', label: 'Ensayo', goal: 3000 },
  { id: 'relato', icon: '📖', label: 'Relato', goal: 5000 },
  { id: 'articulo', icon: '📰', label: 'Artículo', goal: 1500 },
  { id: 'poema', icon: '🎵', label: 'Poema / canción', goal: 200 },
  { id: 'guion', icon: '🎬', label: 'Guion', goal: 15000, chapters: true },
  { id: 'tesis', icon: '🎓', label: 'Tesis / investigación', goal: 30000, chapters: true },
  { id: 'otro', icon: '🖋️', label: 'Otro', goal: 2000 },
];
const WORK_STATES = [
  { id: 'idea', icon: '💭', label: 'Idea' },
  { id: 'borrador', icon: '✏️', label: 'Borrador' },
  { id: 'revision', icon: '🔍', label: 'Revisión' },
  { id: 'terminado', icon: '✅', label: 'Terminado' },
  { id: 'publicado', icon: '📢', label: 'Publicado' },
];
const workType = (id) => WORK_TYPES.find((t) => t.id === id) || WORK_TYPES.at(-1);
const workState = (id) => WORK_STATES.find((s) => s.id === id) || WORK_STATES[0];
let worksOpen = null; // id de la nota de la obra abierta
let worksFilter = null;

const isWork = (n) => !!propOf(n, 'obra') && n.path.startsWith('Obras/');
const allWorks = () => state.notes.filter(isWork);

// Palabras de un texto Markdown (sin propiedades, código, enlaces de imagen ni marcas).
function mdWords(text) {
  if (!text) return 0;
  const { end } = parseProps(text);
  // Sin títulos ni recuadros [!…] (sinopsis, avisos): solo cuenta el texto de la obra.
  const body = text.split('\n').slice(end > 0 ? end + 1 : 0).join('\n')
    .replace(/^>\s*\[![^\n]*(?:\n>[^\n]*)*/gm, ' ')
    .replace(/^#{1,6}\s.*$/gm, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/[#>*_`~=|-]+/g, ' ');
  return (body.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length;
}

// Texto propio de la obra (sin la lista de capítulos).
const workOwnText = (text) => (text || '').replace(/^## Capítulos\n(?:(?!## ).*\n?)*/m, '');

function workChapters(work) {
  const text = noteText(work);
  const folder = folderOf(work.path);
  const inFolder = state.notes.filter((n) => n.id !== work.id && folderOf(n.path) === folder);
  const listed = [];
  const sec = text?.match(/^## Capítulos\n((?:(?!## ).*\n?)*)/m)?.[1] || '';
  for (const m of sec.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const n = findNoteByName(m[1]);
    if (n && n.id !== work.id && folderOf(n.path) === folder && !listed.includes(n)) listed.push(n);
  }
  const rest = inFolder.filter((n) => !listed.includes(n)).sort((a, b) => a.path.localeCompare(b.path, 'es', { numeric: true }));
  return [...listed, ...rest];
}

// Vuelve a escribir la lista «## Capítulos» de la obra con este orden.
function writeChapterList(work, chapters) {
  const list = chapters.map((n, i) => `${i + 1}. [[${n.path}|${baseName(n.path)}]]`).join('\n');
  return peEdit(work, (lines) => {
    const text = lines.join('\n');
    const block = `## Capítulos\n${list}\n`;
    const next = /^## Capítulos\n/m.test(text)
      ? text.replace(/^## Capítulos\n(?:(?!## ).*\n?)*/m, `${block}\n`)
      : `${text.replace(/\n*$/, '')}\n\n${block}`;
    lines.splice(0, lines.length, ...next.replace(/\n{3,}/g, '\n\n').split('\n'));
  });
}

function workStats(work) {
  const chapters = workChapters(work);
  const words = mdWords(workOwnText(noteText(work))) + chapters.reduce((n, c) => n + mdWords(noteText(c)), 0);
  const goal = Number(String(propOf(work, 'objetivo')).replace(/\D/g, '')) || workType(propOf(work, 'obra')).goal;
  const time = [work, ...chapters].reduce((t, n) => {
    const x = typeof pomoTotals === 'function' ? pomoTotals('note', n.id) : { minutes: 0, count: 0 };
    return { minutes: t.minutes + x.minutes, count: t.count + x.count };
  }, { minutes: 0, count: 0 });
  const last = Math.max(work.updatedAt || 0, ...chapters.map((c) => c.updatedAt || 0));
  return { chapters, words, goal, pct: Math.min(100, Math.round((words / goal) * 100)), time, last };
}

function createWork(title, type = 'libro', { idea = null } = {}) {
  const t = workType(type);
  const name = cleanName(title) || 'Sin título';
  if (allWorks().some((w) => baseName(w.path).toLowerCase() === name.toLowerCase())) {
    showToastMessage(`Ya tienes una obra «${name}»`);
    return null;
  }
  const folder = `Obras/${name}`;
  ['Obras', folder].forEach((f) => state.folders.includes(f) || state.folders.push(f));
  const head = `---\nobra: ${t.id}\nestado: idea\nobjetivo: ${t.goal}\n---\n# ${name}\n\n> [!abstract] De qué trata\n> ${idea ? idea.text.split('\n')[0] : ''}\n`;
  const work = createNote({ folder, title: name, body: t.chapters ? `${head}\n## Capítulos\n` : `${head}\n`, open: false, log: false });
  logEvent('note', `Nueva obra: ${name}`, { ref: work.id });
  if (t.chapters) addChapter(work, 'Capítulo 1', { open: false });
  if (idea) linkIdeaToWork(idea, work, { quiet: true });
  save();
  return work;
}

function addChapter(work, title, { open = true } = {}) {
  const chapters = workChapters(work);
  const ch = createNote({ folder: folderOf(work.path), title: title || `Capítulo ${chapters.length + 1}`, body: `# ${title || `Capítulo ${chapters.length + 1}`}\n\n`, open: false, log: false });
  writeChapterList(work, [...chapters, ch]);
  if (open) openNote(ch);
  return ch;
}

function moveChapter(work, ch, dir) {
  const list = workChapters(work);
  const i = list.indexOf(ch);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  writeChapterList(work, list);
  renderWorks();
}

function linkIdeaToWork(idea, work, { quiet = false } = {}) {
  idea.obra = work.id;
  idea.updatedAt = Date.now();
  save();
  if (!quiet) showToastMessage(`Idea enviada a «${baseName(work.path)}»`);
  renderIdeas();
}

function pickWorkForIdea(idea) {
  pickFrom('Enviar la idea a la obra…', [
    ...allWorks().map((w) => ({ label: `${workType(propOf(w, 'obra')).icon} ${baseName(w.path)}${idea.obra === w.id ? '  ✓' : ''}`, action: () => linkIdeaToWork(idea, w) })),
    { label: '＋ Nueva obra a partir de esta idea…', action: () => pickFrom('Tipo de obra…', WORK_TYPES.map((t) => ({
      label: `${t.icon} ${t.label}`,
      action: () => {
        const w = createWork(idea.text.split('\n')[0].slice(0, 80), t.id, { idea });
        if (w) openWork(w.id);
      },
    }))) },
  ]);
}

function openWork(id) {
  worksOpen = id;
  ideaView = 'works';
  $$('[data-ideaview]').forEach((b) => {
    b.classList.toggle('active', b.dataset.ideaview === 'works');
    b.ariaPressed = String(b.dataset.ideaview === 'works');
  });
  showView('ideas');
  renderIdeas();
}

async function exportWork(work, kind) {
  const { chapters } = workStats(work);
  const name = baseName(work.path);
  if (kind === 'pdf') return exportNotesPdf([work, ...chapters], { title: name, toc: chapters.length > 1 });
  const strip = (t) => { const { end } = parseProps(t || ''); return (t || '').split('\n').slice(end > 0 ? end + 1 : 0).join('\n').trim(); };
  const md = [strip(workOwnText(noteText(work))), ...chapters.map((c) => strip(noteText(c)))].filter(Boolean).join('\n\n---\n\n');
  return offerDownload(`${name}.md`, md, 'text/markdown');
}

const wordsText = (n) => n.toLocaleString('es');

function workCard(work) {
  const s = workStats(work);
  const t = workType(propOf(work, 'obra'));
  const st = workState(propOf(work, 'estado'));
  const card = el('button', { className: 'card work-card' }, [
    el('div', { className: 'work-top' }, [el('span', { className: 'work-type' }, `${t.icon} ${t.label}`), el('span', { className: `work-state ws-${st.id}` }, `${st.icon} ${st.label}`)]),
    el('strong', { className: 'work-title' }, baseName(work.path)),
    el('div', { className: 'work-bar', title: `${s.pct} %` }, el('i', { style: `width:${s.pct}%` })),
    el('span', { className: 'muted work-meta' }, [`${wordsText(s.words)} / ${wordsText(s.goal)} palabras`, s.chapters.length ? ` · ${plural(s.chapters.length, 'capítulo', 'capítulos')}` : '', s.time.minutes ? ` · ⏱ ${formatMinutes(s.time.minutes)}` : ''].join('')),
  ]);
  card.addEventListener('click', () => {
    worksOpen = work.id;
    renderWorks();
  });
  card.dataset.relType = 'note';
  card.dataset.relId = work.id;
  return card;
}

let worksRendering = false;
function renderWorks() {
  // Al quitar un campo con foco salta su «change» (blur): no se vuelve a dibujar a medias.
  if (worksRendering) return;
  worksRendering = true;
  try {
    renderWorksNow();
  } finally {
    worksRendering = false;
  }
}

function renderWorksNow() {
  const pane = $('#ideas-works-pane');
  const work = worksOpen && noteById(worksOpen);
  if (worksOpen && (!work || !isWork(work))) worksOpen = null;
  if (worksOpen) return pane.replaceChildren(...workDetail(work));
  const type = el('select', { ariaLabel: 'Tipo de obra' }, WORK_TYPES.map((t) => el('option', { value: t.id }, `${t.icon} ${t.label}`)));
  const title = el('input', { type: 'text', placeholder: 'Título de tu nueva obra (p. ej. «Cartas a un joven»)', maxLength: 80, required: true, ariaLabel: 'Título de la obra' });
  const form = el('form', { className: 'card row work-form' }, [title, type, el('button', { type: 'submit', className: 'primary' }, 'Crear obra')]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const w = createWork(title.value, type.value);
    if (w) {
      worksOpen = w.id;
      renderWorks();
    }
  });
  const works = allWorks().sort((a, b) => workStats(b).last - workStats(a).last);
  const filters = el('div', { className: 'tag-filter' }, [null, ...WORK_STATES].map((s) => {
    const n = s ? works.filter((w) => workState(propOf(w, 'estado')).id === s.id).length : works.length;
    const b = el('button', { className: `tag${worksFilter === (s?.id ?? null) ? ' active' : ''}` }, s ? `${s.icon} ${s.label}${n ? ` · ${n}` : ''}` : `Todas · ${n}`);
    b.addEventListener('click', () => {
      worksFilter = s?.id ?? null;
      renderWorks();
    });
    return b;
  }));
  const shown = works.filter((w) => !worksFilter || workState(propOf(w, 'estado')).id === worksFilter);
  pane.replaceChildren(
    form,
    ...(works.length ? [filters] : []),
    shown.length ? el('div', { className: 'work-grid' }, shown.map(workCard)) : el('p', { className: 'empty' }, works.length ? 'Ninguna obra en este estado.' : 'Aquí van tus textos propios: ensayos, libros, relatos, poemas… Crea la primera arriba.')
  );
}

function workDetail(work) {
  const s = workStats(work);
  const name = baseName(work.path);
  const back = el('button', { className: 'link back-link' }, '← Mis obras');
  back.addEventListener('click', () => {
    worksOpen = null;
    renderWorks();
  });
  const sel = (key, list, cur) => {
    const x = el('select', { ariaLabel: key }, list.map((o) => el('option', { value: o.id }, `${o.icon} ${o.label}`)));
    x.value = cur;
    x.addEventListener('change', () => {
      peSet(work, key, 'text', x.value);
      renderWorks();
    });
    return x;
  };
  const goal = el('input', { type: 'number', min: 50, step: 50, value: s.goal, className: 'work-goal', ariaLabel: 'Objetivo de palabras' });
  goal.addEventListener('change', () => {
    const v = Math.max(50, Math.round(Number(goal.value) || 0));
    if (v === s.goal) return;
    peSet(work, 'objetivo', 'number', String(v));
    renderWorks();
  });
  const btn = (label, fn, cls = '') => {
    const b = el('button', { className: cls }, label);
    b.addEventListener('click', fn);
    return b;
  };
  const chapters = s.chapters.map((c, i) => {
    const row = el('li', { className: 'work-ch' }, [
      el('span', { className: 'muted work-ch-n' }, `${i + 1}.`),
      btn(baseName(c.path), () => openNote(c), 'link work-ch-name'),
      el('span', { className: 'muted' }, `${wordsText(mdWords(noteText(c)))} pal.`),
      btn('↑', () => moveChapter(work, c, -1), 'icon-link'),
      btn('↓', () => moveChapter(work, c, 1), 'icon-link'),
    ]);
    row.children[3].disabled = i === 0;
    row.children[4].disabled = i === s.chapters.length - 1;
    row.children[3].title = 'Subir';
    row.children[4].title = 'Bajar';
    row.dataset.relType = 'note';
    row.dataset.relId = c.id;
    return row;
  });
  const addCh = btn('＋ Añadir capítulo', () => promptText({
    placeholder: `Título del capítulo (p. ej. «Capítulo ${s.chapters.length + 1}: El viaje»)`,
    initial: `Capítulo ${s.chapters.length + 1}`,
    action: 'Añadir capítulo',
    onSubmit: (q) => addChapter(work, q),
  }));
  const ideas = state.ideas.filter((i) => i.obra === work.id);
  const ideaInput = el('input', { type: 'text', placeholder: 'Apunta una idea para esta obra…', maxLength: 2000, ariaLabel: 'Nueva idea para la obra' });
  const ideaForm = el('form', { className: 'row work-idea-form' }, [ideaInput, el('button', { type: 'submit' }, 'Añadir')]);
  ideaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!ideaInput.value.trim()) return;
    const idea = { id: uid(), ...extractTags(ideaInput.value), pinned: false, obra: work.id, createdAt: Date.now(), updatedAt: Date.now() };
    const t = workType(propOf(work, 'obra'));
    if (ideaCats().some((c) => c.id === t.id)) idea.cat = t.id;
    state.ideas.push(idea);
    save();
    renderWorks();
  });
  const ideaRows = ideas.map((i) => {
    const rm = btn('Quitar', () => {
      delete i.obra;
      i.updatedAt = Date.now();
      save();
      renderWorks();
    }, 'link');
    const row = el('li', { className: 'work-idea' }, [el('span', {}, i.text.split('\n')[0]), rm]);
    row.dataset.relType = 'idea';
    row.dataset.relId = i.id;
    return row;
  });
  const del = btn('🗑 Borrar obra…', () => {
    const notes = [work, ...s.chapters];
    showMenu(del, [{ label: `Mover a la papelera «${name}» y ${plural(s.chapters.length, 'capítulo', 'capítulos')}`, danger: true, action: () => {
      if (typeof trashNotes === 'function') trashNotes(notes);
      else notes.forEach(deleteNote);
      worksOpen = null;
      renderAll();
    } }]);
  }, 'link danger-link');
  return [
    el('div', { className: 'work-head' }, [back, el('h2', { className: 'work-name' }, name)]),
    el('div', { className: 'card work-panel' }, [
      el('div', { className: 'row work-props' }, [sel('obra', WORK_TYPES, workType(propOf(work, 'obra')).id), sel('estado', WORK_STATES, workState(propOf(work, 'estado')).id), el('label', { className: 'muted work-goal-label' }, ['Objetivo ', goal, ' palabras'])]),
      el('div', { className: 'work-bar big', title: `${s.pct} %` }, el('i', { style: `width:${s.pct}%` })),
      el('p', { className: 'muted' }, `${wordsText(s.words)} de ${wordsText(s.goal)} palabras (${s.pct} %)${s.time.minutes ? ` · ⏱ ${formatMinutes(s.time.minutes)} escribiendo` : ''}${s.last ? ` · última vez ${new Date(s.last).toLocaleDateString('es', { day: 'numeric', month: 'short' })}` : ''}`),
      el('div', { className: 'row work-actions' }, [
        btn('📝 Abrir el texto', () => openNote(work), 'primary'),
        ...(typeof pomoStart === 'function' ? [btn('▶ Pomodoro escribiendo', () => pomoStart('note', work))] : []),
        btn('⬇ PDF', () => exportWork(work, 'pdf')),
        btn('⬇ Markdown', () => exportWork(work, 'md')),
      ]),
    ]),
    el('h3', { className: 'section-title' }, `Capítulos${s.chapters.length ? ` · ${s.chapters.length}` : ''}`),
    s.chapters.length ? el('ol', { className: 'work-chapters card' }, chapters) : el('p', { className: 'muted' }, 'Sin capítulos: el texto va en la propia nota. Si la obra crece, divídela en capítulos.'),
    addCh,
    el('h3', { className: 'section-title' }, `💡 Ideas para esta obra${ideas.length ? ` · ${ideas.length}` : ''}`),
    ideaForm,
    ideas.length ? el('ul', { className: 'work-ideas card' }, ideaRows) : el('p', { className: 'muted' }, 'Manda aquí ideas con clic derecho › «✍️ Enviar a obra…».'),
    el('div', { className: 'row' }, [del]),
  ];
}

// Clic derecho en una idea: categoría y obra.
CTX_MENU_EXTRA.push((kind, x) => (kind === 'idea' ? [
  { sep: true },
  { label: `🏷 Categoría: ${ideaCatInfo(ideaCatOf(x)).label}…`, action: () => pickIdeaCat(x) },
  { label: x.obra && noteById(x.obra) ? `✍️ Obra: ${baseName(noteById(x.obra).path)}…` : '✍️ Enviar a obra…', action: () => pickWorkForIdea(x) },
] : []));

COMMANDS_EXTRA.push(() => [
  { label: 'Mis obras (ensayos, libros, relatos…)', action: () => openWork(null) },
  { label: 'Nueva obra…', action: () => pickFrom('Tipo de obra…', WORK_TYPES.map((t) => ({ label: `${t.icon} ${t.label}`, action: () => promptText({ placeholder: `Título del ${t.label.toLowerCase()}`, action: 'Crear obra', onSubmit: (q) => { const w = createWork(q, t.id); if (w) openWork(w.id); } }) }))) },
]);
