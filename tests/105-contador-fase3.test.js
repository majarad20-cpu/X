const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const N = (id, path, body) => ({ id, path, body, createdAt: 1, updatedAt: 1 });
const notes = [
  N('cli', 'Clientes/Comercial Cachapoal Ltda.', '---\ntipo: cliente\nrut: 76.000.000-0\nregimen: 14 D N° 3 (Pro Pyme General)\ngiro: Comercio\nobligaciones: [F29 por internet, F22]\ncontacto: contacto@ejemplo.cl\nestado: activo\n---\n# Comercial Cachapoal Ltda.\n\n## Pendientes\n- [ ] Pedir el libro de compras de noviembre\n\n## Bitácora\n- 01-11-2026: reunión inicial.\n'),
  N('reu', 'Reuniones/Reunión de cierre', '# Reunión\n- [ ] Enviar el balance a [[Comercial Cachapoal Ltda.]] 📅 2026-12-10\n'),
  N('calc', 'Trabajo/Cálculo de un atraso', '# Atraso\n\n```calculadora\ntipo: art53\nimpuesto: 1.500.000\nvencimiento: 2026-08-20\npago: 2026-11-24\nreajuste: 1,2\n```\n'),
];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await c.addInitScript((notes) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true, look: { ribbonLabels: 'on', ribAutoV1: true } }, notes, updatedAt: 1 })); }, notes);
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date('2026-11-24T10:00:00') });
  await p.goto(url); await p.clock.runFor(800);
  const shot = async (n) => out && p.screenshot({ path: `${out}/105-${n}.png` });
  check('menú Contador', await p.$$eval('[data-group="especialidades"] .tb-col:first-child .rib', (n) => n.map((x) => x.dataset.view || x.id)), ['radar', 'contradicciones', 'vigencia', 'calendario-trib', 'clientes', 'calculadoras', 'rib-pro-profile']);

  // Parámetros de fábrica
  check('parámetros', await p.evaluate(() => { const P = calcParams(); return [P.vals.get('utm').value, P.vals.get('uf').value, P.vals.get('uf').vig, P.vals.get('uf').src, P.rates.length, P.rates.at(-1).pct, P.scale.length, P.scale.at(-1).to === Infinity]; }), [72440, 41247.63, '31-10-2026', 'bcentral.cl', 4, 0.0213888889, 8, true]);
  // Art. 53: 96 días del 2S-2026
  check('art. 53', await p.evaluate(() => { const r = calcArt53({ impuesto: '1.500.000', vencimiento: '2026-08-20', pago: '2026-11-24', reajuste: '1,2' }); return [r.rows.map((x) => x[1]), r.total[1], r.value]; }), [['$1.500.000', '$18.000', '$1.518.000', '$31.170'], '$1.549.170', 1549170]);
  check('art. 53 en dos semestres', await p.evaluate(() => { const r = calcArt53({ impuesto: '1000000', vencimiento: '2025-12-20', pago: '2026-01-10', reajuste: '0' }); return [r.rows[3][1], r.rows[3][2]]; }), ['$4.644', '11 × 0,0222222222 % + 10 × 0,022 %']);
  check('art. 53 sin tasa publicada', await p.evaluate(() => calcArt53({ impuesto: '1000000', vencimiento: '2026-12-20', pago: '2027-01-05', reajuste: '0' }).warnings.some((w) => /No hay tasa en el perfil para 5 días/.test(w))), true);
  check('art. 53 deuda de 2024', await p.evaluate(() => calcArt53({ impuesto: '1000000', vencimiento: '2024-12-20', pago: '2025-01-10', reajuste: '0' }).warnings.some((w) => /11 días de atraso son anteriores al 01-01-2025/.test(w))), true);
  check('art. 53 sin reajuste avisa', await p.evaluate(() => calcArt53({ impuesto: '1000000', vencimiento: '2026-10-20', pago: '2026-11-20' }).warnings[0].startsWith('⚠️ Falta el reajuste')), true);
  // Impuesto único
  check('IUSC', await p.evaluate(() => [calcIusc({ renta: '1.800.000' }).value, calcIusc({ renta: '5.000.000' }).value, calcIusc({ renta: '900.000' }).value, calcIusc({ renta: '30000000' }).value]), [32882, 349744, 0, 9187879]);
  // APV
  check('APV A', await p.evaluate(() => [calcApv({ aporte: '200000', regimen: 'A' }).value, calcApv({ aporte: '300000', regimen: 'A' }).value]), [360000, 434640]);
  check('APV B', await p.evaluate(() => { const r = calcApv({ aporte: '200000', regimen: 'B', renta: '3000000' }); return [r.value, r.rows.slice(-2).map((x) => x[1])]; }), [16000, ['$113.954', '$97.954']]);
  // Finiquito
  const fin = await p.evaluate(() => { const r = calcFiniquito({ inicio: '2020-03-01', termino: '2026-11-30', causal: 'necesidades', aviso: 'no', remuneracion: '1200000' }); return [r.rows.map((x) => `${x[0]} = ${x[1]}`), r.total[1]]; });
  console.log('finiquito:', JSON.stringify(fin));
  check('finiquito: años y aviso', [fin[0][0], fin[0][2], fin[0][3]], ['Antigüedad = 6 años, 9 meses y 0 días', 'Indemnización por años de servicio (7 × $1.200.000) = $8.400.000', 'Indemnización sustitutiva del aviso previo = $1.200.000']);
  check('finiquito: tope 90 UF y 11 años', await p.evaluate(() => calcFiniquito({ inicio: '2005-01-01', termino: '2026-11-30', causal: 'necesidades', aviso: 'si', remuneracion: '5000000' }).rows[2][1]), `$${Math.round(11 * Math.round(90 * 41247.63 * 100) / 100).toLocaleString('es-CL')}`);
  check('finiquito: renuncia sin indemnización', await p.evaluate(() => calcFiniquito({ inicio: '2024-01-01', termino: '2026-11-30', causal: 'otra', remuneracion: '1000000' }).rows[2][1]), '$0');
  check('finiquito: menos de un año', await p.evaluate(() => calcFiniquito({ inicio: '2026-03-01', termino: '2026-11-30', causal: 'necesidades', aviso: 'si', remuneracion: '1000000' }).rows[2][2]), 'requiere un año o más de servicio');
  // Conversión
  check('conversión', await p.evaluate(() => calcConversion({ monto: '25', unidad: 'uf', fecha: '2026-10-31' }).rows[0][1]), '$1.031.191');
  // Avisos de vigencia: en diciembre, la UTM de noviembre ya no sirve
  check('aviso UTM vieja', await p.evaluate(() => calcIusc({ renta: '1000000', mes: '2026-12-05' }).warnings.some((w) => /La UTM del perfil es de noviembre 2026/.test(w))), true);
  check('UTM del mes sin aviso', await p.evaluate(() => calcIusc({ renta: '1000000', mes: '2026-11-10' }).warnings.length), 0);
  // El perfil manda
  await p.evaluate(() => { calcEditProfile(); const n = proProfileNote(); n.body = n.body.replace('- UTM: 72.440 · noviembre 2026 · sii.cl', '- UTM: 73.000 · diciembre 2026 · sii.cl').replace('- 01-07-2026 a 31-12-2026 · 0,0213888889 % · Res. Ex. SII 88/2026', '- 01-07-2026 a 31-12-2026 · 0,0213888889 % · Res. Ex. SII 88/2026\n- 01-01-2027 a 30-06-2027 · 0,0200000000 % · Res. Ex. SII de prueba'); n.updatedAt = Date.now(); dataRev++; save(); });
  check('perfil: UTM y tasa nuevas', await p.evaluate(() => [calcParams().vals.get('utm').value, calcParams().origin.vals, calcArt53({ impuesto: '1000000', vencimiento: '2026-12-20', pago: '2027-01-05', reajuste: '0' }).warnings.some((w) => /No hay tasa/.test(w))]), [73000, 'perfil', false]);

  // Vista Calculadoras
  await p.evaluate(() => document.querySelector('.rib[data-view="calculadoras"]').click()); await p.clock.runFor(200);
  await p.fill('#view-calculadoras .calc-field input[type="text"] >> nth=0', '1.500.000');
  await p.fill('#view-calculadoras .calc-field input[type="date"] >> nth=0', '2026-08-20');
  await p.fill('#view-calculadoras .calc-field input[type="date"] >> nth=1', '2026-11-24');
  await p.fill('#view-calculadoras .calc-field input[type="text"] >> nth=1', '1,2');
  check('vista: total', await p.textContent('#view-calculadoras .calc-total .calc-num'), '$1.549.170');
  await shot('calculadoras');
  // Bloque dentro de una nota
  await p.evaluate(() => openNote(noteById('calc'))); await p.clock.runFor(400);
  check('bloque en la nota', await p.evaluate(() => document.querySelector('.calc-in-note .calc-total .calc-num')?.textContent), '$1.549.170');
  await p.evaluate(() => { const i = document.querySelector('.calc-in-note input[type="text"]'); i.value = '2.000.000'; i.dispatchEvent(new Event('input')); }); await p.clock.runFor(100);
  check('bloque recalcula', await p.evaluate(() => document.querySelector('.calc-in-note .calc-total .calc-num').textContent), '$2.065.559');
  await shot('bloque');
  await p.evaluate(() => [...document.querySelectorAll('.calc-in-note button')].find((x) => /Guardar/.test(x.textContent)).click()); await p.clock.runFor(200);
  check('bloque guardado', await p.evaluate(() => /impuesto: 2\.000\.000/.test(noteById('calc').body) && /```calculadora\ntipo: art53/.test(noteById('calc').body)), true);
  check('markdown estático (PDF)', await p.evaluate(() => /<table/.test(renderMd(noteById('calc').body))), true);

  // Clientes
  check('clientes', await p.evaluate(() => clientList().map((n) => n.id)), ['cli']);
  check('vencimientos del cliente', await p.evaluate(() => clientEvents(clientInfo(noteById('cli')), 45).map((e) => `${e.date} ${e.title}`)), ['2026-12-21 F29 por internet']);
  check('pendientes del cliente', await p.evaluate(() => clientTasks(clientInfo(noteById('cli'))).map((t) => t.title).sort()), ['Enviar el balance a Comercial Cachapoal Ltda.', 'Pedir el libro de compras de noviembre']);
  await p.evaluate(() => document.querySelector('.rib[data-view="clientes"]').click()); await p.clock.runFor(300);
  check('panel', await p.evaluate(() => [document.querySelector('#view-clientes .cl-detail .gv-title')?.textContent, document.querySelectorAll('#view-clientes .cl-item').length]), ['Comercial Cachapoal Ltda.', 1]);
  await shot('clientes');
  await p.evaluate(() => { clientAppend(noteById('cli'), 'Bitácora', '- 24-11-2026: llamada por el F29.'); clientAppend(noteById('cli'), 'Pendientes', '- [ ] Revisar el RCV'); });
  check('bitácora y pendientes', await p.evaluate(() => [noteById('cli').body.includes('- 01-11-2026: reunión inicial.\n- 24-11-2026: llamada por el F29.'), noteById('cli').body.includes('- [ ] Pedir el libro de compras de noviembre\n- [ ] Revisar el RCV')]), [true, true]);

  // Firma (opcional) e informe
  check('sin firma por defecto', await p.evaluate(() => [firmaReady(), firmaDefault(), /---\n\*\*/.test(informeMarkdown(noteById('cli'), { firma: true }))]), [false, false, false]);
  await p.evaluate(() => showView('settings')); await p.clock.runFor(200);
  check('ajustes de firma', await p.evaluate(() => !!document.querySelector('#firma-settings') && document.querySelectorAll('#firma-settings .firma-field input').length), 5);
  await p.evaluate(() => { const set = (k, v) => { const i = document.querySelector(`#firma-settings input[data-k="${k}"]`); i.value = v; i.dispatchEvent(new Event('input')); }; set('nombre', 'Nombre de Prueba'); set('titulo', 'Contador Auditor'); });
  check('firma configurada', await p.evaluate(() => [firmaReady(), firmaDefault(), firmaMarkdown()]), [true, false, '**Nombre de Prueba**\nContador Auditor']);
  const inf = await p.evaluate(() => informeMarkdown(noteById('cli'), { dias: 30, firma: true, observaciones: 'Todo en orden.' }));
  check('informe', [inf.startsWith('# Informe para Comercial Cachapoal Ltda.'), /\| .* \| F29 por internet \|/.test(inf), /## Pendientes\n- Pedir el libro de compras de noviembre/.test(inf), /## Observaciones\nTodo en orden\./.test(inf), inf.trim().endsWith('**Nombre de Prueba**\nContador Auditor'), !/\[\[/.test(inf.split('## Novedades')[0])], [true, true, true, true, true, true]);
  check('informe sin firma', await p.evaluate(() => informeMarkdown(noteById('cli'), { firma: false }).includes('Nombre de Prueba')), false);
  await p.evaluate(() => informeOpen(noteById('cli'))); await p.clock.runFor(200);
  check('diálogo: firma desmarcada por defecto', await p.evaluate(() => [document.querySelector('#informe .firma-check input').checked, document.querySelector('#informe textarea').value.includes('Nombre de Prueba')]), [false, false]);
  await p.click('#informe .firma-check input'); await p.clock.runFor(100);
  check('diálogo: marcar la firma', await p.evaluate(() => document.querySelector('#informe textarea').value.includes('**Nombre de Prueba**')), true);
  await shot('informe');
  await p.evaluate(() => [...document.querySelectorAll('#informe button')].find((x) => x.textContent === 'Guardar como nota').click()); await p.clock.runFor(200);
  check('informe guardado', await p.evaluate(() => { const n = state.notes.find((x) => x.path.startsWith('Clientes/Informes/')); return [!!n, propOf(n, 'tipo'), clientList().length, noteById('cli').body.includes('informe preparado')]; }), [true, 'informe', 1, true]);

  // Kataleya: firma en documentos y herramientas nuevas
  check('kataleya: doc con y sin firma', await p.evaluate(() => [kataDocMarkdown({ titulo: 'X', contenido: 'Hola' }, true).endsWith('**Nombre de Prueba**\nContador Auditor'), kataDocMarkdown({ titulo: 'X', contenido: 'Hola' }, false).includes('Prueba'), kataFirmaInitial(undefined), kataFirmaInitial(true)]), [true, false, false, true]);
  const tools = await p.evaluate(() => { const t = kataTools(13); const ct = t.find((x) => x.name === 'contador'); return { n: t.length, enumv: ct.inputSchema.properties.consulta.enum, desc: ct.description.length, sizes: t.map((x) => [x.name, x.description.length, JSON.stringify(x.inputSchema).length]).filter(([, d, s]) => d > 1024 || s > 4096) }; });
  check('kataleya: contador', [tools.n, tools.enumv, tools.desc <= 1024, tools.sizes], [13, ['radar', 'contradicciones', 'alertas', 'calendario', 'por_revisar', 'clientes', 'cliente', 'calcular', 'informe'], true, []]);
  check('kataleya: calcular', await p.evaluate(async () => { const t = kataTools(13).find((x) => x.name === 'contador'); const r = await t.execute({ consulta: 'calcular', tipo: 'iusc', datos: { renta: '1800000', mes: '2026-12-10' } }); return r.total; }), 'Impuesto único del mes: $32.580');
  check('kataleya: faltan datos', await p.evaluate(async () => { const t = kataTools(13).find((x) => x.name === 'contador'); const r = await t.execute({ consulta: 'calcular', tipo: 'finiquito', datos: {} }); return [!!r.error, r.campos.length]; }), [true, 7]);
  check('kataleya: ficha', await p.evaluate(async () => { const t = kataTools(13).find((x) => x.name === 'contador'); const r = await t.execute({ consulta: 'cliente', cliente: 'cachapoal' }); return [r.cliente, r.vencimientos, r.notas_que_lo_enlazan]; }), ['Comercial Cachapoal Ltda.', ['2026-12-21 · F29 por internet'], ['Reunión de cierre', 'Informe Comercial Cachapoal Ltda. 2026-11-24']]);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
  if (errs.length) process.exitCode = 1;
})();
