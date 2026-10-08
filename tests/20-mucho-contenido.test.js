const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
// Muchos datos: 3000 notas enlazadas, 3000 tareas y 750 entradas de diario (más de 5 MB en total,
// por encima de lo que cabe en localStorage). Comprueba tiempos y que todo se conserva al recargar.
const fill = (N) => {
  const words = 'proyecto reunión idea cliente diseño web informe lectura viaje compra salud código equipo plan objetivo revisión'.split(' ');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const w = () => words[(rnd() * words.length) | 0];
  const names = Array.from({ length: N }, (_, i) => `Nota ${i} ${w()}`);
  const now = Date.now();
  const filler = ' '.repeat(900);
  state.notes = Array.from({ length: N }, (_, i) => ({ id: 'n' + i, path: `Carpeta${i % 20}/${names[i]}`, body: `# Nota ${i}\n` + Array.from({ length: 12 }, () => `${w()} ${w()} [[${rnd() < 0.95 ? names[(rnd() * N) | 0] : 'Idea ' + w()}]] #${w()}`).join('\n') + `\n- [ ] tarea ${i} 📅 2026-10-${10 + (i % 18)}\n${filler}`, createdAt: now, updatedAt: now - i * 1000 }));
  state.folders = Array.from({ length: 20 }, (_, i) => 'Carpeta' + i);
  state.tasks = Array.from({ length: N }, (_, i) => ({ id: 't' + i, title: `Tarea ${i} ${w()} #${w()}`, tags: [w()], priority: 1 + (i % 3), due: i % 3 ? `2026-10-${10 + (i % 18)}` : null, done: false, createdAt: now - i }));
  state.journal = Array.from({ length: N / 4 }, (_, i) => ({ id: 'j' + i, kind: 'dump', date: `2026-0${1 + (i % 9)}-1${i % 9}`, text: Array.from({ length: 40 }, w).join(' '), createdAt: now - i * 864e5 }));
  save();
  renderAll();
  return JSON.stringify(state).length;
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url);
  const size = await p.evaluate(fill, 3000);
  console.log('data size > 5 MB:', size > 5 * 1024 * 1024);
  const time = (expr) => p.evaluate((e) => { const a = performance.now(); (0, eval)(e); return Math.round(performance.now() - a); }, expr);
  const t = {
    renderAll: await time('renderAll()'),
    saveAndRender: await time('save(); renderAll()'),
    tasksView: await time("showView('tasks')"),
    backlinks: await time("openNoteByLink(state.notes[7].path); renderRightPanel()"),
    backlinksAgain: await time("openNoteByLink(state.notes[8].path); renderRightPanel()"),
    findMissing: await time("for (let i = 0; i < 5000; i++) findNoteByName('No existe ' + i)"),
  };
  console.log('times:', JSON.stringify(t));
  const budget = { renderAll: 150, saveAndRender: 400, tasksView: 600, backlinks: 600, findMissing: 200, backlinksAgain: 300 };
  console.log('within budget:', Object.entries(budget).every(([k, v]) => t[k] <= v) || JSON.stringify(Object.entries(budget).filter(([k, v]) => t[k] > v)));
  await p.evaluate(() => showView('tasks'));
  console.log('task list paged:', await p.$$eval('#task-list > li.task, #task-list > li[data-id]', n => n.length), '| more button:', await p.textContent('#task-list .show-more'));
  await p.click('#task-list .show-more');
  console.log('after show more:', await p.$$eval('#task-list > li[data-id]', n => n.length));
  // Grafo: debe abrirse y dar pasos rápidos con miles de nodos.
  await p.keyboard.press('Control+g');
  const g = await p.evaluate(() => { const a = performance.now(); globalGraph.step(); const s = performance.now() - a; const d0 = performance.now(); globalGraph.draw(); return { nodes: globalGraph.nodes.length, step: Math.round(s), draw: Math.round(performance.now() - d0) }; });
  console.log('graph nodes:', g.nodes, '| step fast:', g.step < 250, '| draw fast:', g.draw < 250);
  await p.screenshot({ path: S + '/big-graph.png' });
  // Guardado en IndexedDB: más de 5 MB sobrevive a la recarga.
  await p.evaluate(() => { state.notes[0].body += '\nÚltimo cambio'; save(); flushLocal(); });
  await p.waitForTimeout(1500);
  console.log('localStorage too small:', await p.evaluate(() => !idb.lsFits && localStorage.getItem('enfoque:v1') === null), '| idb ok:', await p.evaluate(() => idb.ok));
  const t0 = Date.now();
  await p.reload();
  await p.waitForFunction(() => document.documentElement.dataset.ready);
  console.log('reload fast:', Date.now() - t0 < 6000, '| notes after reload:', await p.evaluate(() => state.notes.length), '| last change kept:', await p.evaluate(() => state.notes[0].body.endsWith('Último cambio')));
  await p.evaluate(() => showView('settings'));
  console.log('meter:', await p.textContent('.storage-row:last-child .sr-label'), '|', await p.textContent('.storage-row:last-child .sr-num'), '|', (await p.textContent('.storage-row:last-child .sr-alert').catch(() => 'sin aviso')) || 'sin aviso');

  // Migración: datos solo en localStorage (versión anterior) pasan a IndexedDB.
  const c2 = await b.newContext();
  await c2.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [{ id: 'x', title: 'De antes', priority: 2, done: false, createdAt: 1 }], habits: [], settings: { notesWelcome: true }, updatedAt: 5 })); } });
  const p2 = await c2.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(url); await p2.waitForTimeout(500);
  console.log('migrated to idb:', await p2.evaluate(() => idbGet('state').then((s) => s && s.tasks.map((t) => t.title))));
  // IndexedDB más reciente gana sobre una copia vieja en localStorage.
  await p2.evaluate(() => { state.tasks[0].title = 'Cambiada'; save(); flushLocal(); localStorage.setItem('enfoque:v1', JSON.stringify({ ...state, tasks: [{ id: 'x', title: 'Vieja', priority: 2, done: false, createdAt: 1 }], updatedAt: 6 })); });
  await p2.waitForTimeout(300);
  await p2.reload(); await p2.waitForTimeout(500);
  console.log('newest wins:', await p2.evaluate(() => state.tasks.map((t) => t.title)));
  console.log('errors:', errs); await b.close();
})();
