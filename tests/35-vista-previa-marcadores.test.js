const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-09T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  const note = (id, path, body, extra = {}) => ({ id, path, body, createdAt: now, updatedAt: now, ...extra });
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, folders: ['Proyectos'],
    notes: [
      note('a', 'Inicio', '# Inicio\nVer [[Destino]] y [[Destino#Dos]] y [[Secreta]] y [[No existe]].'),
      note('d', 'Destino', '# Uno\nTexto de destino.\n\n' + 'relleno\n\n'.repeat(30) + '## Dos\nSegunda parte con [[Inicio]].'),
      note('s', 'Secreta', '🔒 Nota protegida con contraseña.', { enc: { salt: 'AAAA', iv: 'AAAA', ct: 'AAAA' } }),
      note('p', 'Proyectos/Plan', 'plan del proyecto'),
    ],
    updatedAt: 1,
  });
  await c.route(/fonts\.g/, r => r.abort());
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  const pop = () => p.evaluate(() => { const x = document.getElementById('link-preview'); return x.hidden ? null : x.textContent.replace(/\s+/g, ' ').slice(0, 60); });
  const hover = async (sel) => { const r = await (await p.$(sel)).boundingBox(); await p.mouse.move(r.x + 5, r.y + r.height / 2, { steps: 2 }); await p.clock.runFor(500); };
  const away = async () => { await p.mouse.move(650, 840); await p.clock.runFor(400); };
  const menu = () => p.$$eval('#note-menu .menu-item', n => n.map(x => x.querySelector('span').textContent));
  const pick = async (text) => { await p.waitForSelector(`#note-menu .menu-item:has-text("${text}")`, { state: 'visible', timeout: 5000 }); await p.click(`#note-menu .menu-item:has-text("${text}")`); await p.clock.runFor(100); };

  // ---- Vista previa ----
  await p.evaluate(() => { noteMode.set('a', 'read'); openNoteByLink('Inicio'); });
  await p.clock.runFor(200);
  await p.mouse.move(650, 840);
  const link = '#note-reading a.wikilink[data-target="Destino"][data-heading=""]';
  const r = await (await p.$(link)).boundingBox();
  await p.mouse.move(r.x + 5, r.y + r.height / 2); await p.clock.runFor(200);
  console.log('not yet:', await pop());
  await p.clock.runFor(300);
  console.log('preview:', await pop());
  const box = await p.evaluate(() => { const x = document.getElementById('link-preview').getBoundingClientRect(); return x.width <= 420 && x.height <= 360 && x.left >= 0 && x.bottom <= innerHeight; });
  console.log('inside viewport:', box);
  // Se queda abierta con el ratón encima
  const pr = await (await p.$('#link-preview .lp-body')).boundingBox();
  await p.mouse.move(pr.x + 20, pr.y + 20, { steps: 3 }); await p.clock.runFor(600);
  console.log('stays over popover:', !!(await pop()));
  await away();
  console.log('closes on leave:', await pop());
  // #título: baja hasta la sección
  await hover('#note-reading a.wikilink[data-target="Destino"][data-heading="Dos"]');
  console.log('heading target:', await p.evaluate(() => [document.querySelector('#link-preview .lp-target')?.textContent, document.querySelector('#link-preview .lp-body').scrollTop > 0]));
  // Esc la cierra
  await p.keyboard.press('Escape'); await p.clock.runFor(50);
  console.log('esc closes:', await pop());
  // Clic en un enlace de dentro: navega
  await hover('#note-reading a.wikilink[data-target="Destino"][data-heading=""]');
  const inner = await (await p.$('#link-preview a.wikilink[data-target="Inicio"]')).boundingBox();
  await p.evaluate(() => { const b = document.querySelector('#link-preview .lp-body'); b.scrollTop = b.scrollHeight; });
  await p.click('#link-preview a.wikilink[data-target="Inicio"]');
  await p.clock.runFor(100);
  console.log('click inside follows:', await p.evaluate(() => activeNote()?.path), await pop(), !!inner);
  // Protegida y enlace roto
  await away();
  await hover('#note-reading a.wikilink[data-target="Secreta"]');
  console.log('locked:', await pop());
  await away();
  await hover('#note-reading a.wikilink[data-target="No existe"]');
  console.log('unresolved:', await pop());
  await away();
  // Enlaces entrantes y resultados de búsqueda
  await p.evaluate(() => { openNoteByLink('Destino'); panels.rpane = 'backlinks'; panels.right = true; applyPanels(); renderRightPanel(); });
  await p.clock.runFor(100);
  await hover('#rp-backlinks .bl-note');
  console.log('backlinks:', await pop());
  await away();
  await p.evaluate(() => { showLeftPane('search'); document.getElementById('note-search').value = 'plan'; renderSearch(); });
  await p.clock.runFor(200);
  await hover('#search-results .search-hit');
  console.log('search hit:', await pop());
  await away();
  // Ratón táctil: nada
  const touch = await p.evaluate(() => { const a = document.querySelector('#search-results .search-hit'); a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' })); return true; });
  await p.clock.runFor(500);
  console.log('touch none:', touch && await pop());

  // ---- Marcadores ----
  // Desde la búsqueda
  await p.click('#bm-search');
  // Menú ⋯ de la nota
  await p.evaluate(() => { noteMode.set('d', 'read'); openNoteByLink('Destino'); });
  await p.clock.runFor(100);
  await p.click('#note-more'); await pick('Añadir a marcadores');
  // Título en la lectura
  await p.click('#note-reading h2', { button: 'right', force: true });
  await pick('Añadir este título a marcadores');
  // Carpeta del explorador (plegada)
  await p.evaluate(() => { collapsedFolders.add('Proyectos'); showLeftPane('files'); treeKey = ''; renderTree(); });
  await p.click('.tree-row.folder[title="Proyectos"]', { button: 'right', force: true });
  await pick('Añadir a marcadores');
  // Nota del explorador: ahora sale «Quitar»
  await p.click('.tree-row.file[data-id="d"]', { button: 'right', force: true });
  console.log('tree note menu:', (await menu()).filter(x => /marcadores/.test(x)));
  await p.keyboard.press('Escape');
  console.log('stored:', await p.evaluate(() => state.settings.bookmarks.map(b => `${b.type}:${b.ref}${b.heading ? '#' + b.heading : ''}`)));
  console.log('command:', await p.evaluate(() => COMMANDS_EXTRA.flatMap(f => f(activeNote()) || []).map(x => x.label).filter(l => /marcadores/.test(l))));
  // Panel de marcadores
  await p.click('#rib-bookmarks'); await p.clock.runFor(100);
  console.log('pane:', await p.isVisible('#lp-bookmarks'), await p.$$eval('#bookmark-list .bm-item', n => n.map(x => x.textContent)));
  // Abrir cada tipo
  await p.evaluate(() => openNoteByLink('Inicio'));
  await p.click('#bookmark-list .bm-item:has-text("Dos")'); await p.clock.runFor(300);
  console.log('open heading:', await p.evaluate(() => activeNote()?.path));
  await p.click('#bookmark-list .bm-item:has-text("Proyectos")'); await p.clock.runFor(100);
  console.log('open folder:', await p.isVisible('#lp-files'), await p.isVisible('.tree-row.file[data-id="p"]'));
  await p.click('#rib-bookmarks'); await p.clock.runFor(100);
  await p.click('#bookmark-list .bm-item:has-text("plan")'); await p.clock.runFor(300);
  console.log('open search:', await p.isVisible('#lp-search'), await p.inputValue('#note-search'));
  await p.click('#rib-bookmarks'); await p.clock.runFor(100);
  // Vista previa en un marcador
  await hover('#bookmark-list .bm-item[data-pv-note="d"]:not([data-pv-heading])');
  console.log('bookmark preview:', await pop());
  await away();
  // Clic derecho: opciones, grupo, renombrar, bajar, quitar
  await p.click('#bookmark-list .bm-item:has-text("plan")', { button: 'right' });
  console.log('bm menu:', await menu());
  await pick('Mover a grupo');
  await p.keyboard.type('Trabajo'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  console.log('group:', await p.$$eval('#bookmark-list > *', n => n.map(x => x.textContent)));
  await p.click('#bookmark-list .bm-item[data-pv-note="d"]:not([data-pv-heading])', { button: 'right' }); await pick('Renombrar');
  await p.keyboard.press('Control+a'); await p.keyboard.type('Mi destino'); await p.keyboard.press('Enter'); await p.clock.runFor(100);
  await p.click('#bookmark-list .bm-item:has-text("Mi destino")', { button: 'right' }); await pick('Bajar');
  console.log('renamed+down:', await p.$$eval('#bookmark-list .bm-item', n => n.map(x => x.textContent)));
  // Arrastrar: la carpeta delante de todo
  await p.evaluate(() => {
    const dt = new DataTransfer();
    const src = [...document.querySelectorAll('#bookmark-list .bm-item')].find(x => x.textContent.includes('Proyectos'));
    const dst = document.querySelector('#bookmark-list .bm-item');
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  console.log('dragged:', await p.$$eval('#bookmark-list .bm-item', n => n.map(x => x.textContent)));
  // Nota borrada: atenuada
  await p.evaluate(() => { state.notes = state.notes.filter(n => n.id !== 'd'); save(); renderAll(); });
  console.log('missing:', await p.$$eval('#bookmark-list .bm-item.missing', n => n.length));
  await p.click('#bookmark-list .bm-item:has-text("Proyectos")', { button: 'right' }); await pick('Quitar');
  console.log('removed:', await p.evaluate(() => state.settings.bookmarks.length));
  console.log('errors:', errs); await b.close();
})();
