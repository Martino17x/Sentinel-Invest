# Plan: Landing de Sentinel Invest (Astro + View Transitions)

> Plan para un agente implementador. Contexto completo en `docs/landing/`: `identidad-visual.md`, `funcionalidades.md`, `screens-analizadas.md`, `resumen.md`, `screenshots/{desktop,mobile}/` (20 capturas sanitizadas) y `analisis/*.txt`. También en Engram (proyecto sentinel-invest): obs de preparativos y obs de skills de animación.

## 1. Contexto y estado actual
- **Monorepo** pnpm + Turborepo: `apps/{api,dashboard,landing}`, `packages/{tsconfig,eslint-config}`. Rama `codex/landing-page-monorepo`.
- **`apps/landing`** (placeholder listo): Astro 5.18, `src/layouts/Base.astro` con `<ClientRouter />` (View Transitions), `src/pages/index.astro`, `src/styles/global.css`. Scripts: dev/build/check/lint.
- **Preparativos listos**: 20 capturas (demo: cuenta `123456`, avatar `UD`) en `docs/landing/screenshots/`; análisis con `C:\Users\Martino\.codex\vision.js` (MiMo V2.5); 4 docs de identidad/funcionalidades/pantallas/resumen.
- **Dev**: `pnpm dev` → api :3001 (`IOL_PROVIDER=mock`), dashboard :5173, landing :4321; DB en Docker (`docker compose up -d db`). Usuario demo: `demo@sentinel.dev` / `Demo1234!`.
- **Identidad real** (código + capturas): tipografía **Geist**; theme shadcn neutro light/dark (primary casi negro `oklch(0.205 0 0)`); paleta de charts esmeralda/violeta/azul/ámbar/cyan; verde de marca **Synara** `#0b6749 → #064028`; tono **voseo rioplatense** ("Tu cartera de inversiones, controlada"). Leftovers de template a confirmar: favicon "Z" violeta/cian, `--sidebar-primary` dark azul, ícono `TrendingUp` de lucide como logo.

## 2. Objetivo
Landing pública que venda **Sentinel**: control de inversiones en IOL **solo lectura** (nunca ejecuta órdenes), cotizaciones AR/US en tiempo real, análisis técnico con señal compuesta 0–100, reportes mensuales (TWR + comparativa Merval), dólar del día y **agente IA vía MCP**. Astro + View Transitions, responsive, accesible (WCAG AA), SEO, usando las capturas reales (mock demo) para mostrar el producto.

## 3. Paso 0 — Skills de animación (instalar, con red/escalado)
```bash
npx skills add greensock/gsap-skills --skill gsap-core -a codex --copy -y
npx skills add greensock/gsap-skills --skill gsap-scrolltrigger -a codex --copy -y
npx skills add greensock/gsap-skills --skill gsap-timeline -a codex --copy -y
npx skills add emilkowalski/skills --skill review-animations -a codex --copy -y
npx skills add emilkowalski/skills --skill animation-vocabulary -a codex --copy -y
# Opcionales:
npx skills add lottiefiles/motion-design-skill --skill motion-design -a codex --copy -y
npx skills add mengto/skills --skill animation-on-scroll -a codex --copy -y
```
Ya instaladas que aplican: `gpt-taste` (GSAP Motion), `ui-ux-pro-max` (presets GSAP), `impeccable` (comando `animate`), `astro-framework` (referencia `references/view-transitions.md`), `high-end-visual-design`. **No instalar packs enteros** (saturan contexto). No existe `@astrojs/animation` ni skill "astro-animation" madura → usar VT nativas de Astro + GSAP.

## 4. Paso 1 — Confirmar identidad con el usuario (bloqueante leve)
- **Logo/favicon**: ¿reemplazar la "Z" violeta por un mark propio? Default: mark geométrico **verde** (familia Synara) + wordmark "Sentinel" en Geist.
- **Paleta de charts vibrante**: mantener (default) o tonarla.
- **Acento de marca de la landing**: verde Synara (default) sobre base neutra clara (y variante oscura opcional).

## 5. Paso 2 — Estructura (single-page + anchors; default)
1. **Header** sticky (`transition:persist`): logo + nav (Funcionalidades, Pantallas, IA, Seguridad) + CTAs "Ingresar" / "Crear cuenta".
2. **Hero**: tagline *"Tu cartera de inversiones, controlada."* + subtítulo (control total, solo lectura, todo en una vista) + CTA primario + mockup con `desktop/inicio.png` (reveal animado).
3. **Confianza/números**: badges — solo lectura, AES-256, Merval, TWR; o métricas del demo (total ~$907.346, dólar, distribución).
4. **Funcionalidades** (grid): Portafolio, Operaciones, Cotizaciones AR/US, Análisis con señal técnica, Reportes TWR/Merval, Dólar — card con screenshot chica cada una.
5. **Showcase de pantallas**: galería desktop + mobile con las capturas sanitizadas (tabs o lightbox simple).
6. **Agente IA (MCP)**: diferencial — "tu agente lee tu cartera" (Claude Code, Cursor, Codex) + `agent-connect.png`.
7. **Seguridad**: solo lectura, cifrado AES-256, desconexión total + `connect.png`.
8. **Cómo funciona**: 3 pasos (Creá tu cuenta → Conectá tu IOL → Controlá todo).
9. **CTA final + Footer**: Términos/Privacidad apuntando a `/terms` y `/privacy` del dashboard.

## 6. Paso 3 — Implementación técnica (solo `apps/landing`)
- **Estilos**: **Tailwind v4** (default; `@tailwindcss/vite` en `astro.config.mjs` + `@import "tailwindcss"`) con tokens propios en `@theme` (colores de identidad, `--font-sans: Geist`). Alternativa aceptada: CSS puro con variables (estado actual). **Decidir antes de escribir**.
- **Componentes** Astro: `Header`, `Hero`, `Features`, `Screenshots`, `AgentMCP`, `Security`, `HowItWorks`, `CTA`, `Footer` (+ primitives si hacen falta).
- **Animaciones**: VT nativas (`transition:animate="fade"` por sección, `transition:persist` en header); reveals con **GSAP ScrollTrigger** en `<script>` global del layout; micro-interacciones hover en CSS. **Respetar `prefers-reduced-motion`** y reglas anti-slop (sin bounce, sin gradientes púrpura, sin cards genéricas).
- **Assets**: copiar PNGs de `docs/landing/screenshots/` a `apps/landing/public/screens/`; agregar excepción de gitignore (`!apps/landing/public/screens/`) si se quieren versionar.
- **Screenshots a usar (default)**: hero → `desktop/inicio`; features → `portfolio`, `operations`, `quotes`, `analysis`, `reports`, `quote-detail`; IA → `agent-connect`; seguridad → `connect`; showcase mobile → `mobile/inicio`, `mobile/quotes`, `mobile/operations`.
- **Enlaces**: CTAs a `http://localhost:5173/register` y `/login` (reemplazar por URL de prod cuando exista).
- **SEO**: `<title>` y meta description, Open Graph (`og:image` con una captura), `sitemap.xml`, `robots.txt`, JSON-LD `SoftwareApplication`, `lang="es"`.

## 7. Paso 4 — Verificación y calidad
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde (turbo, escalado: el binario de turbo no es legible en el sandbox).
- **Visual QA**: capturar la landing (desktop 1440×900, mobile 390×844) con Playwright MCP → `docs/landing/screenshots/landing/` y revisar con `node C:\Users\Martino\.codex\vision.js <img>`; correr `kill-ai-slop` y `impeccable critique` sobre el HTML/CSS.
- **Accesibilidad**: contraste AA, focus visible, `prefers-reduced-motion`.
- **Commits** convencionales atómicos (git-commit-rules; `git -c safe.directory='...'`).

## 8. Criterios de aceptación
- Landing completa, responsive, con VT + reveals suaves, sin over-animación ni datos reales (solo mock demo).
- Build/tests verdes. Docs de `docs/landing/` actualizadas si cambia algo.
- CTAs funcionan y apuntan al dashboard.

## 9. Decisiones pendientes (confirmar con el usuario)
1. Logo/favicon de la landing (¿mark nuevo verde?).
2. Tailwind v4 vs CSS puro.
3. Single-page (default) vs multi-página.
4. ¿Instalar ya las skills del Paso 0?
