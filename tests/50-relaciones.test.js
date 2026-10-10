const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [
      { id: 't1', title: 'Escribir informe', priority: 2, due: '2026-10-10', done: false, projectId: 'p1', createdAt: now, tags: [] },
      { id: 't2', title: 'Comprar papel', priority: 2, done: false, createdAt: now, tags: [], notes: 'Ver [[Otra]]' },
    ],
    projects: [{ id: 'p1', name: 'Lanzamiento', desc: '', status: 'active', deadline: null, color: 'indigo', manual: null, milestone: 0, noteId: 'np', createdAt: now }],
    ideas: [{ id: 'i1', text: 'Usar colores\nPara [[tarea:t2|Comprar papel]]', tags: [], pinned: false, createdAt: now, updatedAt: now }],
    habits: [{ id: 'h1', name: 'Correr', goal: 7, log: {} }],
    settings: { notesWelcome: true },
    notes: [
      { id: 'a', path: 'Plan', body: '# Plan\nVer [[tarea:t1|Viejo título]], [[proyecto:p1|Lanz]], [[idea:i1|Idea]], [[habito:h1|Correr]], [[tarea:zzz|Borrada]] y [[Otra]].\n\n- [ ] Tarea en nota', createdAt: now, updatedAt: now },
      { id: 'np', path: 'Proyectos/Lanzamiento', body: 'Nota del proyecto', createdAt: now, updatedAt: now },
      { id: 'o', path: 'Otra', body: 'x', createdAt: now, updatedAt: now },
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, r => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const ev = (f, a) => p.evaluate(f, a);
  const pick = async (text) => { await p.waitForSelector(`#note-menu .menu-item:has-text("${text}")`, { state: 'visible', timeout: 5000 }); await p.click(`#note-menu .menu-item:has-text("${text}")`); await p.clock.runFor(100); };
  const openPlan = async () => { await ev(() => { openNote(noteById('a')); setNoteMode(noteById('a'), 'read'); }); await p.clock.runFor(100); };

  // Fichas: nombre actual, icono, tachado si no existe
  await openPlan();
  console.log('chips:', await p.$$eval('#note-reading a.elink', (n) => n.map((x) => `${x.dataset.etype}:${x.textContent}${x.classList.contains('missing') ? ':missing' : ''}`)));
  console.log('struck:', await p.$eval('#note-reading a.elink.missing s', (x) => x.textContent));
  // Vista previa al pasar el ratón
  await p.hover('#note-reading a.elink.e-project');
  await p.clock.runFor(600);
  console.log('preview:', await p.$eval('#link-preview', (x) => !x.hidden && /Lanzamiento/.test(x.textContent) && /%/.test(x.textContent)));
  await p.mouse.move(5, 5); await p.clock.runFor(400);
  // Abrir cada cosa
  await p.click('#note-reading a.elink.e-task');
  await p.clock.runFor(100);
  console.log('open task:', await ev(() => [activeTab().view, editingId, !!document.querySelector('.view.active .task-edit .rel-block')]));
  console.log('hierarchy:', await p.$eval('.view.active .task-edit .rel-path', (x) => x.textContent));
  await openPlan(); await p.click('#note-reading a.elink.e-project'); await p.clock.runFor(100);
  console.log('open project:', await ev(() => [activeTab().view, openProjectId, /Plan/.test($('#pd-related').textContent)]));
  await openPlan(); await p.click('#note-reading a.elink.e-idea'); await p.clock.runFor(100);
  console.log('open idea:', await ev(() => [activeTab().view, editingIdeaId, !!$('#idea-list .idea.editing .rel-block')]));
  await openPlan(); await p.click('#note-reading a.elink.e-habit'); await p.clock.runFor(100);
  console.log('open habit:', await ev(() => [activeTab().view, editingHabitId, /Plan/.test($('#habit-body .habit-editing').textContent)]));
  await openPlan(); await p.click('#note-reading a.elink.missing'); await p.clock.runFor(100);
  console.log('missing stays:', await ev(() => activeNote()?.id));

  // [[ sugiere tareas, proyectos, ideas y hábitos
  await ev(() => setNoteMode(noteById('o'), 'edit'));
  await ev(() => openNote(noteById('o')));
  await p.clock.runFor(100);
  await p.focus('#note-editor'); await p.press('#note-editor', 'Control+End');
  const sugg = async (q) => { await p.keyboard.type(`\n[[${q}`); await p.clock.runFor(50); return p.$$eval('#link-suggest .sg-item', (n) => n.map((x) => `${x.querySelector('.sg-icon')?.textContent || ''}${x.querySelector('.sg-label').textContent}`)); };
  console.log('sug lanz:', await sugg('Lanz'));
  await p.keyboard.press('Escape');
  console.log('sug corr:', await sugg('Corr'));
  await p.keyboard.press('Escape');
  console.log('sug usar:', await sugg('Usar'));
  await p.keyboard.press('Escape');
  console.log('sug esc:', await sugg('Escrib'));
  await p.keyboard.press('Enter'); await p.clock.runFor(600);
  await ev(() => flushNoteSave());
  console.log('inserted:', await ev(() => noteById('o').body.includes('[[tarea:t1|Escribir informe]]')));
  await p.focus('#note-editor'); await p.press('#note-editor', 'Control+End');
  await sugg('a'); await p.keyboard.press('Backspace'); await p.clock.runFor(50);
  const empty = await p.$$eval('#link-suggest .sg-item', (n) => n.map((x) => `${x.querySelector('.sg-icon')?.textContent || ''}${x.querySelector('.sg-label').textContent}`));
  console.log('sug empty:', empty.some((x) => x.startsWith('📝')), empty.some((x) => /^[☑📁💡🔁]/u.test(x)));
  await p.keyboard.press('Escape');
  await ev(() => { $('#note-editor').value = 'x'; $('#note-editor').dispatchEvent(new Event('input')); flushNoteSave(); setNoteMode(noteById('o'), 'read'); });

  // «Enlazar con…» del menú de la nota (lectura: al final)
  await openPlan();
  await p.click('#note-more'); await pick('Enlazar con');
  await p.fill('#picker-input', 'Comprar'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  console.log('note menu link:', await ev(() => noteById('a').body.split('\n').at(-1)));

  // Clic derecho en una tarea: enlazar con una nota y con un hábito
  await ev(() => showView('tasks')); await p.clock.runFor(100);
  await p.click('.view.active .task[data-id="t2"] .title', { button: 'right', force: true }); await pick('Enlazar con');
  await p.fill('#picker-input', 'Otra'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  console.log('related section:', JSON.stringify(await ev(() => noteById('o').body)));
  await p.click('.view.active .task[data-id="t2"] .title', { button: 'right', force: true }); await pick('Enlazar con');
  await p.fill('#picker-input', 'Correr'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  console.log('links array:', JSON.stringify(await ev(() => state.tasks.find((t) => t.id === 't2').links)));
  // El enlace se ve en el formulario, con × para quitarlo (y se puede deshacer)
  await ev(() => startEditing('t2')); await p.clock.runFor(50);
  console.log('form chips:', await p.$$eval('.view.active .task-edit .rel-chip', (n) => n.map((x) => x.textContent)));
  await p.click('.view.active .task-edit .rel-chip-x'); await p.clock.runFor(50);
  console.log('removed:', await ev(() => state.tasks.find((t) => t.id === 't2').links));
  await p.click('#toast .toast-action'); await p.clock.runFor(50);
  console.log('undo:', await ev(() => JSON.stringify(state.tasks.find((t) => t.id === 't2').links)));
  await ev(() => stopEditing());
  // Relacionado de un hábito (ambos sentidos) y de una idea
  console.log('habit rel:', await ev(() => { const g = relatedOf('habit', 'h1'); return [g.task.map((t) => t.id), g.noteIn.map((n) => n.id)]; }));
  console.log('idea rel:', await ev(() => { const g = relatedOf('idea', 'i1'); return [g.task.map((t) => t.id), g.noteIn.map((n) => n.id)]; }));
  console.log('idea card chip:', await ev(() => { showView('ideas'); editingIdeaId = null; renderIdeas(); return [...document.querySelectorAll('#idea-list a.elink')].map((x) => x.textContent); }));
  console.log('task notes chip:', await ev(() => { showView('tasks'); return [...document.querySelectorAll('.view.active .task[data-id="t2"] .note-preview a.elink')].map((x) => x.textContent); }));

  // Panel de la nota: grupos, marcar tarea y hábito
  await openPlan();
  console.log('note groups:', await p.$$eval('#rp-backlinks .rel-block .rel-group-head', (n) => n.map((x) => x.textContent)));
  await p.click('#rp-backlinks .rel-block .rel-row[data-rel-id="t1"] input'); await p.clock.runFor(50);
  console.log('task toggled:', await ev(() => state.tasks.find((t) => t.id === 't1').done));
  await p.click('#rp-backlinks .rel-block .rel-row[data-rel-id="h1"] input'); await p.clock.runFor(50);
  console.log('habit today:', await ev(() => !!state.habits[0].log[dateKey()]));
  await p.click('#rp-backlinks .rel-block .rel-row.r-task:not([data-rel-id]) input'); await p.clock.runFor(50);
  console.log('note task toggled:', await ev(() => /- \[x\] Tarea en nota/.test(noteById('a').body)));
  await ev(() => { openNote(noteById('np')); setNoteMode(noteById('np'), 'read'); });
  console.log('note hierarchy:', await p.$eval('#rp-backlinks .rel-path', (x) => x.textContent));

  // Clic derecho en un proyecto: «Ver relacionado…»
  await ev(() => { openProjectId = null; showView('projects'); });
  await p.click('.project-card[data-rel-id="p1"]', { button: 'right' }); await pick('Ver relacionado');
  console.log('modal:', await ev(() => [!$('#rel-modal').hidden, $('#rel-title').textContent, [...document.querySelectorAll('#rel-body .rel-group-head')].map((x) => x.textContent)]));
  await p.keyboard.press('Escape');
  console.log('modal closed:', await ev(() => $('#rel-modal').hidden));

  // Renombrar no rompe: la ficha muestra el nombre nuevo
  await ev(() => { state.tasks.find((t) => t.id === 't1').title = 'Informe final'; state.projects[0].name = 'Lanzamiento 2'; save(); });
  await openPlan();
  console.log('renamed:', await p.$$eval('#note-reading a.elink', (n) => n.slice(0, 2).map((x) => x.textContent)), await ev(() => noteById('a').body.includes('[[tarea:t1|Viejo título]]')));
  // PDF: el texto del enlace
  console.log('pdf:', await ev(() => { const d = document.createElement('div'); d.innerHTML = renderMd('Ver [[tarea:t1|Alias]] y [[tarea:t2]]'); return pdfRuns(d.childNodes, {}, {}).map((r) => r.text).join(''); }));
  // entityList para la búsqueda global
  console.log('entityList:', await ev(() => { const l = entityList(); return [l.length, [...new Set(l.map((e) => e.type))].join(','), typeof l[0].open, l.find((e) => e.id === 'p1').subtitle]; }));

  // Rendimiento: 2.000 notas enlazadas
  console.log('perf:', await ev(() => {
    for (let i = 0; i < 2000; i++) state.notes.push({ id: `x${i}`, path: `Mucho/Nota ${i}`, body: `# Nota ${i}\nVer [[Nota ${(i + 1) % 2000}]] y [[Nota ${(i * 7) % 2000}]] y [[tarea:t1|T]] #tag\n- [ ] tarea ${i}\n${'texto '.repeat(40)}`, createdAt: 1, updatedAt: 1 });
    save();
    const t0 = performance.now(); relIndex(); const t1 = performance.now() - t0;
    const g = relatedOf('task', 't1');
    return [t1 < 500, Math.round(t1), g.noteIn.length];
  }));
  console.log('errors:', errs); await b.close();
})();
