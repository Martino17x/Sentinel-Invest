---
name: interface-design
description: This skill is for interface design — dashboards, admin panels, apps, tools, and interactive products. NOT for marketing design (landing pages, marketing sites, campaigns).
---

# Interface Design (Sentinel)

Build interface design with craft and consistency.

## Scope

**Use for:** Dashboards, admin panels, SaaS apps, tools, settings pages, data interfaces.

**Not for:** Landing pages, marketing sites, campaigns.

---

# Project Integration

For this repository, this skill must work **together with** `.agents/AGENTS.md`, not replace it.

When the task involves frontend, UI, UX, dashboards, admin panels, forms, modals, settings pages, data views, or interactive product surfaces, this skill should treat the project rules as hard constraints and apply its design judgment **inside** those limits.

## Project-Specific Constraints (Sentinel)

Before proposing or implementing UI in this project, enforce:

- **Design system**: shadcn/ui + Tailwind 4 con tokens CSS semánticos (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--chart-*` en `client/src/index.css`). NO usar colores estáticos de Tailwind (`bg-gray-100`, `text-slate-600`) — usar las variables semánticas del theme para que Light/Dark funcione.
- **Iconos**: Lucide (`lucide-react`) SIEMPRE. Prohibido emojis como iconos de interfaz (solo microcopy con tono).
- **Responsive**: tablas SOLO en desktop (≥1024px). En mobile/tablet usar cards (componente `ResponsiveTable` o diseño dedicado con jerarquía). Jerarquía de card: identificación → valor principal (HERO) → detalles compactos.
- **Estados honestos**: toda pantalla de datos debe manejar `loading`, `error` y `empty`. Si un proveedor falla o el mercado está cerrado, mostrar el estado real (badges "Mercado cerrado", mensajes claros) — NUNCA datos falsos como reales.
- **Accessibility obligatoria**: `label` asociado, `aria-*`, focus visible, navegación por teclado.
- **Modales/overlays**: cerrar con backdrop click y Esc. Block del scroll del body cuando un overlay está abierto y restaurarlo al cerrar (o usar `scrollbar-gutter: stable` para evitar layout shift). Animaciones de entrada/salida sutiles (opacity).
- **No usar `alert()`, `confirm()`, `prompt()`** — usar componentes del sistema (shadcn Dialog/Alert).
- **Respetar la UI existente**: si el usuario no pidió rediseño explícito, preservar el layout e interacción actual.
- **Cognitive load bajo**: reutilizar convenciones visuales existentes antes de inventar nuevas.
- **Formularios**: inputs numéricos sin spinners, validación con mensajes claros, estados de error inline.
- **Cursor pointer** en todo elemento clickeable (botones nativos `<button>`, filas con onClick).

## Anti-patterns a evitar (anti-vibecoded)

- Gradientes genéricos (`from-blue-* to-purple-*`) en superficies o botones.
- Gradient text en métricas o títulos.
- Glassmorphism decorativo sin propósito funcional (el blur solo en menús/overlays que se superponen a contenido).
- Iconos decorativos sin semántica de negocio.
- Paletas neón / cyan-on-dark.
- Emojis como iconos.
- Bordes decorativos de un solo lado (`border-l-4`) para "estado".
- Status dots decorativos — usar iconos funcionales del dominio.
