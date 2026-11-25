'use strict';

// ---------- Kataleya: habilidades, notas de referencia, glosario y lecciones ----------
// 🎓 Habilidades: notas en «Sistema/Habilidades de Kataleya» (tipo: habilidad) con «cuando» (palabras
//    clave), pasos, formato de la respuesta y «Errores a evitar». En cada mensaje se elige la que
//    corresponde (o la que nombra la persona), se le pasa completa a Claude y la respuesta muestra
//    «🎓 Usé: …». Se editan como cualquier nota; «＋ Nueva habilidad» la redacta Kataleya para aprobar.
// 📚 Referencia: notas con la propiedad `kataleya: referencia` (se marcan desde la paleta) van siempre
//    como contexto, y el glosario («Sistema/Glosario de Kataleya») le dice qué significan tus siglas.
// 🧠 Lecciones: cuando la persona la corrige, propone guardar la lección en «Errores a evitar» de la
//    habilidad que corresponda o de su memoria.

const KH_DIR = 'Sistema/Habilidades de Kataleya';
const KH_GLOSSARY = 'Sistema/Glosario de Kataleya';

const KH_SEED = [
  { title: 'Revisar un F29', cuando: ['F29', 'formulario 29', 'IVA mensual', 'declaración mensual', 'PPM', 'retenciones'], modo: 'contador', body: `## Para qué
Revisar una declaración mensual (F29) antes de presentarla o después, para detectar errores, plazos y cruces.

## Pasos
1. Pregunta (o toma de la nota) el período, el régimen del contribuyente y si factura electrónicamente.
2. Vencimiento: consulta el calendario (contador › calendario). Si se presentó o pagó fuera de plazo, calcula reajuste e interés con contador › calcular (tipo art53) y di de qué semestre es la tasa.
3. Débito fiscal: cuadrar con las ventas del Registro de Compras y Ventas (RCV).
4. Crédito fiscal: cuadrar con las compras del RCV; revisar facturas rechazadas, reclamadas o de proveedores de difícil fiscalización.
5. PPM: tasa y base según el régimen (busca la nota del régimen en la bóveda).
6. Retenciones: honorarios (tasa vigente del año) e impuesto único de los trabajadores (contador › calcular, tipo iusc).
7. Remanente de crédito del período anterior, reajustado.
8. Lista lo que no cuadra como observación, con el código del formulario si lo sabes.

## Formato de la respuesta
- Resumen en 2 líneas: ¿está bien o no?
- Tabla: concepto | lo declarado | lo esperado | observación.
- Normas citadas con su vigencia y la nota de la bóveda.
- Si falta un dato, pídelo; no lo supongas.

## Errores a evitar
- El interés penal del art. 53 CT es diario desde el 01-01-2025 (Ley 21.713); no usar el antiguo 1,5 % mensual.
` },
  { title: 'Preparar un finiquito', cuando: ['finiquito', 'despido', 'renuncia', 'indemnización', 'término de contrato', 'carta de aviso'], modo: 'contador', body: `## Para qué
Preparar el término de un contrato de trabajo: causal, plazos, cálculo y documentos.

## Pasos
1. Datos: inicio, término, causal, si hubo aviso de 30 días, última remuneración (art. 172) y feriado pendiente.
2. Causal y plazos: lee [[TERMINO DE LA RELACION LABORAL]] (carta de aviso, Ley Bustos, plazos judiciales).
3. Cálculo: contador › calcular (tipo finiquito); revisa los casos especiales de [[Cálculo de Finiquitos e Indemnizaciones Laborales]] (contratos antiguos, obra o faena, horas extra habituales).
4. Descuentos: aporte del empleador al seguro de cesantía (solo art. 161) y retención de pensión de alimentos si existe.
5. Documentos: borrador de carta de aviso y checklist del finiquito (plazo de 10 días hábiles, ministro de fe o Mi DT).

## Formato de la respuesta
- Tabla del cálculo con cada concepto y su base.
- Plazos con fecha concreta.
- ⚠️ lo que depende del caso (recargos del art. 168, criterios judiciales).

## Errores a evitar
- Los contratados entre el 14-08-1981 y el 01-12-1990 mantienen el tope de 11 años; sin tope solo los contratados antes del 14-08-1981.
` },
  { title: 'Responder consulta de cliente', cuando: ['consulta de cliente', 'me preguntó un cliente', 'responder al cliente', 'correo al cliente', 'el cliente pregunta'], modo: 'contador', body: `## Para qué
Responder una consulta de un cliente de forma clara, correcta y con respaldo.

## Pasos
1. Entiende la pregunta y qué decisión tiene que tomar el cliente.
2. Busca en la bóveda la norma y su vigencia; si puede haber cambiado, verifica en fuentes oficiales.
3. Si es un cálculo, usa las calculadoras.
4. Redacta la respuesta y propone dejarla como borrador de correo (crear_documento › correo).

## Formato de la respuesta
- Respuesta directa en 2 o 3 líneas, sin jerga.
- «Qué dice la norma»: artículo, desde cuándo rige y fuente.
- «Qué recomiendo» y «qué necesito de ti» (documentos o datos).
- Cierre cordial. Sin datos de otros clientes.

## Errores a evitar
- No prometer resultados del SII ni plazos que no dependen del contador.
` },
  { title: 'Auditar una nota', cuando: ['auditar nota', 'revisa esta nota', 'está vigente', 'revisar vigencia', 'contradicciones'], modo: 'contador', body: `## Para qué
Revisar que una nota de la bóveda no tenga errores normativos, contradicciones ni enlaces rotos.

## Pasos
1. Lee la nota completa.
2. Por cada norma citada: contador › radar (señales de derogación, cambios y vigencias futuras).
3. Contradicciones: contador › contradicciones, filtrando las que tocan esta nota.
4. Datos que cambian (tasas, topes, UF/UTM, plazos): ¿tienen fecha y fuente? ¿hay historial?
5. Enlaces: enlazar › rotos y sugerir.
6. Propón las correcciones con editar_nota y, lo que no se pueda confirmar, como alerta.

## Formato de la respuesta
- Veredicto: ✅ vigente / 🔄 por actualizar / ⚠️ por verificar.
- Lista numerada de hallazgos con la línea afectada y la fuente.

## Errores a evitar
- Una nota con «hasta», «antes» o «histórico» puede estar bien: es trazabilidad, no un error.
` },
  { title: 'Ingesta rápida', cuando: ['ingesta', 'procesa este texto', 'agrega esto a la bóveda', 'esto ya está en la bóveda'], modo: 'contador', body: `## Para qué
Cotejar un texto, una imagen o un documento corto con la bóveda y proponer qué agregar.

## Pasos
1. Separa el material en conceptos (uno por idea, con sus datos y su fuente).
2. Por cada concepto busca en la bóveda (título, alias y contenido).
3. Marca cada uno: 🆕 nuevo · ➕ enriquecer · 🔄 actualizar · ✅ ya existe · ⛔ no relevante.
4. Antes de dar por buena una norma, revisa si otra posterior la cambió.
5. Propón los cambios (crear nota, editar_nota) solo después de mostrar el informe.

## Formato de la respuesta
- Ficha del material (qué es, fecha, fuente).
- Tabla numerada: concepto | marca | nota destino | propuesta.
- «⚠️ por verificar» al final.

## Errores a evitar
- No copiar párrafos largos: resumir y estructurar.
- Datos de clientes: nunca a la bóveda.
` },
  { title: 'Cierre de mes del cliente', cuando: ['cierre de mes', 'cierre mensual', 'fin de mes', 'informe mensual'], modo: 'contador', body: `## Para qué
Ordenar el cierre de mes de un cliente: lo que vence, lo pendiente y el informe.

## Pasos
1. contador › cliente: datos, vencimientos de 45 días y pendientes.
2. Revisa el F29 del período con la habilidad «Revisar un F29».
3. Pendientes del cliente: propón tareas con fecha.
4. contador › informe: abre el informe al cliente para revisarlo.
5. Si se pide, borrador de correo con el resumen.

## Formato de la respuesta
- Checklist del cierre (- [ ]).
- Próximos vencimientos con fecha.

## Errores a evitar
- Confirmar las fechas con el calendario del SII del año.
` },
  { title: 'Reflexión estoica', cuando: ['reflexión', 'estoico', 'estoicismo', 'examen de la noche', 'premeditatio', 'dicotomía'], modo: 'estoicismo', body: `## Para qué
Acompañar la práctica estoica del día: una pregunta, una reflexión breve y el registro en el diario.

## Pasos
1. Si es de mañana: premeditatio malorum (qué puede salir mal hoy y cómo responder con virtud).
2. Si es de noche: examen de Séneca (¿qué hice mal?, ¿qué hice bien?, ¿qué dejé de hacer?).
3. Relaciona con una de tus notas de estoicismo (cita el autor y la obra que esté en la nota).
4. Propón escribir la reflexión en el diario (organizar › escribir_diario).

## Formato de la respuesta
- Una pregunta, una cita de tus notas y 3 a 5 líneas de reflexión.

## Errores a evitar
- No inventar citas: solo las que están en tus notas, con su fuente.
- Las notas personales no se editan sin aprobación.
` },
];

const KH_GLOSSARY_SEED = `---
tipo: glosario
area: sistema
---
# Glosario de Kataleya

**Idea central:** siglas y términos como los uso yo. Kataleya lo lee en cada conversación. Una línea por término: \`- SIGLA: significado\`.

## Tributario
- CT: Código Tributario (DL 830)
- LIR: Ley sobre Impuesto a la Renta (DL 824)
- Ley de IVA: Ley sobre Impuesto a las Ventas y Servicios (DL 825)
- IDPC: Impuesto de Primera Categoría
- IGC: Impuesto Global Complementario
- IA: Impuesto Adicional
- IUSC: Impuesto Único de Segunda Categoría (trabajadores dependientes)
- PPM: Pagos Provisionales Mensuales
- RCV: Registro de Compras y Ventas
- DJ: Declaración Jurada
- F29: declaración mensual (IVA, PPM y retenciones)
- F22: declaración anual de impuestos a la renta
- RAI: Rentas Afectas a Impuesto (registro empresarial)
- REX: Rentas Exentas e Ingresos No Renta (registro empresarial)
- SAC: Saldo Acumulado de Créditos (registro empresarial)
- DDAN: Diferencia entre Depreciación Acelerada y Normal
- CPT: Capital Propio Tributario
- Régimen 14 A: régimen general semi integrado
- Pro Pyme General: régimen del art. 14 D N° 3 LIR
- Pro Pyme Transparente: régimen del art. 14 D N° 8 LIR

## Valores y organismos
- UF: Unidad de Fomento · UTM: Unidad Tributaria Mensual · UTA: Unidad Tributaria Anual (12 UTM)
- IMM: Ingreso Mínimo Mensual
- SII: Servicio de Impuestos Internos · TGR: Tesorería General de la República
- DT: Dirección del Trabajo · CMF: Comisión para el Mercado Financiero · UAF: Unidad de Análisis Financiero
- AFC: Administradora de Fondos de Cesantía

## Contabilidad y auditoría
- NIIF: Normas Internacionales de Información Financiera
- NIA: Normas Internacionales de Auditoría

## Mis términos
- (agrega aquí los tuyos)
`;

// ---------- Lectura ----------
const khList = () => gvCached('kh-list', () => gvLive().filter((n) => n.path.startsWith(`${KH_DIR}/`) || /^habilidad$/i.test(String(propOf(n, 'tipo') || ''))).map((n) => {
  const cuando = (() => {
    const v = propOf(n, 'cuando');
    return (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
  })();
  return { note: n, title: baseName(n.path), cuando, modo: String(propOf(n, 'modo') || ''), off: /^(pausada|inactiva|off)$/i.test(String(propOf(n, 'estado') || '')) };
}).filter((s) => !s.off));

// Habilidades que corresponden a un mensaje (máx. 2): la que se nombra, o por sus palabras clave.
function khMatch(q, mode = '') {
  const f = fold(String(q || ''));
  const scored = khList().map((s) => {
    let score = 0;
    if (f.includes(fold(s.title))) score += 100;
    s.cuando.forEach((k) => {
      const kk = fold(k);
      if (kk.length >= 2 && new RegExp(`(^|[^a-z0-9])${kk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(f)) score += 10 + kk.length / 10;
    });
    if (score && s.modo && mode && fold(s.modo) === fold(mode)) score += 3;
    return { s, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((x) => x.s);
}
const khRefs = () => gvCached('kh-refs', () => gvLive().filter((n) => /^referencia$/i.test(String(propOf(n, 'kataleya') || ''))));
const khGlossaryNote = () => findNoteByName(KH_GLOSSARY) || null;

// Bloque que se agrega a las instrucciones de Kataleya en cada mensaje.
function khContext(q) {
  const parts = [];
  const skills = khList();
  if (skills.length) parts.push(`Tus habilidades (notas de [[${baseName(KH_DIR)}]]): ${skills.map((s) => `«${s.title}»`).join(', ')}. Si la tarea calza con una que no está abajo, léela con leer_nota antes de responder.`);
  const used = khMatch(q, typeof kataMode === 'function' ? kataMode() : '');
  used.forEach((s) => parts.push(`HABILIDAD A SEGUIR: «${s.title}» (nota [[${s.title}]]). Sigue sus pasos y su formato; respeta sus «Errores a evitar».\n"""\n${gvBodyText(s.note).slice(0, 6000)}\n"""`));
  const g = khGlossaryNote();
  if (g && !g.enc) parts.push(`Glosario de la persona (úsalo para entender sus siglas):\n"""\n${gvBodyText(g).slice(0, 4000)}\n"""`);
  const refs = khRefs().filter((n) => !n.enc).slice(0, 6);
  if (refs.length) {
    let budget = 9000;
    parts.push(`Notas de referencia (consúltalas primero en sus temas; cita su título):\n${refs.map((n) => {
      const t = gvBodyText(n).slice(0, Math.max(500, Math.floor(budget / refs.length)));
      return `— [[${baseName(n.path)}]]:\n"""\n${t}\n"""`;
    }).join('\n')}`);
    budget = 0;
  }
  return { text: parts.join('\n\n'), used: used.map((s) => s.title) };
}

// ---------- Escritura ----------
function khTemplate({ title, cuando = [], modo = '', body = '' }) {
  const list = cuando.map((c) => `  - ${typeof yamlScalar === "function" ? yamlScalar(String(c)) : JSON.stringify(String(c))}`).join('\n');
  return `---
tipo: habilidad
cuando:
${list || '  - (palabras clave)'}
${modo ? `modo: ${modo}\n` : ''}estado: activa
creada: ${dateKey()}
---
# ${title}

${String(body).trim() || '## Para qué\n\n## Pasos\n1. \n\n## Formato de la respuesta\n- \n\n## Errores a evitar\n- '}
`;
}
function khEnsureDir() {
  ['Sistema', KH_DIR].forEach((f) => state.folders.includes(f) || state.folders.push(f));
}
function khInstall() {
  khEnsureDir();
  let n = 0;
  KH_SEED.forEach((s) => {
    if (findNoteByName(`${KH_DIR}/${s.title}`)) return;
    createNote({ folder: KH_DIR, title: s.title, body: khTemplate(s), open: false, edit: false, log: false });
    n++;
  });
  if (!khGlossaryNote()) {
    createNote({ folder: 'Sistema', title: baseName(KH_GLOSSARY), body: KH_GLOSSARY_SEED, open: false, edit: false, log: false });
    n++;
  }
  dataRev++;
  save();
  renderAll();
  return n;
}
// Agrega «- fecha: texto» bajo «## Errores a evitar» (crea la sección si falta).
function khAddLesson(body, text) {
  const line = `- ${dateKey()}: ${String(text).replace(/\n+/g, ' ').trim()}`;
  const lines = body.replace(/\s+$/, '').split('\n');
  const h = lines.findIndex((l) => /^##\s+Errores a evitar/i.test(l));
  if (h < 0) return `${lines.join('\n')}\n\n## Errores a evitar\n${line}\n`;
  let i = h + 1;
  while (i < lines.length && !/^##\s/.test(lines[i])) i++;
  while (i > h + 1 && !lines[i - 1].trim()) i--;
  if (/^-\s*$/.test(lines[i - 1] || '')) lines.splice(i - 1, 1, line);
  else lines.splice(i, 0, line);
  return `${lines.join('\n')}\n`;
}

// Acciones nuevas del grupo «proponer»: habilidad y leccion.
const KH_ACTIONS = {
  habilidad: (i) => {
    const title = cleanName(String(i.titulo || '')).slice(0, 80);
    if (!title) throw new Error('Falta el título de la habilidad');
    if (findNoteByName(`${KH_DIR}/${title}`)) throw new Error('Ya existe una habilidad con ese nombre: edítala con editar_nota');
    const cuando = (Array.isArray(i.cuando) ? i.cuando : String(i.cuando || '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
    const body = khTemplate({ title, cuando, modo: String(i.modo || ''), body: String(i.contenido || '') });
    return kataPropose(`🎓 Nueva habilidad «${title}»`, `${plural(cuando.length, 'palabra clave', 'palabras clave')} · en «${baseName(KH_DIR)}»`, () => {
      khEnsureDir();
      const n = createNote({ folder: KH_DIR, title, body, open: false, edit: false, log: false });
      return { texto: 'Habilidad creada: la usaré cuando calce', abrir: () => openNote(n) };
    });
  },
  leccion: (i) => {
    const text = String(i.texto || i.hecho || '').trim();
    if (!text) throw new Error('Falta el texto de la lección');
    const skill = i.habilidad ? khList().find((s) => fold(s.title) === fold(i.habilidad)) || khList().find((s) => fold(s.title).includes(fold(i.habilidad))) : null;
    if (skill) return kataProposeEdit(skill.note, `🧠 Lección para «${skill.title}»`, (body) => khAddLesson(body, text));
    return kataPropose('🧠 Lección para mi memoria', text, () => {
      kataRemember(text, 'Errores a evitar');
      return { texto: 'Guardada en «Errores a evitar» de mi memoria' };
    });
  },
};

// ---------- Integración con Kataleya ----------
{
  const prevTools = kataTools;
  // eslint-disable-next-line no-global-assign
  kataTools = function kataToolsHabilidades(max = 20) {
    const list = prevTools(max);
    const prop = list.find((t) => t.name === 'proponer');
    if (prop) {
      const run = prop.execute;
      const schema = JSON.parse(JSON.stringify(prop.inputSchema));
      schema.properties.accion.enum = [...schema.properties.accion.enum, 'habilidad', 'leccion'];
      schema.properties.cuando = { type: 'array', items: { type: 'string' } };
      schema.properties.modo = { type: 'string' };
      schema.properties.habilidad = { type: 'string' };
      Object.assign(prop, {
        inputSchema: schema,
        description: `${prop.description.replace(/\.$/, '')}, «habilidad» (nueva habilidad: titulo, cuando = palabras clave, modo opcional, contenido en Markdown con «## Para qué», «## Pasos», «## Formato de la respuesta» y «## Errores a evitar») o «leccion» (texto: lo que aprendiste de una corrección; habilidad opcional).`,
        execute: (input = {}) => (KH_ACTIONS[input.accion] ? KH_ACTIONS[input.accion](input) : run(input)),
      });
    }
    return list;
  };
}
{
  const prevRules = kataRules;
  // eslint-disable-next-line no-global-assign
  kataRules = function kataRulesHabilidades() {
    const base = prevRules().replace('- Si la persona te cuenta algo que valga la pena recordar', `- Habilidades: si abajo aparece una «HABILIDAD A SEGUIR», sigue sus pasos, su formato y sus «Errores a evitar», y empieza la respuesta con «🎓 Usé: <nombre>». Si la persona te pide crear una habilidad, redáctala y propónla con proponer › habilidad.
- Cuando la persona te corrija (un dato, una norma, un criterio o la forma de hacer algo), reconoce el error y propón guardar la lección con proponer › leccion (en la habilidad que corresponda, o en tu memoria si no hay una), para no repetirlo.
- Si la persona te cuenta algo que valga la pena recordar`);
    const ctx = khContext(kh.lastQ);
    return ctx.text ? `${base}\n\n${ctx.text}` : base;
  };
}
const kh = { lastQ: '' };
{
  const prevSend = kataSend;
  // eslint-disable-next-line no-global-assign
  kataSend = async function kataSendHabilidades(question) {
    kh.lastQ = String(question || '');
    const used = khMatch(kh.lastQ, typeof kataMode === 'function' ? kataMode() : '').map((s) => s.title);
    const n = kata.turns.length;
    const p = prevSend(question);
    const answer = kata.turns[n + 1];
    if (answer && used.length) {
      answer.skills = used;
      kataRender();
    }
    return p;
  };
}
{
  const prevRender = kataRender;
  // eslint-disable-next-line no-global-assign
  kataRender = function kataRenderHabilidades() {
    prevRender();
    const panel = $('#kata-panel');
    if (!panel || panel.hidden) return;
    // «🎓 Usé: …» debajo de cada respuesta que siguió una habilidad.
    const turns = kata.turns.filter((t) => t.role === 'assistant');
    const bubbles = [...panel.querySelectorAll('.kata-msg.assistant')];
    turns.forEach((t, k) => {
      const b = bubbles[k];
      if (!t.skills?.length || !b || b.querySelector('.kh-used')) return;
      const chip = el('div', { className: 'kh-used' }, [el('span', { className: 'muted' }, '🎓 '), ...t.skills.flatMap((s, i) => {
        const a = el('button', { className: 'link', title: 'Abrir la habilidad' }, s);
        a.addEventListener('click', () => {
          const n = findNoteByName(`${KH_DIR}/${s}`);
          if (n) openNote(n);
        });
        return i ? [' · ', a] : [a];
      })]);
      b.insertBefore(chip, b.firstChild);
    });
    // Botón 🎓 en la cabecera.
    const head = panel.querySelector('.kata-head');
    if (head && !head.querySelector('.kh-btn')) {
      const b = el('button', { className: 'kata-icon kh-btn', title: 'Habilidades, notas de referencia y glosario', ariaLabel: 'Habilidades' }, '🎓');
      b.addEventListener('click', (e) => khMenu(e.currentTarget));
      const mem = [...head.querySelectorAll('button')].find((x) => x.textContent === '🧠');
      head.insertBefore(b, mem || head.lastChild);
    }
  };
}
function khMenu(anchor) {
  const skills = khList();
  const refs = khRefs();
  showMenu(anchor, [
    ...(skills.length ? skills.map((s) => ({ label: `🎓 ${s.title}`, action: () => openNote(s.note) })) : [{ label: '🎓 Instalar las habilidades iniciales', action: () => showToastMessage(`Listo: ${plural(khInstall(), 'nota creada', 'notas creadas')} en «${KH_DIR}».`) }]),
    { sep: true },
    { label: '＋ Nueva habilidad…', action: () => promptText({ placeholder: 'Describe la tarea: qué quieres que haga y cómo (p. ej. «revisar un contrato de arriendo»)', action: 'Redactar habilidad', onSubmit: (t) => kataSend(`Crea una habilidad para esto: ${t}. Redáctala con sus pasos, el formato de la respuesta y los errores a evitar, y propónla con proponer › habilidad.`) }) },
    skills.length && KH_SEED.some((s) => !findNoteByName(`${KH_DIR}/${s.title}`)) ? { label: '🎓 Agregar las habilidades iniciales que faltan', action: () => showToastMessage(`Listo: ${plural(khInstall(), 'nota creada', 'notas creadas')}.`) } : null,
    { sep: true },
    { label: `📚 Notas de referencia (${refs.length})`, action: () => (refs.length ? openPicker({ placeholder: 'Notas de referencia de Kataleya', items: () => refs.map((n) => ({ label: baseName(n.path), detail: folderOf(n.path), action: () => openNote(n) })) }) : showToastMessage('Aún no hay. Abre una nota y usa la paleta: «Kataleya: usar esta nota como referencia».')) },
    { label: '📖 Glosario', action: () => {
      let g = khGlossaryNote();
      if (!g) {
        khEnsureDir();
        g = createNote({ folder: 'Sistema', title: baseName(KH_GLOSSARY), body: KH_GLOSSARY_SEED, open: false, edit: false, log: false });
      }
      openNote(g);
    } },
  ].filter(Boolean));
}
if (typeof COMMANDS_EXTRA !== 'undefined') {
  COMMANDS_EXTRA.push((note) => {
    if (!note || note.enc) return [];
    const on = /^referencia$/i.test(String(propOf(note, 'kataleya') || ''));
    return [{ label: on ? 'Kataleya: dejar de usar esta nota como referencia' : 'Kataleya: usar esta nota como referencia', action: () => {
      setProp(note, 'kataleya', on ? '' : 'referencia');
      if (on) note.body = note.body.replace(/^kataleya:\s*(""|'')?\s*\n/m, '');
      dataRev++;
      save();
      renderAll();
      showToastMessage(on ? 'Kataleya ya no la usa como referencia.' : 'Kataleya la consultará primero en sus temas.');
    } }, { label: 'Kataleya: instalar las habilidades iniciales', action: () => showToastMessage(`Listo: ${plural(khInstall(), 'nota creada', 'notas creadas')}.`) }];
  });
}
