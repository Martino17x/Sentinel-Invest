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

Cada app mantiene su propio `.env` (gitignored). Ver `.env.example` en cada app para la lista completa.

- `apps/api/.env` — DATABASE_URL, JWT, Google OAuth, ENCRYPTION_KEY, IOL, AGENT
  - **Content Providers (noticias)**: `GNEWS_API_KEY` (https://gnews.io — 100 req/día, `lang=es&country=ar`), `FINNHUB_API_KEY` (https://finnhub.io — 60 req/min, header `X-Finnhub-Token`), `NEWS_PROVIDER` flag `gnews|finnhub|tradingview` (default `gnews`; `tradingview` restaura title-only sin consumir cuotas — rollback sin deploy). Sin keys → `warn` al boot y cascade cae a `degraded:true` (TradingView) sin 500.
  - `BRANDFETCH_CLIENT_ID` (opcional mirror server-side; el CDN se usa solo en frontend)
- `apps/dashboard/.env` — `VITE_SERVER_ORIGIN`, `VITE_BRANDFETCH_CLIENT_ID` (https://developers.brandfetch.com — 500k/m free; sin ID el componente `<CompanyLogo>` hace fallback inmediato a lettermark sin request al CDN)

> Copiar: `cp apps/api/.env.example apps/api/.env` y `cp apps/dashboard/.env.example apps/dashboard/.env`.

## Notas

- El dashboard usa `oxlint` como linter; `apps/api` y `apps/landing` usan la ESLint config compartida.
- El proxy de Vite del dashboard redirige `/api` a `http://localhost:3001`.

## CI

GitHub Actions corre en cada push/PR a main: lint, typecheck, test y build vía turbo (.github/workflows/ci.yml).
