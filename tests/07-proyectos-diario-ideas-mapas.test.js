const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const ctx = await b.newContext({ viewport: { width: 390, height: 860 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.clock.install({ time: new Date('2026-10-07T10:00:00') });
  await p.goto(url);
  console.log('nudge visible:', await p.isVisible('#today-journal'));
  // ---- Proyectos
  await p.evaluate(() => showView('projects'));
  await p.fill('#project-name', 'Web nueva'); await p.fill('#project-deadline', '2026-10-10'); await p.click('#project-form button');
  await p.fill('#project-name', 'Mudanza'); await p.click('#project-form button');
  console.log('cards:', await p.$$eval('.project-card', n => n.map(x => x.innerText.replace(/\n/g,' | '))));
  await p.click('.project-card:has-text("Web nueva")');
  for (const t of ['Diseñar portada', 'Escribir textos mañana', 'Publicar el viernes']) { await p.fill('#pd-task-title', t); await p.click('#pd-task-form button'); }
  await p.click('#pd-tasks .task:has-text("Diseñar") input[type=checkbox]');
  console.log('detail:', await p.textContent('#pd-percent'), '|', await p.textContent('#pd-status-text'), '| risk:', await p.isVisible('#pd-risk'));
  await p.screenshot({ path: S + '/project.png', fullPage: true });
  await p.check('#pd-manual'); await p.fill('#pd-slider', '80'); await p.dispatchEvent('#pd-slider', 'change');
  console.log('manual:', await p.textContent('#pd-percent'), await p.textContent('#pd-status-text'));
  await p.uncheck('#pd-manual');
  await p.fill('#pd-desc', 'Lanzar la web antes del puente'); await p.waitForTimeout(500);
  await p.click('#project-back');
  // NLP +proyecto from tasks tab
  await p.evaluate(() => showView('tasks'));
  await p.fill('#task-title', 'Empaquetar libros +mudan el sábado');
  console.log('preview:', await p.$$eval('#task-preview .tag', n => n.map(x => x.textContent)));
  await p.click('#task-form button[type=submit]');
  console.log('chip:', await p.textContent('#task-list .task:has-text("Empaquetar") .project-tag'));
  await p.click('#task-list .task:has-text("Empaquetar") .project-tag');
  console.log('opened:', await p.inputValue('#pd-name'), await p.textContent('#pd-percent'));
  await p.click('#project-back');
  console.log('cards2:', await p.$$eval('.project-card', n => n.map(x => x.innerText.replace(/\n/g,' | '))));
  await p.screenshot({ path: S + '/projects.png', fullPage: true });
  // ---- Diario
  await p.evaluate(() => showView('journal'));
  await p.fill('#journal-fields textarea', '- Llamar al banco mañana a las 10\n- Me preocupa la entrega\n- Comprar regalo para Laura\nIdea: ordenar el trastero');
  await p.click('.mood:has-text("Bien")');
  await p.click('#journal-form button[type=submit]');
  console.log('convert lines:', await p.$$eval('.dc-line', n => n.map(x => x.innerText.replace(/\n/g,' '))));
  await p.check('.dc-line:has-text("Llamar al banco") input'); await p.check('.dc-line:has-text("Comprar regalo") input');
  await p.click('#dump-convert button.primary');
  console.log('tasks now:', await p.evaluate(() => (flushLocal(), JSON.parse(localStorage.getItem('enfoque:v1'))).tasks.map(t => t.title + (t.due ? ' ' + t.due : '') + (t.time ? ' ' + t.time : ''))));
  await p.click('[data-jkind=gratitude]');
  const fields = await p.$$('#journal-fields textarea'); await fields[0].fill('El café con Marta'); await fields[1].fill('Que salió el sol');
  await p.click('#journal-form button[type=submit]');
  console.log('entries:', await p.$$eval('.entry', n => n.map(x => x.querySelector('.entry-head').innerText.replace(/\n/g,' '))), '| stats:', await p.textContent('#journal-stats'));
  console.log('week:', await p.$$eval('.jw-mark', n => n.map(x => x.textContent || '·').join('')));
  await p.fill('#journal-search', 'marta');
  console.log('search:', await p.$$eval('.entry', n => n.length));
  await p.fill('#journal-search', '');
  await p.screenshot({ path: S + '/journal.png', fullPage: true });
  await p.evaluate(() => showView('today'));
  console.log('nudge after:', await p.isVisible('#today-journal'));
  // ---- Ideas
  await p.evaluate(() => showView('ideas'));
  await p.fill('#idea-text', 'App de recetas #negocio\nBuscar recetas por ingredientes\nLista de la compra automática\nModo cocina paso a paso');
  await p.press('#idea-text', 'Control+Enter');
  await p.fill('#idea-text', 'Regalar un libro a papá #regalos'); await p.click('#idea-form button');
  console.log('ideas:', await p.$$eval('.idea .idea-text', n => n.map(x => x.textContent.split('\n')[0])), 'tags:', await p.$$eval('#idea-tags .tag', n => n.map(x => x.textContent)));
  await p.click('.idea:has-text("App de recetas") .icon-link');
  await p.screenshot({ path: S + '/ideas.png', fullPage: true });
  await p.click('.idea:has-text("App de recetas") button:has-text("→ Mapa")');
  console.log('map nodes:', await p.$$eval('.mm-node', n => n.map(x => x.textContent)));
  // keyboard: select first branch, add child with Tab, type
  await p.click('.mm-node:has-text("Lista de la compra")');
  await p.keyboard.press('Tab'); await p.keyboard.type('Compartir con la familia'); await p.keyboard.press('Enter');
  await p.keyboard.press('Enter'); await p.keyboard.type('Avisar de ofertas'); await p.keyboard.press('Tab'); await p.keyboard.type('Supermercados cercanos'); await p.keyboard.press('Enter');
  console.log('after add:', await p.$$eval('.mm-node', n => n.map(x => x.textContent)));
  await p.keyboard.press('ArrowLeft');
  console.log('selected after ArrowLeft:', await p.textContent('.mm-node.selected'));
  await p.click('#mm-fit');
  await p.screenshot({ path: S + '/map.png' });
  // fold
  await p.click('.mm-node:has-text("Lista de la compra") .mm-fold');
  console.log('folded count:', await p.$$eval('.mm-node', n => n.length), await p.textContent('.mm-node:has-text("Lista de la compra") .mm-fold'));
  await p.click('.mm-node:has-text("Lista de la compra") .mm-fold');
  // delete branch + undo
  await p.click('.mm-node:has-text("Lista de la compra")'); await p.keyboard.press('Delete');
  console.log('after delete:', await p.$$eval('.mm-node', n => n.length), await p.textContent('#toast'));
  await p.click('.toast-action');
  console.log('after undo:', await p.$$eval('.mm-node', n => n.length));
  // node -> task, export
  await p.click('.mm-node:has-text("Modo cocina")'); await p.click('#mm-task');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#mm-export')]);
  await dl.saveAs(S + '/map-export.png'); console.log('export:', dl.suggestedFilename());
  await p.emulateMedia({ colorScheme: 'dark' }); await p.click('#mm-fit'); await p.screenshot({ path: S + '/map-dark.png' });
  await p.click('#map-back');
  console.log('maps list:', await p.$$eval('.map-card', n => n.map(x => x.innerText.replace(/\n/g,' | '))));
  await p.screenshot({ path: S + '/maps.png', fullPage: true });
  await p.reload();
  console.log('persisted:', await p.evaluate(() => { const s = (flushLocal(), JSON.parse(localStorage.getItem('enfoque:v1'))); return [s.projects.length, s.journal.length, s.ideas.length, s.maps.length, s.maps[0].nodes.length]; }));
  // shortcuts 1-8
  const seen = []; for (const k of '12345678') { await p.keyboard.press(k); seen.push(await p.$eval('.view.active', v => v.id.slice(5))); } console.log('keys:', seen.join(','));
  console.log('errors:', errs); await b.close();
})();
