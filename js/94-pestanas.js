'use strict';

// ---------- Pestañas: fijar, colores, lista de pestañas y vista dividida ----------
// · 📌 Fijar (clic derecho en la pestaña): queda a la izquierda, solo con su icono, y no la reemplaza
//   lo que se abra después (eso va a una pestaña nueva). «Cerrar las demás» no cierra las fijadas.
// · Color: una franja de color por pestaña para agrupar (un cliente, un estudio…); «Cerrar las de este
//   color» cierra el grupo.
// · ▾ Todas las pestañas: lista para saltar a cualquiera cuando no caben.
// · ◫ Vista dividida: la nota abierta a la izquierda y una vista a la derecha (Radar, Línea de tiempo,
//   Calendario…). Se elige con el botón ◫ o con el clic derecho en la pestaña de una vista.
// Todo se guarda con las pestañas (ws, en este dispositivo).

const TAB_COLORS = [
  ['', 'Sin color'],
  ['red', 'Rojo'],
  ['orange', 'Naranja'],
  ['yellow', 'Amarillo'],
  ['green', 'Verde'],
  ['blue', 'Azul'],
  ['purple', 'Morado'],
];
const tabPos = { x: 0, y: 0 };
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest?.('#ws-tabs')) Object.assign(tabPos, { x: e.clientX, y: e.clientY });
}, true);

// Las fijadas van primero (sin perder cuál está activa).
function tabsNormalize() {
  const cur = ws.tabs[ws.active];
  const pinned = ws.tabs.filter((t) => t.pinned);
  if (!pinned.length || ws.tabs.slice(0, pinned.length).every((t) => t.pinned)) return;
  ws.tabs = [...pinned, ...ws.tabs.filter((t) => !t.pinned)];
  ws.active = Math.max(0, ws.tabs.indexOf(cur));
  saveTabs();
}

function tabsDecorate() {
  $$('#ws-tabs .ws-tab').forEach((b, i) => {
    const t = ws.tabs[i];
    if (!t) return;
    b.classList.toggle('pinned', !!t.pinned);
    b.dataset.color = t.color || '';
    if (t.pinned && !b.title.startsWith('📌')) b.title = `📌 ${b.title}`;
  });
}

// ---------- Vista dividida ----------
const wsPanes = el('div', { className: 'ws-panes' });
(() => {
  const note = $('#note-pane');
  if (!note) return;
  note.before(wsPanes);
  wsPanes.append(note, $('#graph-pane'), $('#views-pane'));
})();

function splitApply() {
  const tab = activeTab();
  const sv = ws.split?.view;
  const on = !!(sv && tab?.type === 'note' && !isNarrow() && VIEW_RENDER[sv] && $(`#view-${sv}`));
  wsPanes.classList.toggle('split', on);
  $('#ws-split')?.classList.toggle('active', !!sv);
  if (!on) return;
  $('#views-pane').hidden = false;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${sv}`));
  VIEW_RENDER[sv]();
}

function splitSet(view) {
  ws.split = view ? { view } : null;
  saveTabs();
  // Si la pestaña activa es la vista elegida, se pasa a la última nota abierta.
  if (view && activeTab()?.type === 'view') {
    const i = ws.tabs.map((t, k) => [t, k]).reverse().find(([t]) => t.type === 'note')?.[1];
    if (i != null) ws.active = i;
    saveTabs();
  }
  renderWorkspace();
  if (view && activeTab()?.type !== 'note') showToastMessage(`Vista dividida: abre una nota y verás «${VIEW_TITLES[view]}» a su lado.`);
}

function splitPick() {
  const skip = new Set(['settings', 'today']);
  openPicker({
    placeholder: 'Vista dividida: ¿qué vista quieres junto a tus notas?',
    hint: 'La nota a la izquierda y la vista a la derecha · <kbd>Esc</kbd> cerrar',
    items: (typed) => [
      ...(ws.split ? [{ label: '✕ Quitar la vista dividida', action: () => splitSet(null) }] : []),
      ...Object.entries(VIEW_TITLES)
        .filter(([v]) => !skip.has(v) && !(typeof isViewHidden === 'function' && isViewHidden(v)))
        .filter(([, t]) => fold(t).includes(fold(typed)))
        .map(([v, t]) => ({ label: `${ws.split?.view === v ? '✓ ' : ''}${t}`, action: () => splitSet(v) })),
    ],
  });
}

// ---------- Lista de pestañas ----------
function tabsList() {
  openPicker({
    placeholder: `Pestañas abiertas (${ws.tabs.length}) · escribe para filtrar`,
    hint: '<kbd>Enter</kbd> ir a la pestaña · <kbd>Esc</kbd> cerrar',
    items: (typed) => ws.tabs.map((t, i) => {
      const note = t.type === 'note' ? noteById(t.id) : null;
      const label = note ? baseName(note.path) : t.type === 'graph' ? 'Grafo' : VIEW_TITLES[t.view] || t.view;
      return { t, i, label: `${t.pinned ? '📌 ' : ''}${i === ws.active ? '● ' : ''}${label}`, detail: note ? folderOf(note.path) : 'Sección' };
    }).filter((x) => fold(x.label).includes(fold(typed))).map((x) => ({ label: x.label, detail: x.detail, action: () => {
      flushNoteSave();
      ws.active = x.i;
      saveTabs();
      renderWorkspace();
    } })),
  });
}

(() => {
  const plus = $('#ws-new-tab');
  if (!plus) return;
  const list = el('button', { id: 'ws-tab-list', className: 'side-btn', title: 'Todas las pestañas', ariaLabel: 'Todas las pestañas' }, '▾');
  list.addEventListener('click', tabsList);
  const split = el('button', { id: 'ws-split', className: 'side-btn desk-only', title: 'Vista dividida: una nota y una vista lado a lado', ariaLabel: 'Vista dividida' }, '◫');
  split.addEventListener('click', splitPick);
  plus.before(list);
  plus.after(split);
})();

// ---------- Cambios sobre lo que ya existía ----------
const tabsRenderBase = renderWorkspace;
renderWorkspace = function renderWorkspaceTabs() {
  tabsNormalize();
  tabsRenderBase();
  tabsDecorate();
  splitApply();
};

// Lo que se abre desde una pestaña fijada va a una pestaña nueva (la fijada no se reemplaza).
const tabsOpenBase = openTab;
openTab = function openTabPinned(tab, opts = {}) {
  const cur = activeTab();
  const exists = ws.tabs.some((t) => sameTab(t, tab));
  return tabsOpenBase(tab, !opts.newTab && cur?.pinned && !exists ? { ...opts, newTab: true } : opts);
};

function tabsCloseWhere(keep) {
  flushNoteSave();
  const cur = ws.tabs[ws.active];
  ws.tabs = ws.tabs.filter((t, k) => t.pinned || keep(t, k));
  if (!ws.tabs.length) ws.tabs = [{ type: 'view', view: 'today' }];
  ws.active = Math.max(0, ws.tabs.indexOf(cur));
  saveTabs();
  renderAll();
}

const tabsMenuBase = tabMenuItems;
tabMenuItems = function tabMenuItemsMore(i) {
  const t = ws.tabs[i];
  if (!t) return tabsMenuBase(i);
  const base = tabsMenuBase(i).map((it) => {
    if (it.label === 'Cerrar las demás') return { ...it, label: 'Cerrar las demás (no las fijadas)', action: () => tabsCloseWhere((x, k) => k === i) };
    if (it.label === 'Cerrar las de la derecha') return { ...it, action: () => tabsCloseWhere((x, k) => k <= i) };
    return it;
  });
  const set = (patch) => {
    Object.assign(t, patch);
    saveTabs();
    renderWorkspace();
  };
  return [
    ...base,
    { sep: true },
    { label: t.pinned ? '📌 Quitar fijación' : '📌 Fijar pestaña', action: () => set({ pinned: !t.pinned }) },
    { label: '🎨 Color ▸', action: () => setTimeout(() => showMenu({ ...tabPos }, TAB_COLORS.map(([c, name]) => ({ label: `${c ? '●' : '○'} ${name}${(t.color || '') === c ? '  ✓' : ''}`, action: () => set({ color: c || undefined }) })))) },
    t.color && { label: 'Cerrar las de este color', action: () => tabsCloseWhere((x) => x.color !== t.color) },
    t.type === 'view' && t.view !== 'today' && t.view !== 'settings' && { label: ws.split?.view === t.view ? '◫ Quitar la vista dividida' : '◫ Ver junto a las notas (vista dividida)', action: () => splitSet(ws.split?.view === t.view ? null : t.view) },
    t.type === 'note' && ws.split && { label: '◫ Quitar la vista dividida', action: () => splitSet(null) },
  ].filter(Boolean);
};
