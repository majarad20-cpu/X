const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const notes = [
  N('w', 'MATRIZ/Borrador IVA', '# IVA\nel iva se declara en el f29 hasta el dia 20 de cada mes.\n\nOtra línea.\n'),
  N('i', 'MATRIZ/Pantallazo F29', '# F29\n![Pantallazo](img:pic1)\n'),
];
const mock = () => {
  window.__calls = [];
  window.__script = null;
  const sample = async (input, o = {}) => {
    window.__calls.push({ kind: typeof input, images: o.images ? o.images.length : 0, tools: (o.tools || []).map((t) => t.name) });
    if (typeof input === 'string') {
      const text = /Continúa/.test(input) ? 'Además, el F29 rectificatorio genera reajustes.' : 'El IVA se declara en el F29 hasta el día 20 de cada mes.';
      return { text, truncated: false };
    }
    let text = 'Listo.';
    if (window.__script) {
      const T = (n) => o.tools.find((t) => t.name === n);
      window.__toolOut = await window.__script(T);
      text = 'Te dejé la propuesta.';
    }
    o.onText?.({ text });
    return { text, truncated: false };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 16 }, images: { maxCount: 4, maxInputBytes: 20e6, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } });
  sample.json = async () => ({});
  window.claude = { use: async (k) => (k === 'sample' ? sample : null) };
};
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes, updatedAt: 1 })); }, notes);
  await c.addInitScript(mock);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(1000);
  // Imagen de 200x100 (mitad roja, mitad azul) guardada como las de las notas.
  await p.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 100;
    const cx = cv.getContext('2d'); cx.fillStyle = '#f00'; cx.fillRect(0, 0, 100, 100); cx.fillStyle = '#00f'; cx.fillRect(100, 0, 100, 100);
    await putFile({ id: 'pic1', name: 'Pantallazo', type: 'image/png', data: cv.toDataURL('image/png'), width: 200, height: 100 });
  });
  const approveLast = async () => { await p.evaluate(async () => { const id = [...kata.pending.keys()].at(-1); await kataApprove(id); }); await p.waitForTimeout(300); };

  // 1) Escritura: botón ✨ con la selección del editor, «Corregir» y aprobar.
  await p.evaluate(() => openNote(noteById('w'), { edit: true })); await p.waitForTimeout(300);
  await p.evaluate(() => {
    const ta = document.querySelector('#note-editor'); ta.hidden = false; ta.value = noteById('w').body; ta.focus();
    const s = ta.value.indexOf('el iva'); ta.setSelectionRange(s, s + 'el iva se declara en el f29 hasta el dia 20 de cada mes.'.length);
    ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 400, clientY: 300 }));
  });
  await p.waitForTimeout(150);
  const fab = await p.evaluate(() => !document.querySelector('#kc-sel-fab').hidden);
  check('botón ✨ con selección', fab, true);
  await p.evaluate(() => kcWriteAction('corregir', kcLastSel.sel)); await p.waitForTimeout(400);
  check('propuesta de corrección', await p.evaluate(() => [kata.turns.at(-1).content.includes('El IVA se declara en el F29'), !!document.querySelector('#kata-panel .kata-diff')]), [true, true]);
  await approveLast();
  check('texto reemplazado', await p.evaluate(() => noteById('w').body), '# IVA\nEl IVA se declara en el F29 hasta el día 20 de cada mes.\n\nOtra línea.\n');
  // Explicar: agrega debajo como callout.
  await p.evaluate(() => kcWriteAction('explicar', { note: noteById('w'), text: 'Otra línea.' })); await p.waitForTimeout(300); await approveLast();
  check('explicar debajo', await p.evaluate(() => /Otra línea\.\n\n> \[!note\] Explicación\n> El IVA/.test(noteById('w').body)), true);
  // Continuar escribiendo desde el cursor.
  await p.evaluate(() => { const ta = document.querySelector('#note-editor'); ta.hidden = false; ta.value = noteById('w').body; const at = ta.value.indexOf('cada mes.') + 'cada mes.'.length; ta.setSelectionRange(at, at); kcContinue(); }); await p.waitForTimeout(300); await approveLast();
  check('continuar escribiendo', await p.evaluate(() => noteById('w').body.includes('cada mes. Además, el F29 rectificatorio genera reajustes.')), true);

  // 2-4) Imagen de la nota: editar (recortar + tapar + flecha) → nueva imagen debajo, original intacta.
  await p.evaluate(() => openNote(noteById('i'))); await p.waitForTimeout(200);
  await p.evaluate(() => { window.__script = (T) => T('imagenes').execute({ accion: 'editar_imagen', imagen: 1, operaciones: [{ op: 'recortar', x: 50, y: 0, ancho: 50, alto: 100 }, { op: 'tapar', x: 0, y: 0, ancho: 50, alto: 50 }, { op: 'flecha', x1: 10, y1: 90, x2: 90, y2: 10, color: 'amarillo' }] }); });
  await p.evaluate(() => kataSend('Edita la imagen: recorta la parte azul y tapa la esquina')); await p.waitForTimeout(800);
  check('imagen enviada y propuesta con vista previa', await p.evaluate(() => [window.__calls.at(-1).images, !!document.querySelector('#kata-panel .kc-preview')]), [1, true]);
  if (out) await p.screenshot({ path: `${out}/107-editar-imagen.png` });
  await approveLast();
  const imgs = await p.evaluate(async () => { const ids = [...noteById('i').body.matchAll(/\(img:([a-z0-9]+)\)/g)].map((m) => m[1]); const rec = await getFile(ids[1]); return [ids.length, ids[0], rec && rec.width, rec && rec.height]; });
  check('original + editada debajo', imgs, [2, 'pic1', 100, 100]);

  // Atajos de imagen en el panel.
  check('atajos de imagen', await p.evaluate(() => [...document.querySelectorAll('.kc-img-quick .kata-chip')].map((x) => x.textContent)), ['📝 Pasar a nota', '🔍 Describir', '✏️ A dibujo editable', '🖼 Editar…']);

  // 3) Dibujo: crear, ver y editar.
  const dn = await p.evaluate(async () => (await kataDrawing({ titulo: 'Cierre', tipo: 'flujo', pasos: ['Inicio', 'Conciliar', 'Fin'] })).id);
  const figs = await p.evaluate(async (dn) => (await kcTool().execute({ accion: 'ver_dibujo', nota: baseName(noteById(dn).path) })).figuras.filter((f) => f.forma !== 'flecha').map((f) => f.texto), dn);
  check('ver dibujo', figs, ['Cierre', 'Inicio', 'Conciliar', 'Fin']);
  await p.evaluate(async (dn) => {
    const f = (await kcTool().execute({ accion: 'ver_dibujo', nota: baseName(noteById(dn).path) })).figuras;
    const conc = f.find((x) => x.texto === 'Conciliar');
    window.__script = (T) => T('imagenes').execute({ accion: 'editar_dibujo', nota: baseName(noteById(dn).path), operaciones: [{ op: 'cambiar', id: conc.id, texto: 'Conciliar bancos', fondo: 'verde' }, { op: 'agregar', forma: 'rectangulo', x: 400, y: 160, ancho: 220, alto: 80, texto: 'Revisar F29' }, { op: 'flecha', desde: conc.id, hasta: '+0' }] });
    await kataSend('Edita el dibujo');
  }, dn); await p.waitForTimeout(800);
  const before = await p.evaluate((dn) => noteById(dn).body.match(/\(img:([a-z0-9]+)\)/)[1], dn);
  await approveLast();
  const after = await p.evaluate(async (dn) => { const id = noteById(dn).body.match(/\(img:([a-z0-9]+)\)/)[1]; const rec = await getFile(id); const t = kcDrawingSummary(rec.drawing); return [id, t.filter((x) => x.forma !== 'flecha').map((x) => x.texto), t.filter((x) => x.forma === 'flecha').length]; }, dn);
  check('dibujo editado', [after[0] !== before, after[1], after[2]], [true, ['Cierre', 'Inicio', 'Conciliar bancos', 'Fin', 'Revisar F29'], 3]);

  // 5) Gráfico e ilustración (SVG limpiado).
  await p.evaluate(() => { window.__script = (T) => T('imagenes').execute({ accion: 'grafico', titulo: 'Ventas 2026', tipo_grafico: 'barras', etiquetas: ['Ene', 'Feb', 'Mar'], series: [{ nombre: 'Ventas', valores: [120, 90, 150] }], unidad: 'M$' }); });
  await p.evaluate(() => kataSend('Haz un gráfico de ventas')); await p.waitForTimeout(800); await approveLast();
  check('gráfico en nota nueva', await p.evaluate(() => { const n = state.notes.find((x) => x.path === 'Gráficos/Ventas 2026'); return !!n && /\(img:[a-z0-9]+\)/.test(n.body); }), true);
  check('SVG limpio', await p.evaluate(() => { const s = kcCleanSvg('<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><circle cx="5" cy="5" r="4" fill="red" onclick="x()"/><image href="https://x/y.png"/></svg>'); return [/script|onload|onclick|<image/.test(s), /circle/.test(s)]; }), [false, true]);
  await p.evaluate(() => { window.__script = (T) => T('imagenes').execute({ accion: 'ilustracion', titulo: 'Icono balanza', svg: '<svg viewBox="0 0 100 100"><rect x="10" y="80" width="80" height="8" fill="#333"/><circle cx="50" cy="40" r="20" fill="#4c6ef5"/></svg>' }); });
  await p.evaluate(() => kataSend('Haz un ícono')); await p.waitForTimeout(800); await approveLast();
  check('ilustración', await p.evaluate(() => !!state.notes.find((x) => x.path === 'Imágenes/Icono balanza')), true);

  // Herramientas: 14, dentro de los límites.
  check('herramientas', await p.evaluate(() => { const t = kataTools(16); return [t.length, t.at(-2).name, t.at(-1).name, t.filter((x) => x.description.length > 1024 || JSON.stringify(x.inputSchema).length > 4096).map((x) => x.name)]; }), [14, 'imagenes', 'comando', []]);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();
