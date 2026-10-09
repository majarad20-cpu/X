const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const now = new Date('2026-10-09T10:20:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [
      { id: 'a', title: 'Cuadrar caja', priority: 3, due: '2026-10-09', time: '09:00', done: false, createdAt: now, tags: [] },
      { id: 'b', title: 'Revisar facturas', priority: 2, due: '2026-10-09', time: '09:15', done: false, createdAt: now, tags: [] },
      { id: 'c', title: 'Llamar al contador', priority: 1, due: '2026-10-09', done: false, createdAt: now, tags: [] },
    ],
    habits: [], settings: { notesWelcome: true },
    notes: [{ id: 'n', path: 'Pendientes', body: '- [ ] Enviar declaración 📅 2026-10-09 ⏰ 16:00', createdAt: now, updatedAt: now }],
    updatedAt: 1,
  });
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  await p.evaluate(() => showView('tasks')); await p.click('[data-taskview=month]');
  await p.click('.mg-day[data-key="2026-10-09"]'); await p.clock.runFor(100);
  console.log('open:', await p.isVisible('#dayview'), '|', await p.textContent('#dv-title'));
  const blocks = () => p.$$eval('#dv-grid .dv-block', n => n.map(x => `${x.querySelector('.dv-btitle').textContent}@${x.querySelector('.dv-btime').textContent}`));
  console.log('blocks:', await blocks());
  console.log('overlap side by side:', await p.$$eval('#dv-grid .dv-block.task', n => n.slice(0, 2).map(x => x.style.width)));
  console.log('untimed:', await p.$$eval('#dv-untimed .dv-ut-title', n => n.map(x => x.textContent)));
  console.log('now line:', await p.isVisible('.dv-now'));
  // Crear una tarea tocando las 14:00
  const lane = await (await p.$('#dv-grid .dv-lane')).boundingBox();
  await p.mouse.click(lane.x + 200, lane.y + 14 * 56 + 10);
  await p.keyboard.type('Reunión con el banco !alta'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  console.log('created:', JSON.stringify(await p.evaluate(() => state.tasks.filter(t => t.title.startsWith('Reunión')).map(t => [t.due, t.time, t.priority]))));
  // Arrastrar «Cuadrar caja» a las 11:00
  const blk = await (await p.$('.dv-block[data-id="a"]')).boundingBox();
  await p.mouse.move(blk.x + 40, blk.y + 10); await p.mouse.down();
  await p.mouse.move(blk.x + 40, blk.y + 10 + 2 * 56, { steps: 8 }); await p.mouse.up(); await p.clock.runFor(100);
  console.log('moved:', await p.evaluate(() => state.tasks.find(t => t.id === 'a').time));
  // Alargar «Revisar facturas» a 1 hora con el borde inferior
  const g = await (await p.$('.dv-block[data-id="b"] .dv-grip')).boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + 3); await p.mouse.down(); await p.mouse.move(g.x + g.width / 2, g.y + 3 + 28, { steps: 5 }); await p.mouse.up(); await p.clock.runFor(100);
  console.log('duration:', await p.evaluate(() => state.tasks.find(t => t.id === 'b').duration));
  // Arrastrar la tarea sin hora a las 17:30
  const ut = await (await p.$('.dv-ut:has-text("Llamar al contador")')).boundingBox();
  await p.evaluate(() => { document.getElementById('dv-scroll').scrollTop = 12 * 56; });
  const lane2 = await (await p.$('#dv-grid .dv-lane')).boundingBox();
  await p.mouse.move(ut.x + 60, ut.y + 10); await p.mouse.down();
  await p.mouse.move(lane2.x + 100, lane2.y + 17.5 * 56 + 10, { steps: 10 }); await p.mouse.up(); await p.clock.runFor(100);
  console.log('scheduled:', await p.evaluate(() => state.tasks.find(t => t.id === 'c').time));
  // Tarea de nota: arrastrarla una hora antes cambia ⏰ en la nota
  const nb = await (await p.$('.dv-block.virtual')).boundingBox();
  await p.mouse.move(nb.x + 40, nb.y + 10); await p.mouse.down(); await p.mouse.move(nb.x + 40, nb.y + 10 - 56, { steps: 6 }); await p.mouse.up(); await p.clock.runFor(100);
  console.log('note line:', await p.evaluate(() => state.notes[0].body));
  // Editar con un toque
  await p.click('.dv-block[data-id="a"] .dv-btitle'); await p.clock.runFor(50);
  console.log('pop:', await p.isVisible('#dv-pop'));
  await p.fill('#dv-pop input[aria-label="Título"]', 'Cuadrar caja chica');
  await p.selectOption('#dv-pop select[aria-label="Duración"]', '90');
  await p.click('#dv-pop button[type=submit]'); await p.clock.runFor(100);
  console.log('edited:', JSON.stringify(await p.evaluate(() => { const t = state.tasks.find(x => x.id === 'a'); return [t.title, t.time, t.duration]; })));
  console.log('blocks after:', await blocks());
  await p.screenshot({ path: S + '/agenda.png' });
  // Quitar la hora: arrastrar al panel «Sin hora»
  const ab = await (await p.$('.dv-block[data-id="a"]')).boundingBox();
  const side = await (await p.$('#dv-side')).boundingBox();
  await p.mouse.move(ab.x + 40, ab.y + 10); await p.mouse.down(); await p.mouse.move(side.x + 100, side.y + 200, { steps: 8 }); await p.mouse.up(); await p.clock.runFor(100);
  console.log('untimed again:', await p.evaluate(() => state.tasks.find(t => t.id === 'a').time));
  // Completar desde la agenda y pasar al día siguiente
  await p.click('.dv-block[data-id="b"] input[type=checkbox]'); await p.clock.runFor(100);
  console.log('done:', await p.evaluate(() => state.tasks.find(t => t.id === 'b').done));
  await p.click('#dv-next'); console.log('next day:', await p.textContent('#dv-title'));
  await p.keyboard.press('Escape'); console.log('closed:', !(await p.isVisible('#dayview')));
  console.log('errors:', errs); await b.close();
})();
