const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
const seed = {
  tasks: [], habits: [], settings: { notesWelcome: true },
  notes: [
    { id: 'a', path: 'Alfa', body: 'Ver [[Beta]]', createdAt: now, updatedAt: now },
    { id: 'b', path: 'Beta', body: 'Texto beta', createdAt: now, updatedAt: now },
    { id: 'c', path: 'Gamma', body: 'Texto gamma', createdAt: now, updatedAt: now },
  ],
  updatedAt: 1,
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const cur = () => p.evaluate(() => { const t = activeTab(); return t.type === 'note' ? noteById(t.id).path : t.view; });
  check('sin historial', await p.evaluate(() => [document.getElementById('nav-back').disabled, document.getElementById('nav-fwd').disabled]), [true, true]);
  // Recorrido: Hoy → Alfa → Beta (por enlace) → Tareas → Gamma
  await p.evaluate(() => openNote(noteById('a'))); await p.clock.runFor(50);
  await p.evaluate(() => openNoteByLink('Beta', { fromNote: noteById('a') })); await p.clock.runFor(50);
  await p.evaluate(() => showView('tasks')); await p.clock.runFor(50);
  await p.evaluate(() => openNote(noteById('c'))); await p.clock.runFor(50);
  check('actual', await cur(), 'Gamma');
  await p.click('#nav-back'); await p.clock.runFor(50);
  check('atrás 1', await cur(), 'tasks');
  await p.click('#nav-back'); await p.clock.runFor(50);
  check('atrás 2', await cur(), 'Beta');
  await p.keyboard.press('Alt+ArrowLeft'); await p.clock.runFor(50);
  check('Alt+←', await cur(), 'Alfa');
  check('adelante habilitado', await p.evaluate(() => document.getElementById('nav-fwd').disabled), false);
  await p.click('#nav-fwd'); await p.clock.runFor(50);
  check('adelante', await cur(), 'Beta');
  await p.keyboard.press('Alt+ArrowRight'); await p.clock.runFor(50);
  check('Alt+→', await cur(), 'tasks');
  // Botones laterales del ratón
  await p.mouse.move(600, 400);
  await p.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true })));
  await p.clock.runFor(50);
  check('ratón atrás', await cur(), 'Beta');
  // Ir a otro sitio corta el «adelante»
  await p.evaluate(() => openNote(noteById('a'))); await p.clock.runFor(50);
  check('adelante tras navegar', await p.evaluate(() => document.getElementById('nav-fwd').disabled), true);
  // Una nota borrada se salta
  await p.evaluate(() => { state.notes = state.notes.filter((n) => n.id !== 'b'); dataRev++; save(); renderAll(); }); await p.clock.runFor(50);
  await p.click('#nav-back'); await p.clock.runFor(50);
  check('salta la borrada', (await cur()) !== 'Beta', true);
  // Alt+← dentro del editor no navega
  await p.evaluate(() => { openNote(noteById('c')); setNoteMode(noteById('c'), 'edit'); }); await p.clock.runFor(100);
  const before = await cur();
  await p.focus('#note-editor'); await p.keyboard.press('Alt+ArrowLeft'); await p.clock.runFor(50);
  check('Alt+← en el editor', await cur(), before);
  // Menú del botón atrás
  await p.click('#nav-back', { button: 'right' }); await p.clock.runFor(50);
  check('menú atrás', await p.evaluate(() => !document.getElementById('note-menu').hidden && document.querySelectorAll('#note-menu .menu-item').length > 0), true);
  await p.keyboard.press('Escape');
  // Sin Google, el botón de Drive no se ve
  check('drive oculto', await p.evaluate(() => document.getElementById('drive-sync-btn').hidden), true);
  await c.close();

  // Con Google Drive conectado
  const c2 = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c2.addInitScript((s) => {
    if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s));
    const mcp = { callTool: async () => ({ payload: { files: [] } }) };
    window.claude = { use: async (n) => (n === 'mcp' ? mcp : null) };
  }, seed);
  await c2.route(/fonts\.g/, (r) => r.abort());
  const q = await c2.newPage();
  q.on('pageerror', (e) => errs.push(e.message));
  await q.clock.install({ time: new Date(now) });
  await q.goto(url);
  for (let i = 0; i < 20 && !(await q.evaluate(() => gAvailable())); i++) await q.clock.runFor(500);
  await q.evaluate(() => renderVaultSettings());
  check('drive visible', await q.evaluate(() => document.getElementById('drive-sync-btn').hidden), false);
  // Desactivado: el clic ofrece activarlo
  await q.click('#drive-sync-btn'); await q.clock.runFor(50);
  check('menú activar', await q.evaluate(() => [...document.querySelectorAll('#note-menu .menu-item')].map((x) => x.textContent).some((t) => t.includes('Activar'))), true);
  await q.keyboard.press('Escape');
  // Activado: el clic sincroniza
  await q.evaluate(() => { window.__syncs = 0; gSettings().vaultDevice = deviceId(); window.syncVault = async (o) => { window.__syncs++; window.__manual = o?.manual; }; renderDriveBtn(); });
  check('drive activo', await q.evaluate(() => document.getElementById('drive-sync-btn').classList.contains('on')), true);
  await q.click('#drive-sync-btn'); await q.clock.runFor(50);
  check('clic sincroniza', await q.evaluate(() => [window.__syncs, window.__manual]), [1, true]);
  // Error visible
  await q.evaluate(() => { vault.status = 'No se pudo sincronizar la bóveda: prueba'; renderDriveBtn(); });
  check('drive error', await q.evaluate(() => document.getElementById('drive-sync-btn').classList.contains('error')), true);
  await c2.close();
  console.log('errors:', errs); await b.close();
})();
