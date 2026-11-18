---
name: ingesta-boveda
description: Procesa un documento (PDF, Word, Excel, presentación, imagen escaneada o enlace web) y lo coteja con la bóveda «Cerebro Digital X» de Obsidian/Enfoque en Google Drive. Lo desglosa en conceptos, dice qué es nuevo, qué ya existe, qué conviene enriquecer y qué está desactualizado, y, solo tras aprobación, crea o mejora notas con su MOC y su fuente. Úsala cuando el usuario diga «procesa este PDF», «ingesta», «revisa la Bandeja IA», «¿esto ya está en la bóveda?» o pase un documento para enriquecer la bóveda.
---

# Ingesta a la bóveda

Convierte un documento en conocimiento de la bóveda sin duplicar ni perder nada. Responde siempre en español de Chile, claro y directo.

## Datos fijos

| Qué | Dónde |
|---|---|
| Bandeja de entrada | Drive, carpeta **«Bandeja IA»** (id `1O1HuXh6VfSkhUGGXHbeaJRtL8bnEDuTr`, dentro de 00.- ATLAS) |
| Bóveda | Drive, **«Cerebro Digital X»** (id `1ELX63PzYAtiDOFQzaE1TrYVbAqMwB2He`) → `00.- ATLAS` (id `1swtj5lstGjkONAk-RPhyNVpVyABObLOx`) |
| Notas nuevas | `00.- ATLAS/MATRIZ DE NOTAS` (id `19AXNpz1kLEhidFcTiWibTPpvzUgCWo58`) |
| MOCs | `00.- ATLAS/MOCS` (id `1C0yzRWPkpHGRFkLtTVbmbh1k89woMPQJ`): 00 MOC DE MOCS, 1 Contabilidad, 2 Administración, 3 Economía, 4 Emprendimiento y Planes de Negocios, 5 Finanzas, 6 Proyectos e Inversiones, 7 Marketing, 8 Recursos Humanos, 9 Práctica Profesional, 10 Estoicismo, 11 Personal |
| Registro | Nota `00.- ATLAS/MATRIZ DE NOTAS/📥 Registro de fuentes.md` (id inicial `1by8HX_dzFyb9kVHpcPhQtEojcKlfJq8B`; búscala por título, cambia al editarla) |
| Procesados | `Bandeja IA/Procesados` (id `1BWGN0XPXXsjkA4SbU5PdVRr9vZWOxet7`); mover con `update_file` + `parentId` |
| App | Enfoque (artefacto de Claude) refleja Drive: trae los cambios de Drive al sincronizar. |

## Reglas que no se rompen

1. **Nada se escribe sin aprobación.** Primero el informe; se aplica solo lo que el usuario apruebe (punto por punto o «todo»).
2. **Nunca borrar.** Para cambiar una nota: subir la versión nueva, comprobar su tamaño y mandar la anterior a la **papelera** de Drive. Nunca borrado definitivo.
3. **No tocar:** las fuentes de `KNOWLEDGE BASE` (solo leerlas), los MOCs y PDF de «000 WIKI PROFESIONAL», las notas personales (estoicismo, «MIS…», proyectos personales) salvo aprobación expresa. **Nunca abrir** archivos de claves o credenciales (p. ej. «CLAVE API IA COPILOT.md»).
4. **Datos de clientes:** nunca a la bóveda. Si el documento es de un cliente, se extrae solo el conocimiento general y los ejemplos se anonimizan («Empresa A», «Comercial Cachapoal Ltda.» como caso modelo).
5. **Exactitud:** cada dato duro (tasa, plazo, monto, artículo, fecha) va con su fuente y página. Si algo no se puede verificar, se marca «⚠️ por verificar»; no se inventa.
6. **Trazabilidad:** toda norma puede haber sido modificada, reemplazada o derogada después. Cuando un dato cambia en el tiempo (tasa, tope, plazo, requisito), la nota debe mostrar el **historial** (valor, desde/hasta, norma que lo fijó, estado: histórico / vigente / futuro / derogado) y **qué rige hoy**. Antes de dar por buena una fuente, buscar normas posteriores que la cambien (circulares nuevas, leyes de reforma, la propia bóveda).
7. **Ahorro:** no releer la bóveda completa; usar el índice (paso 3) y abrir solo las notas candidatas.

## Proceso

### 1. Recibir el documento
- Si el usuario no dice cuál: listar la Bandeja IA y preguntar, o procesar el más antiguo.
- Revisar el **Registro de fuentes**: si el documento (mismo nombre, o mismo título y fecha) ya se procesó, avisar y preguntar si se repite.
- Buscar también si ya hay una **ficha del mismo documento** (título con su número, o pie «Fuente: <archivo>.pdf» de la Biblioteca Atlas): si existe, el trabajo pasa a ser **auditar las notas relacionadas** contra el documento (paso 3).
- Anotar: título, autor/emisor, fecha de la fuente, tipo (ley, circular, oficio, libro, apunte, curso, presentación…), páginas.

### Descargar fuentes oficiales
- `www.sii.cl` se descarga directo (curl): circulares `normativa_legislacion/circulares/AAAA/circuNN.pdf`, resoluciones `normativa_legislacion/resoluciones/AAAA/resoNN.pdf` (anexos `resoNN_anexoX.pdf`), FAQ de tasas e historiales.
- Los PDF de leyes en sii.cl (`dl824.pdf`, `dl825.pdf`, `dl830.pdf`) están **desactualizados** (2017-2020): no usarlos como texto vigente.
- `www.bcn.cl` (LeyChile) rechaza las descargas automáticas (401): pedir el PDF al usuario o verificar la ley a través de la circular del SII que la instruye.
- Verificar siempre que el número de una resolución o circular corresponda a la materia: los listados de otras IA suelen equivocarse de número.

### 2. Leer y desglosar
- Extraer el texto (PDF con texto, Word, Excel, web). Si es escaneado, leerlo como imagen. Documentos largos: por partes, anotando página.
- Separar en **conceptos** (unidades de conocimiento que serían una nota o una sección de nota): definiciones, normas, tasas y montos, plazos, procedimientos, ejemplos, criterios del SII, jurisprudencia.
- Por cada concepto: nombre corto, 1–3 líneas de resumen, páginas, términos de búsqueda (sinónimos, siglas, artículo de ley).
- Descartar lo que no aporta (índices, publicidad, repeticiones) y decir por qué.

### 3. Cotejar con la bóveda
- Armar un **índice** una vez por sesión: listar `.md` bajo `00.- ATLAS` (título, carpeta). Para las candidatas, leer YAML (`aliases`, `moc`, `tipo`, `area`, `vigencia`) y encabezados.
- Para cada concepto, buscar por título, alias, siglas y `fullText contains` en Drive. Abrir solo las 1–5 notas más probables.
- Comparar el contenido, no solo el nombre. Un alias cuenta como existente (ej.: «Libro Caja» es alias de «Libro de Caja»).
- **Buscar contradicciones:** en las notas relacionadas, revisar los datos que el documento toca (tasas, topes, artículos citados, quién paga qué). Lo más valioso suele ser una nota antigua que contradice la fuente (p. ej. un tope derogado).

### 4. Veredicto por concepto
| Marca | Significa | Propuesta |
|---|---|---|
| 🆕 Nuevo | No está en la bóveda | Título de la nota, MOC, `tipo`, enlaces a 2–5 notas existentes |
| ➕ Enriquecer | La nota existe pero le falta esto | Nota destino y sección donde va, texto a agregar |
| 🔄 Actualizar | La nota dice algo distinto o antiguo | Qué dice hoy, qué dice la fuente (con fecha), cuál prevalece y por qué |
| ✅ Ya existe | Está bien cubierto | Nota donde está |
| ⛔ No relevante | No aporta a la bóveda | Motivo breve |

Ante datos que cambian (tasas, topes, UF/UTM, plazos), prevalece la fuente **más reciente y de mayor rango** (ley > reglamento > circular > oficio > apunte). Si la fuente es más antigua que la nota, no se actualiza: se informa.

### 5. Informe para aprobar
Entregar un informe breve (en el chat; si es largo, también como nota `📥 Ingesta – <título> (<fecha>)` en la Bandeja IA):
1. Ficha del documento y veredicto general (relevante / parcialmente / no relevante).
2. Tabla de conceptos con marca, nota destino y una línea de propuesta, numerados.
3. Lo que queda «⚠️ por verificar».
4. Pregunta final: «¿Apruebas todo, algunos números, o ninguno?».

### 6. Aplicar lo aprobado
**Nota nueva** (en MATRIZ DE NOTAS, nombre = concepto, sin caracteres raros):
```markdown
---
tipo: concepto | normativa | procedimiento | herramienta | caso | checklist
area: contabilidad | tributario | finanzas | auditoría | laboral | administración | economía | …
moc: "[[1.- MOC - CONTABILIDAD]]"
aliases:
  - "sigla o sinónimo"
fuentes:
  - "Emisor, título, fecha, p. 12-14"
estado: borrador
creada: AAAA-MM-DD
vigencia: "Revisado mmm-AAAA" | "Permanente"
---

# Título

**Idea central:** una o dos frases.

## …secciones con tablas cuando ayuden (norma | regla), ejemplo con cifras…

## Fuentes
- Emisor, título, fecha, páginas.

## Relacionadas
- [[Nota existente 1]] · [[Nota existente 2]]
```
- Agregar el enlace en su MOC, en la sección temática que corresponda; si no hay una clara, bajo `## 📥 Por ordenar` al final del MOC.
- Enlaces con el nombre exacto de la nota (o `[[Nombre|alias]]`); dentro de tablas, escapar la barra: `[[Nombre\|alias]]`.

**Enriquecer / actualizar:** descargar la nota, editar solo lo aprobado, agregar la fuente al YAML `fuentes`, poner `actualizada: AAAA-MM-DD` y, si cambió un dato, una línea `> [!info] Actualizado AAAA-MM-DD` con qué cambió y según qué fuente. Subir la nueva, verificar tamaño, papelera la anterior.

**Subir a Drive sin reescribir el contenido:** guardar el archivo localmente y usar `create_file` con `base64Content: "sha256:<hex>:<ruta absoluta>"`, `parentId` de la carpeta, `contentMimeType: text/markdown`, `disableConversionToGoogleType: true`. Comprobar `fileSize`, luego `trash_file` de la versión antigua.

### 7. Cerrar
- Agregar una fila al **Registro de fuentes**: `| fecha | documento (enlace Drive) | veredicto | notas creadas | notas enriquecidas | notas actualizadas |`.
- Mover el documento procesado de la Bandeja IA a una subcarpeta `Bandeja IA/Procesados` (crearla si no existe), o dejarlo si el usuario prefiere.
- Si una verificación externa no se pudo abrir (la red de la sesión puede bloquear sii.cl o bcn.cl), decirlo y citar las fuentes que sí se consultaron.
- Decirle al usuario que sincronice Enfoque y, si quiere, pulse «Verificar con Drive».

## Errores típicos a evitar
- Creer que una nota no existe por buscar solo el título: revisar alias y contenido.
- Copiar párrafos largos del documento: resumir y estructurar; citar textual solo normas cortas.
- Inventar artículos, oficios o cifras para «completar»: marcar «⚠️ por verificar».
- Dejar notas nuevas sin MOC o sin enlaces: siempre MOC + 2 relacionadas como mínimo.
- Tocar formatos de notas que no estaban en la propuesta aprobada.
