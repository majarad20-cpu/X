#!/usr/bin/env node
// Lanza todas las pruebas de esta carpeta contra index.html y resume el resultado.
// Uso: node tests/run.js [filtro]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const url = `file://${path.resolve(dir, '..', 'index.html')}`;
const out = path.join(dir, 'out');
fs.mkdirSync(out, { recursive: true });

// Lo que cada prueba debe imprimir para darse por buena (por defecto, ningún error en la página).
const EXPECT = { '05-arrastrar-raton.test.js': 'final DABC', '06-arrastrar-tactil.test.js': 'final BCDA' };
const filter = process.argv[2] || '';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js') && f.includes(filter)).sort();

let failed = 0;
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, f), url, out], { encoding: 'utf8', timeout: 180000 });
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  const expect = EXPECT[f] || 'errors: []';
  const ok = r.status === 0 && output.includes(expect) && !/TimeoutError|ReferenceError|TypeError/.test(output);
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${f} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (!ok) console.log(output.split('\n').filter((l) => !l.includes('agent-proxy')).slice(-25).join('\n'));
}
console.log(`\n${files.length - failed}/${files.length} pruebas correctas`);
process.exit(failed ? 1 : 0);
