# Sentinel Invest

Monorepo de **Sentinel Invest**, la plataforma argentina de control de inversiones en InvertirOnline (IOL).

## Estructura

```
apps/
  api/         API Express + Drizzle (Postgres) — puerto 3001
  dashboard/   App React + Vite (shadcn/ui, Tailwind) — puerto 5173
  landing/     Landing page Astro (View Transitions) — puerto 4321
packages/
  tsconfig/       Configs TypeScript base compartidas (@sentinel/tsconfig)
  eslint-config/  Config ESLint compartida (@sentinel/eslint-config)
```

## Requisitos

- Node.js >= 22
- pnpm >= 10 (fijado en `packageManager`)
- Docker (para la base de datos Postgres)

## Comandos

```bash
# Base de datos (Postgres en Docker, puerto 5433)
docker compose up -d db

# Instalar dependencias (desde la raíz)
pnpm install

# Desarrollo: levanta api + dashboard + landing con turbo
pnpm dev

# Verificación
pnpm lint        # lint de todas las apps
pnpm typecheck   # typecheck de todas las apps
pnpm test        # tests (apps/api)
pnpm build       # build de producción de todas las apps
```

## Variables de entorno

Cada app mantiene su propio `.env` (gitignored):
- `apps/api/.env` — DATABASE_URL, JWT, Google OAuth, ENCRYPTION_KEY, IOL, AGENT
- `apps/dashboard/.env` — VITE_SERVER_ORIGIN

## Notas

- El dashboard usa `oxlint` como linter; `apps/api` y `apps/landing` usan la ESLint config compartida.
- El proxy de Vite del dashboard redirige `/api` a `http://localhost:3001`.

## CI

GitHub Actions corre en cada push/PR a main: lint, typecheck, test y build vía turbo (.github/workflows/ci.yml).
