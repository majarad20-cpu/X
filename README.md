# Enfoque

App de productividad ligera, sin dependencias ni paso de compilación. Todo se guarda en el navegador (`localStorage`).

## Funciones

- **Hoy**: resumen del día (pendientes, vencidas, hechas y pomodoros), añadir tareas para hoy al instante y marcar los hábitos del día.
- **Tareas**: prioridad (alta/media/baja), fecha límite, filtros (Todas, Hoy, Pendientes, Hechas), aviso de tareas vencidas. Toca el texto de una tarea para editarla; al borrar puedes deshacer.
- **Pomodoro**: enfoque / pausa corta / pausa larga (cada 4 pomodoros), duraciones configurables, aviso sonoro y notificación del navegador, contador diario. La pantalla se mantiene encendida mientras corre (si el navegador lo permite). Puedes asociar el pomodoro a una tarea y se suma a su contador 🍅.
- **Hábitos**: marca los últimos 7 días y sigue tu racha 🔥.

**Atajos de teclado:** `1`–`4` cambian de pestaña, `N` nueva tarea, `Espacio` inicia o pausa el Pomodoro, `Esc` cancela la edición, `?` muestra la ayuda.

## Uso

Abre `index.html` en el navegador, o sírvelo localmente:

```sh
python3 -m http.server 8000
# luego visita http://localhost:8000
```
