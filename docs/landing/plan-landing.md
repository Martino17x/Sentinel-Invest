# Plan: Landing de Sentinel Invest (Astro + View Transitions) — v2 con decisiones confirmadas

> Plan para un agente implementador. Contexto en `docs/landing/`: `identidad-visual.md`, `funcionalidades.md`, `screens-analizadas.md`, `resumen.md`, `screenshots/{desktop,mobile}/` (20 capturas sanitizadas, demo cuenta `123456`) y `analisis/*.txt`. También en Engram (proyecto sentinel-invest): obs #4966 (preparativos), #4969 (skills de animación), #4971 (este plan).

## 1. Contexto y estado actual
- **Monorepo** pnpm + Turborepo: `apps/{api,dashboard,landing}`, `packages/{tsconfig,eslint-config}`. Rama `codex/landing-page-monorepo`.
- **`apps/landing`** (placeholder listo): Astro 5.18, `src/layouts/Base.astro` con `<ClientRouter />` (View Transitions), `src/pages/index.astro`, `src/styles/global.css`. Scripts: dev/build/check/lint.
- **Preparativos listos**: 20 capturas (demo) en `docs/landing/screenshots/`; análisis con `C:\Users\Martino\.codex\vision.js`; 4 docs de identidad/funcionalidades/pantallas/resumen.
- **Dev**: `pnpm dev` → api :3001 (`IOL_PROVIDER=mock`), dashboard :5173, landing :4321; DB en Docker. Usuario demo: `demo@sentinel.dev` / `Demo1234!`.
- **Identidad real**: tipografía **Geist**; theme shadcn neutro light/dark (primary casi negro `oklch(0.205 0 0)`); charts esmeralda/violeta/azul/ámbar/cyan; verde de marca **Synara** `#0b6749 → #064028`; tono voseo rioplatense ("Tu cartera de inversiones, controlada").

## 2. Objetivo
Landing pública que venda **Sentinel**: control de inversiones en IOL **solo lectura** (nunca ejecuta órdenes), cotizaciones AR/US en tiempo real, análisis técnico con señal compuesta 0–100, reportes mensuales (TWR + comparativa Merval), dólar del día y **agente IA vía MCP**. **Multipágina** con **View Transitions** (por eso el ClientRouter), responsive, accesible (WCAG AA), SEO, con las capturas reales (mock demo).

## 3. Paso 0 — Skills de animación (✅ YA INSTALADAS en `.agents/skills/`)
`gsap-core`, `gsap-scrolltrigger`, `gsap-timeline` (greensock/gsap-skills); `review-animations`, `animation-vocabulary` (emilkowalski/skills); `motion-design` (lottiefiles/motion-design-skill); `animation-on-scroll` (mengto/skills). Ya estaban: `gpt-taste` (GSAP), `ui-ux-pro-max` (presets GSAP), `impeccable` (animate), `astro-framework` (VT), `high-end-visual-design`. No existe `@astrojs/animation` → **VT nativas de Astro + GSAP**.

## 4. Decisiones confirmadas (por el usuario)
- **Estilos: Tailwind v4** en la landing (`@tailwindcss/vite` + `@import "tailwindcss"` + tokens en `@theme`, `--font-sans: Geist`).
- **Multipágina** con View Transitions (páginas definidas abajo).
- **Favicon/logo**: usar el **logo de la app** — cuadrado redondeado oscuro (primary `≈ #171717`) con ícono de **línea de tendencia ascendente** (TrendingUp de lucide) en blanco, como el del login. Crear `apps/landing/public/favicon.svg` con ese mark y linkearlo en `<head>`.
- Skills de animación: instaladas (Paso 0).

## 5. Estructura multipágina (rutas concretas)
Layout base `src/layouts/Base.astro` (ya con `<ClientRouter />`): Header sticky (`transition:persist`) + Footer; transiciones `transition:animate="fade"` entre páginas.

1. **`/` (index)** — Hero: tagline *"Tu cartera de inversiones, controlada."* + subtítulo (control total, solo lectura, todo en una vista) + CTAs "Crear cuenta"/"Ingresar" + mockup `desktop/inicio.png` con reveal. Secciones: "Por qué Sentinel" (badges: solo lectura, AES-256, TWR, Merval) → preview de funcionalidades (3-4 cards con screenshots) → "Cómo funciona" (3 pasos: Creá tu cuenta → Conectá tu IOL → Controlá todo) → CTA final.
2. **`/funcionalidades`** — Grid completo de features con screenshots: Portafolio (`desktop/portfolio`), Operaciones (`desktop/operations`), Cotizaciones AR/US (`desktop/quotes` + `desktop/quote-detail`), Análisis con señal técnica (`desktop/analysis`), Reportes TWR/Merval (`desktop/reports`), Dólar (`desktop/inicio` sección dólar). Detalle breve de cada una (usar `funcionalidades.md`).
3. **`/pantallas`** — Galería showcase de capturas: desktop + mobile (tabs o grid), con las 20 capturas sanitizadas (hero: `desktop/inicio`, `mobile/inicio`, etc.).
4. **`/agente`** — Sección IA/MCP (diferencial): "tu agente lee tu cartera en tiempo real" — agentes soportados (Claude Code, Cursor, Codex, opencode, gemini-cli), tools de lectura (`get_portfolio`, `get_quote`, `search_instruments`, `get_dollar_rates`), API Keys, screenshot `desktop/agent-connect.png`.
5. **`/seguridad`** — Confianza: solo lectura garantizado, cifrado AES-256, desconexión total, múltiples cuentas; screenshot `desktop/connect.png`.
6. **Footer (todas)**: enlaces a Términos y Privacidad → `/terms` y `/privacy` del dashboard (`http://localhost:5173/terms`, `/privacy`).

## 6. Implementación técnica (solo `apps/landing`)
- **Tailwind v4**: instalar `@tailwindcss/vite` y agregar al `astro.config.mjs`; `src/styles/global.css` → `@import "tailwindcss"` + `@theme` con tokens (colores de identidad, `--font-sans: "Geist Variable"` vía `@fontsource-variable/geist`).
- **Componentes** Astro por sección: `Header.astro`, `Footer.astro`, `Hero.astro`, `Features.astro`, `Screenshots.astro`, `AgentMCP.astro`, `Security.astro`, `HowItWorks.astro`, `CTA.astro`.
- **Animaciones**: VT nativas (`transition:animate="fade"` en `<main>` por página, `transition:persist` en header/footer); reveals con **GSAP ScrollTrigger** en `<script>` global del layout; micro-interacciones hover CSS. **Respetar `prefers-reduced-motion`** y anti-slop (sin bounce, sin gradientes púrpura, sin cards genéricas — ver `kill-ai-slop`, `impeccable`, `review-animations`).
- **Favicon**: `apps/landing/public/favicon.svg` (cuadrado redondeado `#171717` + polyline trending-up blanco, estilo lucide TrendingUp) + `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` en `Base.astro`.
- **Assets**: copiar PNGs de `docs/landing/screenshots/` a `apps/landing/public/screens/`; excepción de gitignore `!apps/landing/public/screens/` para versionarlas.
- **Enlaces**: CTAs a `http://localhost:5173/register` y `/login` (reemplazar por URL de prod cuando exista).
- **SEO**: `<title>`/meta description por página, Open Graph (`og:image` con una captura), `sitemap.xml`, `robots.txt`, JSON-LD `SoftwareApplication`, `lang="es"`.

## 7. Verificación y calidad
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde (turbo; escalado: el binario de turbo no es legible en el sandbox → `require_escalated`).
- **Visual QA**: capturar la landing (desktop 1440×900, mobile 390×844) con Playwright MCP → `docs/landing/screenshots/landing/`; revisar con `node C:\Users\Martino\.codex\vision.js <img>`; correr `kill-ai-slop` y `impeccable critique` sobre HTML/CSS.
- **Accesibilidad**: contraste AA, focus visible, `prefers-reduced-motion`.
- **Commits** convencionales atómicos (git-commit-rules; `git -c safe.directory='C:/Users/Martino/Documents/PROGRAMACION III/Invertir'`).

## 8. Criterios de aceptación
- Landing multipágina completa, responsive, con VT + reveals suaves, sin over-animación ni datos reales (solo mock demo).
- Favicon con el logo de la app (trending-up). Build/tests verdes. CTAs funcionan y apuntan al dashboard.

## 9. Decisiones restantes (no bloqueantes)
- URL de producción para CTAs (cuando exista dominio).
- ¿Variante dark-mode de la landing? (default: clara, consistente con el dashboard light).
