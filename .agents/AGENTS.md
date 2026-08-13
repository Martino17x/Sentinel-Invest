# Reglas de Desarrollo para Agentes — Sentinel

Reglas del proyecto Sentinel (app de control de inversiones en InvertirOnline).
Stack: Express + Drizzle + Postgres (Docker) + Vite + React + TypeScript + shadcn/ui.

## Operaciones Destructivas y Borrado de Datos (CRÍTICO)
- **PROHIBIDO** ejecutar cualquier proceso, query SQL o comando de borrado destructivo (`DELETE`, `TRUNCATE`, `DROP TABLE`, `Remove-Item`, etc.) en la base de datos o en el sistema de archivos sin antes informarle al usuario de manera clara, explícita y detallada:
  1. Qué registros, datos o archivos específicos serán eliminados o modificados.
  2. Cómo se realizará el proceso técnicamente.
  3. Cuál es el impacto exacto y los riesgos asociados a la operación.
- **OBLIGATORIO:** Se debe esperar la aprobación explícita y afirmativa del usuario antes de proceder a la ejecución física de cualquier borrado. No se permiten excepciones bajo ningún supuesto (entornos de pruebas, simulación, local, etc.).

## Migraciones de Base de Datos (CRÍTICO)
- Las migraciones se generan con **Drizzle Kit**: `npm run db:generate` (en `server/`) — NUNCA editar a mano una migración ya aplicada.
- El esquema vive en `server/src/db/schema.ts` (TypeScript). Las migraciones generadas van a `server/drizzle/`.
- Aplicar con `npm run db:migrate`. La BD local corre en Docker (`docker compose up -d db`, puerto 5433).
- **PROHIBIDO** editar un archivo de migración ya aplicado. Crear siempre una migración incremental nueva.

## Seguridad (CRÍTICO)
- Las credenciales de IOL de los usuarios SIEMPRE cifradas con AES-256-GCM (`server/src/lib/crypto.ts`, clave en `ENCRYPTION_KEY` del `.env`). NUNCA en texto plano.
- Los secretos viven en `server/.env` (gitignored). NUNCA hardcodear keys/tokens en el código.
- El refresh token de IOL se rota y se guarda cifrado en `iol_connections`.
- La app es SOLO LECTURA sobre la cuenta IOL: nunca ejecuta órdenes de compra/venta.
- Todo recurso del usuario se filtra por `req.user.id` (multitenant) — nunca exponer datos de otros usuarios.

## Estandarización de Componentes React (CRÍTICO)
- **SOLID y SRP obligatorios**: componentes con Responsabilidad Única y patrón Container-Presentational cuando aplique.
- Lógica de datos/API en `client/src/lib/` (api.ts, contexts). Componentes de UI en `client/src/components/ui/` (shadcn). Páginas en `client/src/pages/`. Componentes de layout en `client/src/components/layout/`.
- **Autocarga de Skills**: al trabajar con componentes React complejos, cargar `react-solid-rules` (`.agents/skills/react-solid-rules/SKILL.md`).

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

## Reglas de Sub-agentes, Inyección de Skills y Git (CRÍTICO)
- **Inyección Mandatoria de Skills en Sub-agentes**: Al lanzar sub-agentes para tareas de ejecución (código, UI, SQL, git), el orquestador DEBE auto-inyectar SIEMPRE las referencias de skills de calidad correspondientes (`SKILL: Load ... before starting`), incluyendo obligatoriamente `git-commit-rules` para cualquier operación de staging y commit.
- **Reglas de Git y Commits**: Queda **estrictamente prohibido** ejecutar `git add .` a ciegas. Todo staging debe ser granular, atómico y verificado archivo por archivo siguiendo la skill `git-commit-rules`.
- Commits en formato **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`...). NUNCA agregar atribuciones de IA ("Co-Authored-By").

## Proveedores de datos (IOL)
- La app consume la API de InvertirOnline a través del adaptador `IolProvider` (`server/src/services/iol/`).
- `IOL_PROVIDER=mock|api` y `QUOTE_PROVIDER=iol|byma|auto` en `.env` controlan la fuente de datos.
- NUNCA mostrar datos falsos como reales: si un proveedor falla, degradar con estado honesto (badge "Mercado cerrado", mensajes claros) — los mocks son SOLO para desarrollo local.
- Los endpoints de mercado de IOL pueden estar caídos (500/400); el fallback a BYMADATA (`BymaDataProvider`) es la capa de cotizaciones real.
