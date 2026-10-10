const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const now = new Date('2026-10-09T10:00:00').getTime(); // viernes, semana 2026-W41
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true },
    notes: [
      { id: 'a', path: 'Ideas/Alfa', body: '# Alfa\n\nPrimer párrafo.\n\nSegundo párrafo con más texto.\n\n- uno\n- dos', createdAt: now, updatedAt: now },
      { id: 'b', path: 'Beta', body: '---\nestado: borrador\n---\nTexto de beta.', createdAt: now, updatedAt: now - 1000 },
      { id: 'c', path: 'Gamma', body: 'Ver [[Beta]] y [[Beta#Sección|alias]] y [[Alfa]].', createdAt: now, updatedAt: now - 2000 },
      { id: 'd', path: 'Charla', body: '---\ntags: [x]\n---\n# Uno\n\nHola\n\n---\n\n## Dos\n\n```js\nconst a = 1;\n---\n```\n\n---\n\nTres', createdAt: now, updatedAt: now - 3000 },
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, r => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const check = (name, ok, info = '') => { console.log(`${ok ? 'ok' : 'FALLA'} ${name}${info ? ` · ${info}` : ''}`); if (!ok) errs.push(`falla: ${name} ${info}`); };

  // ---- Notas semanales y mensuales por defecto ----
  await p.click('#rib-weekly'); await p.clock.runFor(200);
  let r = await p.evaluate(() => { const n = activeNote(); return { path: n.path, body: n.body, bar: $('#periodic-bar').hidden ? '' : $('#periodic-bar').textContent }; });
  check('semana: ruta', r.path === 'Semanal/2026-W41', r.path);
  check('semana: días', r.body.includes('[[2026-10-05|Lunes 5]]') && r.body.includes('[[2026-10-11|Domingo 11]]'));
  check('semana: objetivos y tareas', r.body.includes('## 🎯 Objetivos') && r.body.includes('```tareas\nsemana\n```'));
  check('semana: cabecera', r.bar.includes('2026-W40') && r.bar.includes('2026-W42') && r.bar.includes('Semana 41'), r.bar);
  // anterior y siguiente
  await p.click('#periodic-bar .pb-next'); await p.clock.runFor(200);
  r = await p.evaluate(() => [activeNote().path, $('#periodic-bar .pb-now') ? 1 : 0]);
  check('semana: siguiente', r[0] === 'Semanal/2026-W42' && r[1] === 1, r.join());
  await p.click('#periodic-bar .pb-prev'); await p.click('#periodic-bar .pb-prev'); await p.clock.runFor(200);
  check('semana: anterior', (await p.evaluate(() => activeNote().path)) === 'Semanal/2026-W40');
  // cambio de año: 2026-W53 → 2027-W01
  r = await p.evaluate(() => { const n = openPeriodicNote('week', new Date(2026, 11, 31)); const d = periodOf(n).date; return [n.path, PERIODS.week.key(PERIODS.week.step(d, 1)), PERIODS.week.key(PERIODS.week.step(d, -1))]; });
  check('semana: cambio de año', r.join() === 'Semanal/2026-W53,2027-W01,2026-W52', r.join());
  await p.click('#periodic-bar .pb-up'); await p.clock.runFor(200);
  check('semana → mes', (await p.evaluate(() => activeNote().path)) === 'Mensual/2026-12');
  // mes por defecto
  await p.click('#rib-monthly'); await p.clock.runFor(200);
  r = await p.evaluate(() => { const n = activeNote(); return { path: n.path, body: n.body, bar: $('#periodic-bar').textContent }; });
  check('mes: ruta', r.path === 'Mensual/2026-10');
  check('mes: semanas', ['2026-W40', '2026-W41', '2026-W42', '2026-W43', '2026-W44'].every((w) => r.body.includes(`[[${w}]]`)) && !r.body.includes('2026-W45'), r.body);
  check('mes: cabecera', r.bar.includes('2026-09') && r.bar.includes('2026-11') && r.bar.includes('Octubre de 2026'), r.bar);
  await p.click('#periodic-bar .pb-prev'); await p.clock.runFor(200);
  check('mes: anterior', (await p.evaluate(() => activeNote().path)) === 'Mensual/2026-09');
  check('mes: «Este mes»', await p.evaluate(() => !!$('#periodic-bar .pb-now')));
  // notas normales: sin cabecera
  await p.evaluate(() => openNote(noteById('a'))); await p.clock.runFor(100);
  check('sin cabecera en otras notas', await p.evaluate(() => $('#periodic-bar').hidden));

  // ---- Desde plantillas, con las variables ----
  r = await p.evaluate(() => {
    createNote({ folder: 'Plantillas', title: 'Semanal', body: 'S={{semana}} M={{mes}} A={{año}} I={{inicio_semana}} F={{fin_semana}} T={{título}}', open: false });
    createNote({ folder: 'Plantillas', title: 'Mensual', body: 'Mes {{mes}} de {{ano}} · {{semana}}', open: false });
    const w = openPeriodicNote('week', new Date(2027, 0, 14));
    const m = openPeriodicNote('month', new Date(2027, 0, 20));
    const w1 = openPeriodicNote('week', new Date(2027, 0, 2)); // es 2026-W53 (el jueves es 31 de diciembre)
    return [w.body, m.body, w1.path];
  });
  check('plantilla semanal', r[0] === 'S=2027-W02 M=2027-01 A=2027 I=2027-01-11 F=2027-01-17 T=2027-W02', r[0]);
  check('plantilla mensual', r[1] === 'Mes 2027-01 de 2027 · 2026-W53', r[1]);
  check('semana existente se abre', r[2] === 'Semanal/2026-W53');
  check('plantilla: {{fecha}} sigue siendo hoy', (await p.evaluate(() => fillTemplate('{{fecha}} {{semana}}'))) === '2026-10-09 2026-W41');

  // ---- Paleta ----
  r = await p.evaluate(() => commands().map((x) => x.label));
  check('paleta', ['Nota de esta semana', 'Nota de este mes', 'Nota aleatoria', 'Presentar la nota', 'Meta de palabras…', 'Fusionar con otra nota…'].every((l) => r.includes(l)));

  // ---- Extraer desde el editor ----
  await p.evaluate(() => { openNote(noteById('a')); setNoteMode(noteById('a'), 'edit'); });
  await p.clock.runFor(100);
  await p.evaluate(() => { const ta = $('#note-editor'); const s = ta.value.indexOf('Segundo'); ta.focus(); ta.setSelectionRange(s, s + 'Segundo párrafo con más texto.'.length); });
  // clic derecho: aparecen las dos opciones
  await p.click('#note-editor', { button: 'right', position: { x: 60, y: 20 } }).catch(() => {});
  await p.evaluate(() => { const ta = $('#note-editor'); const s = ta.value.indexOf('Segundo'); ta.setSelectionRange(s, s + 'Segundo párrafo con más texto.'.length); ta.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 })); });
  r = await p.evaluate(() => [...$$('#note-menu .menu-item')].map((x) => x.textContent).join('|'));
  check('menú del editor', r.includes('Extraer a una nota nueva (incrustada') && r.includes('(enlace [[…]])'), r.slice(0, 200));
  // la opción pide el nombre (propone la primera línea) y sustituye la selección
  await p.evaluate(() => [...$$('#note-menu .menu-item')].find((x) => x.textContent.includes('incrustada')).click());
  r = await p.evaluate(() => $('#picker-input').value);
  check('nombre propuesto', r === 'Segundo párrafo con más texto', r);
  await p.fill('#picker-input', 'Párrafo dos'); await p.press('#picker-input', 'Enter'); await p.clock.runFor(700);
  r = await p.evaluate(() => [noteById('a').body, findNoteByName('Ideas/Párrafo dos')?.body]);
  check('extraer del editor', r[0].includes('![[Párrafo dos]]') && !r[0].includes('Segundo párrafo') && r[1] === 'Segundo párrafo con más texto.\n', JSON.stringify(r));
  // enlace simple y nombre por defecto desde la primera línea
  r = await p.evaluate(() => { const ta = $('#note-editor'); const s = ta.value.indexOf('- uno'); ta.focus(); ta.setSelectionRange(s, s + '- uno\n- dos'.length); const n = extractSelection(ta, false, extractName(ta.value.slice(s, ta.selectionEnd))); flushNoteSave(); return [n.path, noteById('a').body.split('\n').at(-1)]; });
  check('extraer con enlace', r[0] === 'Ideas/uno' && r[1] === '[[uno]]', r.join());
  // formato: botón en la barra
  check('botón en la barra de formato', await p.evaluate(() => FMT_BUTTONS.some((x) => x[3] === 'fb-extract')));

  // ---- Extraer un bloque desde la lectura ----
  await p.evaluate(() => setNoteMode(noteById('a'), 'read')); await p.clock.runFor(100);
  r = await p.evaluate(() => {
    const blk = [...$$('#note-reading > [data-src]')].find((x) => x.textContent.includes('Primer párrafo'));
    const r0 = blk.getBoundingClientRect();
    blk.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r0.left + 5, clientY: r0.top + 5 }));
    return [...$$('#note-menu .menu-item')].map((x) => x.textContent).join('|');
  });
  check('menú del bloque', r.includes('Extraer este bloque a una nota nueva'), r.slice(0, 200));
  await p.evaluate(() => [...$$('#note-menu .menu-item')].find((x) => x.textContent.includes('Extraer este bloque a una nota nueva')).click());
  await p.press('#picker-input', 'Enter'); await p.clock.runFor(300);
  r = await p.evaluate(() => [noteById('a').body, findNoteByName('Ideas/Primer párrafo')?.body]);
  check('extraer bloque', r[0] === '# Alfa\n\n![[Primer párrafo]]\n\n![[Párrafo dos]]\n\n[[uno]]' && r[1] === 'Primer párrafo.\n', JSON.stringify(r));
  check('bloque incrustado se ve', await p.evaluate(() => $('#note-reading').textContent.includes('Primer párrafo.')));

  // ---- Fusionar ----
  await p.evaluate(() => openNote(noteById('a'))); await p.clock.runFor(100);
  await p.evaluate(() => [...noteMenuItems(noteById('a'))].find((x) => x.label.startsWith('Fusionar')).action());
  await p.fill('#picker-input', 'beta'); await p.clock.runFor(50);
  await p.press('#picker-input', 'Enter'); await p.clock.runFor(50);
  r = await p.evaluate(() => [...$$('#picker-list .pk-item')].map((x) => x.textContent));
  check('fusionar: dos sentidos', r.length === 2 && r[0].includes('Añadir «Beta» al final de «Alfa»'), r.join('|'));
  await p.press('#picker-input', 'Enter'); await p.clock.runFor(200);
  r = await p.evaluate(() => [noteById('a').body, !!noteById('b'), noteById('c').body]);
  check('fusionar: texto y propiedades', r[0].startsWith('---\nestado: borrador\n---\n# Alfa') && r[0].endsWith('## Beta\n\nTexto de beta.\n'), r[0]);
  check('fusionar: borrada', !r[1]);
  check('fusionar: enlaces', r[2] === 'Ver [[Ideas/Alfa]] y [[Ideas/Alfa#Sección|alias]] y [[Alfa]].', r[2]);
  await p.click('#toast .toast-action'); await p.clock.runFor(200);
  r = await p.evaluate(() => [!!noteById('b'), noteById('c').body, noteById('a').body.includes('Texto de beta')]);
  check('fusionar: deshacer', r[0] && r[1] === 'Ver [[Beta]] y [[Beta#Sección|alias]] y [[Alfa]].' && !r[2], r.join());
  // al revés: Alfa se borra y Beta se queda
  r = await p.evaluate(() => { mergeNotes(noteById('b'), noteById('a')); return [!!noteById('a'), noteById('b').body.includes('## Alfa'), noteById('c').body, activeNote()?.id]; });
  check('fusionar al revés', !r[0] && r[1] && r[2] === 'Ver [[Beta]] y [[Beta#Sección|alias]] y [[Beta]].' && r[3] === 'b', r.join());
  await p.click('#toast .toast-action'); await p.clock.runFor(200);

  // ---- Presentar ----
  r = await p.evaluate(() => splitSlides(noteById('d').body));
  check('diapositivas', r.length === 3 && r[0] === '# Uno\n\nHola' && r[1].includes('---\n```') && r[2] === 'Tres', JSON.stringify(r));
  await p.evaluate(() => openNote(noteById('d'))); await p.clock.runFor(100);
  await p.evaluate(() => noteMenuItems(noteById('d')).find((x) => x.label.includes('Presentar')).action());
  await p.clock.runFor(100);
  const pr = () => p.evaluate(() => [$('#present').hidden, $('#present-count').textContent, $('#present-slide').textContent.trim().slice(0, 20)]);
  r = await pr();
  check('presentar: abre', !r[0] && r[1] === '1 / 3' && r[2].startsWith('Uno'), r.join());
  await p.keyboard.press('ArrowRight'); r = await pr();
  check('presentar: flecha', r[1] === '2 / 3' && r[2].startsWith('Dos'), r.join());
  await p.keyboard.press(' '); r = await pr();
  check('presentar: espacio', r[1] === '3 / 3', r.join());
  await p.keyboard.press(' '); r = await pr();
  check('presentar: no pasa del final', r[1] === '3 / 3');
  await p.keyboard.press('ArrowLeft'); r = await pr();
  check('presentar: atrás', r[1] === '2 / 3');
  await p.mouse.click(1000, 300); r = await pr();
  check('presentar: clic', r[1] === '3 / 3', r.join());
  await p.mouse.click(100, 300); r = await pr();
  check('presentar: clic a la izquierda', r[1] === '2 / 3', r.join());
  // deslizar
  await p.evaluate(() => { const box = $('#present'); const ev = (t, x) => box.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: 300 })); ev('pointerdown', 600); ev('pointerup', 400); box.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 300 })); });
  r = await pr();
  check('presentar: deslizar', r[1] === '3 / 3', r.join());
  await p.screenshot({ path: `${out}/46-presentar.png` });
  await p.keyboard.press('Escape'); r = await pr();
  check('presentar: Esc', r[0] === true);
  check('presentar: la nota sigue', (await p.evaluate(() => activeNote()?.id)) === 'd');

  // ---- Nota aleatoria ----
  r = await p.evaluate(() => { const seen = new Set(); for (let i = 0; i < 30; i++) seen.add(openRandomNote().path); return [...seen]; });
  check('aleatoria', r.length > 2 && r.every((x) => !x.startsWith('Plantillas/')), r.join());
  await p.click('#rib-random'); await p.clock.runFor(100);
  check('aleatoria: botón', await p.evaluate(() => !!activeNote()));

  // ---- Meta de palabras ----
  await p.evaluate(() => { openNote(noteById('c')); setNoteMode(noteById('c'), 'read'); }); await p.clock.runFor(100);
  check('meta: sin meta, oculta', await p.evaluate(() => $('#status-goal').hidden));
  await p.evaluate(() => noteMenuItems(noteById('c')).find((x) => x.label.startsWith('Meta de palabras')).action());
  await p.fill('#picker-input', '20'); await p.press('#picker-input', 'Enter'); await p.clock.runFor(200);
  r = await p.evaluate(() => [noteById('c').body, $('#status-goal').hidden, $('#status-goal').textContent, $('#status-goal .goal-fill').style.width, wordGoalProgress(noteById('c'))]);
  check('meta: propiedad', r[0].startsWith('---\nmeta_palabras: 20\n---\n'), r[0]);
  check('meta: barra', !r[1] && r[2] === '6 / 20' && r[3] === '30%', `${r[2]} ${r[3]}`);
  await p.evaluate(() => setNoteMode(noteById('c'), 'edit')); await p.clock.runFor(100);
  await p.focus('#note-editor'); await p.press('#note-editor', 'Control+End');
  await p.keyboard.type(' uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce');
  await p.clock.runFor(700);
  r = await p.evaluate(() => [$('#status-goal').textContent, $('#status-goal').classList.contains('done'), $('#status-goal .goal-fill').style.width]);
  check('meta: al escribir', r[0] === '20 / 20' && r[1] && r[2] === '100%', r.join());
  check('meta: en el menú', await p.evaluate(() => noteMenuItems(noteById('c')).some((x) => x.label === 'Meta de palabras… (20)')));
  await p.evaluate(() => showView('today')); await p.clock.runFor(100);
  check('meta: fuera de las notas, oculta', await p.evaluate(() => $('#status-goal').hidden));
  await p.evaluate(() => { openNote(noteById('c')); setWordGoal(noteById('c'), '0'); }); await p.clock.runFor(100);
  r = await p.evaluate(() => [noteById('c').body.startsWith('---'), $('#status-goal').hidden]);
  check('meta: quitar', !r[0] && r[1], r.join());

  // ---- Botones de Hoy ----
  await p.evaluate(() => showView('today')); await p.click('#today-weekly'); await p.clock.runFor(100);
  check('Hoy: semana', (await p.evaluate(() => activeNote().path)) === 'Semanal/2026-W41');
  await p.evaluate(() => showView('today')); await p.click('#today-monthly'); await p.clock.runFor(100);
  check('Hoy: mes', (await p.evaluate(() => activeNote().path)) === 'Mensual/2026-10');
  await p.screenshot({ path: `${out}/46-semana.png` });

  console.log('errors:', errs); await b.close();
})();
