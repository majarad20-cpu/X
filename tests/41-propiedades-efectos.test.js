const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
const note = (id, path, body) => ({ id, path, body, createdAt: now, updatedAt: now });
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true },
    notes: [
      note('c', 'Estilo', '---\ncssclasses:\n  - ancho\n  - tarjetas\n  - "Mi Clase!<x>"\n  - imágenes-centradas\n---\n- uno\n- dos'),
      note('p', 'Plana', 'Sin propiedades'),
      note('i', 'Libros/Alfa', '---\nicono: 📚\ncolor: teal\n---\nTexto'),
      note('z', 'Libros/Zeta', '---\nfijada: true\n---\nTexto'),
      note('s', 'Libros/Sub/Hoja', 'x'),
      note('x', 'Mala', '---\nicono: "<img src=x onerror=alert(1)>"\ncolor: "red;background:url(javascript:alert(1))"\n---\nTexto'),
      note('h', 'Mala2', '---\nicono: <b>\ncolor: "#12345g"\n---\nTexto'),
      note('r', 'Reunión', '---\nfecha: 2026-10-12\n---\nOrden del día'),
      note('ci', 'Cita médica', '---\nvence: 2026-10-12T09:30\n---\nLlevar informe'),
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, r => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  const check = (name, ok, extra = '') => { console.log(`${name}:`, ok, extra); if (!ok) errs.push(`falla: ${name} ${extra}`); };
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const classes = () => p.evaluate(() => [...document.querySelector('.note-inner').classList].filter((x) => /^(nc|cssclass)-/.test(x)).join(' '));
  // cssclasses: se aplican y se quitan al cambiar de nota
  await p.evaluate(() => openNote(noteById('c'))); await p.clock.runFor(100);
  const on = await classes();
  check('cssclasses', on === 'nc-wide nc-cards cssclass-miclasex nc-center-images', on);
  check('unknown prefixed', !/(^| )miclasex/.test(on) && on.includes('cssclass-miclasex'));
  check('cards grid', await p.evaluate(() => getComputedStyle(document.querySelector('#note-reading > ul')).display === 'grid'));
  await p.evaluate(() => openNote(noteById('p'))); await p.clock.runFor(100);
  check('removed', (await classes()) === '', await classes());
  // Icono y color en el explorador; intentos de inyección neutralizados
  const row = (id) => p.evaluate((id) => { const r = document.querySelector(`#file-tree .tree-row.file[data-id="${id}"]`); return { ico: r.querySelector('.np-ico')?.textContent || '', dot: r.querySelector('.np-dot')?.style.getPropertyValue('--np-color') || '' }; }, id);
  const alfa = await row('i');
  check('icono/color', alfa.ico === '📚' && alfa.dot === 'teal', JSON.stringify(alfa));
  const bad = [await row('x'), await row('h')];
  check('injection', bad.every((r) => !r.ico && !r.dot) && !(await p.$('#file-tree img, #ws-tabs img, #file-tree b')), JSON.stringify(bad));
  await p.evaluate(() => openNote(noteById('i'), { newTab: true })); await p.clock.runFor(100);
  check('tab icon', (await p.textContent('#ws-tabs .ws-tab.active .np-ico')) === '📚');
  // Fijada: arriba de su carpeta (antes de las subcarpetas)
  const order = () => p.$$eval('#file-tree .tree-row', (n) => n.map((x) => x.querySelector('.tree-name').textContent));
  const o1 = await order();
  check('pinned order', o1.indexOf('Zeta') === o1.indexOf('Libros') + 1 && o1.indexOf('Zeta') < o1.indexOf('Sub') && o1.indexOf('Sub') < o1.indexOf('Alfa'), o1.join(','));
  // Menú: fijar y quitar
  const pin = await p.evaluate(() => {
    const n = noteById('p');
    const a = noteMenuItems(n).find((x) => x.label === '📌 Fijar nota');
    a.action();
    const after = n.body;
    const ctx = ctxExtra('note', n).find((x) => x.label === 'Quitar de fijadas');
    ctx.action();
    return [after, n.body];
  });
  await p.clock.runFor(100);
  check('fijar toggle', /^---\nfijada: true\n---\n/.test(pin[0]) && pin[1] === 'Sin propiedades', JSON.stringify(pin));
  const o2 = await order();
  check('unpinned order', o2.indexOf('Plana') > o2.indexOf('Mala'), o2.join(','));
  // Calendario: Mes, detalle del día, agenda y Semana
  await p.evaluate(() => showView('tasks')); await p.click('[data-taskview=month]'); await p.clock.runFor(100);
  const chips = await p.$$eval('.mg-day[data-key="2026-10-12"] .mg-note', (n) => n.map((x) => x.textContent));
  check('month chip', chips.length === 2 && chips[0] === '📝 Reunión' && chips[1] === '📝 09:30 Cita médica', JSON.stringify(chips));
  await p.click('.mg-day[data-key="2026-10-12"] .mg-note >> text=Reunión'); await p.clock.runFor(100);
  check('chip opens note', await p.evaluate(() => activeNote()?.id === 'r' && document.getElementById('dayview').hidden));
  await p.evaluate(() => { showView('tasks'); openDayView('2026-10-12'); }); await p.clock.runFor(100);
  check('agenda all-day', (await p.$$eval('#dv-events .np-note-link', (n) => n.map((x) => x.textContent))).join() === '📝 Reunión');
  const blk = await p.$$eval('#dv-grid .np-dv-note', (n) => n.map((x) => `${x.querySelector('.dv-btitle').textContent}@${x.style.top}`));
  check('agenda timed', blk.join() === `📝 Cita médica@${9.5 * 56}px`, blk.join());
  await p.click('#dv-grid .np-dv-note'); await p.clock.runFor(100);
  check('agenda opens note', await p.evaluate(() => activeNote()?.id === 'ci' && document.getElementById('dayview').hidden));
  await p.evaluate(() => { showView('tasks'); document.querySelector('[data-taskview=week]').click(); weekOffset = 1; renderWeek(); }); await p.clock.runFor(100);
  check('week', (await p.$$eval('#day-2026-10-12 .np-note-link', (n) => n.length)) === 2);
  // Hoy: notas con fecha de hoy
  console.log('hoy notas:', await p.evaluate(() => { const n = noteById('r'); const key = dateKey(); n.body = `---\nfecha: ${key}\n---\nOrden del día`; n.updatedAt = Date.now(); dataRev++; showView('today'); renderToday(); return [document.getElementById('today-notes').hidden, document.getElementById('today-notes').textContent]; }));
  console.log('errors:', errs); await b.close();
})();
