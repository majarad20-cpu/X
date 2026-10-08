const { chromium, launchOptions } = require('./helpers');
const path = require('path');
const fs = require('fs');
const url = process.argv[2], S = process.argv[3];
const body = [
  '---',
  'tags: [proyecto, idea]',
  'aliases:',
  '  - Sintaxis rica',
  'estado: en curso',
  '---',
  '# Prueba',
  'Fórmula $E = mc^2$ y precio de $5 o $10. Nota al pie[^a] y en línea^[Hola].',
  '',
  '%% secreto oculto %%',
  'Párrafo citado. ^bloque-1',
  '',
  '$$',
  '\\frac{1}{2}',
  '$$',
  '',
  '> [!faq]- Plegado',
  '> Dentro',
  '',
  '- [-] Cancelada',
  '- [!] Importante',
  '- [ ] Normal',
  '',
  '```mermaid',
  'graph LR',
  '  A --> B',
  '```',
  '',
  '<u>sub</u> y <script>x</script> \\*literal\\* [ir](Otra.md#Uno)',
  '',
  '[^a]: Texto de la nota.',
].join('\n');
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1400, height: 860 } });
  // Sin red en las pruebas: las bibliotecas de fórmulas y diagramas no cargan (se ve el texto).
  await c.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/, (r) => r.abort());
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, {
    tasks: [], habits: [], settings: { notesWelcome: true }, updatedAt: 1,
    notes: [
      { id: 'a', path: 'Prueba', body, createdAt: 1, updatedAt: 1 },
      { id: 'b', path: 'Otra', body: '# Uno\nVer [[Sintaxis rica]] y:\n![[Prueba#^bloque-1]]\n\n#Desordenado\n* uno\n+ dos\n- []  tres   \n\n\n\nfin', createdAt: 1, updatedAt: 1 },
    ],
  });
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  await p.evaluate(() => { noteMode.set('a', 'read'); openNoteByLink('Prueba'); }); await p.waitForTimeout(400);
  const R = (sel) => p.$$eval(`#note-reading ${sel}`, n => n.map(x => x.textContent.trim()));
  console.log('props:', await R('.props dd'));
  console.log('math:', await p.$$eval('#note-reading .math', n => n.map(x => `${x.classList.contains('display') ? 'D' : 'I'}:${x.dataset.tex}`)));
  console.log('comment hidden:', !(await p.textContent('#note-reading')).includes('secreto'));
  console.log('footnotes:', await R('.fn-ref'), await R('.footnotes li'));
  console.log('block:', await p.$eval('#note-reading #b-bloque-1', x => x.textContent.trim()));
  console.log('callout:', await p.$eval('#note-reading details.callout', x => `${x.className} open=${x.open}`));
  console.log('tasks:', await p.$$eval('#note-reading li.task-item', n => n.map(x => x.className.replace('task-item', '').trim() || 'box')));
  console.log('mermaid:', await p.$$eval('#note-reading .mermaid-box', n => n.length));
  console.log('html:', await p.$eval('#note-reading > p:has(u)', x => x.innerHTML.replace(/ (title|data-target|data-heading)="[^"]*"/g, '')));
  await p.click('#note-reading .fn-ref a'); await p.waitForTimeout(300);
  console.log('fn flash:', await p.$eval('#note-reading .footnotes li', x => x.classList.contains('flash')));

  // Alias y bloque incrustado
  await p.evaluate(() => { noteMode.set('b', 'read'); openNoteByLink('Otra'); }); await p.waitForTimeout(300);
  console.log('alias resolves:', await p.$eval('#note-reading a.wikilink', x => !x.classList.contains('unresolved')));
  console.log('embed block:', await p.$eval('#note-reading .embed', x => x.textContent.replace(/\s+/g, ' ').trim()));
  await p.click('#note-reading a.wikilink:has-text("Sintaxis rica")'); await p.waitForTimeout(300);
  console.log('alias opens:', await p.evaluate(() => activeNote().path));

  // Vista dividida
  await p.evaluate(() => openNoteByLink('Otra')); await p.keyboard.press('Control+Shift+E'); await p.waitForTimeout(300);
  console.log('split:', await p.evaluate(() => [noteMode.get('b'), state.settings.look.editMode, !document.getElementById('note-editor').hidden, !document.getElementById('note-reading').hidden, getComputedStyle(document.querySelector('.note-inner')).gridTemplateColumns.split(' ').length]));
  await p.click('#note-editor'); await p.keyboard.press('Control+End'); await p.keyboard.type('\n\nNuevo **texto** en vivo');
  await p.waitForTimeout(400);
  console.log('live preview:', await p.$$eval('#note-reading strong', n => n.map(x => x.textContent)));
  await p.screenshot({ path: S + '/split.png' });
  await p.click('#note-reading li:has-text("dos")'); await p.waitForTimeout(100);
  console.log('click preview → line:', await p.evaluate(() => { const t = document.getElementById('note-editor'); return t.value.slice(0, t.selectionStart).split('\n').length - 1; }));

  // Ordenar formato
  await p.evaluate(() => lintActiveNote()); await p.waitForTimeout(300);
  console.log('lint:', JSON.stringify(await p.evaluate(() => activeNote().body)));
  await p.keyboard.press('Control+Shift+E'); await p.waitForTimeout(200);
  console.log('split off:', await p.evaluate(() => [noteMode.get('b'), state.settings.look.editMode]));

  // Guía de sintaxis
  await p.evaluate(() => openSyntaxGuide()); await p.waitForTimeout(400);
  console.log('guide:', await p.evaluate(() => [activeNote().path, document.querySelectorAll('#note-reading .callout').length, document.querySelectorAll('#note-reading .math').length]));
  await p.screenshot({ path: S + '/guide.png', fullPage: false });

  // Importar bóveda (carpeta con imagen, .obsidian ignorada)
  const dir = path.join(S, 'vault-in', 'Mi boveda');
  fs.rmSync(path.join(S, 'vault-in'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'Proyectos', 'adjuntos'), { recursive: true }); fs.mkdirSync(path.join(dir, '.obsidian'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Inicio.md'), '# Inicio\n![[foto.png|200]]\nVer [[Plan]]');
  fs.writeFileSync(path.join(dir, 'Proyectos', 'Plan.md'), 'Plan con ![x](adjuntos/foto.png)');
  fs.writeFileSync(path.join(dir, 'Prueba.md'), 'otra distinta');
  fs.writeFileSync(path.join(dir, '.obsidian', 'app.json'), '{}');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDEgAQBJ+AIBfPUqhAAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(dir, 'Proyectos', 'adjuntos', 'foto.png'), png);
  await p.evaluate(() => showView('settings'));
  await p.setInputFiles('#vault-folder', dir);
  await p.waitForFunction(() => /Listo/.test(document.getElementById('vault-message').textContent), null, { timeout: 10000 }).catch(async () => console.log('msg now:', await p.textContent('#vault-message'), await p.evaluate(() => [...document.getElementById('vault-folder').files].map(f => f.webkitRelativePath + ':' + f.name))));
  console.log('import msg:', await p.textContent('#vault-message'));
  console.log('imported:', JSON.stringify(await p.evaluate(() => state.notes.filter(n => !['a', 'b'].includes(n.id) && n.path !== 'Guía de sintaxis').map(n => [n.path, n.body.replace(/img:[a-z0-9]+/g, 'img:ID')]))));
  await p.evaluate(() => openNoteByLink('Inicio')); await p.waitForTimeout(500);
  console.log('img sized:', await p.$eval('#note-reading img.note-img', i => [i.style.width, i.naturalWidth > 0]));
  console.log('errors:', errs); await b.close();
})();
