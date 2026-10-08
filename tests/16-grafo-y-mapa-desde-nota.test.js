const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const now = new Date('2026-10-07T10:00:00').getTime();
const n = (id, path, body) => ({ id, path, body, createdAt: now, updatedAt: now });
const seed = {
  tasks: [], habits: [], pomodoros: {}, settings: { focus: 25, short: 5, long: 15, logVersion: 1, notesWelcome: true },
  folders: ['Proyectos', 'Ideas', 'Diario'],
  notes: [
    n('a', 'Inicio', '# Mi sistema\nEnlaces: [[Web nueva]], [[Podcast de cocina]], [[Lecturas]] y [[Viaje a Asturias]]\n#indice'),
    n('b', 'Proyectos/Web nueva', '# Web nueva\n## Objetivo\n- Lanzar antes del puente\n## Fases\n- Diseño\n  - Portada\n  - [ ] Paleta de colores\n- Textos\n- Lanzamiento\n## Equipo\n- [[Ana]]\n- [[Luis]]\n#trabajo'),
    n('c', 'Ideas/Podcast de cocina', 'Episodios cortos. Ver [[Web nueva]] para la landing. #ideas'),
    n('d', 'Lecturas', '- [[Hábitos atómicos]]\n- [[Deep Work]]\n#ideas'),
    n('e', 'Diario/2026-10-07', 'Hoy hablé con [[Ana]] sobre [[Web nueva]].'),
    n('f', 'Ana', 'Diseñadora. Proyectos: [[Web nueva]]'),
    n('g', 'Nota suelta', 'Sin enlaces'),
  ],
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(url);
  await p.keyboard.press('Control+g'); await p.waitForTimeout(2500);
  console.log('graph:', await p.textContent('#graph-count'), '| legend:', await p.$$eval('.gl-item', n => n.map(x => x.textContent)));
  await p.screenshot({ path: S + '/graph.png' });
  await p.click('[data-gopt=orphans]'); await p.click('[data-gopt=tags]'); await p.waitForTimeout(1500);
  console.log('no orphans + tags:', await p.textContent('#graph-count'));
  await p.fill('#graph-filter', 'web'); await p.waitForTimeout(300);
  console.log('filter web:', await p.textContent('#graph-count'));
  await p.fill('#graph-filter', ''); await p.waitForTimeout(1500);
  // Clic en un nodo abre la nota
  const pt = await p.evaluate(() => { const nd = globalGraph.nodes.find(x => x.label === 'Lecturas'); const s = globalGraph.toScreen(nd); const r = globalGraph.canvas.getBoundingClientRect(); return { x: r.left + s.x, y: r.top + s.y }; });
  await p.mouse.click(pt.x, pt.y);
  console.log('opened from graph:', await p.textContent('.ws-tab.active'));
  // Grafo local
  await p.click('[data-rpane=graph]'); await p.waitForTimeout(1500);
  console.log('local nodes depth1:', await p.evaluate(() => localGraph.nodes.map(n => n.label).sort().join(', ')));
  await p.selectOption('#local-depth', '2'); await p.waitForTimeout(300);
  console.log('local nodes depth2:', await p.evaluate(() => localGraph.nodes.length));
  // Clic en un nodo fantasma crea la nota
  await p.selectOption('#local-depth', '1'); await p.waitForTimeout(1500);
  const gp = await p.evaluate(() => { const nd = localGraph.nodes.find(x => x.label === 'Deep Work'); const s = localGraph.toScreen(nd); const r = localGraph.canvas.getBoundingClientRect(); return { x: r.left + s.x, y: r.top + s.y }; });
  await p.mouse.click(gp.x, gp.y);
  console.log('ghost created:', await p.textContent('.ws-tab.active'), await p.evaluate(() => state.notes.some(n => n.path === 'Deep Work')));
  await p.screenshot({ path: S + '/graph-local.png' });
  // Mapa mental desde la nota
  await p.keyboard.press('Control+o'); await p.keyboard.type('Web nueva'); await p.keyboard.press('Enter');
  await p.click('#note-more'); await p.click('.menu-item:has-text("Crear mapa mental")');
  console.log('map nodes:', await p.$$eval('.mm-node', n => n.map(x => x.textContent.replace(/[−+]\\d*$/, ''))).catch(e => e.message));
  console.log('source buttons:', await p.isVisible('#map-source'), await p.isVisible('#map-refresh'));
  await p.click('#mm-fit');
  await p.screenshot({ path: S + '/map-from-note.png' });
  // Cambiar la nota y actualizar el mapa
  await p.click('#map-source');
  await p.evaluate(() => { const n = state.notes.find(x => x.path === 'Proyectos/Web nueva'); n.body += '\n## Riesgos\n- Plazos'; save(); });
  await p.evaluate(() => showView('ideas'));
  await p.click('#map-refresh');
  console.log('after refresh has Riesgos:', await p.$$eval('.mm-node', n => n.some(x => x.textContent.startsWith('Riesgos'))), '| maps:', await p.evaluate(() => state.maps.length));
  await p.emulateMedia({ colorScheme: 'dark' }); await p.keyboard.press('Control+g'); await p.waitForTimeout(800); await p.screenshot({ path: S + '/graph-dark.png' });
  console.log('errors:', errs); await b.close();
})();
