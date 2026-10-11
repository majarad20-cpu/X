const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-11T10:00:00').getTime();
const seed = {
  tasks: [], habits: [], settings: { notesWelcome: true }, notes: [],
  maps: [{ id: 'm1', title: 'Viaje', createdAt: now, updatedAt: now, nodes: [
    { id: 'root', parent: null, text: 'Viaje' },
    { id: 'a', parent: 'root', text: 'Destino' },
    { id: 'b', parent: 'root', text: 'Presupuesto' },
    { id: 'a1', parent: 'a', text: 'Japón' },
  ] }],
  updatedAt: 1,
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  await p.evaluate(() => openMap('m1')); await p.clock.runFor(100);
  const tree = () => p.evaluate(() => currentMap().nodes.map((n) => `${n.parent || '-'}>${n.text}`));
  // Arrastrar «Japón» sobre «Presupuesto»
  const box = async (id) => (await p.$(`#map-nodes [data-id="${id}"]`)).boundingBox();
  const from = await box('a1'); const to = await box('b');
  await p.mouse.move(from.x + 10, from.y + 10); await p.mouse.down();
  await p.mouse.move(from.x + 40, from.y + 30, { steps: 4 });
  await p.mouse.move(to.x + 15, to.y + 10, { steps: 6 });
  check('marca destino', await p.evaluate(() => !!document.querySelector('.mm-node.mm-drop')), true);
  await p.mouse.up(); await p.clock.runFor(100);
  check('arrastrado', await p.evaluate(() => currentMap().nodes.find((n) => n.id === 'a1').parent), 'b');
  // Deshacer y rehacer
  await p.focus('#map-canvas'); await p.keyboard.press('Control+z'); await p.clock.runFor(50);
  check('deshacer', await p.evaluate(() => currentMap().nodes.find((n) => n.id === 'a1').parent), 'a');
  await p.keyboard.press('Control+y'); await p.clock.runFor(50);
  check('rehacer', await p.evaluate(() => currentMap().nodes.find((n) => n.id === 'a1').parent), 'b');
  // Color e icono (menú de estilo)
  await p.evaluate(() => { selectedNode = 'a'; renderMap(); });
  await p.click('#mm-style'); await p.click('#note-menu .menu-item:has-text("Verde oscuro")'); await p.clock.runFor(50);
  check('color de la rama', await p.evaluate(() => [currentMap().nodes.find((n) => n.id === 'a').color, document.querySelector('#map-nodes [data-id="a"]').classList.contains('b5')]), [5, true]);
  await p.click('#mm-style'); await p.click('#note-menu .menu-item:has-text("Poner icono")'); await p.click('#picker-list .pk-item:has-text("🎯")'); await p.clock.runFor(50);
  check('icono', await p.textContent('#map-nodes [data-id="a"] .mm-text'), '🎯 Destino');
  // Menú contextual del nodo: subir
  await p.click('#map-nodes [data-id="b"]', { button: 'right' }); await p.clock.runFor(50);
  await p.click('#note-menu .menu-item:has-text("Subir")'); await p.clock.runFor(50);
  check('subir', await p.evaluate(() => childrenOf(currentMap(), 'root').map((n) => n.text)), ['Presupuesto', 'Destino']);
  // Pegar una lista con sangrías en «Destino»
  await p.evaluate(() => { selectedNode = 'a'; renderMap(); document.getElementById('map-canvas').focus(); });
  await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', '- Italia\n  - Roma\n  - Florencia\n- Perú'); document.getElementById('map-canvas').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  await p.clock.runFor(50);
  check('pegar lista', await p.evaluate(() => { const m = currentMap(); const t = (id) => m.nodes.find((n) => n.id === id).text; return m.nodes.filter((n) => ['Italia', 'Roma', 'Florencia', 'Perú'].includes(n.text)).map((n) => `${t(n.parent)}>${n.text}`); }), ['Destino>Italia', 'Italia>Roma', 'Italia>Florencia', 'Destino>Perú']);
  // Editor de lista: conserva color/icono y aplica cambios
  await p.click('#mm-outline'); await p.clock.runFor(50);
  const outline = await p.inputValue('.mm-outline');
  check('lista del mapa', outline, 'Viaje\n  - Presupuesto\n    - Japón\n  - 🎯 Destino\n    - Italia\n      - Roma\n      - Florencia\n    - Perú');
  await p.fill('.mm-outline', outline.replace('    - Perú', '    - Perú\n    - México') + '\n  - Fechas');
  await p.click('.mm-outline-modal button.primary'); await p.clock.runFor(100);
  check('lista aplicada', await p.evaluate(() => { const m = currentMap(); const d = m.nodes.find((n) => n.text === 'Destino'); return [d.id, d.color, d.icon, m.nodes.some((n) => n.text === 'México' && n.parent === d.id), childrenOf(m, 'root').map((n) => n.text)]; }), ['a', 5, '🎯', true, ['Presupuesto', 'Destino', 'Fechas']]);
  // Plegar todo y diseño a la derecha
  await p.click('#mm-more'); await p.click('#note-menu .menu-item:has-text("Plegar todas")'); await p.clock.runFor(50);
  check('plegar todo', await p.evaluate(() => document.querySelectorAll('#map-nodes .mm-node').length), 4);
  await p.click('#mm-more'); await p.click('#note-menu .menu-item:has-text("solo a la derecha")'); await p.clock.runFor(50);
  check('todo a la derecha', await p.evaluate(() => [currentMap().layout, document.querySelectorAll('#map-nodes .mm-node.left').length]), ['right', 0]);
  // Nota desde un nodo y mapa a nota
  await p.evaluate(() => { selectedNode = 'a'; renderMap(); });
  await p.click('#map-nodes [data-id="a"]', { button: 'right' }); await p.click('#note-menu .menu-item:has-text("Crear nota de este nodo")'); await p.clock.runFor(100);
  check('nota del nodo', await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Destino'); return [!!n, n.body.includes('- Italia\n  - Roma'), currentMap().nodes.find((x) => x.id === 'a').noteId === n.id]; }), [true, true, true]);
  console.log('errors:', errs); await b.close();
})();
