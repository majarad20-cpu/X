const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
const body = '# Poema\n\nPrimera estrofa, verso uno\nverso dos de la estrofa\n\nSegunda estrofa con **negrita**\ny otro verso\n\n- tarea uno\n- tarea dos\n\nFinal.';
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, updatedAt: 1,
    notes: [{ id: 'a', path: 'Poema', body, createdAt: 1, updatedAt: 1 }, { id: 'v', path: 'Vacía', body: '', createdAt: 1, updatedAt: 1 }],
  });
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  await p.evaluate(() => { noteMode.set('a', 'read'); openNoteByLink('Poema'); }); await p.waitForTimeout(300);
  console.log('split button hidden:', await p.evaluate(() => document.getElementById('note-split').hidden));
  console.log('blocks:', await p.$$eval('#note-reading > [data-src]', n => n.map(x => `${x.tagName}:${x.dataset.src}`).join(' ')));

  // Doble clic en la segunda estrofa: solo ese bloque se edita
  await p.dblclick('#note-reading p:has-text("Segunda estrofa")', { position: { x: 30, y: 10 } }); await p.waitForTimeout(200);
  console.log('editing:', JSON.stringify(await p.inputValue('#note-editor')), '| others rendered:', await p.$$eval('#note-reading > h1, #note-reading > p, #note-reading > ul', n => n.length), '| focused:', await p.evaluate(() => document.activeElement.id), '| mode:', await p.evaluate(() => noteMode.get('a')));
  await p.keyboard.press('End'); await p.keyboard.type(' (editado)');
  await p.waitForTimeout(700);
  console.log('body:', JSON.stringify(await p.evaluate(() => state.notes[0].body.split('\n').slice(5, 7))));
  await p.screenshot({ path: S + '/block-edit.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('after esc:', await p.evaluate(() => [blockEdit, document.getElementById('note-editor').hidden, document.querySelector('#note-reading p:nth-of-type(2)').textContent]));

  // Ayudas: [[ se cierra solo y sugiere notas; Ctrl+B pone negrita; seleccionar y escribir * envuelve
  await p.dblclick('#note-reading p:has-text("Final.")'); await p.waitForTimeout(150);
  await p.keyboard.press('End'); await p.keyboard.type(' Ver [[');
  console.log('autopair:', JSON.stringify(await p.inputValue('#note-editor')), '| suggest:', await p.isVisible('#link-suggest'));
  await p.keyboard.type('Vac'); await p.keyboard.press('Enter');
  console.log('link:', JSON.stringify(await p.inputValue('#note-editor')));
  await p.keyboard.type(' importante'); await p.keyboard.down('Shift'); for (let i = 0; i < 10; i++) await p.keyboard.press('ArrowLeft'); await p.keyboard.up('Shift');
  await p.waitForTimeout(300);
  console.log('fmt bar:', await p.isVisible('#fmt-bar'));
  await p.keyboard.press('Control+b');
  console.log('ctrl+b:', JSON.stringify(await p.inputValue('#note-editor')));
  await p.keyboard.press('Control+b');
  console.log('ctrl+b again:', JSON.stringify(await p.inputValue('#note-editor')));
  await p.keyboard.type('=');  await p.keyboard.type('=');
  console.log('wrap ==:', JSON.stringify(await p.inputValue('#note-editor')));
  await p.click('#fmt-bar .fb-u');
  console.log('bar U:', JSON.stringify(await p.inputValue('#note-editor')));
  await p.keyboard.press('Control+z');
  console.log('undo:', JSON.stringify(await p.inputValue('#note-editor')));
  // Clic fuera cierra y guarda
  await p.mouse.click(640, 20); await p.waitForTimeout(500);
  console.log('saved last:', JSON.stringify(await p.evaluate(() => state.notes[0].body.split('\n').pop())), '| link rendered:', await p.$eval('#note-reading > p:last-of-type a.wikilink', a => a.textContent).catch(() => null));

  // Lista: Enter continúa y Ctrl+L marca la casilla
  await p.dblclick('#note-reading li:has-text("tarea dos")'); await p.waitForTimeout(150);
  console.log('list block:', JSON.stringify(await p.inputValue('#note-editor')));
  await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('tarea tres'); await p.keyboard.press('Control+l');
  console.log('list:', JSON.stringify(await p.inputValue('#note-editor')));
  await p.keyboard.press('Control+l');
  console.log('ctrl+l x2:', JSON.stringify((await p.inputValue('#note-editor')).split('\n').pop()));
  // Doble clic en otro bloque mientras se edita: cambia de bloque (las líneas se recolocan)
  await p.dblclick('#note-reading > p:last-of-type'); await p.waitForTimeout(500);
  console.log('switched to:', JSON.stringify(await p.inputValue('#note-editor')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('final body:', JSON.stringify(await p.evaluate(() => state.notes[0].body)));

  // Nota vacía: doble clic para escribir
  await p.evaluate(() => { noteMode.set('v', 'read'); openNoteByLink('Vacía'); }); await p.waitForTimeout(200);
  await p.dblclick('#note-reading .note-empty'); await p.keyboard.type('Hola **mundo**'); await p.keyboard.press('Control+Enter'); await p.waitForTimeout(300);
  console.log('empty note:', JSON.stringify(await p.evaluate(() => state.notes[1].body)), await p.$eval('#note-reading strong', x => x.textContent));
  // Ctrl+E sigue editando la nota entera
  await p.keyboard.press('Control+e'); await p.waitForTimeout(200);
  console.log('full edit:', JSON.stringify(await p.inputValue('#note-editor')), await p.evaluate(() => noteMode.get('v')));
  console.log('errors:', errs); await b.close();
})();
