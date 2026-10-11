const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-11T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [], updatedAt: 1 })); });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  check('21 plantillas', await p.evaluate(() => BASE_TEMPLATES.length), 21);
  // Todas las plantillas se crean y sus vistas se dibujan
  const bad = await p.evaluate(() => BASE_TEMPLATES.filter((t) => {
    const n = createBase({ name: t.name, folder: t.folder, views: t.views(t.folder), props: t.props, sample: t.sample, icon: t.icon });
    if (!n) return true;
    openBase(n.id);
    return baseViews(n).some((v, i) => { bases.tab.set(n.id, i); renderBases(); const box = document.querySelector('#view-bases .base-content'); return !box.querySelector('.query, table, .nb-board, .vg-grid, .vc-grid') && !box.textContent.trim(); });
  }).map((t) => t.name));
  check('plantillas que fallan', bad, []);
  // Totales en la tabla de suscripciones
  await p.evaluate(() => { const s = allBases().find((x) => baseName(x.path) === 'Suscripciones'); openBase(s.id); bases.tab.set(s.id, 0); renderBases(); });
  check('total de precio', await p.evaluate(() => /10[.,]99/.test(document.querySelector('#view-bases .base-content tfoot')?.textContent || '')), true);
  // Ficha: un clic en la entrada la abre sin salir de la base
  await p.evaluate(() => { const bb = allBases().find((x) => baseName(x.path) === 'Biblioteca'); openBase(bb.id); bases.tab.set(bb.id, 0); renderBases(); });
  await p.click('#view-bases .base-content a.wikilink'); await p.clock.runFor(50);
  check('ficha abierta', await p.evaluate(() => [!document.getElementById('entry-modal').hidden, document.querySelector('.entry-title').value, activeTab().view]), [true, 'Cien años de soledad', 'bases']);
  // Editar título, un campo, añadir campo y contenido
  await p.fill('.entry-title', 'Cien años de soledad (1967)');
  await p.fill('.entry-field:has-text("puntuacion") input', '4');
  await p.click('#entry-modal .link:has-text("Campo")'); await p.keyboard.type('enlace'); await p.keyboard.press('Enter'); await p.clock.runFor(50);
  await p.fill('.entry-field:has-text("enlace") input', 'https://ejemplo.org');
  await p.fill('.entry-body', 'Mi reseña: obra maestra.');
  await p.click('#entry-modal button.primary'); await p.clock.runFor(100);
  check('guardado', await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Biblioteca/Cien años de soledad (1967)'); return n && [propOf(n, 'puntuacion'), propOf(n, 'enlace'), n.body.includes('Mi reseña: obra maestra.'), String(propOf(n, 'autor'))]; }), ['4', 'https://ejemplo.org', true, 'Gabriel García Márquez']);
  // Tablero: clic en la tarjeta abre la ficha; menú contextual
  await p.evaluate(() => { const bb = allBases().find((x) => baseName(x.path) === 'Biblioteca'); bases.tab.set(bb.id, 1); renderBases(); });
  await p.click('#view-bases .nb-card .nb-title'); await p.clock.runFor(50);
  check('ficha desde el tablero', await p.evaluate(() => !document.getElementById('entry-modal').hidden), true);
  await p.keyboard.press('Escape');
  await p.click('#view-bases .nb-card', { button: 'right' }); await p.clock.runFor(50);
  const items = await p.$$eval('#note-menu .menu-item', (n) => n.map((x) => x.textContent));
  check('menú de la entrada', ['Editar ficha', 'Abrir como nota', 'Renombrar', 'Duplicar', 'Crear nota vinculada', 'Mover a otra base', 'Copiar enlace', 'Eliminar'].every((w) => items.some((t) => t.includes(w))), true);
  await p.click('#note-menu .menu-item:has-text("Duplicar")'); await p.clock.runFor(80);
  await p.keyboard.press('Escape');
  check('duplicada', await p.evaluate(() => state.notes.filter((x) => x.path.startsWith('Biblioteca/Cien años')).length), 2);
  // Mover a otra base
  await p.click('#view-bases .nb-card', { button: 'right' }); await p.click('#note-menu .menu-item:has-text("Mover a otra base")'); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("Citas y frases")'); await p.clock.runFor(80);
  check('movida', await p.evaluate(() => state.notes.filter((x) => x.path.startsWith('Citas/')).length), 2);
  // Eliminar (a la papelera)
  const before = await p.evaluate(() => state.notes.length);
  await p.click('#view-bases .nb-card', { button: 'right' }); await p.click('#note-menu .menu-item:has-text("Eliminar")'); await p.clock.runFor(80);
  check('eliminada', await p.evaluate((n) => [state.notes.length === n - 1, trashList().length > 0], before), [true, true]);
  // Nota vinculada
  await p.evaluate(() => { const bb = allBases().find((x) => baseName(x.path) === 'Películas y series'); openBase(bb.id); bases.tab.set(bb.id, 0); renderBases(); });
  await p.click('#view-bases .base-content tbody tr', { button: 'right' }); await p.click('#note-menu .menu-item:has-text("Crear nota vinculada")'); await p.clock.runFor(50);
  await p.keyboard.press('Enter'); await p.clock.runFor(80);
  check('nota vinculada', await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Notas sobre Interstellar'); return !!n && n.body.includes('[[Interstellar]]'); }), true);
  // Ctrl+clic abre la nota
  await p.evaluate(() => showView('bases'));
  await p.click('#view-bases .base-content a.wikilink', { modifiers: ['Control'] }); await p.clock.runFor(80);
  check('ctrl+clic abre la nota', await p.evaluate(() => activeTab().type === 'note' || document.querySelectorAll('#ws-tabs .ws-tab').length > 1), true);
  // Borrar una base: a la papelera, sus entradas siguen
  await p.evaluate(() => { const bb = allBases().find((x) => baseName(x.path) === 'Recetas'); openBase(bb.id); });
  await p.click('.base-top .side-btn'); await p.click('#note-menu .menu-item:has-text("Borrar la base")'); await p.clock.runFor(80);
  check('base borrada, entradas intactas', await p.evaluate(() => [allBases().some((x) => baseName(x.path) === 'Recetas'), state.notes.some((x) => x.path === 'Recetas/Tortilla de patatas')]), [false, true]);
  console.log('errors:', errs); await b.close();
})();
