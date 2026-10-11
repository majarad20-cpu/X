'use strict';

// ---------- Bases: bases de datos de notas con su propia sección ----------
// Como los Lienzos: se abren desde la barra de la izquierda, sin pasar por ninguna nota. Cada base
// guarda sus vistas (tabla, tablero Kanban, galería, calendario, lista o tareas) en una nota de la
// carpeta «Bases» (así se sincroniza, va a Drive y se abre en Obsidian), pero aquí se ve y se usa
// a pantalla completa: pestañas de vistas, «＋ Nueva entrada», ⚙ configurar y ＋ Vista.
ICONS.database = '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>';
Object.assign(VIEW_TITLES, { bases: 'Bases' });
Object.assign(VIEW_ICONS, { bases: 'database' });
Object.assign(VIEW_RENDER, { bases: renderBases });
$('#views-pane main').append(el('section', { id: 'view-bases', className: 'view' }));

const basesRib = el('button', { className: 'rib', title: 'Bases: tus notas como tabla, tablero, galería o calendario', ariaLabel: 'Bases' }, [ico('database'), el('span', { className: 'rib-label' }, 'Bases')]);
basesRib.dataset.view = 'bases';
basesRib.addEventListener('click', (e) => showView('bases', { newTab: e.ctrlKey || e.metaKey }));
$('.ribbon [data-view="canvas"]')?.after(basesRib);

const BASE_FOLDER = 'Bases';
const bases = { open: null, tab: new Map(), count: new Map() };
const isBase = (n) => folderOf(n.path) === BASE_FOLDER && !n.enc;
const allBases = () => state.notes.filter(isBase).sort((a, b) => b.updatedAt - a.updatedAt);

// Vistas de una base: sus bloques de consulta, con el nombre del título «## …» de justo encima.
function baseViews(note) {
  const text = noteText(note) || '';
  const lines = text.split('\n');
  return qbFences(lines).map((f) => {
    let i = f.from - 1;
    while (i >= 0 && !lines[i].trim()) i--;
    const h = i >= 0 && lines[i].match(/^#{2,4}\s+(.+)$/);
    return { ...f, name: h ? h[1].trim() : qbKind(f.kind).label, headLine: h ? i : -1 };
  });
}
const viewFolder = (v) => qbParse(v.kind, v.code).folder || '';

// ---------- Plantillas ----------
const tbl = (folder, cols, extra = {}) => qbEmit({ ...qbModel('tabla'), folder, columns: ['Nota', ...cols], ...extra });
const brd = (folder, group, cols, show) => qbEmit({ ...qbModel('tablero'), folder, group, boardCols: cols, show });
const gal = (folder, show) => qbEmit({ ...qbModel('galeria'), folder, show });
const calv = (folder, dateProp, show = []) => qbEmit({ ...qbModel('calendario'), folder, dateProp, show });
const BASE_TEMPLATES = [
  { icon: '📚', name: 'Biblioteca', folder: 'Biblioteca', props: { autor: '', estado: 'Por leer', puntuacion: '', genero: '' }, sample: { title: 'Cien años de soledad', autor: 'Gabriel García Márquez', estado: 'Leído', puntuacion: '5', genero: 'Novela' },
    views: (f) => [['Todos', tbl(f, ['autor', 'estado', 'puntuacion', 'genero'])], ['Por estado', brd(f, 'estado', 'Por leer, Leyendo, Leído', ['autor'])], ['Portadas', gal(f, ['autor'])]] },
  { icon: '🎬', name: 'Películas y series', folder: 'Películas y series', props: { tipo: 'Película', estado: 'Pendiente', puntuacion: '', plataforma: '' }, sample: { title: 'Interstellar', tipo: 'Película', estado: 'Visto', puntuacion: '5', plataforma: '' },
    views: (f) => [['Todas', tbl(f, ['tipo', 'estado', 'puntuacion', 'plataforma'])], ['Por estado', brd(f, 'estado', 'Pendiente, Viendo, Visto', ['tipo'])]] },
  { icon: '🍳', name: 'Recetas', folder: 'Recetas', props: { categoria: '', tiempo: '', dificultad: 'Fácil' }, sample: { title: 'Tortilla de patatas', categoria: 'Plato principal', tiempo: '40 min', dificultad: 'Media' },
    views: (f) => [['Galería', gal(f, ['categoria', 'tiempo'])], ['Tabla', tbl(f, ['categoria', 'tiempo', 'dificultad'])]] },
  { icon: '👥', name: 'Contactos', folder: 'Contactos', props: { email: '', telefono: '', empresa: '', cumpleanos: '' }, sample: { title: 'Ana Pérez', email: '', telefono: '', empresa: '', cumpleanos: '' },
    views: (f) => [['Agenda', tbl(f, ['email', 'telefono', 'empresa', 'cumpleanos'])], ['Cumpleaños', calv(f, 'cumpleanos')]] },
  { icon: '🎓', name: 'Cursos y estudios', folder: 'Cursos', props: { plataforma: '', estado: 'Por empezar', progreso: '' }, sample: { title: 'Curso de inglés B2', plataforma: '', estado: 'En curso', progreso: '30 %' },
    views: (f) => [['Por estado', brd(f, 'estado', 'Por empezar, En curso, Terminado', ['plataforma', 'progreso'])], ['Tabla', tbl(f, ['plataforma', 'estado', 'progreso'])]] },
  { icon: '🚀', name: 'Proyectos personales', folder: 'Proyectos personales', props: { estado: 'Idea', prioridad: 'Media', fecha: '' }, sample: { title: 'Aprender a tocar la guitarra', estado: 'En marcha', prioridad: 'Alta', fecha: '' },
    views: (f) => [['Kanban', brd(f, 'estado', 'Idea, En marcha, En pausa, Hecho', ['prioridad'])], ['Tabla', tbl(f, ['estado', 'prioridad', 'fecha'])], ['Calendario', calv(f, 'fecha', ['estado'])]] },
  { icon: '✈️', name: 'Viajes', folder: 'Viajes', props: { destino: '', fecha: '', presupuesto: '', estado: 'Soñando' }, sample: { title: 'Japón en primavera', destino: 'Japón', fecha: '', presupuesto: '2500', estado: 'Planeando' },
    views: (f) => [['Viajes', tbl(f, ['destino', 'fecha', 'presupuesto', 'estado'])], ['Por estado', brd(f, 'estado', 'Soñando, Planeando, Hecho', ['destino'])], ['Calendario', calv(f, 'fecha', ['destino'])]] },
];

const yamlLine = (k, v) => `${k}: ${v === '' ? '' : yamlScalar(String(v))}`;
function propsBlock(props) {
  const keys = Object.keys(props);
  return keys.length ? `---\n${keys.map((k) => yamlLine(k, props[k])).join('\n')}\n---\n` : '';
}

function createBase({ name, folder, views, props = null, sample = null, icon = '📇' }) {
  const title = cleanName(name) || 'Base';
  if (allBases().some((b) => baseName(b.path).toLowerCase() === title.toLowerCase())) {
    showToastMessage(`Ya tienes una base «${title}»`);
    return null;
  }
  [BASE_FOLDER, folder].forEach((f) => f && !state.folders.includes(f) && state.folders.push(f));
  const keys = props ? Object.keys(props) : [];
  const body = `${propsBlock({ icono: icon, ...(keys.length ? { campos: keys.join(', ') } : {}) })}# ${title}\n\n${views.map(([n, code]) => `## ${n}\n\n${code}\n`).join('\n')}`;
  const note = createNote({ folder: BASE_FOLDER, title, body, open: false, log: false });
  if (sample && folder) {
    const { title: st, ...vals } = sample;
    createNote({ folder, title: st, body: `${propsBlock({ ...props, ...vals })}\n`, open: false, log: false });
  }
  logEvent('note', `Nueva base: ${title}`, { ref: note.id });
  save();
  return note;
}

function newBaseMenu() {
  pickFrom('Nueva base…', [
    ...BASE_TEMPLATES.map((t) => ({ label: `${t.icon} ${t.name}`, detail: `Carpeta «${t.folder}»`, action: () => {
      const b = createBase({ name: t.name, folder: t.folder, views: t.views(t.folder), props: t.props, sample: t.sample, icon: t.icon });
      if (b) openBase(b.id);
    } })),
    { label: '📇 Base en blanco con una carpeta…', action: () => pickFrom('¿Qué carpeta de notas quieres ver como base?', [...allFolders().filter((f) => f !== BASE_FOLDER), '＋ Carpeta nueva…'].map((f) => ({
      label: f,
      action: () => {
        const go = (folder) => {
          const b = createBase({ name: baseName(folder), folder, views: [['Tabla', tbl(folder, [])], ['Tablero', brd(folder, 'estado', '', [])]] });
          if (b) openBase(b.id);
        };
        if (f.startsWith('＋')) promptText({ placeholder: 'Nombre de la carpeta nueva', action: 'Crear', onSubmit: (q) => go(cleanName(q)) });
        else go(f);
      },
    }))) },
  ]);
}

// ---------- Pantallas ----------
function openBase(id) {
  bases.open = id;
  showView('bases');
  renderBases();
}

function renderBases() {
  const box = $('#view-bases');
  if (!box) return;
  const base = bases.open && noteById(bases.open);
  if (bases.open && (!base || !isBase(base))) bases.open = null;
  if (bases.open) return box.replaceChildren(...baseScreen(base));
  const add = el('button', { className: 'primary' }, '＋ Nueva base');
  add.addEventListener('click', newBaseMenu);
  const list = allBases();
  box.replaceChildren(
    el('div', { className: 'bases-head' }, [el('div', {}, [el('h2', { className: 'bases-title' }, '📇 Bases'), el('p', { className: 'muted' }, 'Tus notas como base de datos: tabla, tablero Kanban, galería o calendario, cada una con sus vistas. Empieza con una plantilla o con una carpeta que ya tengas.')]), add]),
    list.length
      ? el('div', { className: 'bases-grid' }, list.map((b) => {
          const views = baseViews(b);
          const card = el('button', { className: 'card base-card' }, [
            el('span', { className: 'base-card-icon' }, String(propOf(b, 'icono') || '📇')),
            el('strong', {}, baseName(b.path)),
            el('span', { className: 'muted' }, views.length ? views.map((v) => `${qbKind(v.kind).icon} ${v.name}`).join(' · ') : 'Sin vistas'),
          ]);
          card.addEventListener('click', () => openBase(b.id));
          card.dataset.relType = 'note';
          card.dataset.relId = b.id;
          return card;
        }))
      : el('p', { className: 'empty' }, 'Aún no tienes bases. Crea una con «＋ Nueva base»: biblioteca, películas, recetas, contactos, cursos, proyectos, viajes… o la tuya.')
  );
}

function baseScreen(note) {
  const views = baseViews(note);
  // Una vista recién añadida queda elegida.
  const before = bases.count.get(note.id);
  let tab = bases.tab.get(note.id) ?? 0;
  if (before !== undefined && views.length > before) tab = views.length - 1;
  tab = Math.max(0, Math.min(tab, views.length - 1));
  bases.tab.set(note.id, tab);
  bases.count.set(note.id, views.length);
  const v = views[tab];
  const btn = (label, fn, cls = '', title = '') => {
    const b = el('button', { className: cls, title }, label);
    b.addEventListener('click', fn);
    return b;
  };
  const back = btn('← Bases', () => {
    bases.open = null;
    renderBases();
  }, 'link back-link');
  const tabs = el('div', { className: 'view-switch base-tabs', role: 'tablist' }, [
    ...views.map((x, i) => {
      const b = btn(`${qbKind(x.kind).icon} ${x.name}`, () => {
        bases.tab.set(note.id, i);
        renderBases();
      }, `seg${i === tab ? ' active' : ''}`);
      b.setAttribute('role', 'tab');
      b.ariaSelected = String(i === tab);
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        bases.tab.set(note.id, i);
        renderBases();
        viewMenu(note, { x: e.clientX, y: e.clientY });
      });
      return b;
    }),
    btn('＋ Vista', () => addView(note, v), 'seg base-add-view', 'Añadir otra vista (tabla, tablero, galería, calendario…)'),
  ]);
  const content = el('div', { className: 'base-content' });
  if (v) {
    content.innerHTML = renderMd(v.text, { noteId: note.id });
    hydrateQueries(content, note.id);
  } else content.append(el('p', { className: 'empty' }, 'Esta base no tiene vistas. Añade una con «＋ Vista».'));
  const more = btn('⋯', (e) => baseMenu(note, e.currentTarget), 'side-btn', 'Más opciones');
  return [
    el('div', { className: 'base-top' }, [back, el('h2', { className: 'base-name' }, `${propOf(note, 'icono') || '📇'} ${baseName(note.path)}`), el('span', { className: 'spacer' }),
      ...(v ? [btn('＋ Nueva entrada', () => newEntry(note, v), 'primary'), btn('⚙ Configurar vista', () => qbConfigure(note, v))] : []), more]),
    tabs,
    content,
  ];
}

// Una entrada nueva: una nota en la carpeta de la vista, con los campos de la base ya puestos.
function newEntry(note, v) {
  const folder = viewFolder(v) || baseName(note.path);
  promptText({
    placeholder: `Nombre de la nueva entrada (en «${folder}»)`,
    action: 'Crear',
    onSubmit: (title) => {
      if (!state.folders.includes(folder)) state.folders.push(folder);
      const fields = String(propOf(note, 'campos') || '').split(',').map((x) => x.trim()).filter(Boolean);
      // Sin «campos»: los de las notas que ya hay en la carpeta.
      const keys = fields.length ? fields : [...new Set(state.notes.filter((n) => folderOf(n.path) === folder && !n.enc).slice(0, 20).flatMap((n) => parseProps(n.body).props.map((p) => p.key)))];
      const entry = createNote({ folder, title, body: `${propsBlock(Object.fromEntries(keys.map((k) => [k, ''])))}\n`, open: false });
      renderBases();
      qbOpenProps(entry);
    },
  });
}

function addView(note, current) {
  const lines = (noteText(note) || '').split('\n');
  const folder = current ? viewFolder(current) : '';
  qbOpen({ model: { ...qbModel('tablero'), folder }, target: { mode: 'after', note, line: lines.length - 1 } });
}

function renameView(note, v) {
  promptText({
    placeholder: 'Nombre de la vista',
    initial: v.name,
    action: 'Renombrar',
    onSubmit: (q) => qbEdit(note, (lines) => {
      const from = qbFind(lines, v);
      if (from < 0) return false;
      if (v.headLine >= 0 && /^#{2,4}\s/.test(lines[v.headLine])) lines[v.headLine] = `## ${q.trim()}`;
      else lines.splice(from, 0, `## ${q.trim()}`, '');
    }),
  });
}

function viewMenu(note, anchor) {
  const views = baseViews(note);
  const i = bases.tab.get(note.id) ?? 0;
  const v = views[i];
  if (!v) return;
  showMenu(anchor, [
    { label: '⚙ Configurar vista…', action: () => qbConfigure(note, v) },
    { label: '✏️ Renombrar vista…', action: () => renameView(note, v) },
    { label: '⧉ Duplicar vista', action: () => qbEdit(note, (lines) => lines.push('', `## ${v.name} (copia)`, '', ...v.text.split('\n'))) },
    ...(i > 0 ? [{ label: '⬅ Mover a la izquierda', action: () => moveView(note, i, -1) }] : []),
    ...(i < views.length - 1 ? [{ label: '➡ Mover a la derecha', action: () => moveView(note, i, 1) }] : []),
    { sep: true },
    { label: '🗑 Quitar esta vista', danger: true, action: () => {
      qbEdit(note, (lines) => {
        const from = qbFind(lines, v);
        if (from < 0) return false;
        const start = v.headLine >= 0 ? v.headLine : from;
        lines.splice(start, from - start + v.orig.split('\n').length);
      });
    } },
  ]);
}

// Cambia de sitio el bloque (con su título) con el de al lado.
function moveView(note, i, dir) {
  const views = baseViews(note);
  const a = views[Math.min(i, i + dir)];
  const b = views[Math.max(i, i + dir)];
  qbEdit(note, (lines) => {
    const span = (v) => [v.headLine >= 0 ? v.headLine : v.from, v.to];
    const [a0, a1] = span(a);
    const [b0, b1] = span(b);
    const A = lines.slice(a0, a1 + 1);
    const B = lines.slice(b0, b1 + 1);
    const mid = lines.slice(a1 + 1, b0);
    lines.splice(a0, b1 - a0 + 1, ...B, ...mid, ...A);
  });
  bases.tab.set(note.id, i + dir);
  bases.count.set(note.id, views.length);
}

function baseMenu(note, anchor) {
  showMenu(anchor, [
    { label: '✏️ Renombrar la base…', action: () => promptText({ placeholder: 'Nombre de la base', initial: baseName(note.path), action: 'Renombrar', onSubmit: (q) => {
      if (typeof renameNote === 'function') renameNote(note, cleanName(q));
      else {
        const old = note.path;
        note.path = `${BASE_FOLDER}/${cleanName(q)}`;
        relinkAll(old, note.path);
        save();
      }
      renderBases();
    } }) },
    { label: '😀 Cambiar icono…', action: () => promptText({ placeholder: 'Emoji de la base', initial: String(propOf(note, 'icono') || ''), action: 'Poner', onSubmit: (q) => {
      peSet(note, 'icono', 'text', [...q.trim()].slice(0, 2).join(''));
      renderBases();
    } }) },
    { label: '🏷 Campos de las entradas nuevas…', action: () => promptText({ placeholder: 'Campos separados por comas (p. ej. autor, estado, puntuacion)', initial: String(propOf(note, 'campos') || ''), action: 'Guardar', onSubmit: (q) => {
      peSet(note, 'campos', 'text', q.split(',').map((x) => x.trim()).filter(Boolean).join(', '));
      renderBases();
    } }) },
    { label: '📝 Abrir como nota', action: () => openNote(note) },
    { sep: true },
    { label: '🗑 Borrar la base (las entradas no se tocan)', danger: true, action: () => {
      if (typeof trashNotes === 'function') trashNotes([note]);
      else deleteNote(note);
      bases.open = null;
      renderAll();
    } },
  ]);
}

RENDER_HOOKS.push(() => {
  if ($('#view-bases')?.classList.contains('active') && !document.querySelector('#view-bases :focus')) renderBases();
});
COMMANDS_EXTRA.push(() => [
  { label: 'Bases (tus notas como base de datos)', action: ({ newTab } = {}) => showView('bases', { newTab }) },
  { label: 'Nueva base…', action: () => {
    showView('bases');
    newBaseMenu();
  } },
  ...allBases().slice(0, 12).map((b) => ({ label: `Base: ${baseName(b.path)}`, action: () => openBase(b.id) })),
]);
