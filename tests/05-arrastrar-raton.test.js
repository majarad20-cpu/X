const { chromium, launchOptions } = require('./helpers');
(async () => {
  const b = await chromium.launch(launchOptions);
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  await p.goto(process.argv[2]);
  await p.evaluate(() => showView('tasks'));
  for (const t of ['A', 'B', 'C', 'D']) { await p.fill('#task-title', t); await p.click('#task-form button[type=submit]'); }
  await p.selectOption('#task-sort', 'manual');
  await p.evaluate(() => { window.__moves = 0; document.addEventListener('pointermove', () => window.__moves++, true); });
  const h = await (await p.$('#task-list li:nth-child(4) .handle')).boundingBox();
  const first = await (await p.$('#task-list li:nth-child(1)')).boundingBox();
  console.log('handle y', h.y, 'first y', first.y, 'scrollY', await p.evaluate(() => scrollY));
  await p.mouse.move(h.x + 5, h.y + 5); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(h.x + 5, h.y + 5 + (first.y - h.y) * i / 8); console.log(i, await p.$$eval('#task-list .title', n => n.map(x => x.textContent).join(''))); }
  await p.mouse.up();
  console.log('final', await p.$$eval('#task-list .title', n => n.map(x => x.textContent).join('')), 'moves', await p.evaluate(() => __moves));
  await b.close();
})();
