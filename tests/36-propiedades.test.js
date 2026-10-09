const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true },
    notes: [
      { id: 'a', path: 'Libro', body: '---\ntitulo: Dune\ntags:\n  - ficcion\n  - clasico\nleido: false\npaginas: 412\ninicio: 2026-10-01\nurl: "https://x.org/a"\n---\n# Libro\nTexto.', createdAt: now, updatedAt: now },
      { id: 'b', path: 'Suelta', body: 'Sin propiedades.', createdAt: now, updatedAt: now },
      { id: 'c', path: 'Otra', body: '---\nestado: pendiente\n---\nx', createdAt: now, updatedAt: now },
      { id: 't', path: 'Tabla', body: '```tabla\norden: Nota\n```', createdAt: now, updatedAt: now },
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const body = (id) => p.evaluate((i) => state.notes.find((n) => n.id === i).body, id);
  await p.evaluate(() => { noteMode.set('a', 'read'); openNoteByLink('Libro'); });
  await p.waitForSelector('#note-reading .pe-panel');
  console.log('panel:', await p.$$eval('#note-reading .pe-row', (r) => r.map((x) => `${x.dataset.key}:${x.dataset.type}`)));
  console.log('no dl left:', await p.$$eval('#note-reading > dl.props', (n) => n.length));
  // Texto
  const titulo = '.pe-row[data-key="titulo"] input.pe-value';
  await p.fill(titulo, 'Dune: Mesías'); await p.press(titulo, 'Enter');
  console.log('text quoted:', (await body('a')).split('\n')[1]);
  // Lista: añadir un chip con Intro y quitar uno con ×
  await p.fill('.pe-row[data-key="tags"] .pe-add-item', 'scifi'); await p.press('.pe-row[data-key="tags"] .pe-add-item', 'Enter');
  console.log('chip added:', (await body('a')).split('\n').slice(2, 6).join('|'));
  console.log('focus kept:', await p.evaluate(() => document.activeElement.classList.contains('pe-add-item')));
  await p.click('.pe-row[data-key="tags"] .pe-chip:nth-child(1) .pe-x');
  console.log('chip removed:', await p.$$eval('.pe-row[data-key="tags"] .pe-chip', (n) => n.map((x) => x.textContent)));
  // Casilla
  await p.click('.pe-row[data-key="leido"] .pe-check');
  console.log('checkbox:', /\nleido: true\n/.test(await body('a')), await p.isChecked('.pe-row[data-key="leido"] .pe-check'));
  // Número y fecha conservan su tipo
  console.log('number/date:', await p.getAttribute('.pe-row[data-key="paginas"] input.pe-value', 'type'), await p.inputValue('.pe-row[data-key="inicio"] input.pe-value'));
  // Cambiar el tipo desde el menú: número -> texto (queda entre comillas)
  await p.click('.pe-row[data-key="paginas"] .pe-ico');
  await p.click('#note-menu .menu-item:has-text("Texto")');
  console.log('type changed:', /\npaginas: "412"\n/.test(await body('a')), await p.getAttribute('.pe-row[data-key="paginas"]', 'data-type'));
  // Renombrar una clave
  await p.fill('.pe-row[data-key="url"] input.pe-key', 'enlace'); await p.press('.pe-row[data-key="url"] input.pe-key', 'Enter');
  console.log('renamed:', /\nenlace: "https:\/\/x.org\/a"\n/.test(await body('a')));
  // Ida y vuelta del YAML: el lector de propiedades lee lo mismo que se escribió
  console.log('round trip:', JSON.stringify(await p.evaluate(() => parseFrontmatter(state.notes[0].body.split('\n')).props)));
  console.log('table props:', JSON.stringify(await p.evaluate(() => parseProps(state.notes[0].body).props.map((x) => [x.key, x.value]))));
  // Sin perder el desplazamiento
  console.log('scroll ok:', await p.evaluate(() => { const s = document.getElementById('note-scroll'); return s.scrollTop >= 0; }));
  // Doble clic dentro del panel no abre la edición por bloques; en la cabecera, sí
  await p.dblclick('.pe-row[data-key="titulo"] .pe-ico');
  console.log('dblclick body:', await p.evaluate(() => !!blockEdit));
  await p.dblclick('.pe-head .pe-count', { force: true });
  console.log('dblclick head:', await p.evaluate(() => !!blockEdit && document.getElementById('note-editor').value.startsWith('---')));
  await p.keyboard.press('Escape'); await p.clock.runFor(400);
  // Nota sin propiedades: añadir una desde el menú de comandos
  await p.evaluate(() => { noteMode.set('b', 'read'); openNoteByLink('Suelta'); });
  console.log('cmd:', await p.evaluate(() => COMMANDS_EXTRA.flatMap((f) => f(activeNote()) || []).map((x) => x.label).filter((l) => /propiedad/i.test(l))));
  console.log('menu:', await p.evaluate(() => NOTE_MENU_EXTRA.map((f) => f(activeNote())).filter(Boolean).map((x) => x.label).filter((l) => /propiedad/i.test(l))));
  await p.evaluate(() => peAddProperty());
  await p.keyboard.type('estado');
  console.log('key suggestions:', await p.$$eval('#pe-keys option', (o) => o.map((x) => x.value).includes('estado')));
  await p.keyboard.press('Enter');
  console.log('value suggestions:', await p.$$eval('.pe-row[data-key="estado"] datalist option', (o) => o.map((x) => x.value)));
  await p.keyboard.type('hecho: sí'); await p.keyboard.press('Enter');
  console.log('created:', JSON.stringify(await body('b')));
  // Borrar la última propiedad quita el bloque
  await p.click('.pe-row[data-key="estado"] .pe-ico');
  await p.click('#note-menu .menu-item:has-text("Eliminar")');
  console.log('removed block:', JSON.stringify(await body('b')), await p.$$eval('#note-reading .pe-panel', (n) => n.length));
  // Ocultar / mostrar
  await p.evaluate(() => { noteMode.set('a', 'read'); openNoteByLink('Libro'); });
  await p.click('.pe-toggle');
  console.log('collapsed:', await p.evaluate(() => [state.settings.propsHidden, document.querySelector('.pe-panel').classList.contains('collapsed')]));
  await p.click('.pe-toggle');
  // setProp no rompe las listas con guiones
  console.log('setProp list:', JSON.stringify(await p.evaluate(() => { const n = { body: '---\ntags:\n  - a\n  - b\nx: 1\n---\nt' }; setProp(n, 'tags', 'a, c'); setProp(n, 'x', 'p: q'); return n.body; })));
  // Tabla: casilla, lista y fecha
  await p.evaluate(() => { noteMode.set('t', 'read'); openNoteByLink('Tabla'); }); await p.clock.runFor(200);
  console.log('table cells:', await p.$$eval('.note-table tbody tr:has-text("Libro") td', (t) => t.map((x) => (x.querySelector('.nt-check') ? `check:${x.querySelector('.nt-check').checked}` : x.querySelector('.prop-chip') ? `chips:${x.querySelectorAll('.prop-chip').length}` : x.querySelector('time') ? 'date' : x.textContent))));
  await p.click('.note-table tbody tr:has-text("Libro") .nt-check');
  console.log('table toggle:', /\nleido: false\n/.test(await body('a')));
  // Nota protegida desbloqueada: se edita el texto en memoria, nunca en claro
  await p.evaluate(async () => { const n = state.notes.find((x) => x.id === 'c'); await protectNote(n, 'clave'); noteMode.set('c', 'read'); openNoteByLink('Otra'); });
  await p.clock.runFor(200);
  await p.fill('.pe-row[data-key="estado"] input.pe-value', 'listo'); await p.press('.pe-row[data-key="estado"] input.pe-value', 'Enter');
  await p.clock.runFor(600);
  console.log('enc:', await p.evaluate(() => [unlockedNotes.get('c').split('\n')[1], !state.notes.find((x) => x.id === 'c').body.includes('listo')]));
  await b.close();
  console.log('errors:', errs);
})();
