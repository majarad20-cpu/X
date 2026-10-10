// La nota diaria como centro del día: panel vivo (hábitos, tareas, pomodoros, ideas), ajuste,
// diario escrito en la nota diaria, línea de tiempo con las entradas antiguas y migración con «Deshacer».
const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const now = new Date('2026-10-09T10:00:00').getTime();
const at = (s) => new Date(s).getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    settings: { notesWelcome: true }, folders: ['Diario'],
    habits: [{ id: 'h1', name: 'Leer', goal: 7, log: {} }, { id: 'h2', name: 'Correr', goal: 3, log: { '2026-10-08': true } }],
    tasks: [
      { id: 't1', title: 'Enviar factura', due: '2026-10-09', done: false, priority: 2, tags: [], createdAt: now - 864e5 },
      { id: 't2', title: 'Pagar luz', due: '2026-10-07', done: false, priority: 2, tags: [], createdAt: now - 3 * 864e5 },
      { id: 't3', title: 'Comprar pan', due: '2026-10-12', done: false, priority: 2, tags: [], createdAt: now - 864e5 },
      { id: 't4', title: 'Revisar correo', due: '2026-10-09', done: true, completedAt: at('2026-10-09T08:00:00'), priority: 2, tags: [], createdAt: now - 864e5 },
      { id: 't5', title: 'Llevar el coche', due: '2026-10-08', done: true, completedAt: at('2026-10-08T09:00:00'), priority: 2, tags: [], createdAt: now - 2 * 864e5 },
      { id: 't6', title: 'Planear viaje', due: '2026-10-08', done: false, priority: 2, tags: [], createdAt: now - 2 * 864e5 },
    ],
    pomodoros: { '2026-10-09': 2, '2026-10-08': 1 }, focusMinutes: { '2026-10-09': 50, '2026-10-08': 25 },
    log: [{ id: 'l1', type: 'pomodoro', text: 'Enviar factura', ref: 't1', date: '2026-10-09', at: at('2026-10-09T08:30:00'), detail: '25 min' }],
    ideas: [
      { id: 'i1', text: 'App de recetas\nCon fotos', tags: [], createdAt: at('2026-10-09T07:00:00') },
      { id: 'i2', text: 'Ordenar el trastero', tags: [], createdAt: at('2026-10-08T19:00:00') },
    ],
    journal: [
      { id: 'j1', date: '2026-10-07', createdAt: at('2026-10-07T21:00:00'), kind: 'free', text: 'Un martes largo', mood: 2 },
      { id: 'j2', date: '2026-10-08', createdAt: at('2026-10-08T21:00:00'), kind: 'free', text: 'Ayer escribí', mood: 4 },
    ],
    notes: [
      { id: 'o', path: 'Otra', body: 'Texto\n- [ ] Llamar a Ana 📅 2026-10-09', createdAt: now - 864e5, updatedAt: now },
      { id: 'd9', path: 'Diario/2026-10-09', body: '# Viernes\n\n## ✅ Tareas\n- [ ] Tarea de la nota\n\n## 📝 Notas\nHoy.\n', createdAt: now, updatedAt: now },
      { id: 'd8', path: 'Diario/2026-10-08', body: '# Jueves\n\n← [[2026-10-07]] · [[2026-10-09]] →\n\n## 🧠 Vaciado mental\n- \n\n## 📝 Notas\nFui al cine.\n', createdAt: now - 864e5, updatedAt: now - 864e5 },
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, r => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const check = (name, ok, info = '') => { console.log(`${ok ? 'ok' : 'FALLA'} ${name}${info ? ` · ${info}` : ''}`); if (!ok) errs.push(`falla: ${name} ${info}`); };
  const open = async (id, mode = 'read') => { await p.evaluate(([id, mode]) => { noteMode.set(id, mode); openNote(noteById(id)); }, [id, mode]); await p.clock.runFor(100); };
  const panel = () => p.evaluate(() => {
    const box = $('#day-panel');
    const txt = (sel) => [...box.querySelectorAll(sel)].map((x) => x.textContent.trim());
    return { hidden: box.hidden, habits: txt('.habit-chip'), due: txt('.dp-sec:nth-child(2) > .dp-list .dp-name'), done: txt('.dp-done summary').join(), doneList: txt('.dp-done .dp-name'), pomos: txt('.dp-pomos').join(), start: txt('.dp-start').join(), ideas: txt('.dp-sec .dp-name').filter((x) => x.startsWith('💡')), sessions: txt('.dp-sessions li').join('|'), text: box.textContent };
  });

  // ---- El panel solo aparece en las notas diarias ----
  await open('o');
  check('nota normal: sin panel', (await panel()).hidden);
  await open('d9');
  let r = await panel();
  check('nota diaria: panel', !r.hidden && r.text.includes('Hoy · Viernes, 9 de octubre'), r.text.slice(0, 60));
  check('el panel no está en el texto', await p.evaluate(() => !noteById('d9').body.includes('Hábitos') && !$('#note-reading').contains($('#day-panel'))));
  check('hábitos', r.habits.length === 2 && r.habits[0] === 'Leer' && r.habits[1].startsWith('Correr'), r.habits.join());
  check('tareas de hoy y vencidas', r.due.includes('Enviar factura') && r.due.includes('Pagar luz') && r.due.includes('Llamar a Ana') && !r.due.includes('Comprar pan') && !r.due.includes('Tarea de la nota'), r.due.join());
  check('vencida marcada', await p.evaluate(() => [...document.querySelectorAll('#day-panel .dp-meta.overdue')].some((x) => x.textContent.includes('vencida'))));
  check('hechas plegadas', r.done === 'Hechas (1)' && !(await p.evaluate(() => $('#day-panel .dp-done').open)), r.done);
  check('pomodoros con tiempo', r.pomos === '2 pomodoros · 50 min' && r.sessions.includes('Enviar factura'), `${r.pomos} ${r.sessions}`);
  check('ideas del día', r.ideas.length === 1 && r.ideas[0] === '💡 App de recetas', r.ideas.join());
  check('navegación', await p.evaluate(() => !!$('#day-panel .dp-prev') && !!$('#day-panel .dp-next') && !$('#day-panel .dp-today')));

  // ---- Hábito: misma función que Hoy (registro, bitácora, Hábitos) ----
  await p.click('#day-panel .habit-chip:has-text("Leer")'); await p.clock.runFor(50);
  r = await p.evaluate(() => [!!state.habits[0].log['2026-10-09'], state.log.some((e) => e.type === 'habit' && e.ref === 'h1' && e.date === '2026-10-09' && !e.removed), $('#day-panel .habit-chip').classList.contains('on'), $('#today-habits .habit-chip').classList.contains('on')]);
  check('hábito marcado y sincronizado', r.every(Boolean), r.join());
  await p.evaluate(() => showView('habits')); await p.clock.runFor(50);
  check('Hábitos lo muestra', await p.evaluate(() => $('#view-habits').textContent.includes('Leer')));
  await open('d9');
  await p.click('#day-panel .habit-chip:has-text("Leer")'); await p.clock.runFor(50);
  check('hábito desmarcado', await p.evaluate(() => !state.habits[0].log['2026-10-09'] && !state.log.some((e) => e.type === 'habit' && e.ref === 'h1' && !e.removed)));

  // ---- Tareas: marcar y desmarcar ----
  const comp0 = await p.evaluate(() => state.completions['2026-10-09'] || 0);
  await p.click('#day-panel .dp-row:has-text("Enviar factura") input'); await p.clock.runFor(50);
  r = await panel();
  check('tarea hecha', (await p.evaluate((c0) => state.tasks.find((t) => t.id === 't1').done && state.completions['2026-10-09'] === c0 + 1, comp0)) && r.done === 'Hechas (2)' && !r.due.includes('Enviar factura'), r.done);
  await p.click('#day-panel .dp-done summary');
  await p.click('#day-panel .dp-done .dp-row:has-text("Enviar factura") input'); await p.clock.runFor(50);
  check('tarea desmarcada', await p.evaluate((c0) => !state.tasks.find((t) => t.id === 't1').done && (state.completions['2026-10-09'] || 0) === c0, comp0));
  check('hechas sigue abierta', await p.evaluate(() => $('#day-panel .dp-done').open));
  await p.click('#day-panel .dp-row:has-text("Llamar a Ana") input'); await p.clock.runFor(50);
  check('tarea de otra nota', await p.evaluate(() => noteById('o').body.includes('- [x] Llamar a Ana') && noteById('o').body.includes('✅ 2026-10-09')));
  check('…y pasa a hechas', (await panel()).doneList.includes('Llamar a Ana'));

  // ---- Pomodoro ----
  await p.click('#day-panel .dp-start'); await p.clock.runFor(50);
  check('empieza un pomodoro', await p.evaluate(() => activeTab().view === 'timer' && !!timer.endsAt && timer.mode === 'focus'));
  await p.evaluate(() => stopTimer());

  // ---- Un día pasado ----
  await open('d8');
  r = await panel();
  check('pasado: título y sin «Empezar»', r.text.includes('Jueves, 8 de octubre') && !r.text.includes('Hoy ·') && !r.start, r.start);
  check('pasado: solo sus tareas', r.due.join() === 'Planear viaje' && r.done === 'Hechas (1)' && r.doneList.join() === 'Llevar el coche', `${r.due} ${r.doneList}`);
  check('pasado: pomodoros e idea', r.pomos === '1 pomodoro · 25 min' && r.ideas.join() === '💡 Ordenar el trastero', `${r.pomos} ${r.ideas}`);
  check('pasado: «Hoy» para volver', await p.evaluate(() => !!$('#day-panel .dp-today')));
  await p.click('#day-panel .habit-chip:has-text("Leer")'); await p.clock.runFor(50);
  check('pasado: hábito en su día', await p.evaluate(() => state.habits[0].log['2026-10-08'] === true && !state.habits[0].log['2026-10-09'] && state.log.some((e) => e.type === 'habit' && e.date === '2026-10-08' && e.untimed)));
  await p.click('#day-panel .dp-next'); await p.clock.runFor(100);
  check('siguiente: hoy', await p.evaluate(() => activeNote().path === 'Diario/2026-10-09'));
  await p.click('#day-panel .dp-next'); await p.clock.runFor(100);
  r = await p.evaluate(() => [activeNote().path, $('#day-panel').hidden, $('#day-panel .dp-start') ? 1 : 0, $('#day-panel .habit-chip').disabled]);
  check('siguiente: crea mañana', r[0] === 'Diario/2026-10-10' && !r[1] && !r[2] && r[3], r.join());
  await p.click('#day-panel .dp-today'); await p.clock.runFor(100);
  check('volver a hoy', await p.evaluate(() => activeNote().path === 'Diario/2026-10-09'));

  // ---- Plegar (se recuerda), modos y ajuste ----
  await p.click('#day-panel .dp-fold'); await p.clock.runFor(50);
  r = await p.evaluate(() => [state.settings.dayPanelClosed, !!$('#day-panel .dp-grid'), $('#day-panel .dp-sum')?.textContent]);
  check('plegado', r[0] === true && !r[1] && r[2].includes('🍅 2'), r.join());
  await open('d8');
  check('plegado se recuerda', await p.evaluate(() => !$('#day-panel .dp-grid') && !$('#day-panel').hidden));
  await p.click('#day-panel .dp-fold'); await p.clock.runFor(50);
  check('desplegado', await p.evaluate(() => !state.settings.dayPanelClosed && !!$('#day-panel .dp-grid')));
  await open('d9', 'edit');
  check('edición: con panel', !(await panel()).hidden);
  await open('d9', 'split');
  check('vista dividida: con panel', !(await panel()).hidden);
  await open('d9', 'read');
  await p.evaluate(() => showView('settings')); await p.clock.runFor(50);
  check('ajuste marcado', await p.evaluate(() => $('#set-day-panel').checked));
  await p.click('#set-day-panel'); await p.clock.runFor(50);
  await open('d9');
  check('ajuste apagado: sin panel', (await panel()).hidden && (await p.evaluate(() => state.settings.dayPanel === false)));
  check('menú ⋯ para volver a mostrarlo', await p.evaluate(() => NOTE_MENU_EXTRA.map((f) => f(noteById('d9'))).some((x) => x?.label === 'Mostrar el resumen del día')));
  await p.evaluate(() => setDayPanel(true)); await p.clock.runFor(50);
  check('ajuste encendido', !(await panel()).hidden);

  // ---- Escribir desde Hoy y desde el Diario: va a la nota diaria ----
  await p.evaluate(() => showView('today')); await p.clock.runFor(50);
  check('Hoy invita a escribir', await p.isVisible('#today-journal'));
  await p.click('#today-journal'); await p.clock.runFor(50);
  await p.fill('#journal-fields textarea', 'Llamar al dentista\nMe noto con energía');
  await p.click('.mood:has-text("Genial")');
  await p.click('#journal-form button[type=submit]'); await p.clock.runFor(100);
  r = await p.evaluate(() => [noteById('d9').body, state.journal.length, $('#journal-draft').textContent]);
  check('desde Hoy: en la nota diaria', r[0].includes('## ✍️ Diario\n### Vaciado mental · 10:00 · 😄\nLlamar al dentista\nMe noto con energía') && r[1] === 2, JSON.stringify(r[0]));
  check('ánimo como propiedad', r[0].startsWith('---\nanimo: 😄\n---\n# Viernes'), JSON.stringify(r[0].slice(0, 40)));
  check('aviso con enlace', r[2].includes('nota diaria de hoy') && r[2].includes('Abrir la nota'), r[2]);
  check('la nota sigue intacta', r[0].includes('## ✅ Tareas\n- [ ] Tarea de la nota\n\n## 📝 Notas\nHoy.'));
  await p.click('[data-jkind="free"]');
  await p.fill('#journal-fields textarea', 'Una tarde tranquila');
  await p.click('.mood:has-text("Bien")');
  await p.click('#journal-form button[type=submit]'); await p.clock.runFor(100);
  r = await p.evaluate(() => noteById('d9').body);
  check('desde Diario: se añade a la sección', /### Vaciado mental[^]*Me noto con energía\n\n### Libre · 10:00 · 🙂\nUna tarde tranquila\n$/.test(r) && (r.match(/## ✍️ Diario/g) || []).length === 1 && r.includes('animo: 🙂'), JSON.stringify(r));
  await p.evaluate(() => showView('today')); await p.clock.runFor(50);
  check('Hoy: ya escrito', !(await p.isVisible('#today-journal')));

  // ---- Línea de tiempo: notas diarias y entradas antiguas juntas ----
  await p.evaluate(() => showView('journal')); await p.clock.runFor(50);
  r = await p.evaluate(() => [...document.querySelectorAll('#journal-list .entry-day')].map((s) => ({ head: s.querySelector('h3').textContent, cards: [...s.querySelectorAll('.entry')].map((e) => e.textContent) })));
  check('días en orden', r.map((d) => d.head.split('Abrir')[0]).join('|') === 'Hoy🙂|Ayer🙂|Miércoles, 7 de octubre😕', r.map((d) => d.head).join('|'));
  check('hoy: sección Diario', r[0].cards.length === 1 && r[0].cards[0].includes('Una tarde tranquila') && r[0].cards[0].includes('Abrir nota'));
  check('ayer: nota y entrada antigua', r[1].cards.length === 2 && r[1].cards[0].includes('Fui al cine.') && !r[1].cards[0].includes('[[2026') && r[1].cards[1].includes('Ayer escribí'), JSON.stringify(r[1].cards));
  check('estadística', (await p.textContent('#journal-stats')).startsWith('4 entradas · racha de 3 días'), await p.textContent('#journal-stats'));
  await p.fill('#journal-search', 'cine'); await p.clock.runFor(50);
  check('buscar en las notas diarias', await p.evaluate(() => document.querySelectorAll('#journal-list .entry-day').length === 1 && $('#journal-list').textContent.includes('Fui al cine')));
  await p.fill('#journal-search', ''); await p.clock.runFor(50);
  await p.click('#journal-list .entry-day:nth-child(2) .entry-open'); await p.clock.runFor(50);
  check('abrir nota desde el diario', await p.evaluate(() => activeNote()?.path === 'Diario/2026-10-08'));
  await p.evaluate(() => showView('journal')); await p.clock.runFor(50);

  // ---- Migración explícita, con «Deshacer» ----
  check('botón de migrar', await p.isVisible('#journal-migrate button') && (await p.textContent('#journal-migrate')).includes('2 entradas antiguas'));
  const before8 = await p.evaluate(() => noteById('d8').body);
  await p.click('#journal-migrate button'); await p.clock.runFor(100);
  r = await p.evaluate(() => [state.journal.length, noteById('d8').body, state.notes.find((n) => n.path === 'Diario/2026-10-07')?.body || '', $('#journal-migrate').hidden]);
  check('migrado', r[0] === 0 && r[1].includes('## ✍️ Diario\n### Libre · 21:00 · 🙂\nAyer escribí') && r[1].startsWith('---\nanimo: 🙂\n---') && r[2].includes('Un martes largo') && r[2].includes('animo: 😕') && r[3], JSON.stringify(r));
  check('tras migrar, mismos días', await p.evaluate(() => document.querySelectorAll('#journal-list .entry-day').length === 3 && document.querySelectorAll('#journal-list .entry-note').length === 3));
  await p.click('#toast .toast-action'); await p.clock.runFor(100);
  r = await p.evaluate(() => [state.journal.length, noteById('d8').body, state.notes.some((n) => n.path === 'Diario/2026-10-07')]);
  check('deshacer', r[0] === 2 && r[1] === before8 && !r[2], JSON.stringify(r));
  // Lo que ya estaba copiado en la nota no se repite.
  await p.evaluate(() => { noteById('d8').body += '\n## ✍️ Diario\n### Libre · 21:00 · 🙂\nAyer escribí\n'; save(); });
  await p.evaluate(() => migrateJournal()); await p.clock.runFor(100);
  check('sin duplicar', await p.evaluate(() => noteById('d8').body.split('Ayer escribí').length === 2 && state.journal.length === 0));

  // ---- Progreso, revisión y bitácora siguen funcionando ----
  for (const v of ['progress', 'review', 'today', 'habits']) { await p.evaluate((v) => showView(v), v); await p.clock.runFor(50); }
  check('progreso y revisión', await p.evaluate(() => !!$('#view-progress').textContent.trim() && !!$('#review-title').textContent));
  check('persistido', await p.evaluate(() => { flushLocal(); const s = JSON.parse(localStorage.getItem('enfoque:v1')); return s.journal.length === 0 && s.notes.find((n) => n.id === 'd9').body.includes('Una tarde tranquila') && s.settings.dayPanel === true; }));
  await open('d9');
  await p.screenshot({ path: `${out}/52-nota-diaria.png` });
  console.log('errors:', errs); await b.close();
})();
