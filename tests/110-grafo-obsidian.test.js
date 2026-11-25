const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const notes = [
  N('mm', 'Cerebro/MOCS/00.- MOC DE MOCS', '- [[1.- MOC - CONTABILIDAD]]\n- [[2.- MOC - ADMINISTRACIÓN]]\n'),
  N('m1', 'Cerebro/MOCS/1.- MOC - CONTABILIDAD', '---\ntipo: MOC\n---\n- [[Partida Doble]]\n- [[Balance]]\n'),
  N('m2', 'Cerebro/MOCS/2.- MOC - ADMINISTRACIÓN', '- [[FODA]]\n'),
  N('a', 'Cerebro/MATRIZ/Partida Doble', '# Partida Doble\n[[Balance]] [[No existe]]'),
  N('b', 'Cerebro/MATRIZ/Balance', '# Balance'),
  N('c', 'Cerebro/MATRIZ/FODA', '# FODA'),
  N('d', 'Cerebro/MATRIZ/BSC', '---\nmoc: "[[2.- MOC - ADMINISTRACIÓN]]"\n---\n[[FODA]]'),
  N('e', 'Cerebro/Suelta', '[[Balance]]'),
];
const run = async (b, saved, fn) => {
  const c = await b.newContext({ viewport: { width: 1200, height: 800 } });
  await c.addInitScript(([notes, saved]) => {
    if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes, updatedAt: 1 }));
    if (saved && !localStorage.getItem('enfoque:graph')) localStorage.setItem('enfoque:graph', JSON.stringify(saved));
  }, [notes, saved]);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  await fn(p);
  await c.close();
  return errs;
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const fails = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) fails.push(label); };

  // Quien ya tenía opciones guardadas: estilo Obsidian y «sin crear» apagado una vez.
  let errs = await run(b, { tags: false, ghosts: true, orphans: true, filter: '', depth: 1 }, async (p) => {
    check('migración', await p.evaluate(() => [graphOpts.obsidian, graphOpts.ghosts]), [true, false]);
    check('MOC de cada nota', await p.evaluate(() => { const d = buildGraphData({ obsidian: true }); const m = (id) => d.nodes.find((n) => n.id === `n:${id}`).moc; return [m('mm'), m('m1'), m('a'), m('b'), m('c'), m('d'), m('e'), d.nodes.filter((n) => n.isMoc).length]; }), ['mm', 'm1', 'm1', 'm1', 'm2', 'm2', null, 3]);
    check('nombres cortos', await p.evaluate(() => [graphMocName('1.- MOC - CONTABILIDAD'), graphMocName('8.- MOC - RECURSOS HUMANOS', { num: true }), graphMocName('00.- MOC DE MOCS')]), ['Contabilidad', '8. Recursos humanos', 'Moc de mocs']);
    await p.evaluate(() => openTab({ type: 'graph' })); await p.waitForTimeout(1500);
    check('panel oscuro y botón', await p.evaluate(() => [document.querySelector('#graph-pane').classList.contains('obs'), document.querySelector('[data-gopt=obsidian]').ariaPressed, getComputedStyle(document.querySelector('#graph-pane .graph-stage')).backgroundColor]), [true, 'true', 'rgb(46, 52, 64)']);
    check('leyenda por MOC', await p.evaluate(() => [...document.querySelectorAll('.gl-item')].map((x) => x.textContent)), ['Moc de mocs', '1. Contabilidad', '2. Administración', 'Sin MOC']);
    check('colores', await p.evaluate(() => [globalGraph.nodeColor(globalGraph.byId.get('n:a')), globalGraph.nodeColor(globalGraph.byId.get('n:e')), globalGraph.nodeColor(globalGraph.byId.get('n:mm'))]), ['#88c0d0', '#616e88', '#eceff4']);
    check('MOC más grande', await p.evaluate(() => globalGraph.radius(globalGraph.byId.get('n:m1')) > 2 * globalGraph.radius(globalGraph.byId.get('n:b'))), true);
    check('fondo dibujado', await p.evaluate(() => [...document.querySelector('#graph-canvas').getContext('2d').getImageData(2, 2, 1, 1).data].slice(0, 3)), [46, 52, 64]);
    if (out) await p.screenshot({ path: `${out}/110-grafo-obsidian.png` });
    // Volver al estilo clásico.
    await p.click('[data-gopt=obsidian]'); await p.waitForTimeout(300);
    check('clásico', await p.evaluate(() => [graphOpts.obsidian, document.querySelector('#graph-pane').classList.contains('obs'), [...document.querySelectorAll('.gl-item')].map((x) => x.textContent)[0], JSON.parse(localStorage.getItem('enfoque:graph')).obsidian]), [false, false, 'Raíz', false]);
  });
  // Quien no tenía opciones: estilo Obsidian, «sin crear» como antes.
  errs = errs.concat(await run(b, null, async (p) => {
    check('nuevo usuario', await p.evaluate(() => [graphOpts.obsidian, graphOpts.ghosts]), [true, true]);
  }));
  console.log('errors:', JSON.stringify([...errs, ...fails]));
  await b.close();
  process.exit(errs.length || fails.length ? 1 : 0);
})();
