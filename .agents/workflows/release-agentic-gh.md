---
description: workflow agentico de release con GH CLI + Changesets para evitar merges sin release
---

# Workflow: Release Agentico (GH CLI + Changesets)

## Objetivo

Asegurar releases consistentes en Equarys, evitando el caso "merge exitoso pero sin release", mediante una secuencia obligatoria con verificación de:

- bump semántico correcto (`patch`, `minor`, `major`)
- changeset presente y consumido localmente (`pnpm changeset version`)
- actualización del Changelog UI (`updates.ts`) en `develop` antes del PR
- PR `develop -> main`
- run de release en `main`
- tags y release publicados
- post-release guardrails (sincronización de `develop` con `main`)

## Regla crítica (OBLIGATORIA)

Antes de crear o editar cualquier changeset, el agente **debe preguntar explícitamente**:

> "¿Qué tipo de versión querés para este cambio: `patch`, `minor` o `major`?"

Sin esa confirmación, el agente **no puede**:

- generar `.changeset/*.md`
- ejecutar `pnpm changeset version`
- abrir PR a `main` para release
- mergear PR de release

## Cuándo usarlo

- cuando el usuario pida "sacar release", "pasar a producción", "publicar versión"
- cuando haya que garantizar que GitHub Release se cree automáticamente
- cuando se use `gh` CLI para abrir/mergear PRs

## Cuándo NO usarlo

- cambios de código sin intención de release
- PRs de feature internos que todavía no van a `main`

## Pre-checks rápidos

1. Confirmar rama actual (`develop` esperada para preparar release).
2. Confirmar que el working tree esté limpio o que solo incluya cambios esperados.
3. Confirmar tipo de bump (`patch|minor|major`) aprobado por el usuario.

## Flujo operativo exacto

1. **Preguntar tipo de versión** (`patch|minor|major`) y esperar respuesta del usuario.
2. **Crear changeset**: Ejecutar `pnpm changeset` para generar la nota de cambio en `.changeset/`.
3. **Consumir changeset localmente**: Ejecutar `pnpm changeset version` para aplicar el bump en `package.json` y actualizar `CHANGELOG.md`.
4. **Actualizar Changelog UI (`updates.ts`) en `develop` ANTES de abrir PR**:
   - Analizar las novedades *con impacto real en el usuario/comerciante* (descartar cambios exclusivos de CI/CD, refactoring o dependencias internas).
   - Agregar la nueva entrada en formato JSON al principio de `apps/dashboard/src/data/changelog/updates.ts`.
5. **Ejecutar verificaciones locales**:
   - `pnpm lint`
   - `pnpm typecheck`
6. **Commit & Push a `develop`**:
   - Hacer commit de la versión, `CHANGELOG.md`, `.changeset` consumido y `updates.ts`.
   - Pushear los cambios a `develop`.
7. **Abrir PR `develop -> main`**:
   - Ejecutar `gh pr create --base main --head develop --title "Release vX.Y.Z" --body "..."`.
8. **Verificar checks, mergear PR y verificar Release (Main)**:
   - Esperar a que los checks de CI (`PR Checks`) estén en verde.
   - Mergear la PR (`gh pr merge` en `main`).
   - Verificar la ejecución del workflow `Release (Main)` en GitHub Actions (confirmar que se generó el tag y la GitHub Release).
9. **Guardrails post-release (higiene de ramas)**:
   - Sincronizar `develop` con `main`:
     ```bash
     git checkout develop && git merge main && git push origin develop
     ```
   - Confirmar que la rama activa final sea `develop`.

## Guardrails anti-fallas

- Nunca asumir bump por defecto: siempre preguntar al usuario.
- Nunca mergear directo a `main` sin haber ejecutado `pnpm changeset` y `pnpm changeset version`.
- Si el run de release dice "No new tag detected", cortar y crear changeset nuevo.
- No cerrar la tarea sin evidencia de tags/releases creados en GitHub.
- Si falla CI, resolver bloqueantes de typecheck/lint/encoding antes de reintentar.
- Al finalizar una subida a producción, el agente DEBE dejar el repo en `develop` (nunca quedarse trabajando en `main`).

## Plantilla mínima de pregunta al usuario

- "Antes de generar la release, confirmame el tipo de versión: `patch`, `minor` o `major`."

## Criterio de éxito

Se considera "release correcta" solo si existen los 4 artefactos:

1. PR mergeado a `main`
2. workflow `Release (Main)` en `success`
3. tag nuevo respecto al estado previo
4. GitHub Release publicada para ese tag
