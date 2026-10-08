const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const now = new Date('2026-10-07T10:00:00').getTime();
const seed = {
  tasks: [], habits: [], settings: { focus: 25, short: 5, long: 15, logVersion: 1, notesWelcome: true }, pomodoros: {},
  journal: [{ id: 'j1', date: '2026-10-06', createdAt: now - 864e5, kind: 'dump', text: '- Llamar a mamá\n- Pensar en el viaje', mood: 4 },
            { id: 'j2', date: '2026-10-06', createdAt: now - 800e5, kind: 'gratitude', sections: [{ q: 'Hoy agradezco…', a: 'El sol' }] }],
  ideas: [{ id: 'i1', text: 'Podcast de cocina\nEpisodios de 15 min', tags: ['proyectos'], createdAt: now - 5e6 }],
  maps: [{ id: 'm1', title: 'Viaje', createdAt: now - 4e6, updatedAt: now, nodes: [{ id: 'root', parent: null, text: 'Viaje' }, { id: 'a', parent: 'root', text: 'Destino' }, { id: 'b', parent: 'a', text: 'Asturias' }, { id: 'c', parent: 'root', text: 'Presupuesto' }] }],
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url);
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('enfoque:v1')));
  // Proyecto + su nota
  await p.evaluate(() => showView('projects'));
  await p.fill('#project-name', 'Web nueva'); await p.click('#project-form button');
  await p.click('.project-card'); console.log('pd-note label:', await p.textContent('#pd-note'));
  await p.click('#pd-note');
  console.log('project note:', await p.textContent('#note-crumbs'), '| caret line focused:', await p.evaluate(() => document.activeElement.id));
  await p.keyboard.type('Diseñar portada 📅 mañana !alta');
  await p.keyboard.press('Enter'); await p.keyboard.type('Escribir textos');
  await p.clock.runFor(1000);
  // Nota suelta con tareas
  await p.keyboard.press('Control+o'); await p.keyboard.type('Recados'); await p.keyboard.press('Enter');
  await p.fill('#note-editor', '## Pendientes\n- [ ] Llamar al banco 📅 2026-10-07 ⏰ 12:00 #casa\n- [ ] Revisar contrato +web\n- [x] Ya hecho ✅ 2026-10-05\n```\n- [ ] dentro de código no cuenta\n```');
  await p.dispatchEvent('#note-editor', 'input'); await p.clock.runFor(1000);
  // Nota diaria con tarea sin fecha
  await p.keyboard.press('Alt+d');
  const daily = await p.inputValue('#note-editor');
  await p.fill('#note-editor', daily.replace('- [ ] \n', '- [ ] Comprar pan\n')); await p.dispatchEvent('#note-editor', 'input'); await p.clock.runFor(1000);
  // Tareas
  await p.evaluate(() => showView('tasks'));
  console.log('tasks list:', await p.$$eval('#task-list .task', n => n.map(x => x.innerText.replace(/\n/g, ' | '))));
  await p.evaluate(() => showView('today'));
  console.log('today:', await p.$$eval('#today-list .task .title', n => n.map(x => x.textContent)), '| stats', await p.$$eval('#view-today .stat .num', n => n.map(x => x.textContent).join(',')));
  // Completar desde Hoy
  await p.click('#today-list .task:has-text("Llamar al banco") input');
  const s1 = await store();
  console.log('note line after check:', s1.notes.find(n => n.path === 'Recados').body.split('\n')[1], '| completions:', JSON.stringify(s1.completions), '| log:', s1.log.filter(e => e.type === 'task').map(e => e.text + ' ' + e.detail));
  // Desmarcar desde la nota en lectura
  await p.keyboard.press('Control+o'); await p.keyboard.type('Recados'); await p.keyboard.press('Enter');
  if (await p.isVisible('#note-editor')) await p.keyboard.press('Control+e');
  await p.click('#note-reading input.task-check >> nth=0');
  const s2 = await store();
  console.log('after uncheck in note:', s2.notes.find(n => n.path === 'Recados').body.split('\n')[1], '| completions:', JSON.stringify(s2.completions), '| log tasks:', s2.log.filter(e => e.type === 'task' && !e.removed).length);
  // Proyecto: avance con tareas de su nota y +web
  await p.evaluate(() => showView('projects')); await p.click('#project-back').catch(() => {});
  console.log('project card:', await p.textContent('.project-card .pc-meta'));
  await p.click('.project-card');
  await p.click('#pd-tasks .task:has-text("Revisar contrato") input');
  console.log('progress:', await p.textContent('#pd-percent'), '|', await p.textContent('#pd-status-text'));
  await p.screenshot({ path: S + '/p2-project.png' });
  // Pasar a notas
  await p.evaluate(() => document.getElementById('open-settings').click());
  await p.click('#import-notes');
  console.log('import:', await p.textContent('#import-message'));
  const s3 = await store();
  console.log('notes:', s3.notes.map(n => n.path).sort());
  console.log('daily 06:', JSON.stringify(s3.notes.find(n => n.path === 'Diario/2026-10-06').body.split('## ✍️ Diario')[1]));
  console.log('map note:', JSON.stringify(s3.notes.find(n => n.path === 'Mapas/Viaje').body));
  await p.click('#import-notes'); console.log('import again:', await p.textContent('#import-message'));
  await p.evaluate(() => showView('tasks'));
  await p.screenshot({ path: S + '/p2-tasks.png' });
  console.log('errors:', errs); await b.close();
})();
