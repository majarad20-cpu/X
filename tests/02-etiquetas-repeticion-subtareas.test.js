const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url);
  await p.evaluate(() => showView('tasks'));
  // tags
  await p.fill('#task-title', 'Preparar presentación #trabajo #cliente'); await p.selectOption('#task-priority','3'); await p.click('#task-form button[type=submit]');
  await p.fill('#task-title', 'Comprar fruta #casa'); await p.click('#task-form button[type=submit]');
  // recurring daily, no due -> today
  await p.fill('#task-title', 'Revisar correo #trabajo'); await p.selectOption('#task-repeat','daily'); await p.click('#task-form button[type=submit]');
  // weekdays
  await p.fill('#task-title', 'Stand-up del equipo'); await p.selectOption('#task-repeat','weekly'); await p.click('#task-form button[type=submit]');
  console.log('titles:', await p.$$eval('#task-list .title', n => n.map(x => x.textContent)));
  console.log('tag filter:', await p.$$eval('#tag-filter .tag', n => n.map(x => x.textContent)));
  await p.click('#tag-filter .tag:has-text("#trabajo")');
  console.log('filtered:', await p.$$eval('#task-list .title', n => n.map(x => x.textContent)));
  await p.click('#tag-filter .tag:has-text("Todas")');
  // subtasks
  await p.click('#task-list .task:has-text("Preparar") .sub-toggle');
  console.log('sub input focused:', await p.evaluate(() => document.activeElement.dataset.subInput ? 'yes' : document.activeElement.tagName));
  for (const s of ['Hacer diapositivas', 'Ensayar', 'Enviar al cliente']) { await p.keyboard.type(s); await p.keyboard.press('Enter'); }
  await p.click('#task-list .subtask:has-text("Ensayar") input');
  console.log('meta:', await p.textContent('#task-list .task:has-text("Preparar") .meta'));
  // recurring completion
  await p.click('#task-list .task:has-text("Revisar correo") input[type=checkbox]');
  console.log('toast:', await p.textContent('#toast'));
  console.log('recurring meta:', await p.textContent('#task-list .task:has-text("Revisar correo") .meta'), 'done?', await p.$eval('#task-list .task:has-text("Revisar correo") input', i => i.checked));
  await p.screenshot({ path: S + '/tasks2.png', fullPage: true });
  await p.click('.toast-action');
  console.log('after undo meta:', await p.textContent('#task-list .task:has-text("Revisar correo") .meta'));
  // edit tags
  await p.click('#task-list .title:has-text("Comprar fruta")');
  console.log('editor value:', await p.inputValue('.view.active .task-edit input[type=text]'));
  await p.fill('.view.active .task-edit input[type=text]', 'Comprar fruta y pan #casa #super');
  await p.selectOption('.view.active .task-edit select[aria-label=Repetir]', 'weekly');
  await p.keyboard.press('Enter');
  console.log('after edit:', await p.textContent('#task-list .task:has-text("Comprar fruta") .body'));
  await p.evaluate(() => showView('today'));
  console.log('today stats:', await p.$$eval('#view-today .stat', n => n.map(x => x.innerText.replace('\n',' '))));
  await p.screenshot({ path: S + '/today2.png', fullPage: true });
  await p.reload(); await p.evaluate(() => showView('tasks'));
  console.log('persisted subtasks meta:', await p.textContent('#task-list .task:has-text("Preparar") .meta'));
  console.log('errors:', errs); await b.close();
})();
