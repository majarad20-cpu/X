const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const now = new Date('2026-10-08T10:00:00').getTime();
const seed = {
  tasks: [
    { id: 't1', title: 'Preparar presentación', priority: 3, due: '2026-10-09', done: false, createdAt: now, tags: ['trabajo'], projectId: 'p1' },
    { id: 't2', title: 'Comprar regalo', priority: 2, due: '2026-10-15', done: false, createdAt: now, tags: [] },
    { id: 't3', title: 'Revisar contrato', priority: 3, due: null, done: false, createdAt: now, tags: [] },
    { id: 't4', title: 'Ordenar fotos', priority: 1, due: null, done: false, createdAt: now - 30 * 864e5, tags: [] },
    { id: 't5', title: 'Escribir informe', priority: 2, due: '2026-10-20', done: false, status: 'doing', createdAt: now, tags: [] },
    { id: 't6', title: 'Llamar al banco', priority: 2, due: '2026-10-08', done: false, createdAt: now, tags: [] },
    { id: 't7', title: 'Pagar factura', priority: 2, due: '2026-10-07', done: true, completedAt: now - 864e5, createdAt: now, tags: [] },
  ],
  habits: [], projects: [{ id: 'p1', name: 'Web nueva', status: 'active', color: 'teal', createdAt: now }], settings: { notesWelcome: true },
  ideas: [{ id: 'i1', text: 'Compra\n- [ ] Pan\n- [x] Leche', tags: [], pinned: false, createdAt: 1 }],
  notes: [{ id: 'a', path: 'Recados', body: '- [ ] Ir al correo 📅 2026-10-12\n- [/] Pintar la puerta\n- [ ] Lavar el auto !alta', createdAt: now, updatedAt: now }],
  updatedAt: 1,
};
// Almacén de la nube simulado y compartido entre «dispositivos» (como en la prueba 08).
const mock = (initial) => {
  const docs = new Map(Object.entries(initial || {}));
  let listener = null;
  const snap = () => ({ docs: [...docs].map(([id, d]) => ({ id, exists: true, data: () => d })), metadata: { hasPendingWrites: false } });
  window.__docs = docs;
  const col = {
    doc: (id) => ({ async set(d) { docs.set(id, JSON.parse(JSON.stringify(d))); }, async delete() { docs.delete(id); } }),
    onSnapshot(next) { listener = next; setTimeout(() => next(snap()), 30); return () => {}; },
  };
  window.claude = { use: async (n) => (n === 'db' ? { collection: () => col } : n === 'user' ? { id: async () => 'u_x' } : null) };
};
const drag = async (p, from, to, dx = 40, dy = 30) => {
  const a = await (await p.$(from)).boundingBox();
  const b = await (await p.$(to)).boundingBox();
  await p.mouse.move(a.x + 5, a.y + 5); await p.mouse.down();
  await p.mouse.move(a.x + dx, a.y + dy, { steps: 5 });
  await p.mouse.move(b.x + b.width / 2, b.y + Math.min(60, b.height / 2), { steps: 8 });
  await p.mouse.up();
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, seed);
  await c.addInitScript(mock, {});
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);

  // Sugerencias en Hoy
  console.log('suggest:', await p.$$eval('#suggest-list .sg-title', n => n.map(x => x.textContent)));
  await p.click('#suggest-list .sg-row:has-text("Revisar contrato") .primary-chip');
  console.log('+hoy due:', await p.evaluate(() => state.tasks.find(t => t.id === 't3').due), '| in today list:', await p.$$eval('#today-list .title', n => n.map(x => x.textContent)));
  await p.click('#suggest-list .sg-row:has-text("Ordenar fotos") .sg-dismiss').catch(() => {});
  console.log('dismissed hidden:', !(await p.$$eval('#suggest-list .sg-title', n => n.map(x => x.textContent))).includes('Ordenar fotos'));

  // Tablero
  await p.evaluate(() => showView('tasks')); await p.click('[data-taskview=board]');
  console.log('board:', await p.$$eval('.kcol', n => n.map(c => `${c.dataset.key}=${c.querySelectorAll('.kcard').length}`).join(' ')));
  await drag(p, '.kcard:has-text("Comprar regalo") .kc-handle', '.kcol[data-key=doing]');
  await drag(p, '.kcard:has-text("Ir al correo") .kc-handle', '.kcol[data-key=done]');
  console.log('after drag:', await p.evaluate(() => [state.tasks.find(t => t.id === 't2').status, state.notes[0].body.split('\n')[0]]));
  await p.focus('.kcard:has-text("Pintar la puerta") .kc-handle'); await p.keyboard.press('ArrowLeft');
  console.log('keyboard ←:', await p.evaluate(() => state.notes[0].body.split('\n')[1]));
  await p.click('[data-boardgroup=priority]');
  await drag(p, '.kcard:has-text("Lavar el auto") .kc-handle', '.kcol[data-key="1"]');
  console.log('note priority:', await p.evaluate(() => state.notes[0].body.split('\n')[2]));
  await p.screenshot({ path: S + '/board.png' });

  // Mes
  await p.click('[data-taskview=month]');
  console.log('month:', await p.textContent('#month-title'), '| cells:', await p.$$eval('.mg-day', n => n.length));
  await drag(p, '.mg-day[data-key="2026-10-09"] .mg-chip', '.mg-day[data-key="2026-10-14"]', 20, 15);
  console.log('moved to 14:', await p.evaluate(() => state.tasks.find(t => t.id === 't1').due));
  await p.click('.mg-day[data-key="2026-10-21"]');
  await p.fill('#month-day .day-form input', 'Dentista a las 9'); await p.press('#month-day .day-form input', 'Enter');
  console.log('added on 21:', await p.evaluate(() => state.tasks.filter(t => t.title === 'Dentista').map(t => `${t.due} ${t.time}`)), '| chip:', await p.$$eval('.mg-day[data-key="2026-10-21"] .mg-chip', n => n.map(x => x.textContent)));
  await p.screenshot({ path: S + '/month.png' });

  // Comando «/» y tarea en curso en una nota
  await p.keyboard.press('Control+o'); await p.keyboard.type('Plan'); await p.keyboard.press('Enter');
  if (!(await p.isVisible('#note-editor'))) await p.keyboard.press('Control+e');
  await p.click('#note-editor'); await p.keyboard.press('Control+End');
  await p.keyboard.type('/tit');
  console.log('slash /tit:', await p.$$eval('#link-suggest .sg-label', n => n.map(x => x.textContent)));
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.keyboard.type('Objetivos');
  await p.keyboard.press('Enter'); await p.keyboard.type('/en curso'); await p.keyboard.press('Escape');
  await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace');
  await p.keyboard.type('## Objetivos\n/curso'); await p.keyboard.press('Enter'); await p.keyboard.type('Diseñar logo');
  console.log('note text:', JSON.stringify(await p.inputValue('#note-editor')));
  await p.clock.runFor(800);
  console.log('doing from note:', await p.evaluate(() => noteTasks().filter(t => t.status === 'doing').map(t => t.title)));

  // Imagen pegada
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1600; const x = c.getContext('2d'); for (let i = 0; i < 300; i++) { x.fillStyle = `hsl(${i * 11},70%,50%)`; x.fillRect((i * 97) % 2400, (i * 53) % 1600, 260, 180); } return c.toDataURL('image/png'); });
  await p.evaluate(async (data) => {
    const blob = await (await fetch(data)).blob();
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'Boceto.png', { type: 'image/png' }));
    const ta = document.getElementById('note-editor'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, png);
  await p.clock.runFor(100); await p.waitForTimeout(800); await p.clock.runFor(3000); await p.waitForTimeout(500);
  const imgLine = (await p.inputValue('#note-editor')).split('\n').find(l => l.includes('(img:'));
  console.log('image line:', imgLine && imgLine.replace(/img:[a-z0-9]+/, 'img:ID'));
  const stored = await p.evaluate(() => allFiles().then(l => l.map(f => ({ w: f.width, small: f.data.length < 240 * 1024 }))));
  console.log('stored:', JSON.stringify(stored));
  await p.keyboard.press('Control+e'); await p.waitForTimeout(300);
  console.log('rendered:', await p.$eval('#note-reading img.note-img', i => i.naturalWidth > 0));
  await p.clock.runFor(5000); await p.waitForTimeout(800);
  const docs = await p.evaluate(() => Object.fromEntries([...window.__docs]));
  console.log('cloud file blocks:', Object.keys(docs).filter(k => k.startsWith('file-')).length);
  await p.screenshot({ path: S + '/note-image.png' });

  // Otro dispositivo: recibe la nota y la imagen
  const c2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c2.addInitScript(mock, docs);
  const p2 = await c2.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(url); await p2.waitForFunction(() => document.documentElement.dataset.ready); await p2.waitForTimeout(1500);
  await p2.evaluate(() => openNoteByLink('Plan'));
  if (await p2.isVisible('#note-editor')) await p2.keyboard.press('Control+e');
  await p2.waitForTimeout(500);
  console.log('device B image:', await p2.$eval('#note-reading img.note-img', i => i.naturalWidth > 0).catch(() => false));

  // Copia de seguridad con la imagen
  const backup = await p2.evaluate(async () => (await backupFiles()).length);
  console.log('backup images:', backup);

  // Ideas: casillas y color
  await p.evaluate(() => showView('ideas'));
  await p.click('.idea-check:has-text("Pan") input');
  await p.click('.idea [aria-label^="Color"]'); await p.click('.idea .swatch[aria-label="Amarillo"]');
  console.log('idea:', await p.evaluate(() => [state.ideas[0].text.split('\n')[1], state.ideas[0].color]));
  console.log('errors:', errs); await b.close();
})();
