const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(url);
  // Hoy: quick add
  await p.fill('#today-title', 'Preparar presentación'); await p.click('#today-form button');
  await p.fill('#today-title', 'Llamar al dentista'); await p.click('#today-form button');
  // Tareas tab via shortcut N
  await p.locator('body').click({ position: { x: 5, y: 5 } });
  await p.keyboard.press('n');
  console.log('N focuses:', await p.evaluate(() => document.activeElement.id));
  await p.fill('#task-title', 'Revisar presupuesto'); await p.selectOption('#task-priority','3');
  await p.fill('#task-due', '2026-10-01'); await p.click('#task-form button');
  // edit
  await p.click('#task-list .task .title >> text=Llamar al dentista');
  console.log('focused editor visible:', await p.evaluate(() => !!document.activeElement.closest('#task-list'))); await p.keyboard.press('Control+A'); await p.keyboard.type('Llamar al dentista (cita)');
  await p.keyboard.press('Enter');
  console.log('after edit:', await p.$$eval('#task-list .title', n => n.map(x => x.textContent)));
  // delete + undo
  await p.click('#task-list .task:has-text("Revisar") .del');
  console.log('toast:', await p.textContent('#toast'), 'count', await p.$$eval('#task-list .task', n=>n.length));
  await p.click('.toast-action');
  console.log('after undo count', await p.$$eval('#task-list .task', n=>n.length), 'toast hidden', await p.$eval('#toast', t=>t.hidden));
  // complete one
  await p.click('#task-list .task:has-text("Preparar") input[type=checkbox]');
  // habits
  await p.keyboard.press('7');
  await p.fill('#habit-name', 'Leer 20 min'); await p.click('#habit-form button');
  await p.fill('#habit-name', 'Caminar'); await p.click('#habit-form button');
  await p.locator('body').click({ position: { x: 5, y: 5 } });
  await p.keyboard.press('1');
  await p.click('.habit-chip:has-text("Leer")');
  console.log('stats:', await p.$$eval('.stat', n => n.map(x => x.innerText.replace('\n',' '))), 'habits', await p.textContent('#today-habits-count'));
  await p.screenshot({ path: S + '/today.png', fullPage: true });
  // space toggles timer
  await p.locator('body').click({ position: { x: 5, y: 5 } });
  await p.keyboard.press('6'); await p.keyboard.press(' ');
  await p.waitForTimeout(1200);
  console.log('timer running:', await p.textContent('#timer-start'), await p.textContent('#timer-display'));
  await p.keyboard.press(' ');
  console.log('paused:', await p.textContent('#timer-start'));
  await p.keyboard.press('2');
  await p.click('#task-list .task .title'); 
  await p.screenshot({ path: S + '/tasks.png', fullPage: true });
  await p.emulateMedia({ colorScheme: 'dark' }); await p.keyboard.press('Escape'); await p.keyboard.press('1');
  await p.screenshot({ path: S + '/today-dark.png', fullPage: true });
  console.log('errors:', errs); await b.close();
})();
