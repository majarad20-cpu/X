# Enfoque

App de productividad ligera, sin dependencias ni paso de compilación. Todo se guarda en el navegador (`localStorage`).

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
- **Progreso**: pomodoros, tareas completadas y tiempo enfocado de los últimos 7 días (comparado con la semana anterior), gráfico por día y constancia de cada hábito en 30 días.
- **Sincronización**: abierta desde Claude, la app guarda tus datos en un almacén privado y los sincroniza entre dispositivos, repartidos en bloques (núcleo, ideas, diario por meses y cada mapa) para no llegar al límite de tamaño. Fuera de Claude se guarda solo en el navegador.
- **Archivo de tareas**: las tareas completadas hace más de 7 días se archivan solas (un bloque por mes). Siguen apareciendo en «Hechas», cuentan para proyectos y estadísticas, y al desmarcarlas vuelven a la lista.
- **Ajustes** (⚙): color de la app, medidor de espacio por apartado (avisa al pasar del 80 % y marca el botón ⚙) y copia de seguridad (descargar, copiar, restaurar desde archivo o texto pegado).

**Atajos de teclado:** `1`–`8` cambian de pestaña, `N` nueva tarea, `Espacio` inicia o pausa el Pomodoro, `Esc` cancela la edición, `?` muestra la ayuda.

## Uso

Abre `index.html` en el navegador, o sírvelo localmente:

```sh
python3 -m http.server 8000
# luego visita http://localhost:8000
```
