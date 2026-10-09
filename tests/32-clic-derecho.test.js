const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const now = new Date('2026-10-09T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [{ id: 'a', title: 'Cuadrar caja', priority: 2, due: '2026-10-09', done: false, createdAt: now, tags: [] }],
    habits: [], settings: { notesWelcome: true },
    notes: [{ id: 'n', path: 'Informe', body: '# Informe\nTexto del informe.\n\n- [ ] Revisar cifras 📅 2026-10-09', createdAt: now, updatedAt: now }, { id: 'm', path: 'Otra', body: 'x', createdAt: now, updatedAt: now }],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, r => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const menu = () => p.$$eval('#note-menu .menu-item', n => n.map(x => x.querySelector('span').textContent));
  const pick = async (text) => { await p.click(`#note-menu .menu-item:has-text("${text}")`); await p.clock.runFor(100); };
  // Tarea en la lista
  await p.evaluate(() => showView('tasks'));
  await p.click('.view.active .task[data-id="a"] .title', { button: 'right', force: true });
  console.log('task menu:', (await menu()).length > 8, (await menu()).slice(0, 3));
  await pick('Prioridad alta');
  console.log('priority:', await p.evaluate(() => state.tasks[0].priority));
  await p.click('.view.active .task[data-id="a"] .title', { button: 'right', force: true }); await pick('Para mañana');
  console.log('due:', await p.evaluate(() => state.tasks[0].due));
  await p.click('.view.active .task[data-id="a"] .title', { button: 'right', force: true }); await pick('Duplicar');
  console.log('dup:', await p.evaluate(() => state.tasks.length));
  // Tarea de una nota
  const nt = await p.$('.view.active .task.from-note .title');
  await nt.click({ button: 'right', force: true }); await pick('Prioridad alta');
  console.log('note task line:', await p.evaluate(() => state.notes[0].body.split('\n').pop()));
  // Mes: clic derecho en un día
  await p.click('[data-taskview=month]');
  await p.click('.mg-day[data-key="2026-10-20"]', { button: 'right', force: true });
  console.log('day menu:', await menu());
  await pick('Abrir la agenda del día');
  console.log('agenda:', await p.isVisible('#dayview'), await p.textContent('#dv-title'));
  await p.keyboard.press('Escape');
  // Explorador: renombrar con clic derecho
  await p.click('.tree-row.file[data-id="m"]', { button: 'right', force: true });
  console.log('file menu:', (await menu()).slice(0, 4));
  await pick('Renombrar');
  await p.keyboard.press('Control+a'); await p.keyboard.type('Otra nota'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  console.log('renamed:', await p.evaluate(() => state.notes.find(n => n.id === 'm').path));
  // Pestañas: cerrar las demás
  await p.evaluate(() => { openNoteByLink('Informe'); openNoteByLink('Otra nota', { newTab: true }); });
  const tabsBefore = await p.$$eval('.ws-tab', n => n.length);
  await p.click('.ws-tab.active', { button: 'right', force: true }); await pick('Cerrar las demás');
  console.log('tabs:', tabsBefore, '→', await p.$$eval('.ws-tab', n => n.length));
  // Lectura de la nota: editar un bloque desde el menú
  await p.evaluate(() => { noteMode.set('n', 'read'); openNoteByLink('Informe'); });
  await p.click('#note-reading p', { button: 'right', force: true });
  console.log('reading menu has:', (await menu()).filter(x => /bloque|Renombrar|Eliminar nota/.test(x)));
  await pick('Editar este bloque');
  console.log('block editing:', await p.evaluate(() => [!!blockEdit, document.getElementById('note-editor').value]));
  await p.keyboard.press('Escape');
  // Dibujo
  await p.evaluate(() => openDrawing()); await p.clock.runFor(300);
  await p.keyboard.press('r'); await p.mouse.move(400, 300); await p.mouse.down(); await p.mouse.move(520, 380, { steps: 5 }); await p.mouse.up();
  await p.mouse.click(460, 340, { button: 'right', force: true });
  console.log('draw menu:', (await menu()).slice(0, 2), '| visible over drawing:', await p.evaluate(() => getComputedStyle(document.getElementById('note-menu')).zIndex));
  await pick('Duplicar');
  console.log('draw dup:', await p.evaluate(() => xd.elements.length));
  // En un campo de texto se deja el menú del navegador
  await p.evaluate(() => { document.getElementById('draw').hidden = true; showView('tasks'); });
  const prevented = await p.evaluate(() => { const i = document.getElementById('task-title'); const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }); i.dispatchEvent(ev); return ev.defaultPrevented; });
  console.log('input native menu:', !prevented);
  console.log('errors:', errs); await b.close();
})();
