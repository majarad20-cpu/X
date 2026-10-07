# Enfoque

App de productividad ligera, sin dependencias ni paso de compilación. Todo se guarda en el navegador (`localStorage`).

## Funciones

- **Hoy**: resumen del día (pendientes, vencidas, hechas y pomodoros), añadir tareas para hoy al instante y marcar los hábitos del día.
- **Tareas**: prioridad (alta/media/baja), fecha límite, filtros (Todas, Hoy, Pendientes, Hechas), aviso de tareas vencidas. Toca el texto de una tarea para editarla; al borrar puedes deshacer.
  - **Etiquetas**: escribe `#trabajo` en el título; toca una etiqueta para filtrar.
  - **Repetición**: cada día, lunes a viernes, cada semana o cada mes. Al completarla pasa sola a la siguiente fecha.
  - **Subtareas**: el botón ☰ abre la lista de pasos de cada tarea.
  - **Lenguaje natural**: «Llamar a Ana mañana !alta #trabajo» crea la tarea con fecha, prioridad y etiqueta. Entiende hoy, mañana, pasado mañana, días de la semana, «en 3 días», «15/10», «15 de octubre», `!alta`/`!media`/`!baja` y «cada día/semana/mes», «cada lunes», «de lunes a viernes». Una vista previa muestra lo que se ha entendido.
  - **Orden manual**: con «Orden: el mío», arrastra el asa ⠿ (o usa ↑ ↓ con el teclado) para reordenar.
- **Pomodoro**: enfoque / pausa corta / pausa larga (cada 4 pomodoros), duraciones configurables, aviso sonoro y notificación del navegador, contador diario. La pantalla se mantiene encendida mientras corre (si el navegador lo permite). Puedes asociar el pomodoro a una tarea y se suma a su contador 🍅.
- **Hábitos**: marca los últimos 7 días y sigue tu racha 🔥. Cada hábito puede ser diario o tener un objetivo semanal (por ejemplo, 3 veces por semana); entonces la racha cuenta semanas cumplidas.
- **Progreso**: pomodoros, tareas completadas y tiempo enfocado de los últimos 7 días (comparado con la semana anterior), gráfico por día y constancia de cada hábito en 30 días.
- **Sincronización**: abierta desde Claude, la app guarda tus datos en un almacén privado y los sincroniza entre dispositivos. Fuera de Claude se guarda solo en el navegador.
- **Ajustes** (⚙): color de la app y copia de seguridad (descargar, copiar, restaurar desde archivo o texto pegado).

**Atajos de teclado:** `1`–`5` cambian de pestaña, `N` nueva tarea, `Espacio` inicia o pausa el Pomodoro, `Esc` cancela la edición, `?` muestra la ayuda.

## Uso

Abre `index.html` en el navegador, o sírvelo localmente:

```sh
python3 -m http.server 8000
# luego visita http://localhost:8000
```
