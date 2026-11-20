// Tablas Markdown: la fila separadora fija la alineación de cada columna, como en Obsidian
// (:--- izquierda, :---: centro, ---: derecha). Los números a la derecha usan cifras tabulares.
const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1200, height: 800 } });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(800);
  const md = '| Cuenta | Glosa | Debe | Haber |\n|:--|:--:|--:|---|\n| Mercaderías | compra | 1.000.000 | |\n| a Proveedores | | | 1.190.000 |';
  const html = await p.evaluate((m) => renderMd(m), md);
  const res = await p.evaluate((h) => {
    const box = document.createElement('div'); box.className = 'md'; box.innerHTML = h; document.body.appendChild(box);
    const row = [...box.querySelectorAll('tbody tr:first-child td')].map((td) => getComputedStyle(td).textAlign);
    const head = [...box.querySelectorAll('thead th')].map((th) => getComputedStyle(th).textAlign);
    const nums = getComputedStyle(box.querySelector('tbody tr:first-child td:nth-child(3)')).fontVariantNumeric;
    box.remove();
    return { row, head, nums };
  }, html);
  check('celdas', res.row, ['left', 'center', 'right', 'left']);
  check('cabeceras', res.head, ['left', 'center', 'right', 'left']);
  check('cifras tabulares', res.nums, 'tabular-nums');
  check('sin alineación no añade estilo', (await p.evaluate(() => renderMd('| a | b |\n|---|---|\n| 1 | 2 |'))).includes('style='), false);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
