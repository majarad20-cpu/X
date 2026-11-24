'use strict';

// ---------- Menús: cada zona hace una cosa ----------
// · Barra de iconos (izquierda): solo trabajar las notas en bruto (explorador, diaria, semanal, mensual,
//   aleatoria, marcadores y abrir nota).
// · Barra de arriba: «📊 Vistas ▾» (Visualizar · Organizar · Crear · Estudiar) y «🎓 Especialidades ▾»
//   (una columna por especialidad activa, más «＋ Nueva especialidad» y «⚙ Administrar»), junto a
//   Planificar, Seguimiento, Pensar y Más.
// Los botones se mueven (no se copian) desde donde los crearon sus módulos, así conservan su acción y
// se siguen marcando como activos (12-notas.js marca todo .rib[data-view]).

const MENU_VISTAS = [
  { title: 'Visualizar', items: ['#rib-graph', 'mapas', 'mosaico', 'linea'] },
  { title: 'Organizar', items: ['bases', 'tableros', 'matriz'] },
  { title: 'Crear', items: ['canvas', 'dibujos', 'ideas'] },
  { title: 'Estudiar', items: ['estudio'] },
];

const menuBtns = new Map(); // clave -> botón (los movidos y los creados aquí)
function menuGrab(key) {
  if (menuBtns.has(key)) return menuBtns.get(key);
  const b = key.startsWith('#') ? $(key) : $(`.ribbon .rib[data-view="${key}"]`) || $(`.prodbar .tb-menu .rib[data-view="${key}"]`);
  if (b) {
    b.setAttribute('role', 'menuitem');
    menuBtns.set(key, b);
  }
  return b;
}
function menuMake(key, { icon, label, title, action, view }) {
  if (menuBtns.has(key)) return menuBtns.get(key);
  const b = el('button', { className: 'rib', role: 'menuitem', title: title || label, ariaLabel: label }, [ico(icon), el('span', { className: 'rib-label' }, label)]);
  if (view) {
    b.dataset.view = view;
    b.addEventListener('click', (e) => showView(view, { newTab: e.ctrlKey || e.metaKey }));
  } else b.addEventListener('click', action);
  menuBtns.set(key, b);
  return b;
}
const menuCol = (title, items) => el('div', { className: 'tb-col' }, [el('div', { className: 'tb-sec' }, title), ...items.filter(Boolean)]);

// Etiquetas más claras dentro de los menús.
const MENU_LABELS = { '#rib-graph': 'Grafo', ideas: 'Ideas y diagramas', canvas: 'Lienzos', stoa: 'Práctica diaria' };

function menusBuildVistas() {
  const menu = $('.prodbar [data-group="vistas"] .tb-menu');
  if (!menu) return;
  const cols = MENU_VISTAS.map((c) => menuCol(c.title, c.items.map((k) => {
    const b = menuGrab(k);
    if (b && MENU_LABELS[k]) b.querySelector('.rib-label') && (b.querySelector('.rib-label').textContent = MENU_LABELS[k]);
    return b;
  })));
  menu.style.setProperty('--cols', String(cols.length));
  menu.replaceChildren(...cols);
}

function menusBuildSpecs() {
  const menu = $('.prodbar [data-group="especialidades"] .tb-menu');
  if (!menu || typeof specList !== 'function') return;
  const cols = specList().filter((s) => specOn(s.id)).map((s) => {
    let items;
    if (s.id === 'contador') {
      items = ['radar', 'contradicciones', 'vigencia', 'calendario-trib'].map(menuGrab);
      items.push(menuGrab('#rib-pro-profile'));
    } else {
      items = [menuMake(`panel:${s.id}`, { icon: 'spec', label: s.id === 'estoicismo' ? 'Panel estoico' : 'Panel', title: `Panel de ${s.name}`, action: (e) => specOpen(s.id, e) })];
      if (s.id === 'estoicismo') {
        const stoa = menuGrab('stoa');
        if (stoa) {
          stoa.querySelector('.rib-label').textContent = MENU_LABELS.stoa;
          items.push(stoa);
        }
        items.push(menuMake('dicotomia', { icon: 'scale', label: 'Dicotomía del control', view: 'dicotomia' }), menuMake('virtudes', { icon: 'chart', label: 'Registro de virtudes', view: 'virtudes' }));
      }
      items.push(menuMake(`perfil:${s.id}`, { icon: 'pro-profile', label: 'Perfil', title: `Perfil de ${s.name}`, action: () => specOpenProfile(s) }));
    }
    return menuCol(`${s.icon} ${s.name}`, items);
  });
  const foot = el('div', { className: 'tb-foot' }, [
    menuMake('spec-new', { icon: 'plus', label: 'Nueva especialidad…', action: () => specNew() }),
    menuMake('spec-admin', { icon: 'gear', label: 'Administrar especialidades', action: () => {
      showView('settings');
      setTimeout(() => $('#spec-settings')?.scrollIntoView({ block: 'center' }), 60);
    } }),
  ]);
  menu.style.setProperty('--cols', String(Math.max(1, cols.length)));
  menu.replaceChildren(...(cols.length ? cols : [el('p', { className: 'muted tb-empty' }, 'No hay especialidades activas.')]), foot);
  // Los botones que quedaron fuera (especialidad oculta) no se ven en ningún sitio.
}

function menusRefresh() {
  menusBuildSpecs();
}

(() => {
  // Iconos de las cabeceras nuevas.
  const vi = $('.tb-ico-vistas');
  if (vi) vi.innerHTML = iconSvg('canvas');
  const si = $('.tb-ico-spec');
  if (si) si.innerHTML = iconSvg('spec');
  menusBuildVistas();
  menusBuildSpecs();
  // La sección «Contador» de la barra de iconos ya no hace falta: está en el menú.
  const pro = $('.ribbon [data-group="pro"]');
  if (pro) pro.hidden = true;
})();

// 89-especialidad.js mostraba u ocultaba su sección de la barra; ahora vive en el menú.
proApply = function proApplyMenu() {
  const g = $('.ribbon [data-group="pro"]');
  if (g) g.hidden = true;
  menusRefresh();
};
