# Ideas para el futuro: integrar notas, tareas, proyectos, ideas y hábitos

Guardado el 10/10/2026 a petición del usuario. La fase 1 ya está hecha; la fase 2 no está implementada. Antes de hacerla, la idea es usar la app una o dos semanas y ver qué falta de verdad.

## Situación actual
- **Ya conectado:**
  - tareas dentro de notas (`- [ ]`);
  - nota de proyecto y `+proyecto`;
  - notas con `fecha` en el calendario;
  - Bandeja de captura;
  - vistas de notas y tareas por menú.
- **Va por separado:**
  - hábitos ↔ notas;
  - ideas ↔ notas: solo pasan a tarea o a mapa;
  - Diario (sección) ↔ notas diarias;
  - la búsqueda solo busca en notas;
  - el Pomodoro no sabe en qué nota o proyecto se trabaja.

## Modelo propuesto: esqueleto jerárquico + red de enlaces

```
ÁREAS (Trabajo, Salud, Personal, Estudios…)        ← lo permanente
 └─ PROYECTOS                                       ← tienen fin y avance
     └─ TAREAS (y subtareas)                        ← lo accionable

HÁBITOS ── pertenecen a un ÁREA

NOTAS e IDEAS ── no están "dentro" de nada: se ENLAZAN con cualquier cosa
```

- **Jerarquía** (un solo padre): tarea → proyecto → área; hábito → área. Sirve para saber qué hay que hacer y cuánto se avanza.
- **Red** (enlaces libres en ambos sentidos): notas e ideas enlazan cualquier cosa. Sirve para guardar lo que se sabe y se piensa.
- **Regla:** se enlaza en un sentido y la app muestra el otro sola, como los enlaces entrantes.

## Fase 1: lo recomendado, poco riesgo y mucho efecto
1. ✅ **Hecho:** **Panel «Relacionado»** en notas (panel derecho, pestaña Enlaces), tareas (formulario), proyectos (detalle), ideas (al editarlas) y hábitos (al editarlos), y «🔗 Ver relacionado…» en el clic derecho. Agrupa proyecto (con avance), tareas (con casilla), ideas, hábitos (con la casilla de hoy) y notas, en ambos sentidos, con la línea «📁 Proyecto › ☑ Tarea · 📝 nota» arriba (`js/60-relaciones.js`).
2. ✅ **Hecho:** **Enlaces universales** `[[tarea:ID|Título]]`, `[[proyecto:ID|Nombre]]`, `[[idea:ID|Texto]]` y `[[habito:ID|Nombre]]`: usan el id (renombrar no rompe nada), se leen como fichas con icono y el nombre actual, y tachadas si la cosa ya no existe. `[[` los sugiere junto a las notas, y «🔗 Enlazar con…» está en el menú de la nota y en el clic derecho de tareas, proyectos, ideas y hábitos (estos guardan sus enlaces en `links`). En Obsidian se ven como enlaces sin resolver con su texto; en el PDF, como su texto.
3. ✅ **Hecho:** **Búsqueda global (Ctrl+K)** en notas, tareas, ideas, proyectos y hábitos, y también en diario, lienzos, marcadores y secciones (`js/61-busqueda-global.js`). En el editor, Ctrl+K sigue insertando un enlace; ahí se usa Ctrl+Mayús+K.

## Fase 2: opcional
4. **Áreas** como nivel nuevo, cada una con su página: proyectos, hábitos, notas y avance. Mientras tanto se puede usar una carpeta o la propiedad `area:`.
5. **Nota diaria como centro del día:** hábitos para marcar, que se sincronizan con Hábitos, tareas, Pomodoros e ideas capturadas. Unificar el Diario con las notas diarias.
6. **Bloques vivos desde «Insertar…»:** hábitos (casillas o mapa de calor), tarjeta de proyecto, ideas con etiqueta y botón de Pomodoro.
7. **Ideas ↔ notas:** convertir en ambos sentidos y conservar el enlace a su origen.
8. **Tarea con nota vinculada** (botón 📝), y que el proyecto liste todas sus notas.
9. **Pomodoro con contexto:** el tiempo queda registrado en la tarea o nota y se suma en el proyecto.
10. **Grafo «neuronal»:** todos los tipos con colores y filtros; líneas continuas para la jerarquía y punteadas para los enlaces.

## Antes de empezar
- Hacer una revisión de limpieza: simplificar menús, quitar lo que no se use y mejorar la velocidad. La app ya tiene unos 57 módulos y 1,26 MB.
- Implementar por fases, con pruebas, sin cambiar el formato de los datos existentes. Si hace falta migrar datos, que sea reversible.
