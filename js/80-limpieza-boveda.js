'use strict';

// ---------- Limpieza guiada (en «Revisar la bóveda») ----------
// Propone, ya marcado, lo que se puede limpiar sin riesgo; nada se borra sin confirmar:
//  1. Notas vacías: basura («Sin título», «Untitled Kanban», diarias vacías, copias «… 2») y ejemplos de
//     las plantillas de Bases. Los esqueletos de conceptos (vacíos pero con nombre propio) se quedan.
//  2. Duplicados: copias con el mismo nombre y el mismo texto (se deja una, la de la bóveda principal).
//  3. Estados: unifica los valores de «estado» en pendiente → borrador → revisada.
//  4. Conversaciones de Copilot y carpetas de sistema: se sacan de Enfoque (siguen en Drive).
// Lo borrado va a la papelera y todo se puede deshacer (salvo sacar de Enfoque, que se revierte en «Solo en Drive»).
const LZ_JUNK_NAME = /^(sin título|untitled( kanban)?|nueva nota|new note)( \d+)?$|\.(png|jpe?g|gif|webp|pdf)$/i;
const LZ_DATE_NAME = /^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{4}-W\d{2}|\d{4}-\d{2})( \d+)?$/;
const LZ_SYSTEM = /(^|\/)(copilot|copilot-conversation|\.smart-env|\.space|\.makemd|\.claude)(\/|$)/i;
const LZ_STATES = ['pendiente', 'borrador', 'revisada'];
const LZ_MAP = {
  pendiente: 'pendiente', idea: 'pendiente', 'por hacer': 'pendiente', 'por escribir': 'pendiente', todo: 'pendiente',
  borrador: 'borrador', 'en proceso': 'borrador', 'en desarrollo': 'borrador', 'en curso': 'borrador', 'en progreso': 'borrador', activo: 'borrador', activa: 'borrador',
  revisada: 'revisada', revisado: 'revisada', completo: 'revisada', completa: 'revisada', terminado: 'revisada', terminada: 'revisada', listo: 'revisada', lista: 'revisada', hecho: 'revisada', hecha: 'revisada',
};
const lz = { pick: new Map(), stateMap: {} };

const lzBody = (n) => rvBody(n.body || '').trim();
// Las entradas de ejemplo que crean las plantillas de Bases (mismo nombre y carpeta que su ejemplo).
const lzSamplePaths = () => new Set((typeof BASE_TEMPLATES !== 'undefined' ? BASE_TEMPLATES : []).filter((t) => t.sample?.title && t.folder).map((t) => joinPath(t.folder, t.sample.title).toLowerCase()));
const lzMain = (n) => /^Cerebro Digital X\//i.test(n.path);

function lzPlan(r) {
  const byPath = new Set(state.notes.map((n) => n.path.toLowerCase()));
  // 1. Vacías
  const junk = [];
  const samples = [];
  const skeletons = [];
  r.empty.forEach((n) => {
    const name = baseName(n.path);
    const copyOf = name.match(/^(.*?) \d+$/);
    if (LZ_JUNK_NAME.test(name) || LZ_DATE_NAME.test(name) || (copyOf && byPath.has(joinPath(folderOf(n.path), copyOf[1]).toLowerCase()))) junk.push(n);
    else if (lzSamplePaths().has(n.path.toLowerCase())) samples.push(n);
    else skeletons.push(n);
  });
  // 2. Duplicados: «X 2» junto a «X» con el mismo texto, y el mismo nombre en varias carpetas con el mismo texto.
  const empty = new Set(r.empty);
  const dupSame = [];
  const dupDiff = [];
  const seen = new Set();
  const groups = new Map();
  const pool = state.notes.filter((n) => !n.enc && !empty.has(n) && !RV_APP_FOLDERS.test(n.path));
  const names = new Set(pool.map((n) => baseName(n.path).toLowerCase()));
  pool.forEach((n) => {
    const name = baseName(n.path);
    // «X 2» solo es copia si existe «X» (así «Capítulo 1» y «Capítulo 2» no son duplicados).
    const m = name.match(/^(.*?) \d+$/);
    const base = (m && names.has(m[1].toLowerCase()) ? m[1] : name).toLowerCase();
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(n);
  });
  groups.forEach((list) => {
    if (list.length < 2) return;
    // Se queda la de la bóveda principal o, si no, la de nombre sin número y ruta más larga.
    const keep = [...list].sort((a, b) => lzMain(b) - lzMain(a) || /\s\d+$/.test(baseName(a.path)) - /\s\d+$/.test(baseName(b.path)) || b.path.length - a.path.length)[0];
    list.filter((n) => n !== keep && !seen.has(n.id)).forEach((n) => {
      seen.add(n.id);
      (lzBody(n) === lzBody(keep) ? dupSame : dupDiff).push({ n, keep });
    });
  });
  // 3. Estados fuera de pendiente/borrador/revisada (solo notas de contenido, no las de Bases ni de la app)
  const states = new Map();
  state.notes.filter((n) => !n.enc && !RV_APP_FOLDERS.test(n.path)).forEach((n) => {
    const v = propOf(n, 'estado');
    if (v == null || Array.isArray(v)) return;
    const k = String(v).trim().toLowerCase();
    if (!k || LZ_STATES.includes(k)) return;
    if (!states.has(k)) states.set(k, []);
    states.get(k).push(n);
  });
  // 4. Sistema / Copilot
  const system = state.notes.filter((n) => LZ_SYSTEM.test(n.path));
  return { junk, samples, skeletons, dupSame, dupDiff, states, system };
}

// Cambia el valor de «estado» en el texto, sin tocar nada más.
function lzSetState(n, value) {
  const text = n.body || '';
  const { props } = parseProps(text);
  const p = props.find((x) => x.key.toLowerCase() === 'estado');
  if (!p) return false;
  const lines = text.split('\n');
  lines.splice(p.line, p.to - p.line + 1, ...peLines(p.key, 'text', value));
  n.body = lines.join('\n');
  n.updatedAt = Date.now();
  return true;
}

function lzTrash(list, label) {
  if (!list.length) return showToastMessage('No hay nada marcado.');
  const ids = new Set(list.map((n) => n.id));
  withUndo(`${plural(list.length, 'nota', 'notas')} ${label} a la papelera`, () => {
    trashNotes(list);
    state.notes = state.notes.filter((n) => !ids.has(n.id));
  });
  rv.rev = -1;
  renderVaultReview();
}

function lzCard(r) {
  const plan = lzPlan(r);
  const open = (n) => {
    const a = el('a', { href: '#', title: n.path }, baseName(n.path));
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openNote(n, { newTab: true });
    });
    return a;
  };
  // Lista con casillas; «checked» decide qué viene marcado.
  const pickList = (key, items, { checked = true, render = (n) => [open(n), el('span', { className: 'muted' }, ` · ${folderOf(n.path) || 'raíz'}`)], note = (x) => x } = {}) => {
    const sel = lz.pick.get(key) || new Set(checked ? items.map((x) => note(x).id) : []);
    lz.pick.set(key, sel);
    return el('ul', { className: 'rv-list lz-list' }, items.slice(0, 300).map((x) => {
      const n = note(x);
      const c = el('input', { type: 'checkbox', checked: sel.has(n.id), ariaLabel: `Marcar ${baseName(n.path)}` });
      c.addEventListener('change', () => (c.checked ? sel.add(n.id) : sel.delete(n.id)));
      return el('li', {}, el('label', {}, [c, ' ', ...render(x)]));
    }));
  };
  const picked = (key, items, note = (x) => x) => items.map(note).filter((n) => lz.pick.get(key)?.has(n.id));
  const step = (num, title, hint, count, body) => el('details', { className: 'lz-step', open: count > 0 && num === 1 }, [el('summary', {}, [el('strong', {}, `${num}. ${title}`), el('span', { className: `rv-count ${count ? 'warn' : 'ok'}` }, String(count)), el('span', { className: 'muted rv-hint' }, hint)]), ...(count ? body() : [el('p', { className: 'muted' }, 'Nada que limpiar aquí. 👍')])]);
  const btn = (label, fn, cls = 'primary') => {
    const b = el('button', { className: cls }, label);
    b.addEventListener('click', fn);
    return b;
  };

  const emptyCount = plan.junk.length + plan.samples.length;
  const statesCount = [...plan.states.values()].reduce((s, l) => s + l.length, 0);
  return el('details', { className: 'card rv-card lz-card', open: true }, [
    el('summary', {}, [el('strong', {}, '🧹 Limpieza guiada'), el('span', { className: 'muted rv-hint' }, 'Lo propuesto viene marcado: revisa, desmarca lo que quieras conservar y confirma. Lo borrado va a la papelera y se puede deshacer.')]),
    step(1, 'Notas vacías que sobran', 'Basura («Sin título», «Untitled Kanban», diarias vacías, copias «… 2») y ejemplos de las plantillas de Bases. Los conceptos vacíos con nombre propio (tus próximas notas) no se tocan.', emptyCount, () => [
      ...(plan.junk.length ? [el('h4', {}, `Basura (${plan.junk.length})`), pickList('junk', plan.junk)] : []),
      ...(plan.samples.length ? [el('h4', {}, `Ejemplos de plantillas (${plan.samples.length})`), pickList('samples', plan.samples)] : []),
      ...(plan.skeletons.length ? [el('p', { className: 'muted' }, `Se quedan ${plural(plan.skeletons.length, 'concepto vacío', 'conceptos vacíos')} (p. ej. ${plan.skeletons.slice(0, 4).map((n) => baseName(n.path)).join(', ')}): son notas por escribir.`)] : []),
      el('div', { className: 'row rv-actions' }, [btn('🗑 Mover a la papelera las marcadas', () => {
        const list = [...picked('junk', plan.junk), ...picked('samples', plan.samples)];
        askConfirm(`¿Mover ${plural(list.length, 'nota vacía', 'notas vacías')} a la papelera? Se puede deshacer.`, 'Sí, a la papelera', () => lzTrash(list, 'vacías'));
      })]),
    ]),
    step(2, 'Duplicados', 'Copias con el mismo nombre. Las que tienen el mismo texto vienen marcadas (se deja la de la bóveda principal); las que difieren, ábrelas y decide.', plan.dupSame.length + plan.dupDiff.length, () => [
      ...(plan.dupSame.length ? [el('h4', {}, `Mismo texto (${plan.dupSame.length})`), pickList('dupSame', plan.dupSame, { note: (x) => x.n, render: ({ n, keep }) => [open(n), el('span', { className: 'muted' }, ` · ${folderOf(n.path) || 'raíz'} → se queda `), open(keep), el('span', { className: 'muted' }, ` (${folderOf(keep.path) || 'raíz'})`)] })] : []),
      ...(plan.dupDiff.length ? [el('h4', {}, `Texto distinto: revísalas a mano (${plan.dupDiff.length})`), pickList('dupDiff', plan.dupDiff, { checked: false, note: (x) => x.n, render: ({ n, keep }) => [open(n), el('span', { className: 'muted' }, ` · ${folderOf(n.path) || 'raíz'} ↔ `), open(keep), el('span', { className: 'muted' }, ` (${folderOf(keep.path) || 'raíz'})`)] })] : []),
      el('div', { className: 'row rv-actions' }, [btn('🗑 Mover a la papelera las copias marcadas', () => {
        const list = [...picked('dupSame', plan.dupSame, (x) => x.n), ...picked('dupDiff', plan.dupDiff, (x) => x.n)];
        askConfirm(`¿Mover ${plural(list.length, 'copia', 'copias')} a la papelera? Se queda la otra de cada par. Se puede deshacer.`, 'Sí, a la papelera', () => lzTrash(list, 'duplicadas'));
      })]),
    ]),
    step(3, 'Unificar estados', 'Tres estados para todo: pendiente → borrador → revisada. Elige a cuál pasa cada valor (o «no cambiar»).', statesCount, () => [
      el('ul', { className: 'rv-list lz-states' }, [...plan.states].sort((a, b) => b[1].length - a[1].length).map(([v, list]) => {
        if (!(v in lz.stateMap)) lz.stateMap[v] = LZ_MAP[v] || '';
        const s = el('select', { ariaLabel: `Nuevo estado para «${v}»` }, [...LZ_STATES.map((x) => el('option', { value: x }, x)), el('option', { value: '' }, 'no cambiar')]);
        s.value = lz.stateMap[v];
        s.addEventListener('change', () => (lz.stateMap[v] = s.value));
        return el('li', {}, [el('strong', {}, v), el('span', { className: 'muted' }, ` (${list.length}) → `), s, el('span', { className: 'muted' }, ` · p. ej. `), ...list.slice(0, 3).flatMap((n, i) => [i ? ', ' : '', open(n)])]);
      })),
      el('div', { className: 'row rv-actions' }, [btn('✓ Aplicar los estados', () => {
        const todo = [...plan.states].flatMap(([v, list]) => (lz.stateMap[v] ? list.map((n) => [n, lz.stateMap[v]]) : []));
        if (!todo.length) return showToastMessage('No hay cambios elegidos.');
        askConfirm(`¿Cambiar el estado de ${plural(todo.length, 'nota', 'notas')}? Solo cambia la propiedad «estado»; se puede deshacer.`, 'Sí, aplicar', () => {
          withUndo(`Estado unificado en ${plural(todo.length, 'nota', 'notas')}`, () => {
            todo.forEach(([n, v]) => lzSetState(n, v));
            dataRev++;
          });
          rv.rev = -1;
          renderVaultReview();
        });
      })]),
    ]),
    step(4, 'Conversaciones de Copilot y carpetas de sistema', 'Restos de complementos de Obsidian: se sacan de Enfoque y siguen en Drive.', plan.system.length, () => [
      pickList('system', plan.system),
      el('div', { className: 'row rv-actions' }, [btn('Sacar de Enfoque las marcadas', () => {
        const list = picked('system', plan.system);
        if (!list.length) return showToastMessage('No hay nada marcado.');
        askConfirm(`¿Sacar ${plural(list.length, 'nota', 'notas')} de Enfoque? Las que están en Drive se quedan allí.`, 'Sí, sacarlas', () => rvExclude(list));
      })]),
    ]),
  ]);
}

// Se añade a la pantalla de «Revisar la bóveda», justo debajo del resumen.
const lzPrevRender = renderVaultReview;
let lzRev = -1;
renderVaultReview = function renderVaultReviewWithCleanup() {
  lzPrevRender();
  // Con datos nuevos, las marcas vuelven a lo propuesto.
  if (rv.rev !== lzRev) {
    lz.pick.clear();
    lzRev = rv.rev;
  }
  const stats = $('#view-revision .rv-stats');
  if (stats && rv.report) stats.after(lzCard(rv.report));
};
