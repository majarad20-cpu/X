'use strict';

// ---------- Nueva nota por tipo ----------
// Crea notas con las propiedades y secciones que usa la bóveda (las mismas de la skill de ingesta):
// pide el tipo, el título y el MOC, deja la nota en MATRIZ DE NOTAS y la enlaza en el MOC.
// El ensayo es propio de la persona: va con «tipo: ensayo» y se enlaza en la línea «✍️ Mis ensayos».
// Acceso directo: Alt+Mayús+E (ensayo) y Alt+Mayús+N (elegir tipo). En Ajustes de la paleta se
// puede dejar el selector como lo que hacen el botón ＋ y Ctrl+N (state.settings.ntDefault).

const NT_TYPES = [
  {
    id: 'ensayo', icon: '✍️', label: 'Ensayo (de mi autoría)', prefix: 'ENSAYO.- ',
    detail: 'Texto propio: tesis, desarrollo y conclusión. Kataleya no lo modifica',
    body: (t) => `# ${t}\n\n> [!abstract] Tesis\n> La idea que defiendo, en una o dos frases.\n\n## Introducción\n\n\n## Desarrollo\n\n\n## Conclusión\n\n\n## Conceptos relacionados\n- \n`,
  },
  {
    id: 'concepto', icon: '💡', label: 'Concepto',
    detail: 'Qué es algo, cómo funciona y un ejemplo con cifras',
    body: (t) => `# ${t}\n\n**Idea central:** \n\n## Explicación\n\n\n## Ejemplo\n\n\n## Aplicación práctica\n\n\n## Fuentes\n- \n\n## Relacionadas\n- \n`,
  },
  {
    id: 'normativa', icon: '⚖️', label: 'Normativa',
    detail: 'Ley, circular u oficio: reglas, historial y qué rige hoy',
    vigencia: true,
    body: (t) => `# ${t}\n\n**Idea central:** \n\n## Qué regula\n\n\n## Reglas clave\n| Norma | Regla |\n|---|---|\n|  |  |\n\n> [!info] Historial y vigencia\n> - **Hasta …:** \n> - **Desde …:** (qué rige hoy)\n\n## Aplicación práctica\n\n\n## Fuentes\n- \n\n## Relacionadas\n- \n`,
  },
  {
    id: 'procedimiento', icon: '🛠️', label: 'Procedimiento',
    detail: 'Trámite o proceso paso a paso, con plazos',
    vigencia: true,
    body: (t) => `# ${t}\n\n**Idea central:** \n\n## Pasos\n1. \n2. \n3. \n\n## Plazos y responsables\n\n\n## Errores comunes\n- \n\n## Fuentes\n- \n\n## Relacionadas\n- \n`,
  },
  {
    id: 'herramienta', icon: '🧰', label: 'Herramienta',
    detail: 'Tabla de consulta, plantilla o fórmula de uso frecuente',
    body: (t) => `# ${t}\n\n**Idea central:** para qué sirve y cuándo usarla.\n\n## Tabla\n|  |  |\n|---|---|\n|  |  |\n\n## Cómo usarla\n\n\n## Fuentes\n- \n\n## Relacionadas\n- \n`,
  },
  {
    id: 'caso', icon: '🧮', label: 'Caso práctico',
    detail: 'Ejercicio con datos, desarrollo y resultado',
    body: (t) => `# ${t}\n\n**Qué se practica:** \n\n## Enunciado\nComercial Cachapoal Ltda. …\n\n## Datos\n|  |  |\n|---|---|\n|  |  |\n\n## Desarrollo\n\n\n## Resultado\n\n\n## Notas de teoría\n- \n`,
  },
  {
    id: 'checklist', icon: '✅', label: 'Checklist',
    detail: 'Lista de verificación con casillas',
    body: (t) => `# ${t}\n\n**Para qué:** \n\n## Antes\n- [ ] \n\n## Durante\n- [ ] \n\n## Al cerrar\n- [ ] \n\n## Relacionadas\n- \n`,
  },
];
const NT_ESSAYS = '✍️ Mis ensayos';
const ntType = (id) => NT_TYPES.find((t) => t.id === id) || NT_TYPES[1];
const ntFolder = () => gvFolders().find((f) => /matriz/i.test(f)) || plainNewFolder();
// «1.- MOC - CONTABILIDAD» → «contabilidad».
const ntArea = (moc) => (moc ? baseName(moc.path).split(' - ').pop().replace(/^[^\p{L}]+/u, '').trim().toLocaleLowerCase('es') : '');
const ntMonth = () => { const d = new Date(); return `${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()]}-${d.getFullYear()}`; };

function ntFrontmatter(type, moc) {
  const lines = ['---', `tipo: ${type.id}`];
  const area = type.id === 'ensayo' ? '' : ntArea(moc);
  if (area) lines.push(`area: ${area}`);
  if (moc) lines.push(`moc: "[[${baseName(moc.path)}]]"`);
  if (type.id !== 'ensayo') lines.push('fuentes:', '  - ""');
  lines.push('estado: borrador', `creada: ${dateKey()}`);
  if (type.vigencia) lines.push(`vigencia: "Revisado ${ntMonth()}"`);
  else if (type.id !== 'ensayo') lines.push('vigencia: "Permanente"');
  if (type.id === 'ensayo') lines.push('tags:', '  - ensayo');
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

// Enlaza la nota en el MOC: el ensayo en la línea «✍️ Mis ensayos:» (o en su sección); el resto bajo «## 📥 Por ordenar».
function ntLinkInMoc(note, moc, type) {
  if (!moc || moc.enc) return false;
  const name = baseName(note.path);
  const link = `[[${findNoteByName(name) === note ? name : `${note.path}|${name}`}]]`;
  let body = (moc.body || '').replace(/\s+$/, '');
  const lines = body.split('\n');
  if (type.id === 'ensayo') {
    const i = lines.findIndex((l) => /^\s*[-*]\s*✍️\s*Mis ensayos\s*:/i.test(l));
    if (i >= 0) {
      lines[i] = `${lines[i].replace(/\s+$/, '')}${/:\s*$/.test(lines[i]) ? ' ' : ' · '}${link}`;
      body = lines.join('\n');
    } else body = ntAppend(body, `- ${link}`, `## ${NT_ESSAYS}`);
  } else body = ntAppend(body, `- ${link}`, '## 📥 Por ordenar');
  moc.body = `${body.replace(/\s+$/, '')}\n`;
  moc.updatedAt = Date.now();
  return true;
}

// Agrega una línea al final de una sección (la crea al final de la nota si no existe).
function ntAppend(body, line, head) {
  const lines = body.split('\n');
  let h = lines.findIndex((l) => l.trim() === head);
  if (h < 0) return `${body.replace(/\s+$/, '')}\n\n${head}\n${line}`;
  let i = h + 1;
  while (i < lines.length && !/^#{1,2}\s/.test(lines[i])) i++;
  while (i > h + 1 && !lines[i - 1].trim()) i--;
  lines.splice(i, 0, line);
  return lines.join('\n');
}

// Crea la nota (sin preguntar nada): la usan los pasos del selector y las pruebas.
function ntCreate(typeId, title, moc = null, { open = true } = {}) {
  const type = ntType(typeId);
  let name = cleanName(String(title || '').replace(/:/g, ' -')) || 'Sin título';
  if (type.prefix && !fold(name).startsWith(fold(type.prefix.trim()))) name = `${type.prefix}${name}`;
  let note;
  withUndo(`${type.icon} Nota creada: «${name}»`, () => {
    const folder = ntFolder();
    if (folder) folder.split('/').reduce((acc, f) => { const p = acc ? `${acc}/${f}` : f; if (!state.folders.includes(p)) state.folders.push(p); return p; }, '');
    note = createNote({ folder, title: name, body: ntFrontmatter(type, moc) + type.body(name), open: false, log: false });
    ntLinkInMoc(note, moc, type);
    dataRev++;
  });
  logEvent('note', `Nueva nota (${type.id}): ${baseName(note.path)}`, { ref: note.id });
  save();
  if (open) {
    openNote(note);
    if (typeof toggleNoteMode === 'function' && noteMode.get(note.id) !== 'edit') toggleNoteMode();
  }
  return note;
}

// Pasos del selector: tipo → título → MOC.
function ntPickMoc(type, title) {
  const mocs = gvMocs();
  const prefer = type.id === 'ensayo' ? mocs.find((m) => /Mis ensayos/i.test(m.body || '')) : null;
  const list = [
    ...(prefer ? [prefer] : []),
    ...mocs.filter((m) => m !== prefer),
  ].map((m) => ({ label: `🧭 ${baseName(m.path)}`, detail: m === prefer ? 'ya tiene «✍️ Mis ensayos»' : '', action: () => ntCreate(type.id, title, m) }));
  pickFrom(`MOC donde va «${title}»…`, [...list, { label: '— Sin MOC por ahora', detail: 'la enlazas después', action: () => ntCreate(type.id, title, null) }]);
}

function ntAskTitle(type) {
  promptText({ placeholder: `Título del ${type.id === 'caso' ? 'caso práctico' : type.label.toLowerCase().replace(/ \(.*\)/, '')}…`, action: `Crear ${type.icon}`, onSubmit: (t) => ntPickMoc(type, t) });
}

const ntNewEssay = () => ntAskTitle(ntType('ensayo'));

function ntPickType() {
  const def = !!state.settings.ntDefault;
  pickFrom('Tipo de nota…', [
    ...NT_TYPES.map((t) => ({ label: `${t.icon} ${t.label}`, detail: t.detail, kbd: t.id === 'ensayo' ? 'Alt+Mayús+E' : '', action: () => ntAskTitle(t) })),
    { label: '📄 Nota en blanco', detail: 'sin propiedades', action: () => createNote({ folder: plainNewFolder() }) },
    { label: def ? '⭐ Dejar el botón ＋ y Ctrl+N como nota en blanco' : '⭐ Usar este selector con el botón ＋ y Ctrl+N', detail: 'predeterminado', action: ntToggleDefault },
  ]);
}

function ntToggleDefault() {
  state.settings.ntDefault = !state.settings.ntDefault;
  if (!state.settings.ntDefault) delete state.settings.ntDefault;
  save();
  showToastMessage(state.settings.ntDefault ? 'El botón ＋ y Ctrl+N ahora preguntan el tipo de nota' : 'El botón ＋ y Ctrl+N vuelven a crear una nota en blanco');
  ntPaintButton();
}

// Lo que hacen el botón ＋ y Ctrl+N (12-notas.js y 18-…-atajos.js preguntan aquí).
function ntNewDefault() {
  if (state.settings.ntDefault) ntPickType();
  else createNote({ folder: plainNewFolder() });
}

function ntPaintButton() {
  const b = $('#new-note');
  if (!b) return;
  b.title = state.settings.ntDefault ? 'Nueva nota por tipo (Ctrl+N) · clic derecho: nota en blanco' : 'Nueva nota (Ctrl+N) · clic derecho: por tipo';
  b.ariaLabel = b.title;
}

// Botón ✍️ junto a «Nueva nota» y clic derecho en ＋ para la otra opción.
(function ntInit() {
  const plus = $('#new-note');
  if (plus && !$('#new-essay')) {
    const essay = el('button', { id: 'new-essay', className: 'side-btn', title: 'Nuevo ensayo (Alt+Mayús+E)', ariaLabel: 'Nuevo ensayo' }, '✍️');
    essay.addEventListener('click', ntNewEssay);
    plus.after(essay);
    plus.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (state.settings.ntDefault) createNote({ folder: plainNewFolder() });
      else ntPickType();
    });
  }
  ntPaintButton();
})();

document.addEventListener('keydown', (e) => {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || !$('#draw').hidden) return;
  if (e.code === 'KeyE') { e.preventDefault(); ntNewEssay(); }
  else if (e.code === 'KeyN') { e.preventDefault(); ntPickType(); }
});

COMMANDS_EXTRA.push(() => [
  { label: '✍️ Nuevo ensayo (de mi autoría)', kbd: 'Alt+Mayús+E', action: ntNewEssay },
  { label: '📝 Nueva nota por tipo…', kbd: 'Alt+Mayús+N', action: ntPickType },
  { label: state.settings.ntDefault ? '⭐ Botón ＋ y Ctrl+N: volver a nota en blanco' : '⭐ Botón ＋ y Ctrl+N: preguntar el tipo de nota', action: ntToggleDefault },
]);

// «＋ Nuevo» de la barra superior (69-barra-superior.js): suma el ensayo y la nota por tipo.
const ntFillNewBase = tbFillNew;
tbFillNew = function (menu) {
  ntFillNewBase(menu);
  const item = (label, action, title = '') => {
    const b = el('button', { className: 'tb-item', role: 'menuitem', title }, label);
    b.addEventListener('click', action);
    return b;
  };
  const first = menu.firstElementChild;
  if (first) first.textContent = state.settings.ntDefault ? '📝 Nota por tipo…' : '📄 Nota en blanco';
  first?.after(
    item('✍️ Ensayo…', ntNewEssay, 'Alt+Mayús+E'),
    ...(state.settings.ntDefault ? [item('📄 Nota en blanco', () => createNote({ folder: plainNewFolder() }))] : [item('🗂️ Nota por tipo…', ntPickType, 'Concepto, normativa, procedimiento, caso… (Alt+Mayús+N)')])
  );
  if (first && state.settings.ntDefault) {
    const b = item('📝 Nota por tipo…', ntPickType, 'Alt+Mayús+N');
    first.replaceWith(b);
  }
};
