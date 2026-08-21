# Reglas de Desarrollo para Agentes — Sentinel

Reglas del proyecto Sentinel (app de control de inversiones en InvertirOnline).
Stack: Monorepo pnpm + Turborepo — apps/dashboard (React + Vite + TypeScript + shadcn/ui), apps/api (Express + Drizzle + Postgres en Docker), apps/landing (Astro). Gestor de paquetes: pnpm (workspaces + turbo).

## Operaciones Destructivas y Borrado de Datos (CRÍTICO)
- **PROHIBIDO** ejecutar cualquier proceso, query SQL o comando de borrado destructivo (`DELETE`, `TRUNCATE`, `DROP TABLE`, `Remove-Item`, etc.) en la base de datos o en el sistema de archivos sin antes informarle al usuario de manera clara, explícita y detallada:
  1. Qué registros, datos o archivos específicos serán eliminados o modificados.
  2. Cómo se realizará el proceso técnicamente.
  3. Cuál es el impacto exacto y los riesgos asociados a la operación.
- **OBLIGATORIO:** Se debe esperar la aprobación explícita y afirmativa del usuario antes de proceder a la ejecución física de cualquier borrado. No se permiten excepciones bajo ningún supuesto (entornos de pruebas, simulación, local, etc.).

## Migraciones de Base de Datos (CRÍTICO)
- Las migraciones se generan con **Drizzle Kit**: `pnpm --filter @sentinel/api db:generate` (en `apps/api/`) — NUNCA editar a mano una migración ya aplicada.
- El esquema vive en `apps/api/src/db/schema.ts` (TypeScript). Las migraciones generadas van a `apps/api/drizzle/`.
- Aplicar con `pnpm --filter @sentinel/api db:migrate`. La BD local corre en Docker (`docker compose up -d db`, puerto 5433).
- **PROHIBIDO** editar un archivo de migración ya aplicado. Crear siempre una migración incremental nueva.

## Seguridad (CRÍTICO)
- Las credenciales de IOL de los usuarios SIEMPRE cifradas con AES-256-GCM (`apps/api/src/lib/crypto.ts`, clave en `ENCRYPTION_KEY` del `.env`). NUNCA en texto plano.
- Los secretos viven en `apps/api/.env` (gitignored). NUNCA hardcodear keys/tokens en el código.
- El refresh token de IOL se rota y se guarda cifrado en `iol_connections`.
- La app es SOLO LECTURA sobre la cuenta IOL: nunca ejecuta órdenes de compra/venta.
- Todo recurso del usuario se filtra por `req.user.id` (multitenant) — nunca exponer datos de otros usuarios.

## Estandarización de Componentes React (CRÍTICO)
- **SOLID y SRP obligatorios**: componentes con Responsabilidad Única y patrón Container-Presentational cuando aplique.
- Lógica de datos/API en `apps/dashboard/src/lib/` (api.ts, contexts). Componentes de UI en `apps/dashboard/src/components/ui/` (shadcn). Páginas en `apps/dashboard/src/pages/`. Componentes de layout en `apps/dashboard/src/components/layout/`.
- **Autocarga de Skills**: al trabajar con componentes React complejos, cargar `react-solid-rules` (`.agents/skills/react-solid-rules/SKILL.md`).

## Animaciones de UI (CRÍTICO)
- TODOS los componentes que aparecen/desaparecen (modales, drawers, dropdowns, popovers, tooltips, banners, listas nuevas, acordeones) DEBEN tener animaciones de entrada Y salida.
- Usar `tw-animate-css` (ya importado en `apps/dashboard/src/index.css`): clases `animate-in`/`animate-out` con `fade-in`/`zoom-in`/`slide-in-from-*` según el caso, SIEMPRE respetando `prefers-reduced-motion` (`motion-reduce:animate-none` / `motion-reduce:transition-none`).
- Acordeones/expansiones: transición de altura con `grid-rows-[0fr]` → `grid-rows-[1fr]` manteniendo el contenido montado (así la salida también anima).
- Componentes sin animación = bug de UI.

## Diálogos nativos prohibidos (CRÍTICO)
- **NUNCA** usar `alert`, `confirm`, `prompt` nativos del navegador (`window.alert`, `window.confirm`, `window.prompt`) en ninguna parte del sistema. Usar siempre `Dialog` / `AlertDialog` del design system (`apps/dashboard/src/components/ui/dialog.tsx` — shadcn + Radix).
- Patrón de confirmación destructiva: `Dialog` minimalista con título `¿Eliminar ...?`, descripción del impacto irreversible, botones `Cancelar` (outline) y `Eliminar` (destructive). El `Dialog` ya incluye animaciones `animate-in/out` y respeta `prefers-reduced-motion`.
- Toda confirmación debe ser accesible (focus trap, aria, escape) — lo que provee Radix Dialog — nunca un `confirm()` bloqueante.

## Skills de calidad OBLIGATORIAS según contexto

Si el contexto aplica, **CARGAR OBLIGATORIAMENTE la skill ANTES de escribir código o ejecutar git**.

| Contexto | Skill | ¿Cuándo cargar? |
|---|---|---|
| UI/UX (interfaces, modales, pantallas) | `anti-vibecoded` | Al editar o crear cualquier UI |
| Componentes React / lógica de estado / modularización | `react-solid-rules` | Antes del primer cambio de código en componentes |
| Frontend (pantallas, dashboards, apps) | `interface-design` | Al diseñar o construir pantallas |
| Diseño responsive / cards / tablas | `web-quality-audit` | Al revisar UI en múltiples viewports |
| Commits / Git / Versionado | `git-commit-rules` | Antes de staging y commit |
| Diseño de APIs REST | `api-design-principles` | Al crear o modificar endpoints |
| Diseño UI / Componentes genéricos | `frontend-design`, `design-taste-frontend`, `ui-ux-pro-max` | Antes de diseñar o crear componente UI |
| Auditoría visual fina | `high-end-visual-design`, `impeccable`, `stitch-design-taste` | Al pulir UI existente |

## Diseño y Componentes UI — Análisis Obligatorio de Skills (CRÍTICO)

**Antes de diseñar o crear CUALQUIER componente de UI, analizar OBLIGATORIAMENTE las skills relevantes y aplicarlas. No diseñar a ciegas.**

Pasos mandatorios (en orden):

1. **Relevamiento de skills disponibles** — listar `anti-vibecoded`, `frontend-design`, `design-taste-frontend`, `ui-ux-pro-max`, `interface-design`, `impeccable`, `stitch-design-taste`, `high-end-visual-design`, etc. Determinar cuáles aplican al caso (banner/alert, card, tabla, modal, etc.).
2. **Lectura efectiva** — cargar (`SKILL: Load ... before starting`) y leer la `SKILL.md` + references de cada skill aplicable (ej: `anti-vibecoded` → pastel ban, glassmorphism, pill badges; `frontend-design` → jerarquía, tipografía; `ui-ux-pro-max` → estilos/paletas recomendadas).
3. **Aplicación verificable** — justificar en el diff/PR qué regla de qué skill se aplicó (ej: “banner sólido `bg-amber-500 text-white` per anti-vibecoded #6/#9/#10 — pastel prohibido”).
4. **Validación** — correr `rg "bg-amber-50|bg-emerald-50|border-amber-200"` y checklist de la skill antes de entregar.

> Regla espejo en `.agents/rules/ui-skills.md` — misma obligatoriedad. Si una UI se entrega sin este análisis, se considera bug de proceso.

## Reglas de Sub-agentes, Inyección de Skills y Git (CRÍTICO)
- **Inyección Mandatoria de Skills en Sub-agentes**: Al lanzar sub-agentes para tareas de ejecución (código, UI, SQL, git), el orquestador DEBE auto-inyectar SIEMPRE las referencias de skills de calidad correspondientes (`SKILL: Load ... before starting`), incluyendo obligatoriamente `git-commit-rules` para cualquier operación de staging y commit.
- **Reglas de Git y Commits**: Queda **estrictamente prohibido** ejecutar `git add .` a ciegas. Todo staging debe ser granular, atómico y verificado archivo por archivo siguiendo la skill `git-commit-rules`.
- Commits en formato **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`...). NUNCA agregar atribuciones de IA ("Co-Authored-By").

## Proveedores de datos (IOL)
- La app consume la API de InvertirOnline a través del adaptador `IolProvider` (`apps/api/src/services/iol/`).
- `IOL_PROVIDER=mock|api` y `QUOTE_PROVIDER=iol|byma|auto` en `apps/api/.env` controlan la fuente de datos.
- NUNCA mostrar datos falsos como reales: si un proveedor falla, degradar con estado honesto (badge "Mercado cerrado", mensajes claros) — los mocks son SOLO para desarrollo local.
- Los endpoints de mercado de IOL pueden estar caídos (500/400); el fallback a BYMADATA (`BymaDataProvider`) es la capa de cotizaciones real.
