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
  await p.keyboard.down('Shift');
  await p.mouse.move(from.x + 10, from.y + 10); await p.mouse.down();
  await p.mouse.move(from.x + 40, from.y + 30, { steps: 4 });
  await p.mouse.move(to.x + 15, to.y + 10, { steps: 6 });
  check('Mayús: marca destino', await p.evaluate(() => !!document.querySelector('.mm-node.mm-drop')), true);
  await p.mouse.up(); await p.keyboard.up('Shift'); await p.clock.runFor(100);
  check('Mayús+arrastrar cambia de rama', await p.evaluate(() => currentMap().nodes.find((n) => n.id === 'a1').parent), 'b');
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
  // ---------- Mover libremente ----------
  await p.evaluate(() => { openMap(currentMap().id); mmFoldAll(false); currentMap().kind = undefined; mmResetPositions(true); selectedNode = 'b'; renderMap(); fitMap(); });
  const b0 = await box('b'); const k0 = await p.evaluate(() => { const m = currentMap(); const k = childrenOf(m, 'b')[0]; return [k.id, mapLayout.pos[k.id].x, mapLayout.pos[k.id].y, mapLayout.pos.b.x, mapLayout.pos.b.y]; });
  await p.mouse.move(b0.x + 10, b0.y + 8); await p.mouse.down();
  await p.mouse.move(b0.x + 60, b0.y + 120, { steps: 8 }); await p.clock.runFor(50);
  await p.mouse.up(); await p.clock.runFor(100);
  const after = await p.evaluate((kid) => { const m = currentMap(); const n = m.nodes.find((x) => x.id === 'b'); return [n.dx, n.dy, n.parent, mapLayout.pos[kid].x - mapLayout.pos.b.x, mapLayout.pos[kid].y - mapLayout.pos.b.y]; }, k0[0]);
  check('movido libremente (sin cambiar de rama)', [after[0] > 30, after[1] > 80, after[2]], [true, true, 'root']);
  check('sus hijos lo acompañan', [after[3], after[4]], [k0[1] - k0[3], k0[2] - k0[4]]);
  await p.focus('#map-canvas'); await p.keyboard.press('Control+z'); await p.clock.runFor(50);
  check('deshacer el movimiento', await p.evaluate(() => currentMap().nodes.find((x) => x.id === 'b').dx || 0), 0);
  await p.keyboard.press('Control+y'); await p.clock.runFor(50);
  // En un organigrama, la línea hasta la idea movida se vuelve a trazar
  await p.evaluate(() => { currentMap().kind = 'org'; renderMap(); });
  check('línea que sigue a la idea', await p.evaluate(() => { const g = document.querySelector('#map-edges g'); return [...g.querySelectorAll('path')].some((x) => x.getAttribute('d').includes('C')); }), true);
  // Doble clic en un hueco: idea nueva ahí
  const cv = await (await p.$('#map-canvas')).boundingBox();
  const n0 = await p.evaluate(() => currentMap().nodes.length);
  await p.evaluate(() => { selectedNode = 'root'; renderMap(); });
  await p.mouse.dblclick(cv.x + cv.width - 60, cv.y + cv.height - 40); await p.clock.runFor(100);
  check('doble clic crea idea', await p.evaluate((n) => [currentMap().nodes.length === n + 1, !!document.querySelector('.mm-input')], n0), [true, true]);
  const spot = await p.evaluate(() => { const el = document.querySelector('.mm-input').closest('.mm-node').getBoundingClientRect(); return [el.x + el.width / 2, el.y + el.height / 2]; });
  await p.keyboard.type('Aquí'); await p.keyboard.press('Enter'); await p.clock.runFor(50);
  check('aparece donde se hizo doble clic', Math.abs(spot[0] - (cv.x + cv.width - 60)) < 30 && Math.abs(spot[1] - (cv.y + cv.height - 40)) < 30, true);
  // Colgar de otra idea desde el menú
  await p.evaluate(() => { selectedNode = currentMap().nodes.find((x) => x.text === 'Aquí').id; mmPickParent(); }); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("Presupuesto")'); await p.clock.runFor(50);
  check('colgar de otra idea', await p.evaluate(() => { const n = currentMap().nodes.find((x) => x.text === 'Aquí'); return [n.parent, n.dx === undefined]; }), ['b', true]);
  check('sin botón de hermano', await p.isHidden('#mm-sibling'), true);
  console.log('errors:', errs); await b.close();
})();
