const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-11T10:00:00').getTime();
const seed = {
  tasks: [], habits: [], settings: { notesWelcome: true }, notes: [],
  ideas: [
    { id: 'i1', text: 'Un ensayo sobre la paciencia', tags: [], pinned: false, createdAt: now - 3000, updatedAt: now },
    { id: 'i2', text: 'Novela de un faro', tags: [], pinned: false, cat: 'libro', createdAt: now - 2000, updatedAt: now },
    { id: 'i3', text: 'Negocio de café', tags: [], pinned: false, cat: 'negocio', createdAt: now - 1000, updatedAt: now },
  ],
  updatedAt: 1,
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  await p.evaluate(() => showView('ideas')); await p.clock.runFor(50);
  // ---------- A. Categorías ----------
  const shown = () => p.$$eval('#idea-list .idea .idea-text', (n) => n.map((x) => x.textContent));
  check('chips', await p.$$eval('#idea-cats .tag', (n) => n.slice(0, 4).map((x) => x.textContent)), ['Todas · 3', '💡 General · 1', '✍️ Ensayo', '📚 Libro · 1']);
  check('etiqueta en la tarjeta', await p.$$eval('#idea-list .idea-cat-badge', (n) => n.map((x) => x.textContent)), ['💼 Negocio', '📚 Libro', '💡 General']);
  await p.click('#idea-cats [data-cat=libro]');
  check('filtrar por Libro', await shown(), ['Novela de un faro']);
  // Nueva idea con la categoría del filtro
  await p.fill('#idea-text', 'Capítulo final en el faro');
  check('selector sigue al filtro', await p.inputValue('#idea-cat'), 'libro');
  await p.click('#idea-form button[type=submit]'); await p.clock.runFor(50);
  check('nueva idea en Libro', await p.evaluate(() => state.ideas.at(-1).cat), 'libro');
  await p.click('#idea-cats .tag:first-child');
  // Cambiar categoría con clic derecho
  await p.click('#idea-list .idea:has-text("ensayo sobre la paciencia")', { button: 'right' }); await p.clock.runFor(50);
  await p.click('#note-menu .menu-item:has-text("Categoría")'); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("Ensayo")'); await p.clock.runFor(50);
  check('categoría cambiada', await p.evaluate(() => state.ideas.find((i) => i.id === 'i1').cat), 'ensayo');
  // Categoría propia
  await p.evaluate(() => newIdeaCat()); await p.clock.runFor(50);
  await p.keyboard.type('🎨 Pintura'); await p.keyboard.press('Enter'); await p.clock.runFor(50);
  check('categoría propia', await p.evaluate(() => ideaCats().at(-1)), { id: 'pintura', icon: '🎨', label: 'Pintura' });
  // Borrar una categoría: sus ideas pasan a General
  await p.click('#idea-cats [data-cat=negocio]', { button: 'right' }); await p.clock.runFor(50);
  await p.click('#note-menu .menu-item:has-text("Borrar categoría")'); await p.clock.runFor(50);
  check('borrada', await p.evaluate(() => [ideaCats().some((c) => c.id === 'negocio'), ideaCatOf(state.ideas.find((i) => i.id === 'i3'))]), [false, 'general']);
  // ---------- B. Mis obras ----------
  await p.click('[data-ideaview=works]'); await p.clock.runFor(50);
  check('vacío', await p.textContent('#ideas-works-pane .empty'), 'Aquí van tus textos propios: ensayos, libros, relatos, poemas… Crea la primera arriba.');
  await p.fill('#ideas-works-pane .work-form input', 'El faro');
  await p.selectOption('#ideas-works-pane .work-form select', 'libro');
  await p.click('#ideas-works-pane .work-form button'); await p.clock.runFor(50);
  const work = await p.evaluate(() => { const w = allWorks()[0]; return [w.path, propOf(w, 'obra'), propOf(w, 'estado'), String(propOf(w, 'objetivo')), workChapters(w).map((n) => n.path)]; });
  check('obra creada', work, ['Obras/El faro/El faro', 'libro', 'idea', '50000', ['Obras/El faro/Capítulo 1']]);
  check('detalle abierto', await p.textContent('.work-name'), 'El faro');
  // Capítulos: añadir, escribir y reordenar
  await p.click('#ideas-works-pane button:has-text("Añadir capítulo")'); await p.clock.runFor(50);
  await p.keyboard.press('Control+A'); await p.keyboard.type('El naufragio'); await p.keyboard.press('Enter'); await p.clock.runFor(80);
  await p.evaluate(() => { const ch = state.notes.find((n) => n.path === 'Obras/El faro/El naufragio'); ch.body = '# El naufragio\n\nEl mar rugía contra las rocas aquella noche de invierno.'; save(); openWork(allWorks()[0].id); });
  await p.clock.runFor(50);
  check('capítulos', await p.$$eval('.work-ch .work-ch-name', (n) => n.map((x) => x.textContent)), ['Capítulo 1', 'El naufragio']);
  await p.click('.work-ch:nth-child(2) .icon-link:has-text("↑")'); await p.clock.runFor(50);
  check('reordenados', await p.$$eval('.work-ch .work-ch-name', (n) => n.map((x) => x.textContent)), ['El naufragio', 'Capítulo 1']);
  check('lista en la nota', await p.evaluate(() => /## Capítulos\n1\. \[\[Obras\/El faro\/El naufragio\|El naufragio\]\]\n2\. \[\[Obras\/El faro\/Capítulo 1\|Capítulo 1\]\]/.test(allWorks()[0].body)), true);
  check('palabras', await p.evaluate(() => workStats(allWorks()[0]).words), 10);
  // Estado y objetivo
  await p.selectOption('.work-props select[aria-label=estado]', 'borrador'); await p.clock.runFor(50);
  await p.fill('.work-goal', '1000'); await p.dispatchEvent('.work-goal', 'change'); await p.clock.runFor(50);
  check('estado y objetivo', await p.evaluate(() => [propOf(allWorks()[0], 'estado'), String(propOf(allWorks()[0], 'objetivo')), workStats(allWorks()[0]).pct]), ['borrador', '1000', 1]);
  // Ideas de la obra
  await p.fill('.work-idea-form input', 'El farero tiene un secreto');
  await p.click('.work-idea-form button'); await p.clock.runFor(50);
  check('idea de la obra', await p.evaluate(() => { const i = state.ideas.at(-1); return [i.obra === allWorks()[0].id, i.cat]; }), [true, 'libro']);
  // Enviar una idea existente a la obra (clic derecho)
  await p.evaluate(() => pickWorkForIdea(state.ideas.find((i) => i.id === 'i2'))); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("El faro")'); await p.clock.runFor(50);
  check('idea enviada', await p.evaluate(() => state.ideas.find((i) => i.id === 'i2').obra === allWorks()[0].id), true);
  await p.evaluate(() => openWork(allWorks()[0].id)); await p.clock.runFor(50);
  check('ideas en el detalle', await p.$$eval('.work-idea span', (n) => n.map((x) => x.textContent).sort()), ['El farero tiene un secreto', 'Novela de un faro']);
  // Exportar a Markdown
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('.work-actions button:has-text("Markdown")')]);
  const md = dl ? require('fs').readFileSync(await dl.path(), 'utf8') : '';
  check('markdown', md.includes('# El faro') && md.indexOf('El naufragio') < md.indexOf('# Capítulo 1') && !md.includes('obra: libro'), true);
  // Lista de obras
  await p.click('.work-head .back-link'); await p.clock.runFor(50);
  check('tarjeta', await p.$$eval('.work-card', (n) => n.map((x) => [x.querySelector('.work-title').textContent, x.querySelector('.work-state').textContent])), [['El faro', '✏️ Borrador']]);
  await p.click('#ideas-works-pane .tag:has-text("Publicado")');
  check('filtro por estado', await p.$$eval('.work-card', (n) => n.length), 0);
  console.log('errors:', errs); await b.close();
})();
