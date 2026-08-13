# Índice de Workflows de Equarys

Este archivo resume los workflows disponibles en `/.agents/workflows/` y cuándo conviene usar cada uno.

## Workflows disponibles

### `repo-aware-entry.md`

- **Objetivo**: entrada repo-aware para tareas complejas o transversales en Equarys.
- **Usar cuando**:
  - el dominio no es obvio
  - la tarea cruza frontend, servicios y Supabase
  - todavía no está claro por qué app, ruta o entrypoint entrar
- **No usar cuando**:
  - el usuario ya dio archivo, símbolo o pantalla exacta
  - el cambio es pequeño y localizado
- **Entrada recomendada**:
  - `docs/about_project/token_optimization/README.md`
  - `docs/about_project/token_optimization/02_repo_aware_token_map.md`

### `token-saver-operativo.md`

- **Objetivo**: rutina general para ahorrar tokens sin degradar calidad ni seguridad.
- **Usar cuando**:
  - querés una secuencia operativa corta para iniciar, validar y cerrar tareas
  - hay continuidad previa y querés evitar reexplorar el repo completo
  - necesitás presupuesto de lectura y guardrails claros
- **No usar cuando**:
  - la tarea ya está completamente localizada y no requiere rutina adicional

### `release-agentic-gh.md`

- **Objetivo**: ejecutar release con GH CLI + Changesets sin omitir tags/releases.
- **Usar cuando**:
  - se va a promover `develop -> main`
  - se necesita release automática por workflow de GitHub
  - se quiere evitar el caso "merge sin release"
- **No usar cuando**:
  - no hay intención de release en `main`
  - el cambio es solo exploratorio o interno
- **Regla obligatoria**:
  - antes de generar changeset, el agente debe preguntar `patch`, `minor` o `major`

## Orden sugerido de uso

### Tarea compleja en Equarys

1. `AGENTS.md` (raíz)
2. `token-saver-operativo.md`
3. `repo-aware-entry.md` si el dominio sigue sin estar claro

### Tarea puntual con archivo exacto

1. `AGENTS.md` (raíz)
2. lectura mínima del archivo objetivo

### Tarea de release con GH CLI

1. `AGENTS.md` (raíz)
2. `release-agentic-gh.md`
3. ejecutar flujo completo hasta validar tags + GitHub Release

## Regla práctica

Si dudás entre ambos:

- empezá por `token-saver-operativo.md` para el marco general
- saltá a `repo-aware-entry.md` cuando el problema sea transversal o ambiguo

## Mantenimiento

Si se agrega un workflow nuevo en esta carpeta, actualizar este índice con:

- objetivo
- cuándo usarlo
- cuándo no usarlo
- relación con los demás workflows
