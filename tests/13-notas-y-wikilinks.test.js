const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.clock.install({ time: new Date('2026-10-07T10:00:00') });
  await p.goto(url);
  console.log('tabs:', await p.$$eval('.ws-tab .ws-tab-label', n => n.map(x => x.textContent)), '| tree:', await p.$$eval('.tree-row', n => n.map(x => x.textContent)));
  await p.screenshot({ path: S + '/obs-start.png' });
  // Abrir la bienvenida, seguir un enlace que no existe (se crea)
  await p.click('.ws-tab:has-text("Bienvenida")');
  console.log('reading has wikilink:', await p.$eval('#note-reading a.wikilink', a => [a.textContent, a.className]));
  await p.click('#note-reading a.wikilink');
  console.log('active tab:', await p.textContent('.ws-tab.active'), '| mode edit:', await p.isVisible('#note-editor'));
  await p.keyboard.type('Planes posibles:\n- Ir a la sierra\n- Ver a [[Bien');
  console.log('suggest:', await p.$$eval('#link-suggest .sg-label', n => n.map(x => x.textContent)));
  await p.keyboard.press('Enter');
  await p.keyboard.type(' y #ocio');
  console.log('editor:', JSON.stringify(await p.inputValue('#note-editor')));
  await p.keyboard.press('Control+e');
  console.log('reading html:', await p.$eval('#note-reading', d => d.innerText.replace(/\n/g, ' | ')));
  // Enlaces entrantes en la bienvenida
  await p.click('#note-reading a.wikilink:has-text("Bienvenida")');
  console.log('backlinks:', await p.$eval('#rp-backlinks', d => d.innerText.replace(/\n/g, ' | ')));
  // Casilla en lectura
  await p.click('#note-reading input.task-check');
  console.log('task toggled in source:', (await p.evaluate(() => JSON.parse(localStorage.getItem('enfoque:v1')).notes.find(n => n.path === 'Bienvenida').body)).includes('- [x] Marca esta casilla'));
  // Renombrar: los enlaces se actualizan
  await p.fill('#note-title', 'Inicio'); await p.press('#note-title', 'Enter');
  console.log('renamed:', await p.evaluate(() => JSON.parse(localStorage.getItem('enfoque:v1')).notes.map(n => n.path + ' :: ' + (n.body.match(/\[\[[^\]]+\]\]/g) || []).join(','))));
  // Buscador rápido
  await p.keyboard.press('Escape');
  await p.keyboard.press('Control+o'); await p.keyboard.type('ideas fin');
  console.log('switcher:', await p.$$eval('.pk-item .pk-label', n => n.map(x => x.textContent)));
  await p.keyboard.press('Escape');
  await p.keyboard.press('Control+o'); await p.keyboard.type('Trabajo/Reunión lunes'); await p.keyboard.press('Enter');
  console.log('created in folder:', await p.textContent('#note-crumbs'), '| tree:', await p.$$eval('.tree-row', n => n.map(x => x.textContent.trim())));
  await p.fill('#note-editor', '# Orden del día\n## Puntos\n- Presupuesto con [[Inicio]] y **urgente** ==revisar==\n  - [ ] Pedir cifras\n## Acuerdos\n> [!warning] Ojo\n> Revisar plazos\n\n| Tema | Quién |\n|---|---|\n| Web | Ana |\n\n![[Ideas para el fin de semana]]\n\n```js\nconst x = 1;\n```');
  await p.keyboard.press('Control+e');
  await p.screenshot({ path: S + '/obs-note.png' });
  await p.click('[data-rpane=outline]');
  console.log('outline:', await p.$$eval('.ol-item', n => n.map(x => x.textContent)));
  // Paleta
  await p.keyboard.press('Control+p'); await p.keyboard.type('diaria'); await p.keyboard.press('Enter');
  console.log('daily:', await p.textContent('#note-crumbs'), '|', (await p.inputValue('#note-editor')).split('\n').slice(0, 3).join(' / '));
  // Búsqueda y etiquetas
  await p.click('[data-lpane=tags]');
  console.log('tags:', await p.$$eval('.tag-row', n => n.map(x => x.textContent)));
  await p.click('.tag-row'); console.log('search hits:', await p.$$eval('.search-hit .sh-title', n => n.map(x => x.textContent)));
  // Ir a una sección clásica desde la barra
  await p.click('.rib[data-view=tasks]');
  console.log('tasks tab active:', await p.textContent('.ws-tab.active'), await p.isVisible('#task-form'));
  await p.reload();
  console.log('tabs after reload:', await p.$$eval('.ws-tab .ws-tab-label', n => n.map(x => x.textContent)));
  await p.emulateMedia({ colorScheme: 'dark' }); await p.keyboard.press('Control+o'); await p.keyboard.type('Reunión'); await p.keyboard.press('Enter'); await p.waitForTimeout(100); await p.screenshot({ path: S + '/obs-dark.png' });
  console.log('errors:', errs); await b.close();
})();
