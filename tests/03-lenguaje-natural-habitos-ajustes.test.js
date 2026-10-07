const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(url);
  await p.evaluate(() => showView('tasks'));
  // NLP preview + add
  await p.fill('#task-title', 'Llamar a Ana mañana !alta #trabajo');
  console.log('preview:', await p.$$eval('#task-preview .tag', n => n.map(x => x.textContent)));
  await p.click('#task-form button[type=submit]');
  console.log('preview hidden after add:', await p.$eval('#task-preview', x => x.hidden));
  for (const t of ['Comprar pan hoy', 'Pagar alquiler cada mes', 'Revisar informe']) { await p.fill('#task-title', t); await p.click('#task-form button[type=submit]'); }
  console.log('tasks:', await p.$$eval('#task-list .task', n => n.map(x => x.querySelector('.title').textContent + ' [' + x.querySelector('.meta').textContent + ']')));
  // manual order + drag
  await p.selectOption('#task-sort', 'manual');
  console.log('manual order:', await p.$$eval('#task-list .title', n => n.map(x => x.textContent)));
  const h = await p.$('#task-list li:nth-child(4) .handle'); const box = await h.boundingBox();
  const first = await (await p.$('#task-list li:nth-child(1)')).boundingBox();
  await p.mouse.move(box.x + 5, box.y + 5); await p.mouse.down();
  await p.mouse.move(box.x + 5, first.y + 5, { steps: 8 }); await p.mouse.up();
  console.log('after drag:', await p.$$eval('#task-list .title', n => n.map(x => x.textContent)));
  await p.focus('#task-list li:nth-child(1) .handle'); await p.keyboard.press('ArrowDown');
  console.log('after ArrowDown:', await p.$$eval('#task-list .title', n => n.map(x => x.textContent)), 'focus kept:', await p.evaluate(() => document.activeElement.classList.contains('handle')));
  await p.reload(); await p.evaluate(() => showView('tasks'));
  console.log('persisted:', await p.$$eval('#task-list .title', n => n.map(x => x.textContent)), await p.inputValue('#task-sort'));
  await p.screenshot({ path: S + '/tasks3.png', fullPage: true });
  // habits weekly goal
  await p.keyboard.press('7');
  await p.fill('#habit-name', 'Gimnasio'); await p.selectOption('#habit-goal', '3'); await p.click('#habit-form button[type=submit]');
  await p.fill('#habit-name', 'Meditar'); await p.click('#habit-form button[type=submit]');
  await p.click('tbody tr:nth-child(1) td:nth-child(8) button');
  console.log('habit names:', await p.$$eval('.habit-name', n => n.map(x => x.innerText.replace('\n',' | '))));
  await p.click('.habit-name >> nth=1');
  await p.selectOption('.habit-edit select', '5'); await p.click('.habit-edit button[type=submit]');
  console.log('after edit:', await p.$$eval('.habit-name', n => n.map(x => x.innerText.replace('\n',' | '))));
  await p.screenshot({ path: S + '/habits3.png', fullPage: true });
  await p.keyboard.press('1');
  console.log('today chips:', await p.$$eval('.habit-chip', n => n.map(x => x.innerText.replace(/\n/g,' '))));
  // settings: accent + backup
  await p.evaluate(() => document.getElementById('open-settings').click());
  await p.click('.swatch[data-swatch=teal]');
  console.log('accent:', await p.evaluate(() => [document.documentElement.dataset.accent, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()]));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup-export')]);
  const path = S + '/backup.json'; await dl.saveAs(path);
  const backup = require('fs').readFileSync(path, 'utf8');
  console.log('download:', dl.suggestedFilename(), 'tasks in file:', JSON.parse(backup).data.tasks.length, '|', await p.textContent('#backup-message'));
  await p.screenshot({ path: S + '/settings.png', fullPage: true });
  // wipe a task, then restore via paste
  await p.keyboard.press('2'); await p.click('#task-list li:nth-child(1) .del'); await p.evaluate(() => document.getElementById('open-settings').click());
  await p.click('#backup-paste'); await p.fill('#restore-text', backup); await p.click('#backup-paste');
  console.log('restore:', await p.textContent('#backup-message'), 'tasks now', await p.evaluate(() => JSON.parse(localStorage.getItem('enfoque:v1')).tasks.length));
  await p.click('#backup-paste'); await p.fill('#restore-text', '{"hola":1}'); await p.click('#backup-paste');
  console.log('bad restore:', await p.textContent('#backup-message'));
  await p.emulateMedia({ colorScheme: 'dark' }); await p.screenshot({ path: S + '/settings-dark.png', fullPage: true });
  console.log('errors:', errs); await b.close();
})();
