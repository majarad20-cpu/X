'use strict';

// ---------- Secciones visibles ----------
// Algunas secciones se pueden ocultar (Ajustes › Tareas y enfoque › Secciones) sin borrar nada: sus
// datos se conservan y se siguen sincronizando, y al volver a mostrarlas está todo como estaba.
// state.settings.hiddenViews = ['finanzas', …]. Por defecto se oculta Finanzas (presupuesto personal,
// fuera del trabajo con la bóveda).
const HIDEABLE_VIEWS = [
  { id: 'finanzas', label: 'Finanzas (presupuesto personal)' },
  { id: 'stoa', label: 'Estoicismo' },
  { id: 'shared', label: 'Listas compartidas' },
];
if (!Array.isArray(state.settings.hiddenViews)) state.settings.hiddenViews = ['finanzas'];
const isViewHidden = (v) => (state.settings.hiddenViews || []).includes(v);

const hideStyle = el('style', { id: 'hidden-views-style' });
document.head.append(hideStyle);
function applyHiddenViews() {
  const list = (state.settings.hiddenViews || []).filter((v) => HIDEABLE_VIEWS.some((h) => h.id === v));
  hideStyle.textContent = list.map((v) => `.rib[data-view="${v}"]`).concat(list.includes('finanzas') ? ['#today-fin'] : []).map((s) => `${s} { display: none !important; }`).join('\n');
}
applyHiddenViews();

(() => {
  const group = $('#set-g-tareas');
  if (!group) return;
  const rows = HIDEABLE_VIEWS.map((h) => {
    const box = el('input', { type: 'checkbox', checked: !isViewHidden(h.id) });
    box.addEventListener('change', () => {
      const set = new Set(state.settings.hiddenViews || []);
      if (box.checked) set.delete(h.id);
      else set.add(h.id);
      state.settings.hiddenViews = [...set];
      save();
      applyHiddenViews();
    });
    return el('label', { className: 'set-row' }, [box, ` Mostrar ${h.label}`]);
  });
  group.append(
    el('h3', { className: 'section-title' }, 'Secciones'),
    el('div', { className: 'card' }, [...rows, el('p', { className: 'muted' }, 'Ocultar una sección no borra sus datos: se conservan y vuelven al mostrarla.')])
  );
})();
