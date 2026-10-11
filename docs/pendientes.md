# Pendientes

Actualizado el 11/10/2026. La app se usa desde el enlace de Claude, instalado como acceso directo en Windows (Edge/Chrome), el móvil y la Galaxy Tab S11 Ultra.

## Recomendaciones de mejora (en orden sugerido)
1. **Tablet y móvil** (gasto medio, por partes):
   - S Pen con presión y que la palma no pinte;
   - botones cómodos al tocar;
   - aprovechar la pantalla grande;
   - pantalla dividida y DeX;
   - navegación con el pulgar en el móvil.
2. **Seguridad de datos** (gasto medio):
   - medidor de espacio en Ajustes;
   - aviso si se llena el almacén de Claude;
   - copias automáticas en Drive con «Restaurar»;
   - imágenes y notas de voz en Drive en lugar del almacén de Claude.
3. **Limpieza y velocidad** (gasto muy alto): son 65 módulos y 1,6 MB.
4. **Simplificar menús.** Hecho: barra superior de productividad con desplegables, «＋ Nuevo» y contadores (js/69-barra-superior.js). Quedan:
   - **C:** barra inferior en el móvil (Hoy · Tareas · ＋ · Notas · Más), junto con la adaptación al móvil;
   - **D:** menú personalizable (ocultar o fijar secciones) y atajos Alt+1…9;
   - **E:** ordenar los menús internos (⋯ de la nota y clic derecho) (gasto alto).

## Sin resolver de la segunda revisión (gasto bajo)
- Al elegir un color de acento en Ajustes se pierde el foco del teclado.
- La agenda del día (js/42) no carga eventos de días fuera del rango cargado del calendario.
- Si la misma nota se edita a la vez en dos dispositivos sin tenerla abierta en el editor, gana el último cambio. Lo mismo pasa con mapas y lienzos.
- Una tarea puede quedar a la vez en Tareas y en Archivo si un dispositivo la archiva al arrancar mientras otro la edita.
- Una nota borrada en otro dispositivo, estando este sin conexión, solo desaparece en la segunda foto de la nube.
- La versión sin cifrar de una nota protegida queda en la papelera de Drive. El conector no permite borrarla del todo.
- Algunas llamadas a `toggleNoteTask` no pasan el título:
  - 22-revision, 42-agenda-dia, 43-menu-contextual, 45-vista-previa, 61-busqueda-global y 62-dia;
  - las casillas de la vista de lectura.
- 54 (`qbProps`): cachear las propiedades por cuerpo de nota, como `peKnown` en 47.

## Fase 2 de integración (ver docs/futuro-integracion.md)
- Áreas (Trabajo, Salud, Personal…) con su página.
- Bloques vivos en notas: hábitos, tarjeta de proyecto, ideas, botón de Pomodoro.
- Ideas ↔ notas en ambos sentidos.
- Grafo «neuronal».

## Ideas nuevas
- **Mi brújula, siguiente paso:** la versión sencilla ya está hecha (js/68-brujula.js). Faltan:
  - enlazar cada objetivo con sus proyectos y hábitos y ver su avance (encaja con «Áreas» de la Fase 2);
  - redactarla con ayuda de Claude.
- Diario en la bitácora, en Claude y en «Preguntar».

## Descartado por ahora
- App propia (PWA, .exe con Tauri o APK): fuera de Claude no hay IA sin pagar la API ni sincronización sin un proyecto propio de Google. Se puede retomar si hace falta usar la app sin conexión.
