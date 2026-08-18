# Identidad visual — Sentinel (código + capturas)

> Combinación de `apps/dashboard/src/index.css`, `tailwind.config.ts`, `public/favicon.svg`, `LoginPage.tsx`, `HomePage.tsx` y colores observados en las capturas (análisis de visión). Los valores oklch se transcriben del código; los hex `≈` son conversión estimada; los "observados" son aproximados.

## 1. Paleta (tokens de `index.css`, light por defecto)

| Token | Valor (oklch) | Hex aprox. |
|---|---|---|
| `--background` | `oklch(1 0 0)` | `#FFFFFF` |
| `--foreground` | `oklch(0.145 0 0)` | `≈ #0A0A0A` |
| `--primary` | `oklch(0.205 0 0)` | `≈ #171717` (casi negro) |
| `--primary-foreground` | `oklch(0.985 0 0)` | `≈ #FBFBFB` |
| `--secondary/--muted/--accent` | `oklch(0.97 0 0)` | `≈ #F5F5F5` |
| `--muted-foreground` | `oklch(0.556 0 0)` | `≈ #737373` |
| `--destructive` | `oklch(0.577 0.245 27.325)` | rojo |
| `--border/--input` | `oklch(0.922 0 0)` | `≈ #E5E5E5` |

**Dark:** fondo `≈ #0A0A0A`, card `≈ #171717`, primary claro, bordes `oklch(1 0 0 / 10%)`.

**Paleta de gráficos** ("vibrante, consistente con el donut"): `--chart-1` esmeralda, `--chart-2` violeta, `--chart-3` azul, `--chart-4` ámbar, `--chart-5` cyan.

**Marca del chat (Synara):** gradiente verde `#0b6749 → #064028` (contraste con blanco 6.9:1 / 11.9:1 documentado en código). Es el único color "de marca" explícito.

**Observado en capturas:** fondos blancos `#FFFFFF` / app mobile `#F5F5F5` / cards `#F9FAFB`; texto `#111827`/`#6B7280`; bordes `#E5E7EB`; positivo verde `≈ #28a745/#4CAF50`; negativo rojo; badges oscuros `#222222`.

## 2. Tipografía
- **Geist Variable** (`@fontsource-variable/geist`) como `--font-sans` global y `--font-heading`. Sans geométrica moderna y neutral, legible para datos financieros.

## 3. Logo / favicon
- **Favicon (`public/favicon.svg`):** forma de "Z"/rayo con degradado **violeta** (`#863bff`, `#7e14ff`), lavanda (`#ede6ff`) y acentos **cian** (`#47bfff`), con blur.
- **Logo en la app (login/register):** cuadrado redondeado con fondo `bg-primary` (negro) e ícono `TrendingUp` de **lucide** en blanco — no usa el favicon.
- **⚠️ POSIBLE LEFTOVER DE TEMPLATE a confirmar:** el favicon violeta/cian es idéntico al default de plantillas v0/Vercel; no coincide con la identidad negra/gris/verde del resto de la app.

## 4. Estilo general
- **Stack:** React + Tailwind v4, **shadcn/ui**, íconos **lucide-react**, dark mode por clase, `--radius: 0.625rem`.
- **Estética "IOL":** home mobile-first (total → disponible → acciones → dólar → inversiones), desktop a dos columnas en `lg+`.
- **Detalles de pulido:** scrollbar custom (7px), `scrollbar-gutter: stable` (evita layout shift), animaciones `tw-animate-css` que respetan `prefers-reduced-motion`.
- **Componentes distintivos:** donut vibrante, score de señal técnica con barras por indicador, FAB de chat Synara (verde), KPIs en cards con ícono, badges, bottom nav mobile, tablas con bid/ask/volumen.

## 5. ⚠️ Posibles leftovers de template a confirmar
1. **Favicon violeta/cian** ("Z" degradado) — candidato nº 1 a reemplazar.
2. **`--sidebar-primary` dark = azul** (`oklch(0.488 0.243 264.376)`) — default de shadcn en un tema que usa negro.
3. **Paleta de gráficos vibrante** (esmeralda/violeta/azul/ámbar/cyan) — declarada intencional en CSS; verificar que sea decisión de producto (resuena con el favicon template).
4. **Ícono `TrendingUp` de lucide como logo** en login — placeholder probable hasta tener logo propio.
5. **Azules observados por visión** (`#2A7DE1` en portfolio viejo, enlaces "azules") — no existen en los tokens; eran interpretación del modelo / estilos residuales.
6. **`tailwind.config.ts`** es un puente vacío ("los tokens reales viven en src/index.css") — señal de scaffold shadcn/v0.

> ⚠️ **Nota de sanitización:** las capturas definitivas usan el **usuario demo** (cuenta `123456`, avatar `UD`). Una primera pasada se hizo con un usuario de prueba que tenía la cuenta real del desarrollador  y su email — se descartó y re-capturó todo con el demo.
