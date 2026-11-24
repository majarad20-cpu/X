'use strict';

// ---------- Kataleya: la asistente de Enfoque ----------
// Un chat con Claude siempre a mano (botón con su avatar abajo a la derecha, o Alt+K) que se abre en un
// panel lateral sin salir de lo que estás haciendo. Sabe qué nota o vista tienes abierta (y el texto
// seleccionado), lee su memoria (la nota «Sistema/Memoria de Kataleya», que se puede editar e importar
// desde Claude) y responde según el modo: General, 🧾 Contador (norma vigente, trazabilidad, fuente,
// alertas y contradicciones), 🏛️ Estoico o el de una especialidad libre (su perfil como contexto).
// Herramientas: lee notas, tareas, diario, el Radar normativo, las contradicciones, las alertas, el
// calendario tributario y la cola de vigencia; abre vistas; y **propone** acciones —crear tareas, notas,
// alertas, tableros, bases, diagramas, lienzos y dibujos, cambiar propiedades, marcar notas revisadas,
// agendar en Google Calendar y recordar cosas— que solo se hacen cuando la persona pulsa «Aprobar».
// Las notas con contraseña no salen del dispositivo. La conversación se puede guardar como nota.

const KATA_MEMORY_PATH = 'Sistema/Memoria de Kataleya';
const KATA_AVATAR = `<svg class="kata-avatar" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="kata-clip"><circle cx="32" cy="32" r="32"/></clipPath></defs><g clip-path="url(#kata-clip)"><circle cx="32" cy="32" r="32" fill="#b07cd6"/><path d="M13 40c0-16 8-27 19-27s19 11 19 27v26H13z" fill="#3b2418"/><path d="M17 64c2-9 8-13 15-13s13 4 15 13z" fill="#4f46e5"/><rect x="28" y="44" width="8" height="8" rx="3" fill="#ecbf9b"/><ellipse cx="32" cy="34" rx="12" ry="13.5" fill="#f4cda9"/><path d="M19.5 32c1.5-10 8-15.5 12.5-15.5S44 21 45 31c-6-1.5-10.5-6-12.5-10.5C29.5 26.5 25 30 19.5 32z" fill="#3b2418"/><circle cx="27" cy="35" r="1.7" fill="#2b1a12"/><circle cx="37" cy="35" r="1.7" fill="#2b1a12"/><circle cx="24.5" cy="39.5" r="2.2" fill="#f19a9a" opacity=".55"/><circle cx="39.5" cy="39.5" r="2.2" fill="#f19a9a" opacity=".55"/><path d="M28.5 41.5q3.5 3.2 7 0" stroke="#a0524a" stroke-width="1.5" fill="none" stroke-linecap="round"/><g transform="translate(46 21)"><ellipse rx="4.2" ry="2.4" transform="rotate(-30)" fill="#f7e8ff"/><ellipse rx="4.2" ry="2.4" transform="rotate(30)" fill="#f7e8ff"/><ellipse rx="2.4" ry="4.2" fill="#e9c6ff"/><ellipse cy="1.8" rx="2.2" ry="2.6" fill="#a23fd1"/><circle r="1" fill="#ffd34d"/></g></g></svg>`;

const kata = { turns: [], busy: false, ctl: null, open: false, pending: new Map(), seq: 0, importing: false };
const kataCfg = () => {
  if (!state.settings.kata || typeof state.settings.kata !== 'object') state.settings.kata = {};
  return state.settings.kata;
};

// ---------- Fuentes: bóveda (siempre), internet y Drive ----------
// Internet usa el conector de búsqueda web de la cuenta (Parallel Search) y Drive el de Google Drive,
// los dos con las credenciales de quien usa la app. «auto»: Kataleya decide según las reglas (primero la
// bóveda); «off»: esa fuente no se le ofrece.
const KATA_WEB = 'Parallel Search';
const KATA_DRIVE = 'Google Drive';
const KATA_OFFICIAL = ['bcn.cl', 'leychile.cl', 'diariooficial.interior.gob.cl', 'sii.cl', 'uaf.cl', 'cmfchile.cl', 'dt.gob.cl', 'spensiones.cl', 'suseso.cl', 'tgr.cl', 'previred.com', 'hacienda.cl', 'bcentral.cl', 'ine.gob.cl', 'contach.cl', 'ifrs.org', 'iaasb.org', 'theiia.org', 'camara.cl', 'senado.cl', 'gob.cl'];
const kataOfficial = (url) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return KATA_OFFICIAL.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
};
const kataSource = (k) => (['auto', 'off'].includes(kataCfg()[k]) ? kataCfg()[k] : 'auto');
const kataSearchId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/-/g, '');
let kataMcpNs;
async function kataMcp(server, tool, input) {
  if (kataMcpNs === undefined) kataMcpNs = (await window.claude?.use?.('mcp').catch(() => null)) || null;
  if (!kataMcpNs) throw new Error('Esta fuente solo funciona al abrir Enfoque desde Claude.');
  try {
    const r = await kataMcpNs.callTool(server, tool, input);
    return r?.payload ?? r;
  } catch (e) {
    const fix = { server_not_connected: `agrega «${server}» en claude.ai › Configuración › Conectores`, needs_reauth: `vuelve a conectar «${server}» en claude.ai › Configuración › Conectores`, not_in_manifest: `permite «${server}» en los permisos de esta página`, approval_required: 'aprueba el aviso de permiso', blocked_by_policy: 'tu organización no lo permite' }[e?.code];
    throw new Error(fix ? `No pude usar ${server}: ${fix}.` : `No pude usar ${server} (${e?.code || 'error'}): ${e?.message || ''}`.trim());
  }
}
const kataMark = (k, ref) => {
  const t = kata.turns.at(-1);
  if (!t || t.role !== 'assistant') return;
  (t.used ||= []).includes(k) || t.used.push(k);
  if (ref) (t.refs ||= []).some((r) => r.url === ref.url) || t.refs.push(ref);
};

// ---------- Memoria ----------
const KATA_MEMORY_SEED = `---
tipo: sistema
area: sistema
estado: en desarrollo
---
# Memoria de Kataleya

**Idea central:** lo que Kataleya recuerda de ti. La lee al empezar cada conversación. Puedes editarla cuando quieras; ella solo agrega algo cuando apruebas «¿Lo recuerdo?».

## Sobre mí
- Contador auditor en Chile. Uso Enfoque y la bóveda «Cerebro Digital X» como base única de conocimiento profesional: asesoría a clientes, consultas técnicas, estudio, cursos y contenidos.
- Practico el estoicismo (notas personales en su carpeta).

## Reglas de trabajo
- Lo que importa es que la bóveda no tenga errores en leyes y normas.
- Trazabilidad: indicar el historial de cada norma (origen → modificaciones → lo que rige hoy). Precaución con los cambios legales: una ley puede estar bien en su origen y haber sido cambiada después.
- Lo que no cuadre queda como alerta (⏰ Alertas Normativas), nunca como afirmación.
- Citar siempre la fuente y la fecha de vigencia. Si la bóveda no lo cubre, decirlo; no inventar.
- Los apuntes tienen menor rango: sus datos normativos son historia hasta verificarlos.

## Preferencias
- Responder en español de Chile, breve y concreto.
- Para cambios en la bóveda: primero un informe con 🆕/➕/🔄/✅/⛔/⚠️ y la pregunta «¿Apruebas todo, algunos números o ninguno?»; aplicar solo lo aprobado.

## Límites
- Los datos de clientes son confidenciales; en los ejemplos usar «Comercial Cachapoal Ltda.».
- No tocar notas personales (estoicismo, «MIS…», proyectos personales, carpeta PERSONAL) sin aprobación; nunca alterar mis ensayos.
- No abrir ni copiar claves ni credenciales.

## Hechos y decisiones
- 2026-11-24: Finanzas quedó oculta en Enfoque (sus datos se conservan).
- 2026-11-24: Fase 3 de la especialidad Contador: panel de clientes, calculadoras (art. 53 CT, impuesto único, APV, finiquito, UF/UTM) e informe al cliente. La firma de documentos es opcional.
`;

const kataMemoryNote = () => findNoteByName(KATA_MEMORY_PATH) || null;
function kataEnsureMemory() {
  let note = kataMemoryNote();
  if (!note) {
    if (!state.folders.includes('Sistema')) state.folders.push('Sistema');
    note = createNote({ folder: 'Sistema', title: baseName(KATA_MEMORY_PATH), body: KATA_MEMORY_SEED, open: false, edit: false, log: false });
  }
  return note;
}
function kataMemoryText() {
  const n = kataMemoryNote();
  if (!n || n.enc) return KATA_MEMORY_SEED.split('\n').slice(6).join('\n');
  return gvBodyText(n).slice(0, 7000);
}
// Añade una línea bajo una sección de la memoria (la crea si no existe).
function kataRemember(text, section = 'Hechos y decisiones') {
  const note = kataEnsureMemory();
  const lines = note.body.split('\n');
  let h = lines.findIndex((l) => new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(l));
  if (h < 0) {
    lines.push('', `## ${section}`);
    h = lines.length - 1;
  }
  let i = h + 1;
  while (i < lines.length && !/^##\s/.test(lines[i])) i++;
  while (i > h + 1 && !lines[i - 1].trim()) i--;
  lines.splice(i, 0, `- ${dateKey()}: ${text.replace(/\n+/g, ' ').trim()}`);
  note.body = lines.join('\n');
  note.updatedAt = Date.now();
  dataRev++;
  save();
  if (typeof snapshotNote === 'function') snapshotNote(note);
}

// ---------- Modos ----------
function kataModes() {
  const list = [{ id: 'general', label: '✨ General' }];
  if (typeof specList === 'function') specList().filter((s) => specOn(s.id)).forEach((s) => list.push({ id: s.id, label: `${s.icon} ${s.name}` }));
  return list;
}
const kataMode = () => (kataModes().some((m) => m.id === kataCfg().mode) ? kataCfg().mode : proOn() ? 'contador' : 'general');

function kataModeRules(mode) {
  if (mode === 'contador') {
    return `Modo Contador (Chile):
- Para cualquier pregunta normativa (leyes, DL, circulares, resoluciones, oficios, NIC/NIIF/NIA): busca en las notas y usa radar_norma. Responde con lo que **rige hoy**, su **trazabilidad** (origen → cambios → vigente), la **fuente** y la **fecha de vigencia** si la nota la trae.
- Si hay una alerta abierta o una contradicción sobre el tema (usa alertas_abiertas y contradicciones), avísalo con ⚠️.
- Si la bóveda no lo cubre o los datos no cuadran, dilo y sugiere dejarlo como alerta. Nunca inventes tasas, plazos ni artículos.
- Los datos de clientes son confidenciales: en ejemplos usa «Comercial Cachapoal Ltda.».`;
  }
  if (mode === 'estoicismo') {
    const mx = typeof stoaMaxim === 'function' ? stoaMaxim() : null;
    return `Modo Estoico: acompaña la práctica con calma y sin sermones. Usa las citas y notas de estoicismo de la persona (busca antes), propone ejercicios concretos (premeditatio malorum, dicotomía del control, examen de la noche, memento mori) y cita la fuente clásica (autor y obra). ${mx ? `Máxima de hoy: «${mx.text}» (${mx.ref || ''}).` : ''}`;
  }
  const spec = typeof specById === 'function' ? specById(mode) : null;
  if (spec) {
    const n = specNote(spec);
    return `Modo ${spec.name}: la persona trabaja la especialidad «${spec.name}». Su perfil (origen, fuentes y calendario):\n${n ? gvBodyText(n).slice(0, 2000) : '(sin perfil todavía)'}`;
  }
  return 'Modo General: ayuda con las notas, tareas, proyectos y la organización del día.';
}

// ---------- Contexto de lo que se ve ----------
function kataSelection() {
  const ta = $('#note-editor');
  if (ta && document.activeElement === ta && ta.selectionEnd > ta.selectionStart) return ta.value.slice(ta.selectionStart, ta.selectionEnd);
  const s = String(window.getSelection?.() || '').trim();
  return s && !$('#kata-panel')?.contains(window.getSelection().anchorNode) ? s : '';
}
// Lo que Kataleya «ve», en corto, para la línea de arriba del chat.
function kataSeeing() {
  const tab = activeTab();
  if (tab?.type === 'note') return noteById(tab.id) ? `📄 ${baseName(noteById(tab.id).path)}${kataSelection() ? ' · con texto seleccionado' : ''}` : '';
  if (tab?.type === 'view') return `🧭 ${VIEW_TITLES[tab.view] || tab.view}`;
  if (tab?.type === 'graph') return '🕸 Grafo';
  return '';
}

function kataContext() {
  const tab = activeTab();
  const sel = kataSelection().slice(0, 3000);
  if (tab?.type === 'note') {
    const n = noteById(tab.id);
    if (!n) return '';
    if (n.enc) return `La persona tiene abierta una nota protegida con contraseña («${baseName(n.path)}»): su texto no se puede leer.`;
    return `La persona tiene abierta la nota [[${baseName(n.path)}]] (${n.path}).${sel ? `\nTexto seleccionado:\n"""\n${sel}\n"""` : ''}\nInicio de la nota:\n"""\n${n.body.slice(0, 3500)}\n"""`;
  }
  if (tab?.type === 'view') return `La persona está en la vista «${VIEW_TITLES[tab.view] || tab.view}» de Enfoque.${sel ? `\nTexto seleccionado:\n"""\n${sel}\n"""` : ''}`;
  if (tab?.type === 'graph') return 'La persona está en el grafo de notas.';
  return '';
}

// Dónde buscar: siempre primero la bóveda; Drive e internet solo cuando corresponde.
function kataWhereRules() {
  const web = kataSource('web') !== 'off';
  const drive = kataSource('drive') !== 'off';
  return `- Dónde buscar, en este orden:
  1. 🗂 **Bóveda** (tus notas): siempre primero.
  ${drive ? '2. 📁 **Drive**: si la persona habla de un archivo o documento (PDF, Word, planilla) que no es una nota, o la bóveda no lo tiene.' : '2. (Drive no está disponible ahora.)'}
  ${web ? `3. 🌐 **Internet**: solo si la bóveda no lo cubre, si el dato puede haber cambiado (tasas, plazos, valores como UF o UTM, normas o circulares recientes, alertas abiertas) o si la persona lo pide. Prefiere fuentes oficiales: ${KATA_OFFICIAL.slice(0, 12).join(', ')}…; blogs y prensa solo de apoyo.` : '3. (Internet está apagado: no busques afuera; si hace falta, dilo.)'}
- Cuando uses más de una fuente, sepáralas en la respuesta: «🗂 En tu bóveda: …» y «🌐 En internet (fuente, fecha): …» (y «📁 En tu Drive: …»).
- Si lo de internet contradice o actualiza la bóveda, dilo con claridad y propone **agregar_alerta** (o guardar la fuente en la carpeta «Bandeja IA» con crear_nota, con el enlace, la fecha y el extracto). Nunca cambies una nota con datos de internet sin que la persona lo apruebe.
- Cita cada dato de internet con su enlace y fecha de publicación.`;
}

function kataRules() {
  return `Eres **Kataleya**, la asistente de Enfoque, la app de notas y productividad de esta persona. Hablas en español de Chile, cercana y profesional, breve y concreta. Te presentas como Kataleya si te preguntan.

Hoy es ${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${dateKey()}).

Reglas:
- Busca en las notas antes de responder. Cita cada dato con [[Título exacto de la nota]]. Si no encuentras algo, dilo; no inventes.
${kataWhereRules()}
- Para crear o cambiar cosas usa las herramientas de acción: **no hacen nada solas**, dejan una propuesta que la persona aprueba con un botón. Di qué propusiste y nunca digas que ya está hecho.
- Para mostrar algo, usa abrir_vista (no necesita aprobación).
- Puedes usar la app como la persona: editar notas (editar_nota: lee la nota primero y copia el fragmento exacto), enlazarlas (enlazar: relacionar, menciones, entrantes, moc, sugerir, rotos y reparar; para «¿qué debería enlazar?» usa sugerir y después propone), organizar tareas, hábitos, proyectos, ideas, diario y Pomodoro (organizar) y ejecutar cualquier comando de la paleta (comando: primero listar). Todo queda como propuesta con vista previa.
- Puedes ir más allá de las notas con crear_documento: PDF, Google Docs, hojas de cálculo (Google Sheets o CSV) y borradores de Gmail. Redacta con tono profesional, en español de Chile, con la norma, su vigencia y la fuente cuando corresponda; no escribas firma ni datos de contacto en el contenido: la app agrega la firma de la persona solo si ella la configuró y la deja marcada en la tarjeta (con firma: true o false solo sugieres); nunca pongas datos reales de clientes si no te los dio la persona. Los correos quedan como borrador: jamás digas que se enviaron.
- Si la persona te cuenta algo que valga la pena recordar (una preferencia, una regla, una decisión), propón guardarlo con recordar.
- Respeta la memoria: sus reglas y límites mandan.
- Markdown sencillo: párrafos cortos y listas.

${kataModeRules(kataMode())}

Tu memoria (nota [[${baseName(KATA_MEMORY_PATH)}]]):
"""
${kataMemoryText()}
"""

${kataContext()}`;
}

// ---------- Herramientas ----------
const kataNote = (t) => {
  const n = findNoteByName(String(t || '')) || gvLive().find((x) => fold(baseName(x.path)) === fold(String(t || '')));
  if (!n) throw new Error(`No existe una nota llamada «${t}»`);
  if (n.enc) throw new Error('Esa nota está protegida con contraseña');
  return n;
};
const kataProgress = (t) => {
  const p = $('#kata-progress');
  if (p) p.textContent = t;
};
const kataSrc = (o) => {
  if (!o || !o.tipo) return { t: 'all' };
  const v = String(o.valor || '');
  if (o.tipo === 'carpeta') return { t: 'folder', v };
  if (o.tipo === 'etiqueta') return { t: 'tag', v: v.replace(/^#/, '').toLowerCase() };
  if (o.tipo === 'moc') {
    const n = findNoteByName(v) || gvMocs().find((m) => fold(baseName(m.path)).includes(fold(v)));
    return n ? { t: 'moc', v: n.id } : { t: 'all' };
  }
  return { t: 'all' };
};
const KATA_SRC_SCHEMA = { type: 'object', description: 'Origen de las notas: {tipo: "carpeta"|"etiqueta"|"moc"|"todo", valor}', properties: { tipo: { type: 'string', enum: ['carpeta', 'etiqueta', 'moc', 'todo'] }, valor: { type: 'string' } } };

// Deja una acción pendiente de aprobación y devuelve su resumen a Claude.
// opts.firma (true/false): la tarjeta muestra la casilla «Incluir mi firma» y run la recibe en a.firma.
function kataPropose(label, detail, run, opts = {}) {
  const id = `a${++kata.seq}`;
  const turn = kata.turns.at(-1);
  kata.pending.set(id, { label, detail, run, status: 'pending', result: null, ...(typeof opts.firma === 'boolean' ? { firma: opts.firma } : {}) });
  if (turn) (turn.actions ||= []).push(id);
  kataRender();
  return { propuesta: id, estado: 'pendiente de aprobación por la persona', resumen: `${label}${detail ? ` · ${detail}` : ''}` };
}

// Todas las herramientas por separado (cada una con su lógica). Claude no recibe esta lista: recibe la
// agrupada de kataTools(), porque cada llamada admite pocas herramientas.
function kataToolsAll() {
  const read = [
    { name: 'buscar_notas', description: 'Busca en las notas por palabras clave. Devuelve hasta 8 notas con título, ruta, fecha y las líneas que coinciden.', inputSchema: { type: 'object', properties: { consulta: { type: 'string' } }, required: ['consulta'] }, execute: ({ consulta }) => (kataProgress(`Buscando «${String(consulta).slice(0, 40)}»…`), searchNotesForAI(String(consulta)).filter((x) => !findNoteByName(x.ruta)?.enc)) },
    { name: 'leer_nota', description: 'Texto completo (hasta 9.000 caracteres) de una nota por su título o ruta.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] }, execute: ({ titulo }) => { const n = kataNote(titulo); kataProgress(`Leyendo [[${baseName(n.path)}]]…`); return { titulo: baseName(n.path), ruta: n.path, texto: n.body.slice(0, 9000) }; } },
    { name: 'buscar_tareas', description: 'Tareas (de la lista y de las casillas de las notas). estado: pendientes (por defecto), hechas o todas.', inputSchema: { type: 'object', properties: { consulta: { type: 'string' }, estado: { type: 'string', enum: ['pendientes', 'hechas', 'todas'] } } }, execute: (i) => (kataProgress('Revisando tus tareas…'), tasksForAI({ consulta: String(i.consulta || ''), estado: String(i.estado || 'pendientes') })) },
    { name: 'buscar_diario', description: 'Entradas del diario. consulta, desde y hasta (AAAA-MM-DD) opcionales.', inputSchema: { type: 'object', properties: { consulta: { type: 'string' }, desde: { type: 'string' }, hasta: { type: 'string' } } }, execute: (i) => (kataProgress('Leyendo tu diario…'), journalForAI({ consulta: String(i.consulta || ''), desde: String(i.desde || ''), hasta: String(i.hasta || '') })) },
  ];
  const pro = typeof proIndex === 'function' ? [
    { name: 'radar_norma', description: 'Radar normativo: para una norma (p. ej. «Ley 21.713», «DL 824», «Circular UAF 62», «LIR»), las notas que la citan, sus artículos, señales (derogada, modificada, postergada), fechas de vigencia futuras y alertas abiertas.', inputSchema: { type: 'object', properties: { norma: { type: 'string' } }, required: ['norma'] }, execute: ({ norma }) => {
      kataProgress(`Consultando el Radar: ${norma}…`);
      const keys = proNormsIn(String(norma), proProfile()).map((x) => x.key);
      const { norms } = proIndex();
      const q = fold(String(norma));
      const hits = [...norms.values()].filter((e) => keys.includes(e.key) || fold(e.key).includes(q) || (e.name && fold(e.name).includes(q))).slice(0, 4);
      return hits.map((e) => ({ norma: e.key, nombre: e.name || null, notas: [...e.notes.keys()].map((id) => baseName(noteById(id)?.path || '')).slice(0, 15), articulos: [...e.arts.keys()].slice(0, 12), señales: Object.fromEntries([...e.signals].map(([k, v]) => [k, v.slice(0, 4).map((r) => `${baseName(r.note.path)}: ${r.text}`)])), vigencias_futuras: e.future.slice(0, 5).map((f) => `${f.date} · ${baseName(f.note.path)}: ${f.text}`), alertas_abiertas: e.alerts.map((a) => a.text) }));
    } },
    { name: 'contradicciones', description: 'Contradicciones detectadas en la bóveda: artículos con datos distintos entre notas y normas derogadas citadas sin aclararlo.', inputSchema: { type: 'object', properties: {} }, execute: () => (kataProgress('Revisando contradicciones…'), proContradictions().slice(0, 15).map((c) => (c.type === 'derogada' ? { tipo: 'norma derogada citada sin aclarar', norma: c.subject, la_citan: c.plain.map((p) => baseName(p.note.path)) } : { tipo: 'datos distintos', tema: c.subject, dato: c.fact.label, valores: c.notes.map((x) => `${baseName(x.note.path)}: ${[...x.values].join(', ')}`) }))) },
    { name: 'alertas_abiertas', description: 'Alertas abiertas de la nota ⏰ Alertas Normativas y Seguimiento.', inputSchema: { type: 'object', properties: {} }, execute: () => { const al = vgAlertsNote(); return al ? al.body.split('\n').filter((l) => /^\s*\|\s*\[ \]/.test(l) || /^\s*-\s*\[ \]/.test(l)).map((l) => gvSnippet(l)).slice(0, 40) : []; } },
    { name: 'calendario', description: 'Vencimientos tributarios, alertas con fecha y vigencias futuras de los próximos días (por defecto 30).', inputSchema: { type: 'object', properties: { dias: { type: 'number' } } }, execute: ({ dias = 30 } = {}) => ctEvents(dateKey(), dateKey(new Date(Date.now() + Math.min(366, Number(dias) || 30) * 864e5))).map((e) => `${e.date} · ${e.title}${e.detail ? ` · ${e.detail}` : ''}`).slice(0, 60) },
    { name: 'notas_por_revisar', description: 'Cola de revisión de vigencia: notas que conviene revisar y por qué.', inputSchema: { type: 'object', properties: { meses: { type: 'number' } } }, execute: ({ meses = 6 } = {}) => vgQueue({ t: 'all' }, Number(meses) || 6).slice(0, 25).map((x) => ({ nota: baseName(x.note.path), motivos: x.reasons.map((r) => r.text) })) },
  ] : [];
  if (pro.length && typeof clientList === 'function') {
    const findClient = (t) => {
      const q = fold(String(t || ''));
      const c = clientList().find((n) => fold(baseName(n.path)) === q) || clientList().find((n) => fold(baseName(n.path)).includes(q));
      if (!c) throw new Error(`No hay un cliente llamado «${t}» (clientes: ${clientList().map((n) => baseName(n.path)).slice(0, 15).join(', ') || 'ninguno'})`);
      return c;
    };
    pro.push(
      { name: 'clientes_lista', description: 'Clientes (notas tipo: cliente): RUT, régimen, estado, próximo vencimiento y pendientes.', inputSchema: { type: 'object', properties: {} }, execute: () => (kataProgress('Revisando tus clientes…'), clientList().map(clientInfo).map((c) => ({ cliente: c.name, rut: c.rut || null, regimen: c.regimen || null, estado: c.estado, proximo_vencimiento: (() => { const e = clientEvents(c, 45)[0]; return e ? `${e.date} · ${e.title}` : null; })(), pendientes: clientTasks(c).length }))) },
      { name: 'cliente_ficha', description: 'Ficha de un cliente: datos, vencimientos de los próximos 45 días según sus obligaciones, pendientes, notas que lo enlazan y bitácora.', inputSchema: { type: 'object', properties: { cliente: { type: 'string' } }, required: ['cliente'] }, execute: ({ cliente }) => {
        const c = clientInfo(findClient(cliente));
        kataProgress(`Leyendo la ficha de ${c.name}…`);
        return { cliente: c.name, rut: c.rut, regimen: c.regimen, giro: c.giro, contacto: c.contacto, estado: c.estado, obligaciones: c.obligaciones, vencimientos: clientEvents(c, 45).map((e) => `${e.date} · ${e.title}`), pendientes: clientTasks(c).map((t) => `${t.title}${t.due ? ` (${t.due})` : ''}`).slice(0, 20), notas_que_lo_enlazan: (typeof backlinksOf === 'function' ? backlinksOf(c.note).linked : []).map((x) => baseName(x.note.path)).slice(0, 15), bitacora: clientSection(c, 'Bit[aá]cora').slice(-8) };
      } },
      { name: 'calcular', description: `Calculadora del contador con los parámetros del perfil. tipo: ${CALC_TYPES.map((t) => t.id).join(', ')}. datos: los campos de cada tipo.`, inputSchema: { type: 'object', properties: { tipo: { type: 'string' }, datos: { type: 'object' } }, required: ['tipo'] }, execute: (i) => {
        kataProgress('Calculando…');
        const r = calcRun(i.tipo, i.datos || {});
        if (r.error) return { error: r.error, campos: (r.type || calcType(i.tipo))?.fields.map((f) => `${f.k}: ${f.label}${f.options ? ` (${f.options.map((o) => o[0]).join('|')})` : ''}`) || [], avisos: r.warnings || [] };
        return { calculo: r.type.title, filas: r.rows.map(([a, b, c]) => `${a}: ${b}${c ? ` (${c})` : ''}`), total: `${r.total[0]}: ${r.total[1]}`, avisos: r.warnings, parametros: r.used, tabla_markdown: calcMarkdown(i.tipo, i.datos || {}) };
      } },
      { name: 'informe_cliente', description: 'Abre el informe al cliente (vencimientos, pendientes, novedades normativas) para que la persona lo revise y lo exporte a PDF, nota o Google Doc. observaciones: texto opcional al final; dias: período (15 a 90).', inputSchema: { type: 'object', properties: { cliente: { type: 'string' }, dias: { type: 'number' }, observaciones: { type: 'string' } }, required: ['cliente'] }, execute: (i) => {
        const n = findClient(i.cliente);
        informeOpen(n, { dias: Number(i.dias) || 30, observaciones: String(i.observaciones || '') });
        return { texto: `Abrí el informe de ${baseName(n.path)} para que lo revises y lo exportes.` };
      } }
    );
  }
  const ext = [];
  if (kataSource('web') !== 'off') {
    ext.push(
      { name: 'buscar_en_internet', description: 'Busca en internet (datos actualizados). objetivo: qué se quiere saber; consultas: 2 o 3 búsquedas cortas (3 a 6 palabras), pueden usar site:sii.cl o site:bcn.cl. Devuelve hasta 6 resultados con título, url, fecha, si es fuente oficial y un extracto.', inputSchema: { type: 'object', properties: { objetivo: { type: 'string' }, consultas: { type: 'array', items: { type: 'string' } } }, required: ['objetivo', 'consultas'] }, execute: async (i) => {
        kataProgress(`🌐 Buscando en internet: ${String(i.objetivo).slice(0, 50)}…`);
        const r = await kataMcp(KATA_WEB, 'web_search', { objective: String(i.objetivo), search_queries: (i.consultas || []).map(String).slice(0, 4), session_id: kataSearchId });
        const list = (r?.results || []).map((x) => ({ titulo: x.title, url: x.url, fecha: x.publish_date || null, oficial: kataOfficial(x.url), extracto: (x.excerpts || []).join(' … ').replace(/\s+/g, ' ').slice(0, 1800) }));
        list.sort((a, b) => b.oficial - a.oficial);
        const top = list.slice(0, 6);
        top.forEach((x) => kataMark('web', { title: x.titulo, url: x.url, date: x.fecha, official: x.oficial }));
        if (!top.length) kataMark('web');
        return top;
      } },
      { name: 'leer_pagina', description: 'Lee una página web concreta (cuando los extractos no bastan). objetivo: qué buscar en ella.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, objetivo: { type: 'string' } }, required: ['url'] }, execute: async (i) => {
        if (!/^https:\/\//.test(String(i.url))) throw new Error('Solo leo páginas https');
        kataProgress(`🌐 Leyendo ${String(i.url).replace(/^https:\/\/(www\.)?/, '').slice(0, 50)}…`);
        const r = await kataMcp(KATA_WEB, 'web_fetch', { urls: [String(i.url)], objective: String(i.objetivo || '').slice(0, 200) || null, session_id: kataSearchId });
        const x = (r?.results || [])[0] || {};
        kataMark('web', { title: x.title || i.url, url: String(i.url), date: x.publish_date || null, official: kataOfficial(String(i.url)) });
        return { titulo: x.title || null, fecha: x.publish_date || null, texto: (x.excerpts || [x.full_content || '']).join(' … ').slice(0, 6000) };
      } }
    );
  }
  if (kataSource('drive') !== 'off') {
    ext.push(
      { name: 'buscar_en_drive', description: 'Busca archivos en tu Google Drive (PDF, Word, planillas, documentos) por palabras de su título o contenido. Devuelve hasta 8 con id, título, tipo, fecha y un extracto.', inputSchema: { type: 'object', properties: { consulta: { type: 'string' }, solo_titulo: { type: 'boolean' } }, required: ['consulta'] }, execute: async (i) => {
        const q = String(i.consulta).replace(/\\/g, '').replace(/'/g, "\\'").slice(0, 80);
        kataProgress(`📁 Buscando en tu Drive: ${q}…`);
        const r = await kataMcp(KATA_DRIVE, 'search_files', { query: `${i.solo_titulo ? 'title' : 'fullText'} contains '${q}' and trashed = false`, pageSize: 8, snippetVerbosity: 'BRIEF' });
        kataMark('drive');
        return (r?.files || []).map((f) => ({ id: f.id, titulo: f.title, tipo: f.mimeType, modificado: String(f.modifiedTime || '').slice(0, 10), extracto: String(f.contentSnippet || '').replace(/\s+/g, ' ').slice(0, 500) }));
      } },
      { name: 'leer_archivo_drive', description: 'Lee el contenido de un archivo de Drive por su id (de buscar_en_drive): PDF, Word, planilla, presentación o texto. Hasta 9.000 caracteres.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, execute: async (i) => {
        kataProgress('📁 Leyendo el archivo de Drive…');
        const r = await kataMcp(KATA_DRIVE, 'read_file_content', { fileId: String(i.id) });
        kataMark('drive', r?.viewUrl ? { title: `📁 ${r.title || 'Archivo de Drive'}`, url: r.viewUrl, date: null, official: false, drive: true } : null);
        return { titulo: r?.title || null, texto: String(r?.fileContent || '').slice(0, 9000) };
      } }
    );
  }
  const views = Object.keys(VIEW_TITLES).filter((v) => !['settings'].includes(v));
  const actions = [
    { name: 'abrir_vista', description: `Abre una vista o una nota (no necesita aprobación). vista: una de ${views.join(', ')}; o nota: título. origen opcional para vistas gráficas; buscar opcional para radar o línea de tiempo.`, inputSchema: { type: 'object', properties: { vista: { type: 'string' }, nota: { type: 'string' }, origen: KATA_SRC_SCHEMA, buscar: { type: 'string' } } }, execute: (i) => {
      if (i.nota) { const n = kataNote(i.nota); openNote(n); return { abierta: baseName(n.path) }; }
      const v = String(i.vista || '');
      if (!VIEW_TITLES[v]) throw new Error(`No existe la vista «${v}»`);
      if (i.origen && gvCfg()) { gvCfg().view[v] = { ...(gvCfg().view[v] || {}), src: kataSrc(i.origen) }; save(); }
      if (i.buscar && v === 'radar') proState.q = String(i.buscar);
      if (i.buscar && v === 'linea') gvLine.q = String(i.buscar);
      showView(v);
      return { abierta: VIEW_TITLES[v] };
    } },
    { name: 'crear_tarea', description: 'Propone crear una tarea. fecha AAAA-MM-DD y hora HH:MM opcionales; prioridad alta, media o baja.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] } }, required: ['titulo'] }, execute: (i) => kataPropose(`☑ Tarea «${i.titulo}»`, [i.fecha && `📅 ${i.fecha}`, i.hora && `⏰ ${i.hora}`, i.prioridad && `prioridad ${i.prioridad}`].filter(Boolean).join(' · '), () => {
      const t = addTask(String(i.titulo), { raw: true, due: /^\d{4}-\d{2}-\d{2}$/.test(i.fecha || '') ? i.fecha : null, time: /^\d{2}:\d{2}$/.test(i.hora || '') ? i.hora : null, priority: { alta: 3, media: 2, baja: 1 }[i.prioridad] || 2 });
      renderAll();
      return { texto: 'Tarea creada', abrir: () => showView('tasks'), t };
    }) },
    { name: 'crear_nota', description: 'Propone crear una nota en Markdown. carpeta opcional (por defecto MATRIZ de la bóveda si existe); moc opcional: el MOC donde va.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, contenido: { type: 'string' }, carpeta: { type: 'string' }, moc: { type: 'string' } }, required: ['titulo', 'contenido'] }, execute: (i) => kataPropose(`📝 Nota «${i.titulo}»`, `${i.carpeta ? `en ${i.carpeta}` : ''}${i.moc ? ` · MOC ${i.moc}` : ''} · ${String(i.contenido).length} caracteres`, () => {
      const folder = String(i.carpeta || gvFolders().find((f) => /matriz/i.test(f)) || '');
      const body = `${i.moc && !/^---/.test(i.contenido) ? `---\nmoc: "[[${i.moc}]]"\nestado: borrador\ncreada: ${dateKey()}\n---\n` : ''}${i.contenido}`;
      const n = createNote({ folder, title: String(i.titulo), body, open: false, edit: false });
      renderAll();
      return { texto: 'Nota creada', abrir: () => openNote(n) };
    }) },
    { name: 'agregar_alerta', description: 'Propone añadir una alerta a ⏰ Alertas Normativas (tabla 🟠). nota: la nota afectada.', inputSchema: { type: 'object', properties: { texto: { type: 'string' }, nota: { type: 'string' } }, required: ['texto', 'nota'] }, execute: (i) => { const n = kataNote(i.nota); return kataPropose(`⚠️ Alerta «${i.texto}»`, `nota: ${baseName(n.path)}`, () => { vgAddAlert(n, String(i.texto)); return { texto: 'Alerta añadida', abrir: () => vgAlertsNote() && openNote(vgAlertsNote()) }; }); } },
    { name: 'cambiar_propiedad', description: 'Propone cambiar (o quitar, con valor vacío) una propiedad de una o varias notas.', inputSchema: { type: 'object', properties: { notas: { type: 'array', items: { type: 'string' } }, propiedad: { type: 'string' }, valor: { type: 'string' } }, required: ['notas', 'propiedad'] }, execute: (i) => { const ns = (i.notas || []).map(kataNote); return kataPropose(`🏷 ${i.propiedad}: ${i.valor || '(quitar)'}`, plural(ns.length, 'nota', 'notas') + `: ${ns.slice(0, 4).map((n) => baseName(n.path)).join(', ')}${ns.length > 4 ? '…' : ''}`, () => { ns.forEach((n) => gvSetProps(n, [[String(i.propiedad), String(i.valor || '')]])); return { texto: `${plural(ns.length, 'nota cambiada', 'notas cambiadas')}` }; }); } },
    { name: 'marcar_revisadas', description: 'Propone marcar notas como revisadas hoy (propiedad revisada).', inputSchema: { type: 'object', properties: { notas: { type: 'array', items: { type: 'string' } } }, required: ['notas'] }, execute: (i) => { const ns = (i.notas || []).map(kataNote); return kataPropose(`✅ Revisadas hoy`, ns.map((n) => baseName(n.path)).join(', '), () => { ns.forEach((n) => gvSetProps(n, [['revisada', dateKey()]])); return { texto: `${plural(ns.length, 'nota marcada', 'notas marcadas')}` }; }); } },
    { name: 'crear_tablero', description: 'Propone crear un tablero kanban. agrupar: la propiedad de las columnas (p. ej. estado, area, tipo); columnas y mostrar opcionales.', inputSchema: { type: 'object', properties: { nombre: { type: 'string' }, origen: KATA_SRC_SCHEMA, agrupar: { type: 'string' }, columnas: { type: 'array', items: { type: 'string' } }, mostrar: { type: 'array', items: { type: 'string' } } }, required: ['nombre', 'agrupar'] }, execute: (i) => { const src = kataSrc(i.origen); const n = gvNotes(src).length; return kataPropose(`📋 Tablero «${i.nombre}»`, `columnas por ${i.agrupar} · ${gvSrcLabel(src)} · ${plural(n, 'nota', 'notas')}`, () => { gvNewBoard({ name: String(i.nombre), src, group: String(i.agrupar), columns: (i.columnas || []).map(String), show: (i.mostrar || []).map(String) }); showView('tableros'); return { texto: 'Tablero creado' }; }); } },
    { name: 'crear_base', description: 'Propone crear una Base (notas como base de datos) en su carpeta, con sus propiedades y vistas: tabla, tablero (agrupado por una propiedad) y calendario (por una propiedad de fecha).', inputSchema: { type: 'object', properties: { nombre: { type: 'string' }, carpeta: { type: 'string' }, propiedades: { type: 'array', items: { type: 'string' } }, tablero_por: { type: 'string' }, fecha: { type: 'string' }, icono: { type: 'string' } }, required: ['nombre', 'propiedades'] }, execute: (i) => kataPropose(`📇 Base «${i.nombre}»`, `carpeta ${i.carpeta || i.nombre} · ${(i.propiedades || []).join(', ')}`, () => {
      const folder = String(i.carpeta || i.nombre);
      const props = Object.fromEntries((i.propiedades || []).map((p) => [String(p), '']));
      const keys = Object.keys(props);
      const views = [['Tabla', tbl(folder, keys)]];
      if (i.tablero_por) views.push([`Por ${i.tablero_por}`, brd(folder, String(i.tablero_por), '', keys.filter((k) => k !== i.tablero_por).slice(0, 2))]);
      if (i.fecha) views.push(['Calendario', calv(folder, String(i.fecha))]);
      const note = createBase({ name: String(i.nombre), folder, views, props, icon: String(i.icono || '📇') });
      if (!note) throw new Error('Ya existe una base con ese nombre');
      showView('bases');
      openBase(note.id);
      return { texto: 'Base creada' };
    }) },
    { name: 'crear_diagrama', description: 'Propone crear un diagrama en Ideas y mapas. tipo: mindmap, radial, org, outline, fishbone, process, timeline, matrix, pyramid, concept, flow, venn, cycle, funnel o radar. esquema: el contenido como lista con sangría (dos espacios por nivel), sin el título.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, tipo: { type: 'string' }, esquema: { type: 'string' } }, required: ['titulo', 'esquema'] }, execute: (i) => { const kind = String(i.tipoDiagrama || (i.tipo !== 'diagrama' ? i.tipo || '' : '') || 'mindmap'); const items = mmParseLines(String(i.esquema)); return kataPropose(`🗺️ Diagrama «${i.titulo}»`, `${kind} · ${plural(items.length, 'elemento', 'elementos')}`, () => { const map = newMap(String(i.titulo)); mmAddLines(map, 'root', items); if (kind !== 'mindmap') map.kind = kind; map.updatedAt = Date.now(); save(); openMap(map.id); return { texto: 'Diagrama creado' }; }); } },
    { name: 'crear_lienzo', description: 'Propone crear un lienzo con tarjetas: notas existentes (por título) y tarjetas de texto, unidas con flechas. conexiones: pares [desde, hasta] con los índices de tarjetas (primero las notas, después los textos), con etiqueta opcional.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, notas: { type: 'array', items: { type: 'string' } }, textos: { type: 'array', items: { type: 'string' } }, conexiones: { type: 'array', items: { type: 'object', properties: { desde: { type: 'number' }, hasta: { type: 'number' }, etiqueta: { type: 'string' } } } }, enlazar: { type: 'boolean', description: 'Unir también las notas según sus [[enlaces]]' } }, required: ['titulo'] }, execute: (i) => { const ns = (i.notas || []).map(kataNote); const ts = (i.textos || []).map(String); return kataPropose(`🧩 Lienzo «${i.titulo}»`, `${plural(ns.length, 'nota', 'notas')} · ${plural(ts.length, 'texto', 'textos')} · ${plural((i.conexiones || []).length, 'flecha', 'flechas')}`, () => {
      const c = newCanvas(String(i.titulo));
      const all = [...ns.map((n) => ({ type: 'note', noteId: n.id, w: 300, h: 200 })), ...ts.map((t) => ({ type: 'text', text: t, w: 260, h: 120 }))];
      const cols = Math.max(1, Math.ceil(Math.sqrt(all.length)));
      const cards = all.map((k, j) => ({ id: uid(), x: (j % cols) * 380, y: Math.floor(j / cols) * 280, ...k }));
      c.cards.push(...cards);
      (i.conexiones || []).forEach((e) => { const a = cards[Number(e.desde)]; const b = cards[Number(e.hasta)]; if (a && b && a !== b) c.edges.push({ id: uid(), from: a.id, to: b.id, ...(e.etiqueta ? { label: String(e.etiqueta) } : {}) }); });
      if (i.enlazar !== false) linkNoteCards(c);
      touchCanvas(c);
      openCanvas(c.id);
      return { texto: 'Lienzo creado' };
    }); } },
    { name: 'crear_dibujo', description: 'Propone crear un dibujo editable (estilo Excalidraw) en una nota nueva de «Dibujos». tipo «flujo»: pasos en orden, de arriba abajo, unidos por flechas (un paso que termina en «?» es una decisión, en rombo). tipo «libre»: elementos con forma (rectangulo, elipse, rombo, texto), x, y, ancho, alto y texto, y flechas [desde, hasta] por índice.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, tipo: { type: 'string', enum: ['flujo', 'libre'] }, pasos: { type: 'array', items: { type: 'string' } }, elementos: { type: 'array', items: { type: 'object' } }, flechas: { type: 'array', items: { type: 'array', items: { type: 'number' } } } }, required: ['titulo'] }, execute: (i) => kataPropose(`✏️ Dibujo «${i.titulo}»`, i.tipo === 'libre' ? plural((i.elementos || []).length, 'elemento', 'elementos') : plural((i.pasos || []).length, 'paso', 'pasos'), async () => {
      const note = await kataDrawing(i);
      return { texto: 'Dibujo creado', abrir: () => openNote(note) };
    }) },
    { name: 'agendar', description: 'Propone crear un evento en Google Calendar. fecha AAAA-MM-DD, hora HH:MM (por defecto 09:00) y duración en minutos (por defecto 30).', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, minutos: { type: 'number' }, detalle: { type: 'string' } }, required: ['titulo', 'fecha'] }, execute: (i) => kataPropose(`📅 Evento «${i.titulo}»`, `${i.fecha} ${i.hora || '09:00'}`, async () => {
      if (typeof gAvailable !== 'function' || !gAvailable()) throw new Error('Google Calendar no está conectado aquí');
      const [y, m, d] = String(i.fecha).split('-').map(Number);
      const [hh, mm] = String(i.hora || '09:00').split(':').map(Number);
      const start = new Date(y, m - 1, d, hh, mm);
      const end = new Date(start.getTime() + (Number(i.minutos) || 30) * 60000);
      await gCall('Google Calendar', 'create_event', { summary: String(i.titulo), startTime: localStamp(start), endTime: localStamp(end), timeZone: tz(), description: `${i.detalle || ''}\n\nAgendado por Kataleya desde Enfoque.`.trim() });
      return { texto: 'Evento creado en Google Calendar' };
    }) },
    { name: 'crear_pdf', description: 'Propone generar un PDF descargable (informe, carta, minuta, respuesta a un cliente). contenido en Markdown (títulos, listas, tablas), sin firma; para opcional; firma: true/false para sugerir si va la firma de la persona (ella decide en la tarjeta).', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, contenido: { type: 'string' }, para: { type: 'string' }, firma: { type: 'boolean' }, guardar_nota: { type: 'boolean' } }, required: ['titulo', 'contenido'] }, execute: (i) => kataPropose(`📄 PDF «${i.titulo}»`, `${String(i.contenido).length} caracteres${i.para ? ` · para ${i.para}` : ''}${i.guardar_nota ? ' · y como nota' : ''}`, async (a) => {
      const md = kataDocMarkdown(i, a?.firma);
      await exportNotesPdf([{ id: `kata-${uid()}`, path: String(i.titulo), body: md }], { title: String(i.titulo) });
      if (i.guardar_nota) {
        if (!state.folders.includes('Documentos')) state.folders.push('Documentos');
        createNote({ folder: 'Documentos', title: String(i.titulo).slice(0, 80), body: md, open: false, edit: false, log: false });
      }
      return { texto: 'PDF generado (revisa la descarga)' };
    }, { firma: kataFirmaInitial(i.firma) }) },
    { name: 'crear_doc', description: 'Propone crear un documento editable de Google Docs en el Drive (carpeta «Kataleya» si existe). contenido en Markdown, sin firma; para opcional; firma: true/false (la persona decide en la tarjeta).', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, contenido: { type: 'string' }, para: { type: 'string' }, firma: { type: 'boolean' } }, required: ['titulo', 'contenido'] }, execute: (i) => kataPropose(`📝 Google Doc «${i.titulo}»`, `${String(i.contenido).length} caracteres · en tu Drive`, async (a) => {
      const r = await kataDriveUpload(String(i.titulo), kataDocHtml(kataDocMarkdown(i, a?.firma)), 'text/html');
      return { texto: `Documento creado en ${r.folder}`, abrir: r.url ? () => kataOpenUrl(r.url) : null };
    }, { firma: kataFirmaInitial(i.firma) }) },
    { name: 'crear_hoja', description: 'Propone crear una hoja de cálculo: en el Drive como Google Sheets (destino «drive», por defecto) o como archivo CSV descargable (destino «csv»). columnas: los encabezados; filas: una lista por fila (números sin puntos de miles, con punto decimal).', inputSchema: { type: 'object', properties: { titulo: { type: 'string' }, columnas: { type: 'array', items: { type: 'string' } }, filas: { type: 'array', items: { type: 'array', items: { type: ['string', 'number'] } } }, destino: { type: 'string', enum: ['drive', 'csv'] } }, required: ['titulo', 'columnas', 'filas'] }, execute: (i) => { const rows = (i.filas || []).slice(0, 2000); return kataPropose(`📊 Hoja «${i.titulo}»`, `${plural((i.columnas || []).length, 'columna', 'columnas')} · ${plural(rows.length, 'fila', 'filas')} · ${i.destino === 'csv' ? 'CSV descargable' : 'Google Sheets en tu Drive'}`, async () => {
      const csv = kataCsv((i.columnas || []).map(String), rows);
      if (i.destino === 'csv') {
        await offerDownload(`${pdfFileName(String(i.titulo))}.csv`, new Blob([`\ufeff${csv}`], { type: 'text/csv' }), 'text/csv');
        return { texto: 'CSV generado (revisa la descarga)' };
      }
      const r = await kataDriveUpload(String(i.titulo), csv, 'text/csv');
      return { texto: `Hoja creada en ${r.folder}`, abrir: r.url ? () => kataOpenUrl(r.url) : null };
    }); } },
    { name: 'crear_borrador', description: 'Propone dejar un BORRADOR de correo en Gmail (nunca se envía solo: la persona lo revisa y lo envía). para: direcciones de correo (puede ir vacío); cuerpo en texto simple, sin Markdown.', inputSchema: { type: 'object', properties: { para: { type: 'array', items: { type: 'string' } }, asunto: { type: 'string' }, cuerpo: { type: 'string' } }, required: ['asunto', 'cuerpo'] }, execute: (i) => { const to = (i.para || []).map(String).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)); return kataPropose(`✉️ Borrador «${i.asunto}»`, `${to.length ? `para ${to.join(', ')}` : 'sin destinatario'} · ${String(i.cuerpo).length} caracteres · no se envía`, async () => {
      const r = await kataMcp('Gmail', 'create_draft', { to, subject: String(i.asunto), body: String(i.cuerpo), htmlBody: `<div>${kataEsc(i.cuerpo).replace(/\n/g, '<br>')}</div>`, includeSignature: true });
      return { texto: 'Borrador guardado en Gmail', abrir: /^https:\/\//.test(r?.viewUrl || '') ? () => kataOpenUrl(r.viewUrl) : null };
    }); } },
    { name: 'recordar', description: 'Propone guardar algo en tu memoria (preferencias, reglas, decisiones, datos de contexto). seccion: Sobre mí, Reglas de trabajo, Preferencias, Límites o Hechos y decisiones.', inputSchema: { type: 'object', properties: { hecho: { type: 'string' }, seccion: { type: 'string' } }, required: ['hecho'] }, execute: (i) => kataPropose('🧠 ¿Lo recuerdo?', `${i.hecho}${i.seccion ? ` (${i.seccion})` : ''}`, () => { kataRemember(String(i.hecho), String(i.seccion || 'Hechos y decisiones')); return { texto: 'Guardado en la memoria' }; }) },
  ];
  // Lo que lee la bóveda queda marcado como fuente 🗂.
  [...read, ...pro].forEach((t) => {
    const run = t.execute;
    t.execute = (input) => {
      kataMark('boveda');
      return run(input);
    };
  });
  return [...read, ...pro, ...ext, ...actions];
}

// Las herramientas que ve Claude: agrupadas (menos de 15) para caber en el límite de cada llamada.
// Cada grupo elige con «tipo» o «accion» y pasa los demás campos a la herramienta original.
function kataTools(max = 20) {
  const all = new Map(kataToolsAll().map((t) => [t.name, t]));
  const run = (name, input) => {
    const t = all.get(name);
    if (!t) throw new Error(`«${name}» no está disponible ahora`);
    return t.execute(input || {});
  };
  const pick = (...names) => names.map((n) => all.get(n)).filter(Boolean);
  const group = (name, description, key, map, properties, required = [key]) => ({
    name,
    description,
    inputSchema: { type: 'object', properties: { [key]: { type: 'string', enum: Object.keys(map) }, ...properties }, required },
    execute: (input = {}) => {
      const target = map[String(input[key] || '')];
      if (!target) throw new Error(`${key} debe ser uno de: ${Object.keys(map).join(', ')}`);
      return run(target, input);
    },
  });
  const out = [...pick('buscar_notas', 'leer_nota')];
  out.push(group('tareas_y_diario', 'Lee tareas (donde: tareas; estado pendientes, hechas o todas) o entradas del diario (donde: diario; desde y hasta AAAA-MM-DD). consulta opcional filtra por palabras.', 'donde', { tareas: 'buscar_tareas', diario: 'buscar_diario' }, { consulta: { type: 'string' }, estado: { type: 'string', enum: ['pendientes', 'hechas', 'todas'] }, desde: { type: 'string' }, hasta: { type: 'string' } }));
  if (all.has('radar_norma')) {
    out.push(group('contador', `Herramientas del contador. consulta: «radar» (una norma: notas que la citan, artículos, señales de derogación o cambio, vigencias futuras y alertas; requiere norma, p. ej. «Ley 21.713» o «LIR»), «contradicciones» (datos distintos entre notas), «alertas» (alertas normativas abiertas), «calendario» (vencimientos de los próximos días), «por_revisar» (notas con la vigencia por revisar)${all.has('calcular') ? ', «clientes» (lista), «cliente» (ficha; requiere cliente), «calcular» (tipo: art53, iusc, apv, finiquito o conversion; datos: sus campos; si faltan, la respuesta dice cuáles) o «informe» (abre el informe al cliente para revisarlo; cliente, dias, observaciones)' : ''}.`, 'consulta', { radar: 'radar_norma', contradicciones: 'contradicciones', alertas: 'alertas_abiertas', calendario: 'calendario', por_revisar: 'notas_por_revisar', ...(all.has('calcular') ? { clientes: 'clientes_lista', cliente: 'cliente_ficha', calcular: 'calcular', informe: 'informe_cliente' } : {}) }, { norma: { type: 'string' }, dias: { type: 'number' }, meses: { type: 'number' }, cliente: { type: 'string' }, tipo: { type: 'string' }, datos: { type: 'object' }, observaciones: { type: 'string' } }));
  }
  const outside = Object.fromEntries([['internet', 'buscar_en_internet'], ['pagina', 'leer_pagina'], ['drive', 'buscar_en_drive'], ['archivo_drive', 'leer_archivo_drive']].filter(([, n]) => all.has(n)));
  if (Object.keys(outside).length) {
    out.push(group('buscar_fuera', `Busca fuera de la bóveda (solo cuando corresponda según las reglas). donde: ${[outside.internet && '«internet» (objetivo y 2 o 3 consultas cortas; devuelve resultados con url, fecha, si es oficial y extracto)', outside.pagina && '«pagina» (url y objetivo: lee una página concreta)', outside.drive && '«drive» (consulta: busca archivos del Google Drive; solo_titulo opcional)', outside.archivo_drive && '«archivo_drive» (id de un archivo de Drive: lee su contenido)'].filter(Boolean).join(', ')}.`, 'donde', outside, { objetivo: { type: 'string' }, consultas: { type: 'array', items: { type: 'string' } }, url: { type: 'string' }, consulta: { type: 'string' }, solo_titulo: { type: 'boolean' }, id: { type: 'string' } }));
  }
  out.push(...pick('abrir_vista'), kataEditTool(), kataLinkTool(), kataOrganizeTool());
  out.push(group('proponer', 'Propone una acción que la persona aprueba con un botón (no se hace sola). accion: «tarea» (titulo, fecha, hora, prioridad), «nota» (titulo, contenido en Markdown, carpeta, moc), «alerta» (texto y nota afectada), «evento» en Google Calendar (titulo, fecha, hora, minutos, detalle), «recordar» en la memoria (hecho, seccion), «propiedad» (notas, propiedad, valor; vacío la quita) o «revisadas» (notas).', 'accion', { tarea: 'crear_tarea', nota: 'crear_nota', alerta: 'agregar_alerta', evento: 'agendar', recordar: 'recordar', propiedad: 'cambiar_propiedad', revisadas: 'marcar_revisadas' }, {
    titulo: { type: 'string' }, contenido: { type: 'string' }, carpeta: { type: 'string' }, moc: { type: 'string' }, fecha: { type: 'string', description: 'AAAA-MM-DD' }, hora: { type: 'string', description: 'HH:MM' }, prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] }, minutos: { type: 'number' }, detalle: { type: 'string' }, texto: { type: 'string' }, nota: { type: 'string' }, hecho: { type: 'string' }, seccion: { type: 'string' }, notas: { type: 'array', items: { type: 'string' } }, propiedad: { type: 'string' }, valor: { type: 'string' },
  }));
  out.push(group('crear_documento', 'Propone crear un documento fuera de las notas (se aprueba con un botón). tipo: «pdf» descargable (titulo, contenido en Markdown, para, firma, guardar_nota), «doc» de Google Docs en el Drive (titulo, contenido, para, firma), «hoja» de cálculo (titulo, columnas, filas; destino «drive» = Google Sheets o «csv» = descarga) o «correo»: un borrador de Gmail que nunca se envía solo (destinatarios, asunto, cuerpo en texto simple).', 'tipo', { pdf: 'crear_pdf', doc: 'crear_doc', hoja: 'crear_hoja', correo: 'crear_borrador' }, {
    titulo: { type: 'string' }, contenido: { type: 'string' }, para: { type: 'string' }, firma: { type: 'boolean' }, guardar_nota: { type: 'boolean' }, columnas: { type: 'array', items: { type: 'string' } }, filas: { type: 'array', items: { type: 'array' } }, destino: { type: 'string', enum: ['drive', 'csv'] }, destinatarios: { type: 'array', items: { type: 'string' } }, asunto: { type: 'string' }, cuerpo: { type: 'string' },
  }));
  // En el grupo, los destinatarios del correo van en «destinatarios» (en el documento, «para» es un texto).
  const docs = out.at(-1);
  const docsRun = docs.execute;
  docs.execute = (input = {}) => docsRun(input.tipo === 'correo' ? { ...input, para: input.destinatarios || [] } : input);
  out.push(group('crear_visual', 'Propone crear algo visual (se aprueba con un botón). tipo: «tablero» kanban (nombre, agrupar por una propiedad, columnas, mostrar, origen), «base» (nombre, carpeta, propiedades, tablero_por, fecha, icono), «diagrama» en Ideas y mapas (titulo, esquema como lista con sangría de dos espacios, forma: mindmap, radial, org, outline, fishbone, process, timeline, matrix, pyramid, concept, flow, venn, cycle, funnel o radar), «lienzo» (titulo, notas, textos, conexiones [{desde, hasta, etiqueta}] por índice) o «dibujo» editable (titulo; forma «flujo» con pasos —un paso que termina en «?» es una decisión— o «libre» con elementos {forma, x, y, ancho, alto, texto} y flechas [[desde, hasta]]).', 'tipo', { tablero: 'crear_tablero', base: 'crear_base', diagrama: 'crear_diagrama', lienzo: 'crear_lienzo', dibujo: 'crear_dibujo' }, {
    nombre: { type: 'string' }, titulo: { type: 'string' }, origen: KATA_SRC_SCHEMA, agrupar: { type: 'string' }, columnas: { type: 'array', items: { type: 'string' } }, mostrar: { type: 'array', items: { type: 'string' } }, carpeta: { type: 'string' }, propiedades: { type: 'array', items: { type: 'string' } }, tablero_por: { type: 'string' }, fecha: { type: 'string' }, icono: { type: 'string' }, esquema: { type: 'string' }, forma: { type: 'string' }, notas: { type: 'array', items: { type: 'string' } }, textos: { type: 'array', items: { type: 'string' } }, conexiones: { type: 'array', items: { type: 'object' } }, pasos: { type: 'array', items: { type: 'string' } }, elementos: { type: 'array', items: { type: 'object' } }, flechas: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
  }));
  // «forma» del diagrama y del dibujo va al campo que espera cada herramienta.
  const visual = out.at(-1);
  const visualRun = visual.execute;
  visual.execute = (input = {}) => {
    const i = { ...input };
    if (i.tipo === 'diagrama' && i.forma && !i.tipo_diagrama) i.tipoDiagrama = i.forma;
    return visualRun(i);
  };
  out.push(kataCommandTool());
  return out.slice(0, Math.max(1, max));
}

// ---------- Documentos: PDF, Google Docs, hojas de cálculo y borradores de Gmail ----------
// El documento se arma en Markdown (título, fecha, destinatario, cuerpo y firma) y sale como PDF
// (el mismo generador de «Exportar a PDF»), como Google Doc o como hoja en el Drive (el conector de
// Google Drive convierte el HTML o el CSV al subirlo) o como borrador de Gmail (nunca se envía solo).
// Lo que va al Drive queda en la carpeta «Kataleya» si existe; si no, en «Mi unidad».
const kataEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// La firma es opcional: solo la que la persona configuró en Ajustes y solo si queda marcada en la tarjeta.
function kataDocMarkdown(i, withFirma = false) {
  const fecha = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  const firma = withFirma && typeof firmaReady === 'function' && firmaReady() ? firmaMarkdown() : '';
  return [`# ${String(i.titulo || 'Documento')}`, `*${fecha}${i.para ? ` · Para: ${i.para}` : ''}*`, '', String(i.contenido || ''), firma ? `\n---\n${firma}` : ''].join('\n');
}
// Valor inicial de la casilla: lo que sugiere Kataleya o, si no dice, la preferencia de Ajustes.
const kataFirmaInitial = (v) => (typeof firmaReady === 'function' && firmaReady() ? (typeof v === 'boolean' ? v : firmaDefault()) : false);
function kataFirmaToggle(a) {
  const ready = typeof firmaReady === 'function' && firmaReady();
  const box = el('input', { type: 'checkbox', checked: !!a.firma && ready, disabled: !ready });
  box.addEventListener('change', () => (a.firma = box.checked));
  return el('label', { className: 'kata-firma', title: ready ? 'Tu firma de Ajustes › Notas › Firma de documentos' : 'Configura tu firma en Ajustes › Notas › Firma de documentos' }, [box, ready ? ' ✍️ Incluir mi firma' : ' ✍️ Sin firma configurada']);
}
const kataDocHtml = (md) => `<!doctype html><html><head><meta charset="utf-8"></head><body>${renderMd(md, { noTasks: true, noExternalImages: true }).replace(/<a [^>]*class="[^"]*wikilink[^"]*"[^>]*>(.*?)<\/a>/g, '$1')}</body></html>`;
async function kataDriveFolder() {
  const r = await kataMcp(KATA_DRIVE, 'search_files', { query: "title = 'Kataleya' and mimeType = 'application/vnd.google-apps.folder' and trashed = false", pageSize: 1, excludeContentSnippets: true }).catch(() => null);
  return r?.files?.[0]?.id || null;
}
async function kataDriveUpload(title, text, mime) {
  const parentId = await kataDriveFolder();
  const r = await kataMcp(KATA_DRIVE, 'create_file', { title, textContent: text, contentMimeType: mime, ...(parentId ? { parentId } : {}) });
  return { url: /^https:\/\//.test(r?.viewUrl || '') ? r.viewUrl : null, folder: parentId ? 'Kataleya' : 'Mi unidad' };
}
const kataOpenUrl = (u) => u && /^https:\/\//.test(u) && window.open(u, '_blank', 'noopener');
function kataCsv(cols, rows) {
  const cell = (v) => {
    const t = String(v ?? '');
    return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols, ...rows].filter((r) => Array.isArray(r) && r.length).map((r) => r.map(cell).join(',')).join('\r\n');
}

// ---------- Editar notas, organizar y usar comandos de la app ----------
// Kataleya hace lo que haría la persona en la app, siempre como propuesta con vista previa:
// · editar_nota: reemplazar un fragmento exacto, agregar texto (al inicio, al final o bajo un título),
//   reescribir la nota, renombrarla, moverla o mandarla a la papelera. La versión anterior queda en el
//   historial de la nota (antes y después del cambio).
// · organizar: completar, editar o borrar tareas, marcar hábitos, crear proyectos, anotar ideas,
//   escribir en el diario e iniciar un Pomodoro.
// · comando: listar y ejecutar cualquier acción de la paleta de comandos (Ctrl+P).
const KATA_PERSONAL = /(^|\/)(personal|estoic|mis\b)|ensayo/i;
const kataIsPersonal = (n) => KATA_PERSONAL.test(n.path) || /^ensayo$/i.test(propOf(n, 'tipo'));

// Diferencias por líneas (para la vista previa): [{ t: ' '|'-'|'+', l }].
function kataDiff(a, b) {
  const A = a.split('\n');
  const B = b.split('\n');
  if (A.length * B.length > 250000) return [...A.map((l) => ({ t: '-', l })), ...B.map((l) => ({ t: '+', l }))];
  const dp = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) (out.push({ t: ' ', l: A[i] }), i++, j++);
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: '-', l: A[i++] });
    else out.push({ t: '+', l: B[j++] });
  }
  while (i < A.length) out.push({ t: '-', l: A[i++] });
  while (j < B.length) out.push({ t: '+', l: B[j++] });
  // Solo los cambios con dos líneas de contexto.
  const keep = new Set();
  out.forEach((d, k) => d.t !== ' ' && [-2, -1, 0, 1, 2].forEach((x) => keep.add(k + x)));
  const res = [];
  out.forEach((d, k) => {
    if (keep.has(k)) res.push(d);
    else if (res.length && res[res.length - 1].t !== '…') res.push({ t: '…', l: '' });
  });
  return res;
}

// Aplica un nuevo texto a una nota (con historial antes y después).
function kataWriteNote(note, body) {
  flushNoteSave();
  if (typeof snapshotNote === 'function') snapshotNote(note, { force: true });
  note.body = body;
  note.updatedAt = Date.now();
  dataRev++;
  save();
  if (typeof snapshotNote === 'function') snapshotNote(note, { force: true });
  renderAll();
}

// makeBody(texto) → texto nuevo. Al aprobar se vuelve a calcular sobre el texto de ese momento, así
// varias propuestas sobre la misma nota se aplican una tras otra.
function kataProposeEdit(note, label, makeBody) {
  const before = note.body;
  const newBody = makeBody(before);
  const id = kataPropose(`${label}${kataIsPersonal(note) ? ' ⚠️ nota personal' : ''}`, `[[${baseName(note.path)}]]`, () => {
    const cur = noteById(note.id);
    if (!cur) throw new Error('La nota ya no existe');
    kataWriteNote(cur, cur.body === before ? newBody : makeBody(cur.body));
    return { texto: 'Nota actualizada (la versión anterior queda en su historial)', abrir: () => openNote(cur) };
  });
  const a = kata.pending.get(id.propuesta);
  if (a) a.diff = kataDiff(before, newBody);
  kataRender();
  return { ...id, cambios: (a?.diff || []).filter((d) => d.t !== ' ' && d.t !== '…').length };
}

function kataAppend(body, text, { under = '', where = 'final' } = {}) {
  const lines = body.split('\n');
  const add = String(text).replace(/\s+$/, '').split('\n');
  if (under) {
    const h = lines.findIndex((l) => /^#{1,6}\s/.test(l) && fold(l.replace(/^#+\s*/, '')).includes(fold(under)));
    if (h < 0) throw new Error(`No encontré el título «${under}» en la nota`);
    const level = lines[h].match(/^#+/)[0].length;
    let i = h + 1;
    while (i < lines.length && !(/^#{1,6}\s/.test(lines[i]) && lines[i].match(/^#+/)[0].length <= level)) i++;
    while (i > h + 1 && !lines[i - 1].trim()) i--;
    lines.splice(i, 0, ...add);
    return lines.join('\n');
  }
  if (where === 'inicio') {
    const { end } = parseProps(body);
    let i = end + 1;
    if (/^#\s/.test(lines[i] || '')) i++;
    lines.splice(i, 0, '', ...add, '');
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  return `${body.replace(/\s+$/, '')}\n\n${add.join('\n')}\n`;
}

function kataEditTool() {
  return {
    name: 'editar_nota',
    description: 'Propone editar una nota existente (la persona ve los cambios y aprueba). accion: «reemplazar» (buscar: el texto EXACTO que hay, poner: el nuevo; todas: si aparece varias veces), «agregar» (texto; bajo_titulo para insertarlo al final de esa sección, o posicion inicio/final), «reescribir» (contenido completo; solo si la persona lo pide), «renombrar» (nuevo_nombre), «mover» (carpeta) o «papelera». Lee la nota antes. Nunca edites notas personales, de estoicismo ni ensayos sin que la persona lo pida.',
    inputSchema: { type: 'object', properties: { accion: { type: 'string', enum: ['reemplazar', 'agregar', 'reescribir', 'renombrar', 'mover', 'papelera'] }, nota: { type: 'string' }, buscar: { type: 'string' }, poner: { type: 'string' }, todas: { type: 'boolean' }, texto: { type: 'string' }, bajo_titulo: { type: 'string' }, posicion: { type: 'string', enum: ['inicio', 'final'] }, contenido: { type: 'string' }, nuevo_nombre: { type: 'string' }, carpeta: { type: 'string' } }, required: ['accion', 'nota'] },
    execute: (i) => {
      const n = kataNote(i.nota);
      const name = baseName(n.path);
      if (i.accion === 'reemplazar') {
        const find = String(i.buscar || '');
        if (!find) throw new Error('Falta «buscar»');
        const count = n.body.split(find).length - 1;
        if (!count) throw new Error('No encontré ese texto exacto en la nota: léela y copia el fragmento tal cual');
        if (count > 1 && !i.todas) throw new Error(`Ese texto aparece ${count} veces: agrega más contexto o usa todas: true`);
        return kataProposeEdit(n, `✏️ Reemplazar en «${name}»`, (body) => {
          if (!body.includes(find)) throw new Error('El texto a reemplazar ya no está en la nota');
          return i.todas ? body.split(find).join(String(i.poner ?? '')) : body.replace(find, () => String(i.poner ?? ''));
        });
      }
      if (i.accion === 'agregar') return kataProposeEdit(n, `➕ Agregar a «${name}»${i.bajo_titulo ? ` (bajo «${i.bajo_titulo}»)` : ''}`, (body) => kataAppend(body, String(i.texto || ''), { under: String(i.bajo_titulo || ''), where: i.posicion }));
      if (i.accion === 'reescribir') {
        let body = String(i.contenido || '');
        if (!body.trim()) throw new Error('Falta el contenido');
        const { end } = parseProps(n.body);
        if (end > 0 && !/^---\n/.test(body)) body = `${n.body.split('\n').slice(0, end + 1).join('\n')}\n${body}`;
        return kataProposeEdit(n, `📝 Reescribir «${name}»`, () => body);
      }
      if (i.accion === 'renombrar') {
        const to = cleanName(String(i.nuevo_nombre || ''));
        if (!to) throw new Error('Falta el nuevo nombre');
        return kataPropose(`🏷 Renombrar «${name}» → «${to}»`, 'los enlaces [[…]] se actualizan solos', () => {
          renameNote(n, to);
          renderAll();
          return { texto: 'Nota renombrada', abrir: () => openNote(n) };
        });
      }
      if (i.accion === 'mover') {
        const folder = String(i.carpeta || '').split('/').map(cleanName).filter(Boolean).join('/');
        return kataPropose(`📁 Mover «${name}»`, `a ${folder || '(raíz)'}`, () => {
          if (folder && !state.folders.includes(folder)) state.folders.push(folder);
          moveNoteToFolder(n, folder);
          renderAll();
          return { texto: 'Nota movida', abrir: () => openNote(n) };
        });
      }
      if (i.accion === 'papelera') {
        return kataPropose(`🗑 Mandar «${name}» a la papelera${kataIsPersonal(n) ? ' ⚠️ nota personal' : ''}`, 'se recupera desde la Papelera durante 30 días', () => {
          deleteNote(n);
          return { texto: 'Nota en la papelera (se puede deshacer)', abrir: () => showView('trash') };
        });
      }
      throw new Error('accion no válida');
    },
  };
}

const kataFindTask = (q) => {
  const all = allTasks().concat(typeof noteTasks === 'function' ? noteTasks() : []).filter((t) => !t.done || true);
  const f = fold(String(q || ''));
  const exact = all.filter((t) => fold(t.title) === f);
  const hits = exact.length ? exact : all.filter((t) => fold(t.title).includes(f));
  if (!hits.length) throw new Error(`No encontré la tarea «${q}»`);
  if (hits.length > 1 && !exact.length) throw new Error(`Hay ${hits.length} tareas parecidas: ${hits.slice(0, 5).map((t) => `«${t.title}»`).join(', ')}. Dime el título exacto`);
  return hits[0];
};

function kataOrganizeTool() {
  return {
    name: 'organizar',
    description: 'Propone acciones de organización (la persona aprueba). accion: «completar_tarea» (tarea), «editar_tarea» (tarea; nuevo_titulo, fecha AAAA-MM-DD, hora HH:MM, prioridad), «borrar_tarea» (tarea), «marcar_habito» (habito; fecha opcional, hoy por defecto), «crear_proyecto» (nombre; fecha_limite), «anotar_idea» (texto, puede llevar #etiquetas), «escribir_diario» (texto; va a la nota diaria de hoy) o «iniciar_pomodoro».',
    inputSchema: { type: 'object', properties: { accion: { type: 'string', enum: ['completar_tarea', 'editar_tarea', 'borrar_tarea', 'marcar_habito', 'crear_proyecto', 'anotar_idea', 'escribir_diario', 'iniciar_pomodoro'] }, tarea: { type: 'string' }, nuevo_titulo: { type: 'string' }, fecha: { type: 'string' }, hora: { type: 'string' }, prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] }, habito: { type: 'string' }, nombre: { type: 'string' }, fecha_limite: { type: 'string' }, texto: { type: 'string' } }, required: ['accion'] },
    execute: (i) => {
      const a = i.accion;
      if (a === 'completar_tarea') {
        const t = kataFindTask(i.tarea);
        return kataPropose(`✅ Completar «${t.title}»`, t.due ? `📅 ${t.due}` : '', () => (toggleDone(t, true), renderAll(), { texto: 'Tarea completada' }));
      }
      if (a === 'borrar_tarea') {
        const t = kataFindTask(i.tarea);
        if (t.virtual) throw new Error('Es una casilla dentro de una nota: edítala con editar_nota');
        return kataPropose(`🗑 Borrar la tarea «${t.title}»`, '', () => (deleteTask(t), renderAll(), { texto: 'Tarea borrada (se puede deshacer)' }));
      }
      if (a === 'editar_tarea') {
        const t = kataFindTask(i.tarea);
        if (t.virtual) throw new Error('Es una casilla dentro de una nota: edítala con editar_nota');
        const ch = [i.nuevo_titulo && `título «${i.nuevo_titulo}»`, /^\d{4}-\d{2}-\d{2}$/.test(i.fecha || '') && `📅 ${i.fecha}`, /^\d{2}:\d{2}$/.test(i.hora || '') && `⏰ ${i.hora}`, i.prioridad && `prioridad ${i.prioridad}`].filter(Boolean);
        if (!ch.length) throw new Error('No hay cambios');
        return kataPropose(`✏️ Editar «${t.title}»`, ch.join(' · '), () => {
          if (i.nuevo_titulo) t.title = String(i.nuevo_titulo);
          if (/^\d{4}-\d{2}-\d{2}$/.test(i.fecha || '')) t.due = i.fecha;
          if (/^\d{2}:\d{2}$/.test(i.hora || '')) t.time = i.hora;
          if (i.prioridad) t.priority = { alta: 3, media: 2, baja: 1 }[i.prioridad] || t.priority;
          save();
          renderAll();
          return { texto: 'Tarea editada' };
        });
      }
      if (a === 'marcar_habito') {
        const f = fold(String(i.habito || ''));
        const h = state.habits.filter((x) => !x.archived).find((x) => fold(x.name) === f) || state.habits.filter((x) => !x.archived).find((x) => fold(x.name).includes(f));
        if (!h) throw new Error(`No encontré el hábito «${i.habito}». Hábitos: ${state.habits.filter((x) => !x.archived).map((x) => x.name).join(', ') || 'ninguno'}`);
        const day = /^\d{4}-\d{2}-\d{2}$/.test(i.fecha || '') ? i.fecha : dateKey();
        return kataPropose(`🔥 ${h.log[day] ? 'Desmarcar' : 'Marcar'} «${h.name}»`, day, () => (toggleHabit(h, day), save(), renderAll(), { texto: 'Hábito actualizado' }));
      }
      if (a === 'crear_proyecto') {
        const name = String(i.nombre || '').trim();
        if (!name) throw new Error('Falta el nombre');
        return kataPropose(`📁 Proyecto «${name}»`, i.fecha_limite ? `fecha límite ${i.fecha_limite}` : '', () => {
          const used = state.projects.map((p) => p.color);
          const p = { id: uid(), name, desc: '', status: 'active', deadline: /^\d{4}-\d{2}-\d{2}$/.test(i.fecha_limite || '') ? i.fecha_limite : null, color: PROJECT_COLORS.find((c) => !used.includes(c)) || PROJECT_COLORS[0], manual: null, milestone: 0, createdAt: Date.now() };
          state.projects.push(p);
          logEvent('project', `Nuevo proyecto: ${name}`, { ref: p.id });
          save();
          renderAll();
          return { texto: 'Proyecto creado', abrir: () => showView('projects') };
        });
      }
      if (a === 'anotar_idea') {
        const raw = String(i.texto || '').trim();
        if (!raw) throw new Error('Falta el texto');
        return kataPropose('💡 Idea', raw.slice(0, 120), () => {
          const idea = { id: uid(), ...extractTags(raw), pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
          state.ideas.push(idea);
          logEvent('idea', idea.text.split('\n')[0], { ref: idea.id });
          save();
          renderAll();
          return { texto: 'Idea anotada', abrir: () => showView('ideas') };
        });
      }
      if (a === 'escribir_diario') {
        const text = String(i.texto || '').trim();
        if (!text) throw new Error('Falta el texto');
        return kataPropose('📓 Entrada del diario', text.slice(0, 120), () => {
          const entry = { id: uid(), date: dateKey(), createdAt: Date.now(), updatedAt: Date.now(), kind: 'free', mood: null, text };
          const note = journalToNote(entry);
          if (!note) state.journal.push(entry);
          save();
          renderAll();
          return { texto: 'Escrito en el diario de hoy', abrir: () => (note ? openNote(note) : showView('journal')) };
        });
      }
      if (a === 'iniciar_pomodoro') return kataPropose('🍅 Iniciar un Pomodoro', '', () => (showView('timer'), timer.endsAt || startTimer(), { texto: 'Pomodoro en marcha' }));
      throw new Error('accion no válida');
    },
  };
}

// Paleta de comandos: todo lo que la app sabe hacer, por su nombre.
function kataCommandTool() {
  const list = () => (typeof commands === 'function' ? commands() : []).filter((c) => c && c.label && typeof c.action === 'function' && !c.disabled);
  return {
    name: 'comando',
    description: 'Usa la paleta de comandos de la app (Ctrl+P), que tiene casi todo lo que la app sabe hacer (exportar a PDF, presentar, plegar títulos, ordenar formato, crear desde plantilla, ir a una sección…). accion «listar» (filtro opcional: palabras) devuelve los nombres; «ejecutar» (nombre exacto de la lista) propone ejecutarlo y la persona lo aprueba. Los comandos de nota actúan sobre la nota abierta.',
    inputSchema: { type: 'object', properties: { accion: { type: 'string', enum: ['listar', 'ejecutar'] }, filtro: { type: 'string' }, nombre: { type: 'string' } }, required: ['accion'] },
    execute: (i) => {
      if (i.accion === 'listar') {
        const f = fold(String(i.filtro || ''));
        return list().map((c) => c.label).filter((l) => !f || f.split(/\s+/).every((w) => fold(l).includes(w))).slice(0, 80);
      }
      const name = String(i.nombre || '');
      const cmd = list().find((c) => c.label === name) || list().find((c) => fold(c.label) === fold(name));
      if (!cmd) throw new Error(`No existe el comando «${name}»: usa listar primero`);
      const note = activeNote();
      return kataPropose(`⌘ ${cmd.label}`, note ? `sobre la nota abierta: ${baseName(note.path)}` : '', () => {
        const fresh = list().find((c) => c.label === cmd.label) || cmd;
        fresh.action({ newTab: false });
        return { texto: 'Comando ejecutado' };
      });
    },
  };
}

// ---------- Enlazar notas ----------
// relacionar (sección «## Relacionadas», en uno o ambos sentidos) · menciones (convierte en [[enlace]]
// la primera mención de otras notas dentro de esta) · entrantes (lo mismo, pero en las notas que
// mencionan a esta) · moc (cuelga la nota de su MOC y le pone la propiedad moc) · sugerir (qué
// convendría enlazar: menciones, misma norma, parecidas) · rotos (enlaces que no llevan a ninguna nota,
// con la nota más parecida) · reparar (cambia un enlace roto por el bueno). Todo con vista de cambios.
const kataEscRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Convierte la primera mención de `title` (fuera de enlaces, títulos, código y propiedades) en [[title]].
function kataLinkFirst(body, title) {
  const lines = body.split('\n');
  const { end } = parseProps(body);
  const re = new RegExp(`(?<![\\p{L}\\p{N}\\[])(${kataEscRe(title)})(?![\\p{L}\\p{N}])`, 'iu');
  let inCode = false;
  for (let i = end + 1; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) inCode = !inCode;
    if (inCode || /^#{1,6}\s/.test(lines[i])) continue;
    const parts = lines[i].split(/(!?\[\[[^\]\n]+?\]\]|`[^`]*`|https?:\/\/\S+)/);
    let done = false;
    const next = parts.map((p, k) => (done || k % 2 ? p : p.replace(re, (m) => ((done = true), `[[${title}${m !== title ? `|${m}` : ''}]]`)))).join('');
    if (done) {
      lines[i] = next;
      return lines.join('\n');
    }
  }
  return body;
}
const kataLinksTo = (n, target) => linksIn(n.body).some((l) => l.target && findNoteByName(l.target)?.id === target.id);
// Títulos que se pueden buscar como menciones (no fechas, no muy cortos).
// Solo títulos específicos (dos palabras o más, 10 letras o más, o con un número), para no enlazar
// palabras sueltas como «Capital» o «Renta»; uno por nombre, con su expresión ya preparada.
const kataTitles = () => gvCached('kata-titles', () => {
  const seen = new Set();
  return gvLive().map((n) => ({ n, t: baseName(n.path) }))
    .filter(({ t }) => !/^\d{4}-\d{2}-\d{2}/.test(t) && t.length >= 5 && (/\s\S/.test(t.trim()) || t.length >= 10 || /\d/.test(t)))
    .filter(({ t }) => !seen.has(fold(t)) && seen.add(fold(t)))
    .sort((a, b) => b.t.length - a.t.length)
    .map((x) => ({ ...x, re: new RegExp(`(?<![\\p{L}\\p{N}])${kataEscRe(x.t)}(?![\\p{L}\\p{N}])`, 'iu'), f: fold(x.t) }));
});

function kataAddRelated(body, titles) {
  const lines = body.split('\n');
  const h = lines.findIndex((l) => /^#{2,6}\s+(?:🔗\s*)?(Relacionadas|Notas relacionadas|Ver también)\s*$/i.test(l));
  const add = titles.map((t) => `- [[${t}]]`);
  if (h < 0) return `${body.replace(/\s+$/, '')}\n\n## Relacionadas\n${add.join('\n')}\n`;
  let i = h + 1;
  while (i < lines.length && !/^#{1,6}\s/.test(lines[i])) i++;
  while (i > h + 1 && !lines[i - 1].trim()) i--;
  lines.splice(i, 0, ...add);
  return lines.join('\n');
}

function kataLinkTool() {
  return {
    name: 'enlazar',
    description: 'Enlaza notas (cada cambio se aprueba viendo la diferencia). accion: «relacionar» (nota, con: títulos; ambos_sentidos opcional: agrega [[…]] en la sección Relacionadas), «menciones» (nota; hacia opcional: convierte en [[enlace]] las menciones de otras notas dentro de esta), «entrantes» (nota: convierte en enlace las menciones de esta nota en las demás), «moc» (nota, moc, seccion opcional: la cuelga de su MOC), «sugerir» (nota: qué convendría enlazar), «rotos» (nota opcional: enlaces que no llevan a ninguna nota, con la más parecida) o «reparar» (nota, roto, por).',
    inputSchema: { type: 'object', properties: { accion: { type: 'string', enum: ['relacionar', 'menciones', 'entrantes', 'moc', 'sugerir', 'rotos', 'reparar'] }, nota: { type: 'string' }, con: { type: 'array', items: { type: 'string' } }, ambos_sentidos: { type: 'boolean' }, hacia: { type: 'array', items: { type: 'string' } }, moc: { type: 'string' }, seccion: { type: 'string' }, roto: { type: 'string' }, por: { type: 'string' } }, required: ['accion'] },
    execute: (i) => {
      const a = i.accion;
      if (a === 'rotos') {
        const scope = i.nota ? [kataNote(i.nota)] : gvLive();
        const out = [];
        let total = 0;
        scope.forEach((n) => linksIn(n.body).forEach((l) => {
          if (!l.target || /^(tarea|proyecto|idea|habito):/.test(l.target) || /^\d{4}-\d{2}-\d{2}$/.test(l.target) || (l.embed && /\.(png|jpe?g|gif|pdf|svg|webp)$/i.test(l.target)) || findNoteByName(l.target)) return;
          total++;
          if (out.length >= 40) return;
          const want = fold(l.target.split('/').pop());
          const best = want.length >= 4 && (kataTitles().find(({ f }) => f === want) || kataTitles().find(({ f }) => f.includes(want) || want.includes(f)));
          out.push({ nota: baseName(n.path), enlace: l.target, parecida: best ? best.t : null });
        }));
        return { total, primeros: out, nota: 'Muchos pueden ser notas por escribir (en los MOC): pregunta antes de repararlos.' };
      }
      const n = kataNote(i.nota);
      const name = baseName(n.path);
      if (a === 'sugerir') {
        const linked = new Set(linksIn(n.body).map((l) => l.target && findNoteByName(l.target)?.id).filter(Boolean));
        const text = gvBodyText(n).replace(WIKILINK_RE, ' ');
        const ft = fold(text);
        const mentions = kataTitles().filter(({ n: x, f, re }) => x.id !== n.id && !linked.has(x.id) && ft.includes(f) && re.test(text)).slice(0, 15).map(({ t }) => t);
        let sameNorm = [];
        if (typeof proIndex === 'function') {
          const keys = new Set(n.body.split('\n').flatMap((l) => proNormsIn(l, proProfile()).map((x) => x.key)));
          const score = new Map();
          proIndex().norms.forEach((e) => keys.has(e.key) && e.notes.size <= 60 && e.notes.forEach((_, id) => id !== n.id && !linked.has(id) && score.set(id, (score.get(id) || 0) + 1)));
          sameNorm = [...score].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([id, k]) => `${baseName(noteById(id)?.path || '')} (${plural(k, 'norma en común', 'normas en común')})`);
        }
        const similar = searchNotesForAI(name, 8).map((x) => x.titulo).filter((t) => t !== name && !mentions.includes(t)).slice(0, 6);
        const back = backlinksOf(n);
        return { ya_enlazadas: [...linked].map((id) => baseName(noteById(id)?.path || '')).slice(0, 30), menciones_sin_enlazar: mentions, misma_norma: sameNorm, parecidas: similar, la_mencionan_sin_enlace: back.unlinked.slice(0, 10).map((x) => baseName(x.note.path)), moc: propOf(n, 'moc') || null };
      }
      if (a === 'relacionar') {
        const others = (i.con || []).map(kataNote).filter((x) => x.id !== n.id);
        if (!others.length) throw new Error('Falta con qué notas enlazar');
        const fresh = others.filter((x) => !kataLinksTo(n, x));
        const res = [];
        if (fresh.length) res.push(kataProposeEdit(n, `🔗 Enlazar «${name}» con ${plural(fresh.length, 'nota', 'notas')}`, (body) => kataAddRelated(body, fresh.map((x) => baseName(x.path)))));
        if (i.ambos_sentidos) others.filter((x) => !kataLinksTo(x, n)).forEach((x) => res.push(kataProposeEdit(x, `🔗 Enlazar «${baseName(x.path)}» con «${name}»`, (body) => kataAddRelated(body, [name]))));
        if (!res.length) return { estado: 'ya estaban enlazadas' };
        return res;
      }
      if (a === 'menciones') {
        const linked = new Set(linksIn(n.body).map((l) => l.target && findNoteByName(l.target)?.id).filter(Boolean));
        const targets = i.hacia?.length ? i.hacia.map(kataNote).map((x) => baseName(x.path)) : kataTitles().filter(({ n: x }) => x.id !== n.id && !linked.has(x.id)).map(({ t }) => t);
        let body = n.body;
        const done = [];
        for (const t of targets) {
          const next = kataLinkFirst(body, t);
          if (next !== body) {
            body = next;
            done.push(t);
            if (done.length >= 25) break;
          }
        }
        if (!done.length) return { estado: 'no hay menciones sin enlazar' };
        return kataProposeEdit(n, `🔗 Enlazar ${plural(done.length, 'mención', 'menciones')} en «${name}»`, (cur) => done.reduce((b, t) => kataLinkFirst(b, t), cur));
      }
      if (a === 'entrantes') {
        const back = backlinksOf(n).unlinked.slice(0, 10);
        if (!back.length) return { estado: 'ninguna nota la menciona sin enlazarla' };
        return back.map(({ note: x }) => kataProposeEdit(x, `🔗 En «${baseName(x.path)}», enlazar «${name}»`, (body) => kataLinkFirst(body, name)));
      }
      if (a === 'moc') {
        const moc = kataNote(i.moc);
        const res = [];
        if (!kataLinksTo(moc, n)) res.push(kataProposeEdit(moc, `🧭 Agregar «${name}» al MOC «${baseName(moc.path)}»${i.seccion ? ` (bajo «${i.seccion}»)` : ''}`, (body) => kataAppend(body, `- [[${name}]]`, { under: String(i.seccion || '') })));
        if (gvClean(propOf(n, 'moc')).split('/').pop() !== baseName(moc.path)) res.push(kataPropose(`🏷 moc: [[${baseName(moc.path)}]]`, `en «${name}»`, () => (gvSetProps(n, [['moc', `[[${baseName(moc.path)}]]`]]), { texto: 'Propiedad moc puesta' })));
        return res.length ? res : { estado: 'ya está en ese MOC' };
      }
      if (a === 'reparar') {
        const bad = String(i.roto || '');
        const good = kataNote(i.por);
        const goodName = baseName(good.path);
        const re = new RegExp(`(!?)\\[\\[${kataEscRe(bad)}((?:#[^\\]|]*)?)(\\|[^\\]]*)?\\]\\]`, 'g');
        if (!re.test(n.body)) throw new Error(`No hay un enlace [[${bad}]] en la nota`);
        return kataProposeEdit(n, `🩹 Reparar [[${bad}]] → [[${goodName}]] en «${name}»`, (body) => body.replace(new RegExp(re.source, 'g'), (_, e, h, alias) => `${e}[[${goodName}${h || ''}${alias || ''}]]`));
      }
      throw new Error('accion no válida');
    },
  };
}

// ---------- Dibujos generados ----------
function kataShape(type, x, y, w, h, text, extra = {}) {
  const id = uid();
  const shape = xdNormalize({ id, type, x, y, width: w, height: h, roughness: 1, roundness: type === 'rectangle' ? { type: 3 } : null, backgroundColor: extra.bg || 'transparent', fillStyle: 'solid', strokeColor: extra.stroke || '#1e1e1e', boundElements: [] });
  const els = [shape];
  if (text) {
    const size = 20;
    const perLine = Math.max(6, Math.floor((w - 2 * XD_PAD - (type === 'diamond' ? w * 0.3 : 0)) / (size * 0.55)));
    const words = String(text).split(/\s+/);
    const lines = [];
    words.forEach((wd) => (lines.length && `${lines.at(-1)} ${wd}`.length <= perLine ? (lines[lines.length - 1] = `${lines.at(-1)} ${wd}`) : lines.push(wd)));
    const th = lines.length * size * 1.25;
    const t = xdNormalize({ id: uid(), type: 'text', x: x + XD_PAD, y: y + (h - th) / 2, width: w - 2 * XD_PAD, height: th, text: lines.join('\n'), originalText: String(text), fontSize: size, fontFamily: 1, textAlign: 'center', verticalAlign: 'middle', containerId: type === 'text' ? null : id, lineHeight: 1.25 });
    if (type === 'text') return [t];
    shape.boundElements.push({ id: t.id, type: 'text' });
    els.push(t);
  }
  return els;
}
function kataArrow(a, b) {
  const [x1, y1] = [a.x + a.width / 2, a.y + a.height];
  const [x2, y2] = [b.x + b.width / 2, b.y];
  const down = y2 > y1 + 4;
  const sx = down ? x1 : a.x + a.width;
  const sy = down ? y1 : a.y + a.height / 2;
  const ex = down ? x2 : b.x;
  const ey = down ? y2 : b.y + b.height / 2;
  const arrow = xdNormalize({ id: uid(), type: 'arrow', x: sx, y: sy, width: Math.abs(ex - sx), height: Math.abs(ey - sy), points: [[0, 0], [ex - sx, ey - sy]], endArrowhead: 'arrow', startArrowhead: null, startBinding: { elementId: a.id, focus: 0, gap: 6 }, endBinding: { elementId: b.id, focus: 0, gap: 6 } });
  a.boundElements.push({ id: arrow.id, type: 'arrow' });
  b.boundElements.push({ id: arrow.id, type: 'arrow' });
  return arrow;
}
async function kataDrawing(raw) {
  const i = { ...raw, tipo: raw.tipo === 'dibujo' ? raw.forma || (raw.elementos?.length ? 'libre' : 'flujo') : raw.tipo };
  const els = [];
  const shapes = [];
  if (i.tipo === 'libre' && Array.isArray(i.elementos) && i.elementos.length) {
    const map = { rectangulo: 'rectangle', 'rectángulo': 'rectangle', elipse: 'ellipse', rombo: 'diamond', texto: 'text' };
    i.elementos.slice(0, 60).forEach((e) => {
      const made = kataShape(map[fold(String(e.forma || e.tipo || 'rectangulo'))] || 'rectangle', Number(e.x) || 0, Number(e.y) || 0, Number(e.ancho) || 220, Number(e.alto) || 90, String(e.texto || ''));
      shapes.push(made[0]);
      els.push(...made);
    });
    (i.flechas || []).forEach(([a, b]) => shapes[a] && shapes[b] && shapes[a].type !== 'text' && shapes[b].type !== 'text' && els.push(kataArrow(shapes[a], shapes[b])));
  } else {
    const steps = (i.pasos || []).map(String).filter(Boolean).slice(0, 30);
    let y = 0;
    const title = kataShape('text', -60, -90, 400, 40, String(i.titulo));
    title[0].fontSize = 28;
    els.push(...title);
    steps.forEach((s, k) => {
      const dec = /\?\s*$/.test(s);
      const w = dec ? 300 : 280;
      const h = dec ? 140 : Math.max(80, 26 * Math.ceil(s.length / 18) + 30);
      const made = kataShape(dec ? 'diamond' : k === 0 || k === steps.length - 1 ? 'ellipse' : 'rectangle', 140 - w / 2, y, w, h, s, { bg: dec ? '#fff3bf' : k === 0 || k === steps.length - 1 ? '#d3f9d8' : '#e7f5ff' });
      shapes.push(made[0]);
      els.push(...made);
      y += h + 60;
    });
    for (let k = 1; k < shapes.length; k++) els.push(kataArrow(shapes[k - 1], shapes[k]));
  }
  if (!els.length) throw new Error('El dibujo no tiene elementos');
  await xdLoadFont();
  const blob = await xdRenderBlob(els, '#ffffff');
  const { data, type, width, height } = await compressImage(new File([blob], 'dibujo.png', { type: 'image/png' }));
  const scene = { type: 'excalidraw', version: 2, elements: JSON.parse(JSON.stringify(els)), appState: { viewBackgroundColor: '#ffffff', gridSize: null } };
  const rec = { id: uid(), name: 'Dibujo', type, data, width, height, createdAt: Date.now(), drawing: scene };
  await putFile(rec);
  xdDrawingIds.add(rec.id);
  if (!state.folders.includes('Dibujos')) state.folders.push('Dibujos');
  const note = createNote({ folder: 'Dibujos', title: String(i.titulo).slice(0, 80), body: `Dibujo hecho por Kataleya el ${dateKey()}. Tócalo para editarlo.\n\n![Dibujo](img:${rec.id})\n`, open: false, edit: false, log: false });
  if (typeof scheduleFilesSync === 'function') scheduleFilesSync();
  renderAll();
  return note;
}

// ---------- Conversación ----------
async function kataSend(question) {
  const q = String(question || '').trim();
  if (!q || kata.busy) return;
  if (!aiReady()) return kataRender();
  kata.busy = true;
  kata.ctl = new AbortController();
  kata.turns.push({ role: 'user', content: q });
  const answer = { role: 'assistant', content: '' };
  kata.turns.push(answer);
  kataRender();
  kataProgress('Pensando…');
  const history = kata.turns.slice(0, -1).filter((t) => t.content).slice(-10).map((t) => ({ role: t.role, content: t.content }));
  const limits = await ai.sample.limits().catch(() => null);
  const maxTools = limits?.tools ? Number(limits.tools.maxCount) || 12 : 0;
  const onText = ({ text: t }) => {
    answer.content = t;
    kataProgress('');
    const b = $('#kata-messages .kata-msg.assistant:last-of-type .kata-md');
    if (b) b.innerHTML = renderMd(t, { noTasks: true, noExternalImages: true });
  };
  const plain = () => ai.sample([{ role: 'user', content: `${kataRules()}\n\n${contextFor(q)}\n\n(Ahora no puedes usar herramientas: responde con lo que hay arriba y, si hace falta crear algo, explica cómo hacerlo.)` }, ...history], { signal: kata.ctl.signal, cache: false, onText });
  try {
    let res;
    if (maxTools) {
      try {
        res = await ai.sample([{ role: 'user', content: kataRules() }, ...history], { signal: kata.ctl.signal, tools: kataTools(maxTools), onText });
      } catch (e) {
        // Si fallan las herramientas (no el permiso ni el límite de uso), responde igual sin ellas.
        if (!['invalid_request', 'transform_error', 'tools_unavailable', 'prompt_too_large'].includes(e?.code) || answer.content) throw e;
        console.warn('Kataleya: herramientas rechazadas', e?.code, e?.message);
        kata.lastToolError = `${e?.code}: ${e?.message || ''}`;
        kataProgress('Respondiendo sin herramientas…');
        res = await plain();
        answer.note = 'Respondí sin mis herramientas (no pude usarlas en esta vista).';
      }
    } else res = await plain();
    answer.content = res.text;
  } catch (e) {
    answer.content = e?.text || answer.content;
    console.warn('Kataleya:', e?.code, e?.message);
    if (e?.code !== 'cancelled') answer.error = `${aiErrorText(e)}${e?.code ? ` (código: ${e.code})` : ''}`;
    if (AI_FATAL.includes(e?.code)) {
      ai.unavailable = true;
      renderAIControls();
    }
  } finally {
    kata.busy = false;
    kata.ctl = null;
    kataProgress('');
    kataRender();
  }
}

async function kataApprove(id) {
  const a = kata.pending.get(id);
  if (!a || a.status !== 'pending') return;
  a.status = 'running';
  kataRender();
  try {
    a.result = (await a.run(a)) || { texto: 'Hecho' };
    a.status = 'done';
  } catch (e) {
    a.status = 'error';
    a.result = { texto: e?.message || 'No se pudo hacer' };
  }
  kataRender();
}
function kataReject(id) {
  const a = kata.pending.get(id);
  if (!a || a.status !== 'pending') return;
  a.status = 'rejected';
  kataRender();
}

function kataSaveConversation() {
  if (!kata.turns.some((t) => t.role === 'assistant' && t.content)) return;
  if (!state.folders.includes('Conversaciones')) state.folders.push('Conversaciones');
  const d = new Date();
  const firstQ = kata.turns.find((t) => t.role === 'user')?.content || 'Conversación';
  const body = kata.turns.map((t) => {
    if (t.role === 'user') return `> **Tú:** ${t.content}`;
    const acts = (t.actions || []).map((id) => kata.pending.get(id)).filter(Boolean).map((a) => `- ${a.status === 'done' ? '✅' : a.status === 'rejected' ? '❌' : '⏳'} ${a.label}${a.detail ? ` · ${a.detail}` : ''}`);
    return `**Kataleya:** ${t.content}${acts.length ? `\n\n${acts.join('\n')}` : ''}`;
  }).join('\n\n');
  const note = createNote({ folder: 'Conversaciones', title: `Kataleya ${dateKey(d)} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')} - ${firstQ.replace(/[\\/:*?"<>|#^[\]]/g, '').slice(0, 50)}`, body: `---\ntipo: conversación\nfecha: ${dateKey(d)}\nmodo: ${kataMode()}\n---\n${body}\n`, open: false, edit: false, log: false });
  showToastMessage('Conversación guardada en «Conversaciones».');
  return note;
}

// ---------- Interfaz ----------
const KATA_QUICK = {
  general: ['¿Qué tengo pendiente esta semana?', 'Resume la nota abierta', '¿Qué notas debería revisar hoy?', 'Hazme un tablero de mis notas por estado'],
  contador: ['¿Qué vence en los próximos 15 días?', '¿Qué dice la bóveda sobre el art. 107 LIR?', '¿Salió algo nuevo de mis alertas abiertas? Búscalo en internet', 'Hazme un PDF para un cliente explicando el cambio del art. 107 LIR', 'Arma una hoja con los vencimientos de diciembre', 'Redacta un correo a un cliente por su F29 atrasado'],
  estoicismo: ['Ayúdame con la premeditatio de hoy', 'Hagamos el examen de la noche', 'Dame una cita de Séneca de mis notas', 'Separa esto en lo que depende de mí y lo que no'],
};

function kataBuild() {
  const fab = el('button', { id: 'kata-fab', className: 'kata-fab', title: 'Kataleya, tu asistente (Alt+K)', ariaLabel: 'Abrir a Kataleya' });
  fab.innerHTML = KATA_AVATAR;
  fab.addEventListener('click', () => kataToggle());
  const panel = el('aside', { id: 'kata-panel', className: 'kata-panel', ariaLabel: 'Kataleya', hidden: true });
  document.body.append(fab, panel);
}

function kataToggle(on = !kata.open) {
  kata.open = on;
  const panel = $('#kata-panel');
  panel.hidden = !on;
  document.body.classList.toggle('kata-open', on);
  if (on) {
    if (kataCfg().memory !== false) kataEnsureMemory();
    kataRender();
    setTimeout(() => $('#kata-input')?.focus(), 30);
  }
}

function kataRender() {
  const panel = $('#kata-panel');
  if (!panel || panel.hidden) return;
  const mode = kataMode();
  const modeSel = el('select', { className: 'kata-mode', ariaLabel: 'Modo de Kataleya', title: 'Modo: cómo responde Kataleya' }, kataModes().map((m) => el('option', { value: m.id, selected: m.id === mode }, m.label)));
  modeSel.addEventListener('change', () => {
    kataCfg().mode = modeSel.value;
    save();
    kataRender();
  });
  const btn = (label, title, fn, cls = 'kata-icon') => {
    const b = el('button', { className: cls, title, ariaLabel: title }, label);
    b.addEventListener('click', fn);
    return b;
  };
  const avatar = el('span', { className: 'kata-head-avatar' });
  avatar.innerHTML = KATA_AVATAR;
  const head = el('header', { className: 'kata-head' }, [
    avatar,
    el('div', { className: 'kata-name' }, [el('strong', {}, 'Kataleya'), modeSel]),
    btn('🧠', 'Memoria: abrir o importar desde Claude', (e) => showMenu(e.currentTarget, [
      { label: '📖 Abrir mi memoria', action: () => openNote(kataEnsureMemory()) },
      { label: '📥 Importar memoria de Claude…', action: () => { kata.importing = true; kataRender(); } },
    ])),
    btn('💾', 'Guardar la conversación como nota', () => kataSaveConversation()),
    btn('🗑', 'Nueva conversación', () => { kata.turns = []; kata.pending.clear(); kataRender(); }),
    btn('✕', 'Cerrar (Alt+K)', () => kataToggle(false)),
  ]);
  const ctx = kataSeeing();
  const ctxBar = ctx ? el('div', { className: 'kata-ctx', title: 'Lo que Kataleya tiene a la vista' }, `Viendo: ${ctx}`) : '';
  const srcBtn = (k, icon, label) => {
    const on = kataSource(k) !== 'off';
    const b = btn(`${icon} ${label}${on ? '' : ' (apagado)'}`, on ? `${label}: Kataleya lo usa cuando hace falta. Toca para apagarlo.` : `${label}: apagado. Toca para encenderlo.`, () => {
      kataCfg()[k] = on ? 'off' : 'auto';
      save();
      kataRender();
    }, `kata-src${on ? ' on' : ''}`);
    return b;
  };
  const srcBar = el('div', { className: 'kata-srcbar' }, [el('span', { className: 'muted' }, 'Fuentes:'), el('span', { className: 'kata-src on fixed', title: 'Tus notas: siempre la primera fuente' }, '🗂 Bóveda'), srcBtn('drive', '📁', 'Drive'), srcBtn('web', '🌐', 'Internet')]);
  const msgs = el('div', { id: 'kata-messages', className: 'kata-messages' });
  if (!aiReady()) {
    msgs.append(el('div', { className: 'kata-empty' }, [el('p', {}, '👋 Soy Kataleya.'), el('p', { className: 'muted' }, 'Funciono cuando abres Enfoque desde Claude (con permiso para usar Claude). Aquí puedes revisar mi memoria con 🧠.')]));
  } else if (kata.importing) {
    const ta = el('textarea', { className: 'kata-import', rows: 10, placeholder: 'Pega aquí tu memoria de Claude (Configuración › Memoria) o las instrucciones de tu proyecto…' });
    msgs.append(el('div', { className: 'kata-empty' }, [
      el('p', {}, [el('strong', {}, '📥 Importar memoria de Claude')]),
      el('p', { className: 'muted' }, 'Copia el texto de tu memoria en la configuración de Claude y pégalo aquí. Se agregará a mi memoria en una sección «Importado de Claude» con la fecha; luego puedes ordenarlo o pedirme que lo ordene.'),
      ta,
      el('div', { className: 'kata-row' }, [
        btn('Agregar a la memoria', '', () => {
          const t = ta.value.trim();
          if (!t) return;
          const note = kataEnsureMemory();
          note.body = `${note.body.replace(/\s+$/, '')}\n\n## Importado de Claude (${dateKey()})\n${t.split('\n').map((l) => (l.trim() && !/^\s*[-*]\s/.test(l) ? `- ${l.trim()}` : l)).join('\n')}\n`;
          note.updatedAt = Date.now();
          dataRev++;
          save();
          if (typeof snapshotNote === 'function') snapshotNote(note);
          kata.importing = false;
          kataRender();
          showToastMessage('Memoria importada. La versión anterior queda en el historial de la nota.');
        }, 'primary'),
        btn('Cancelar', '', () => { kata.importing = false; kataRender(); }, 'link'),
      ]),
    ]));
  } else if (!kata.turns.length) {
    msgs.append(el('div', { className: 'kata-empty' }, [
      el('p', {}, '👋 Hola, soy Kataleya. ¿En qué te ayudo?'),
      el('p', { className: 'muted' }, 'Busco en tu bóveda, en tu Drive y en internet; te digo qué rige hoy y puedo crear tareas, notas, alertas, tableros, bases, diagramas, lienzos, dibujos, PDF, Google Docs, hojas de cálculo y borradores de correo (siempre con tu aprobación).'),
      el('div', { className: 'kata-quick' }, (KATA_QUICK[mode] || KATA_QUICK.general).map((q) => btn(q, '', () => kataSend(q), 'kata-chip'))),
    ]));
  } else {
    kata.turns.forEach((t) => {
      if (t.role === 'user') return msgs.append(el('div', { className: 'kata-msg user' }, t.content));
      const md = el('div', { className: 'kata-md md' });
      md.innerHTML = renderMd(t.content || (kata.busy && t === kata.turns.at(-1) ? '…' : ''), { noTasks: true, noExternalImages: true });
      const acts = (t.actions || []).map((id) => {
        const a = kata.pending.get(id);
        if (!a) return '';
        const status = { pending: '', running: '⏳ Haciendo…', done: `✅ ${a.result?.texto || 'Hecho'}`, rejected: '❌ Descartado', error: `⚠️ ${a.result?.texto || 'Error'}` }[a.status];
        const diff = a.diff ? el('details', { className: 'kata-diff', open: a.status === 'pending' && a.diff.length <= 14 }, [el('summary', {}, `Ver cambios (${a.diff.filter((d) => d.t === '-').length} − · ${a.diff.filter((d) => d.t === '+').length} +)`), el('pre', {}, a.diff.slice(0, 200).map((d) => el('span', { className: `d${d.t === '-' ? 'm' : d.t === '+' ? 'p' : d.t === '…' ? 'e' : 'c'}` }, `${d.t === '…' ? '…' : `${d.t} ${d.l}`}\n`)))]) : '';
        return el('div', { className: `kata-act s-${a.status}` }, [
          el('div', {}, [el('strong', {}, a.label), a.detail ? el('div', { className: 'muted' }, a.detail) : '']),
          diff,
          a.status === 'pending' && 'firma' in a ? kataFirmaToggle(a) : '',
          a.status === 'pending' ? el('div', { className: 'kata-row' }, [btn('Aprobar', '', () => kataApprove(id), 'primary'), btn('Descartar', '', () => kataReject(id), 'link')]) : el('div', { className: 'kata-row' }, [el('span', {}, status), a.status === 'done' && a.result?.abrir ? btn('Abrir', '', () => a.result.abrir(), 'link') : '']),
        ]);
      });
      const used = (t.used || []).map((k) => ({ boveda: '🗂 Bóveda', drive: '📁 Drive', web: '🌐 Internet' })[k]);
      const refs = (t.refs || []).filter((r) => /^https:\/\//.test(r.url));
      const srcs = used.length ? el('div', { className: 'kata-used' }, [
        el('div', { className: 'kata-used-chips' }, [el('span', { className: 'muted' }, 'Consultó:'), ...used.map((u) => el('span', { className: 'kata-chip-src' }, u))]),
        refs.length ? el('ol', { className: 'kata-refs' }, refs.slice(0, 8).map((r) => {
          let host = '';
          try {
            host = new URL(r.url).hostname.replace(/^www\./, '');
          } catch {}
          const a = el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title || host);
          return el('li', {}, [a, el('span', { className: 'muted' }, ` · ${host}${r.date ? ` · ${r.date}` : ''}`), r.official ? el('span', { className: 'kata-official' }, ' ✓ oficial') : '']);
        })) : '',
      ]) : '';
      const bubble = el('div', { className: 'kata-msg assistant' }, [md, srcs, ...acts, t.note ? el('p', { className: 'muted kata-note' }, `ℹ️ ${t.note}`) : '', t.error ? el('p', { className: 'ask-error' }, t.error) : '']);
      msgs.append(bubble);
    });
  }
  const input = el('textarea', { id: 'kata-input', className: 'kata-input', rows: 2, placeholder: aiReady() ? 'Escríbele a Kataleya… (Enter envía, Mayús+Enter salta de línea)' : 'Kataleya funciona al abrir Enfoque desde Claude', disabled: !aiReady() || kata.busy });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      kataSend(v);
    }
  });
  const send = btn(kata.busy ? '■' : '➤', kata.busy ? 'Detener' : 'Enviar', () => {
    if (kata.busy) return kata.ctl?.abort();
    const v = input.value;
    input.value = '';
    kataSend(v);
  }, 'kata-send');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = SR && aiReady() ? btn('🎤', 'Dictar la pregunta', () => {
    const r = new SR();
    r.lang = 'es-CL';
    r.interimResults = true;
    mic.classList.add('on');
    r.onresult = (ev) => (input.value = [...ev.results].map((x) => x[0].transcript).join(' '));
    r.onend = () => mic.classList.remove('on');
    r.onerror = () => mic.classList.remove('on');
    r.start();
  }, 'kata-icon kata-mic') : '';
  const foot = el('footer', { className: 'kata-foot' }, [el('div', { id: 'kata-progress', className: 'muted kata-progress' }), el('div', { className: 'kata-compose' }, [input, mic, send])]);
  panel.replaceChildren(head, ctxBar, srcBar, msgs, foot);
  msgs.scrollTop = msgs.scrollHeight;
}

// Los [[enlaces]] de las respuestas abren la nota.
document.addEventListener('click', (e) => {
  const link = e.target.closest?.('#kata-panel a.wikilink');
  if (!link) return;
  e.preventDefault();
  openNoteByLink(link.dataset.target, { heading: link.dataset.heading, newTab: e.ctrlKey || e.metaKey });
});
document.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
    e.preventDefault();
    kataToggle();
  } else if (e.key === 'Escape' && kata.open && $('#kata-panel')?.contains(document.activeElement)) kataToggle(false);
});
// Al cambiar de nota o de vista, se actualiza lo que Kataleya «ve».
RENDER_HOOKS.push(() => kata.open && $('.kata-ctx') && ($('.kata-ctx').textContent = `Viendo: ${kataSeeing()}`));

kataBuild();
COMMANDS_EXTRA.push(() => [{ label: '✨ Kataleya: abrir la asistente (Alt+K)', action: () => kataToggle(true) }, { label: '🧠 Kataleya: abrir su memoria', action: () => openNote(kataEnsureMemory()) }]);
