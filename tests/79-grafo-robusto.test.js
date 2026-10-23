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
  // Ruta parcial, como en Obsidian
  check('ruta parcial', await p.evaluate(() => { state.notes.push({ id: 'pp', path: 'Cerebro/00.- ATLAS/MOCS/MOC X', body: '', createdAt: 1, updatedAt: 1 }); dataRev++; return [findNoteByName('00.- ATLAS/MOCS/MOC X')?.id, findNoteByName('MOCS/MOC X')?.id, findNoteByName('OTRA/MOC X')?.id, findNoteByName('OTRA/Nada') || null]; }), ['pp', 'pp', 'pp', null]);
  // Rutas de Obsidian que ya no existen (carpetas movidas tras migrar) y tildes descompuestas
  check('ruta antigua', await p.evaluate(() => {
    state.notes.push({ id: 'e1', path: 'ESTOICISMO/100 - Fundamentos/101 - Que\u0301 es el Estoicismo', body: '', createdAt: 1, updatedAt: 1 });
    state.notes.push({ id: 'e2', path: 'Otra/ESTOICISMO/200 - Autores/203 - Séneca', body: '', createdAt: 1, updatedAt: 1 });
    state.notes.push({ id: 'e3', path: 'Copia/203 - Séneca', body: '', createdAt: 1, updatedAt: 1 });
    dataRev++;
    return [findNoteByName('00.- ATLAS/ESTOICISMO/100 - Fundamentos/101 - Qué es el Estoicismo')?.id, findNoteByName('101 - Qué es el Estoicismo')?.id, findNoteByName('00.- ATLAS/ESTOICISMO/200 - Autores/203 - Séneca')?.id];
  }), ['e1', 'e1', 'e2']);
  // Bóveda grande con un índice (MOC) de 600 enlaces: el dibujo no se desborda y se ve entero
  await p.evaluate(() => { for (let i = 0; i < 2400; i++) state.notes.push({ id: 'x' + i, path: `Cerebro/N${i}`, body: i === 0 ? Array.from({ length: 600 }, (_, k) => `[[N${k + 1}]]`).join(' ') : `[[N${(i * 13) % 2400}]] [[Fantasma ${i % 300}]]`, createdAt: 1, updatedAt: 1 }); save(); renderAll(); openTab({ type: 'graph' }); });
  for (let i = 0; i < 16 && (await p.evaluate(() => globalGraph.alpha > 0.02)); i++) await p.waitForTimeout(500);
  await p.waitForTimeout(300);
  check('grafo grande estable y visible', await p.evaluate(() => { const g = globalGraph; const far = g.nodes.filter((n) => !Number.isFinite(n.x) || Math.abs(n.x) > 1e5 || Math.abs(n.y) > 1e5).length; const on = g.nodes.filter((n) => { const s = g.toScreen(n); return s.x >= 0 && s.x <= g.w && s.y >= 0 && s.y <= g.h; }).length; return [g.nodes.length > 2600, far, on / g.nodes.length > 0.95]; }), [true, 0, true]);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
