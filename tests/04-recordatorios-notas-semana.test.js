const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2], S = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.clock.install({ time: new Date('2026-10-07T16:58:00') });
  await p.goto(url);
  await p.evaluate(() => { window.__beeps = 0; });
  await p.evaluate(() => showView('tasks'));
  await p.fill('#task-title', 'Llamar a Ana a las 5 #trabajo');
  console.log('preview:', await p.$$eval('#task-preview .tag', n => n.map(x => x.textContent)));
  await p.click('#task-form button[type=submit]');
  await p.fill('#task-title', 'Gimnasio cada lunes a las 7 de la tarde'); await p.click('#task-form button[type=submit]');
  await p.fill('#task-title', 'Leer artículo'); await p.click('#task-form button[type=submit]');
  await p.fill('#task-title', 'Dentista el viernes 10:30'); await p.click('#task-form button[type=submit]');
  console.log('metas:', await p.$$eval('#task-list .task', n => n.map(x => x.querySelector('.title').textContent + ' [' + x.querySelector('.meta').textContent + ']')));
  console.log('reminders before:', await p.$$eval('.reminder', n => n.length));
  await p.clock.fastForward('03:00');
  console.log('reminders at 17:01:', await p.$$eval('.reminder', n => n.map(x => x.innerText.replace(/\n/g,' '))));
  await p.screenshot({ path: S + '/reminder.png' });
  await p.click('.reminder button:has-text("10 min")');
  console.log('after snooze:', await p.$$eval('.reminder', n => n.length));
  await p.clock.fastForward('10:30');
  console.log('after 10 min:', await p.$$eval('.reminder', n => n.length));
  await p.click('.reminder button:has-text("Hecha")');
  console.log('after done:', await p.$$eval('.reminder', n => n.length), 'done?', await p.$eval('#task-list .task:has-text("Llamar") input', i => i.checked));
  // notes
  await p.click('#task-list .task:has-text("Leer artículo") .sub-toggle');
  await p.fill('#task-list .task:has-text("Leer artículo") textarea.notes', 'https://ejemplo.com/articulo\nLeer la parte 2');
  await p.click('#task-title'); // blur
  await p.click('#task-list .task:has-text("Leer artículo") .sub-toggle');
  console.log('note preview:', await p.textContent('#task-list .task:has-text("Leer artículo") .note-preview'), '| toggle:', await p.textContent('#task-list .task:has-text("Leer artículo") .sub-toggle'));
  // week view
  await p.click('[data-taskview=week]');
  console.log('week title:', await p.textContent('#week-title'));
  console.log('strip:', await p.$$eval('.strip-day', n => n.map(x => x.innerText.replace(/\n/g,''))));
  console.log('days:', await p.$$eval('.day', n => n.map(x => x.querySelector('h4').textContent + ': ' + [...x.querySelectorAll('.title, .ghost-title')].map(t => t.textContent).join(', '))));
  console.log('undated:', await p.textContent('#week-undated'));
  await p.click('#day-2026-10-08 .day-add'); await p.keyboard.type('Comprar regalo a las 6'); await p.keyboard.press('Enter');
  console.log('thursday:', await p.$$eval('#day-2026-10-08 .task', n => n.map(x => x.innerText.replace(/\n/g,' '))));
  await p.screenshot({ path: S + '/week.png', fullPage: true });
  await p.click('#week-next');
  console.log('next week:', await p.textContent('#week-title'), await p.$$eval('.ghost-title', n => n.map(x => x.textContent)));
  await p.emulateMedia({ colorScheme: 'dark' }); await p.click('#week-today'); await p.screenshot({ path: S + '/week-dark.png', fullPage: true });
  console.log('errors:', errs); await b.close();
})();
