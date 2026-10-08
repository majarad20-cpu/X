# Enfoque

App de productividad ligera, sin dependencias. Funciona abriendo `index.html` en el navegador (los datos se guardan en `localStorage`) o publicada como página en Claude, donde además sincroniza entre dispositivos, usa a Claude y se conecta con Google Calendar.

## Interfaz

Tres paneles al estilo de una bóveda de notas: barra de iconos y explorador a la izquierda, pestañas en el centro y enlaces entrantes y esquema a la derecha. En pantallas estrechas los paneles se abren como cajones.

- **Notas en Markdown**: carpetas, pestañas, modo edición y modo lectura (Ctrl+E), guardado automático, títulos, listas, casillas, citas, avisos (`> [!tip]`), tablas, código, resaltado (`==texto==`) y propiedades.
- **Wikilinks**: `[[Nota]]`, `[[Nota|texto]]`, `[[Nota#Sección]]` y notas incrustadas `![[Nota]]`. Al escribir `[[` aparecen sugerencias; un enlace a una nota que no existe la crea; renombrar o mover una nota actualiza los enlaces.
- **Enlaces entrantes** y **menciones sin enlazar** (con botón «Enlazar»), **esquema** de títulos, **etiquetas** y **búsqueda** en todas las notas.
- **Ctrl+O** abre o crea una nota, **Ctrl+P** abre la paleta de comandos, **Ctrl+N** crea una nota y **Alt+D** abre la nota diaria (`Diario/AAAA-MM-DD`).
- **Tareas en las notas**: cualquier `- [ ] texto` de una nota aparece en Tareas, Hoy y Semana con un distintivo 📝 que lleva a su nota. Admite `📅 2026-10-08` o `📅 mañana`, `⏰ 17:30`, `!alta`, `#etiqueta` y `+proyecto`; en una nota diaria, las tareas sin fecha son de ese día. Al completarlas se añade `✅ fecha` a la línea y cuentan en estadísticas y bitácora.
- **Nota de proyecto**: cada proyecto puede tener su nota (`Proyectos/Nombre`); sus casillas cuentan para el avance.
- **Pasar a notas** (Ajustes): copia el diario (en la nota diaria de cada día), las ideas (`Ideas/`) y los mapas mentales (como esquema en `Mapas/`). Los originales se conservan y al repetir solo se copia lo nuevo.
- **Vista de grafo** (Ctrl+G): cada nota es un punto y cada enlace una línea, con colores por carpeta. Se puede mover, ampliar (rueda o pellizco), arrastrar puntos y abrir una nota al tocarla (una nota «sin crear» se crea al tocarla). Filtros: buscar, etiquetas, notas sin crear y notas sin enlaces.
- **Grafo local** (panel derecho › Grafo): las conexiones de la nota abierta, a 1, 2 o 3 saltos.
- **Mapa mental desde una nota** (menú ⋯ o paleta): los títulos y listas de la nota se convierten en ramas; el mapa se puede actualizar cuando cambie la nota y lleva a su nota de origen.
- **Plantillas**: las notas de la carpeta `Plantillas` son plantillas (se crean 4 de ejemplo la primera vez). «Nueva nota desde plantilla» e «Insertar plantilla» (Ctrl+P o menú ⋯). Variables `{{fecha}}`, `{{fecha_larga}}`, `{{hora}}`, `{{título}}` y `{{semana}}`. Si existe `Plantillas/Nota diaria`, se usa para las notas diarias.
- **Consultas**: un bloque de código ```` ```tareas ```` (filtros `#etiqueta`, `+proyecto`, `pendientes`/`hechas`/`todas`, `hoy`/`vencidas`/`semana`/`sin fecha`, `carpeta: X`, `límite: N`) o ```` ```notas ```` (`#etiqueta`, `carpeta: X`, `enlaza: Nota`) muestra una lista que se actualiza sola; las tareas se pueden marcar ahí mismo.
- Las secciones (Hoy, Tareas, Proyectos, Diario, Ideas, Pomodoro, Hábitos, Progreso, Revisión semanal y Preguntar) se abren como pestañas desde la barra de iconos.

## Dentro de Claude

- **Claude ordena tu vaciado mental**: al guardar un vaciado mental, «✨ Ordenar con Claude» propone tareas con fecha, hora, prioridad, proyecto y etiquetas; se pueden editar y desmarcar antes de crearlas.
- **Resumen semanal** (Progreso): Claude lee la bitácora, el diario, los hábitos, los proyectos y las tareas de la semana y escribe logros, en qué se fue el tiempo, ánimo, pendientes y 3 sugerencias. Se puede guardar como nota en `Revisiones/`.
- **Pregúntale a tus notas** (✨ en la barra de iconos): un chat en el que Claude busca y lee tus notas, tareas y diario para responder, citando las notas con `[[enlaces]]` que se abren al tocarlos. La conversación se puede guardar como nota en `Preguntas/`.
- **Google Calendar** (activar en Ajustes): tus eventos aparecen en Hoy y en Tareas › Semana, con enlace a Meet y a Calendar; una tarea con fecha y hora se puede añadir al calendario desde su panel ☰.
- Cada uso de Claude o del calendario pide permiso la primera vez. Fuera de Claude estas funciones no aparecen.

## Funciones

- **Hoy**: resumen del día (pendientes, vencidas, hechas y pomodoros), añadir tareas para hoy al instante y marcar los hábitos del día.
  - **Bitácora**: línea de tiempo con los hitos del día de todas las pestañas (tareas completadas, pomodoros, hábitos, rachas y objetivos semanales, entradas del diario con su ánimo, ideas, mapas y avances de proyecto al 25/50/75/100 %), con resumen y navegación a días anteriores. Se guarda aparte (un bloque por mes), así que los hitos se conservan aunque se borre el elemento, y entre dispositivos se fusiona en vez de pisarse.
- **Tareas**: prioridad (alta/media/baja), fecha límite, filtros (Todas, Hoy, Pendientes, Hechas), aviso de tareas vencidas. Toca el texto de una tarea para editarla; al borrar puedes deshacer.
  - **Etiquetas**: escribe `#trabajo` en el título; toca una etiqueta para filtrar.
  - **Repetición**: cada día, lunes a viernes, cada semana o cada mes. Al completarla pasa sola a la siguiente fecha.
  - **Subtareas**: el botón ☰ abre la lista de pasos de cada tarea.
  - **Lenguaje natural**: «Llamar a Ana mañana !alta #trabajo» crea la tarea con fecha, prioridad y etiqueta. Entiende hoy, mañana, pasado mañana, días de la semana, «en 3 días», «15/10», «15 de octubre», `!alta`/`!media`/`!baja` y «cada día/semana/mes», «cada lunes», «de lunes a viernes». Una vista previa muestra lo que se ha entendido.
  - **Recordatorios**: pon una hora a la tarea (campo de hora o «a las 5», «17:30», «8pm», «a las 10 de la noche»). A esa hora la app muestra un aviso con sonido, con «Hecha», «10 min más» o cerrar; si la abres más tarde, el aviso sigue ahí. Solo avisa mientras la app está abierta.
  - **Notas**: el panel ☰ de cada tarea incluye subtareas y notas; la primera línea de la nota se ve en la lista.
  - **Vista Semana**: calendario de lunes a domingo con tus tareas por día, repeticiones previstas, navegación entre semanas y «+» para añadir una tarea a un día concreto.
  - **Orden manual**: con «Orden: el mío», arrastra el asa ⠿ (o usa ↑ ↓ con el teclado) para reordenar.
- **Proyectos**: estado (activo, en pausa, completado), fecha límite, color y descripción. El avance se calcula con las tareas del proyecto (o se fija a mano) y avisa si va con retraso respecto al plazo. Asigna tareas con `+nombre` al escribirlas o desde su edición.
- **Diario**: vaciado mental, escritura libre, gratitud y reflexión guiada, con registro del ánimo, racha y buscador. Las líneas de un vaciado mental se pueden convertir en tareas (entendiendo fechas y horas). El borrador se guarda solo.
- **Ideas**: notas rápidas con #etiquetas, fijar, buscar y convertir en tarea o en mapa mental.
  - **Mapas mentales**: tema central y ramas que se ordenan solas a ambos lados, con color por rama. Teclado: Tab añade rama, Enter añade hermano, F2 edita, Supr borra (con deshacer), flechas para moverse. Ramas plegables, zoom, convertir un nodo en tarea y descargar el mapa como imagen PNG.
- **Pomodoro**: enfoque / pausa corta / pausa larga (cada 4 pomodoros), duraciones configurables, aviso sonoro y notificación del navegador, contador diario. La pantalla se mantiene encendida mientras corre (si el navegador lo permite). Puedes asociar el pomodoro a una tarea y se suma a su contador 🍅.
- **Hábitos**: marca los últimos 7 días y sigue tu racha 🔥. Cada hábito puede ser diario o tener un objetivo semanal (por ejemplo, 3 veces por semana); entonces la racha cuenta semanas cumplidas.
- **Revisión semanal** (barra de iconos o paleta; de viernes a domingo, Hoy la recuerda): seis pasos guiados — tareas vencidas (hecha, mañana, próxima semana, algún día o borrar), tareas sin fecha, proyectos activos (abrir, pausar, completar), la próxima semana (tareas y eventos del calendario, con campo para añadir), hábitos y una reflexión con tus 3 prioridades. Al terminar guarda una nota en `Revisiones/` con los números de la semana y las decisiones, y crea las prioridades como tareas para el lunes. Funciona también fuera de Claude.
- **Progreso**: pomodoros, tareas completadas y tiempo enfocado de los últimos 7 días (comparado con la semana anterior), gráfico por día y constancia de cada hábito en 30 días.
- **Sincronización**: abierta desde Claude, la app guarda tus datos en un almacén privado y los sincroniza entre dispositivos, repartidos en bloques (núcleo, ideas, diario por meses y cada mapa) para no llegar al límite de tamaño. Fuera de Claude se guarda solo en el navegador.
- **Almacenamiento y rendimiento**: los datos se guardan en la base de datos del navegador (IndexedDB), sin el límite de unos 5 MB de antes; los datos de versiones anteriores se pasan solos y el navegador los protege del borrado automático cuando lo permite. Está probada con 3.000 notas enlazadas, 3.000 tareas y 750 entradas de diario: solo se dibuja la sección abierta, las listas largas se muestran por tandas («Mostrar más»), las búsquedas de notas usan un índice y el grafo usa una simulación aproximada (Barnes-Hut) para miles de puntos.
- **Archivo de tareas**: las tareas completadas hace más de 7 días se archivan solas (un bloque por mes). Siguen apareciendo en «Hechas», cuentan para proyectos y estadísticas, y al desmarcarlas vuelven a la lista.
- **Ajustes** (⚙): color de la app, medidor de espacio por apartado y de la copia en este dispositivo (avisa al pasar del 80 % y marca el botón ⚙) y copia de seguridad (descargar, copiar, restaurar desde archivo o texto pegado).

**Atajos de teclado:** `Ctrl+O` abrir nota, `Ctrl+P` comandos, `Ctrl+N` nueva nota, `Ctrl+G` grafo, `Ctrl+E` editar/leer, `Alt+D` nota diaria, `1`–`8` secciones, `N` nueva tarea, `Espacio` inicia o pausa el Pomodoro, `Esc` cancela la edición, `?` muestra la ayuda.

## Uso

Abre `index.html` en el navegador, o sírvelo localmente:

```sh
python3 -m http.server 8000
# luego visita http://localhost:8000
```

## Desarrollo

- `index.html` y `styles.css`: estructura y estilos.
- `js/`: el código, en módulos que se cargan en orden (`01-nucleo.js` … `23-inicio.js`; `23-inicio.js` va siempre el último). Son scripts normales que comparten el ámbito global, así que no hace falta compilar nada.
- `python3 tools/build.py`: junta todo en `dist/enfoque.html`, el archivo único que se publica en Claude.
- `node tests/run.js [filtro]`: lanza las pruebas de `tests/` (Playwright + Chromium) contra `index.html` y resume el resultado. Las capturas quedan en `tests/out/`. Las pruebas simulan Claude (también sus herramientas), Google Calendar y la sincronización.
