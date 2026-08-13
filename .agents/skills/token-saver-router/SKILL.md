---
name: token-saver-router
description: Enruta a la skill más útil para ahorrar tokens sin cargar contexto ni leer más de lo necesario.
---

# Token Saver Router

## Objetivo

Elegir la skill correcta con el menor costo posible de contexto. Esta skill no resuelve la tarea final: decide una ruta corta y evita activar todas las skills “por si acaso”.

## Cuándo usarla

- Al inicio, cuando todavía no está claro cómo abordar la tarea sin gastar de más.
- Cuando hay varias skills posibles y quieres elegir solo una principal.
- Cuando necesitas un máximo de 2 skills en secuencia, no una cadena larga.

## Ancla repo-aware para Equarys

Si el proyecto es Equarys y el dominio no está claro, antes de elegir una skill conviene revisar la carpeta:

- `docs/about_project/token_optimization/README.md`
- `/.windsurf/workflows/repo-aware-entry.md`

Esa carpeta sirve como ancla barata para decidir si hace falta memoria, lectura quirúrgica o planificación con archivos.

## Enrutamiento rápido

Elige **una sola skill principal** según la necesidad dominante:

- `engram-context-first`: si primero conviene recuperar memoria, decisiones previas, rutas o contexto ya conocido.
- `surgical-file-reader`: si falta confirmar un dato puntual en archivos concretos con lectura mínima.
- `planning-with-files`: si hace falta un plan breve basado en archivos reales a tocar, no un plan abstracto.
- `context-condense`: si ya existe demasiado contexto y necesitas compactarlo antes de seguir.
- `skill-sharpen-lite`: si el flujo actual, una skill o un plan ya armado está gastando tokens de más.

## Regla de elección

1. Detecta el cuello de botella principal:
   - falta de contexto previo -> `engram-context-first`
   - falta de evidencia en archivos -> `surgical-file-reader`
   - falta de dirección concreta -> `planning-with-files`
   - exceso de contexto acumulado -> `context-condense`
   - exceso de pasos o lectura redundante -> `skill-sharpen-lite`
2. Activa solo esa skill.
3. Solo combina una segunda skill si la primera deja un siguiente paso claramente necesario.

## Combinaciones permitidas

Usa como máximo **2 skills en secuencia**:

- `engram-context-first` -> `surgical-file-reader`
- `engram-context-first` -> `planning-with-files`
- `surgical-file-reader` -> `planning-with-files`
- `planning-with-files` -> `context-condense`
- `skill-sharpen-lite` -> la skill específica que quede mejor enfocada

## Guardrails

- No cargar las 5 skills juntas.
- No combinar más de 2.
- No usar `context-condense` si el contexto todavía es corto.
- No usar `skill-sharpen-lite` antes de tener algo concreto que recortar.
- Si una skill ya dejó suficiente claridad, ejecutar y parar el enrutamiento.

## Salida esperada

Una decisión breve con este formato:

- `Skill principal: ...`
- `Motivo: ...`
- `Segunda skill opcional: ...` o `No necesaria`
- `Próximo paso: ...`