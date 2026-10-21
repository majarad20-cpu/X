const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 850 } });
  const notes = [
    { id: 'm', path: 'ESTOICISMO/MOC', body: '- [[Séneca|autor]]\n- ![[foto.png]]\n- [[Cartas.pdf]]\n- [[^bloque]]\n- [[Pendiente]]', createdAt: 1, updatedAt: 1 },
    { id: 's', path: 'ESTOICISMO/Séneca', body: 'Ver [[MOC]]', createdAt: 1, updatedAt: 1 },
    { id: 'e', path: 'Sin texto', createdAt: 1, updatedAt: 1 }, // llegó sin «body»
    { id: 'z', body: 'sin nombre', createdAt: 1, updatedAt: 1 }, // sin ruta: se descarta
  ];
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes, updatedAt: 1 })); }, notes);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(1000);
  check('notas reparadas', await p.evaluate(() => state.notes.map((n) => [n.path, typeof n.body]).sort()), [['ESTOICISMO/MOC', 'string'], ['ESTOICISMO/Séneca', 'string'], ['Sin texto', 'string']]);
  await p.click('#rib-graph'); await p.waitForTimeout(1200);
  check('grafo abierto', await p.evaluate(() => { const c = document.getElementById('graph-canvas').getBoundingClientRect(); return [activeTab().type, c.width > 100 && c.height > 100]; }), ['graph', true]);
  check('sin adjuntos ni bloques como «sin crear»', await p.evaluate(() => buildGraphData({}).nodes.filter((n) => n.kind === 'ghost').map((n) => n.label)), ['Pendiente']);
  // Una nota que llega sin texto mientras se usa la app (p. ej. de la nube)
  await p.evaluate(() => { state.notes.push({ id: 'y', path: 'Nueva', createdAt: 1, updatedAt: 1 }); renderAll(); });
  await p.evaluate(() => { showView('today'); openTab({ type: 'graph' }); }); await p.waitForTimeout(500);
  check('sigue funcionando', await p.evaluate(() => typeof noteById('y').body), 'string');
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
