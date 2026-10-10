'use strict';

// ---------- Atrás / adelante entre notas y secciones ----------
// Cada vez que cambia lo que se ve (otra nota, Hoy, Tareas…) se recuerda lo anterior, como en un navegador.
// Alt+← / Alt+→ (o Ctrl+Alt+← / →), los botones laterales del ratón y las flechas de la barra de pestañas.
const nav = { back: [], fwd: [], last: null, moving: false };
const navKey = (t) => (t ? `${t.type}:${t.type === 'note' ? t.id : t.view || ''}` : '');
const navValid = (t) => t && (t.type !== 'note' || !!noteById(t.id));

function navTrack(tab) {
  const key = navKey(tab);
  if (nav.last && key !== nav.last.key && !nav.moving) {
    nav.back.push(nav.last.tab);
    if (nav.back.length > 60) nav.back.shift();
    nav.fwd = [];
  }
  if (tab) nav.last = { key, tab: { ...tab } };
  renderNavButtons();
}

function renderNavButtons() {
  const name = (t) => (t.type === 'note' ? baseName(noteById(t.id)?.path || 'Nota') : t.type === 'graph' ? 'Grafo' : VIEW_TITLES[t.view] || '');
  const prev = [...nav.back].reverse().find(navValid);
  const next = [...nav.fwd].reverse().find(navValid);
  const b = $('#nav-back');
  const f = $('#nav-fwd');
  if (!b) return;
  b.disabled = !prev;
  f.disabled = !next;
  b.title = prev ? `Atrás: ${name(prev)} (Alt+←)` : 'Atrás (Alt+←)';
  f.title = next ? `Adelante: ${name(next)} (Alt+→)` : 'Adelante (Alt+→)';
}

function navGo(dir) {
  const from = dir < 0 ? nav.back : nav.fwd;
  const to = dir < 0 ? nav.fwd : nav.back;
  let target = from.pop();
  while (target && !navValid(target)) target = from.pop();
  if (!target) return renderNavButtons();
  if (nav.last) to.push(nav.last.tab);
  if (typeof flushNoteSave === 'function') flushNoteSave();
  nav.moving = true;
  try {
    openTab(target);
  } finally {
    nav.moving = false;
  }
  renderNavButtons();
}

$('#nav-back').addEventListener('click', () => navGo(-1));
$('#nav-fwd').addEventListener('click', () => navGo(1));
// Clic derecho en las flechas: la lista de lo visitado, para saltar varios pasos.
['#nav-back', '#nav-fwd'].forEach((sel, i) =>
  $(sel).addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const list = (i ? nav.fwd : nav.back).filter(navValid).slice(-12).reverse();
    if (!list.length) return;
    showMenu({ x: e.clientX, y: e.clientY }, list.map((t, k) => ({
      label: t.type === 'note' ? `📄 ${baseName(noteById(t.id).path)}` : `${t.type === 'graph' ? 'Grafo' : VIEW_TITLES[t.view] || t.view}`,
      action: () => { for (let s = 0; s <= k; s++) navGo(i ? 1 : -1); },
    })));
  })
);
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return; // ya lo usó otro (p. ej. mover una nota del calendario)
  if (!e.altKey || e.shiftKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  // Dentro de un campo de texto, Alt+flecha es de la edición; ahí vale Ctrl+Alt+flecha.
  if (!e.ctrlKey && e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (!$('#draw')?.hidden || !$('#present')?.hidden) return;
  e.preventDefault();
  navGo(e.key === 'ArrowLeft' ? -1 : 1);
});
// Botones laterales del ratón (atrás = 3, adelante = 4).
document.addEventListener('mouseup', (e) => {
  if (e.button !== 3 && e.button !== 4) return;
  e.preventDefault();
  navGo(e.button === 3 ? -1 : 1);
});
COMMANDS_EXTRA.push(() => [
  { label: 'Atrás', action: () => navGo(-1) },
  { label: 'Adelante', action: () => navGo(1) },
]);

// ---------- Botón de sincronización con Google Drive ----------
// En la barra de pestañas: un toque sincroniza las notas con la carpeta «Enfoque/Notas» (44-boveda-drive.js).
function renderDriveBtn() {
  const btn = $('#drive-sync-btn');
  if (!btn || typeof gAvailable !== 'function') return;
  btn.hidden = !gAvailable();
  if (btn.hidden) return;
  const on = vaultOn();
  const m = vaultMap();
  const err = on && /^No se pudo|no se pudieron/i.test(vault.status || '');
  btn.classList.toggle('busy', !!vault.busy);
  btn.classList.toggle('on', on && !err);
  btn.classList.toggle('error', err);
  const when = m.lastSync ? new Date(m.lastSync).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '';
  btn.title = vault.busy
    ? 'Sincronizando con Google Drive…'
    : !on
      ? 'Notas en Google Drive: desactivado en este dispositivo (toca para activarlo)'
      : err
        ? `Error al sincronizar con Drive: ${vault.status}`
        : `Sincronizar las notas con Google Drive${when ? ` · última vez ${when}` : ''}`;
}

function driveBtnMenu(anchor) {
  const on = vaultOn();
  showMenu(anchor, [
    on && { label: '☁ Sincronizar ahora', action: () => syncVault({ manual: true }) },
    !on && { label: '☁ Activar «Notas en Google Drive» aquí', action: enableVaultHere },
    on && vaultMap().root && { label: 'Abrir la carpeta en Drive ↗', action: () => window.open(`https://drive.google.com/drive/folders/${vaultMap().root}`, '_blank', 'noopener') },
    { sep: true },
    { label: '⚙ Ajustes de Google Drive', action: openDriveSettings },
  ]);
}

function enableVaultHere() {
  const box = $('#gvault-on');
  if (!box || box.disabled) return showToastMessage('Abre la app desde Claude con el conector de Google Drive para usar esta opción.');
  box.checked = true;
  box.dispatchEvent(new Event('change'));
}

function openDriveSettings() {
  showView('settings');
  setTimeout(() => $('#gvault-card')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
}

$('#drive-sync-btn').addEventListener('click', (e) => {
  if (vault.busy) return;
  if (vaultOn()) syncVault({ manual: true });
  else driveBtnMenu(e.currentTarget);
});
$('#drive-sync-btn').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  driveBtnMenu({ x: e.clientX, y: e.clientY });
});
COMMANDS_EXTRA.push(() => (typeof gAvailable === 'function' && gAvailable() ? [{ label: 'Sincronizar las notas con Google Drive', action: () => (vaultOn() ? syncVault({ manual: true }) : enableVaultHere()) }] : []));
renderDriveBtn();
renderNavButtons();
