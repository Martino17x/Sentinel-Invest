---
name: anti-vibecoded
description: >
  Evita patrones visuales genéricos “vibecoded” en interfaces de Equarys y fuerza decisiones de UI con identidad de producto.
  Trigger: usar cuando se diseñe, edite o revise UI/UX (componentes, pantallas, modales, cards, estados, microcopy visual).
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.1"
---

# Anti Vibecoded (Equarys)

> [!IMPORTANT]
> Es OBLIGATORIO cargar, leer y consultar la skill `anti-vibecoded` antes de realizar cualquier cambio, adición o revisión de código en la interfaz de usuario (frontend) del repositorio.

## Cuándo usar

- Cambios en UI/UX de dashboard o catálogo.
- Refactors visuales de cards, badges, iconografía, colores o jerarquía.
- Revisión de PRs donde la UI se vea “pl## Reglas críticas (MUST)

1. **Prohibido `border-l-*` decorativo en cards.** Extensión: Prohibido simular bordes coloreados de un solo lado (en cualquier borde de la tarjeta: superior, izquierdo, derecho o inferior) mediante elementos internos posicionados absolutamente (ej: `<div className="absolute left-0 top-0 bottom-0 w-1 bg-[...]">`) o mediante selectores de pseudo-elementos (`after:border-l-*`, `after:border-t-*`, etc.). Si se necesita indicar estado, usar un indicador funcional integrado como un status dot junto al texto o el contraste tipográfico.
2. **Prohibido `Sparkles` fuera de Synara** y contexto explícito de asistente IA.
3. **Prohibido gradiente genérico `from-blue-* to-purple-*` en superficies principales.**
4. **Todo ícono debe representar acción o dato de negocio (nada decorativo).**
5. **No usar badges/chips flotantes sin función operativa.**
6. **OBLIGATORIEDAD DEL THEME SYSTEM: Prohibido usar colores estáticos o escalas de Tailwind fijas (`bg-gray-100`, `text-slate-600`, `bg-emerald-50`, `border-amber-100`). TODO contenedor, texto, aviso, badge o elemento decorativo DEBE utilizar variables semánticas del Theme System de Equarys (`var(--bg-surface)`, `var(--surface-1)`, `var(--surface-2)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`, `var(--border-default)`, `var(--metallic-green)`, etc.) para adaptarse a Light/Dark Mode y cualquier tema activo (Ocean, Monokai, Esmerald, etc.).**
7. **Mantener identidad “British Racing Green Metallic” y claridad operativa.**
8. **Prohibido encajonar contenidos principales de bienvenida en tarjetas blancas flotantes rígidas sobre fondos grises.** El contenido debe fluir integrado con el fondo principal del panel.
9. **Los íconos encerrados en contenedores de fondo con colores pasteles o de estados suaves (ej. `bg-blue-50`, `bg-yellow-100`, etc.) son un antipatrón vibecoded trillado.** Renderizar el ícono solo, con su color semántico directo y sin fondo decorativo artificial.
10. **Prohibido el uso de 'pill badges' (insignias redondeadas) con fondo y contorno pastel de color de estado junto a iconos de check genéricos para representar estados o versiones de software.** Prácticamente siempre se debe preferir texto plano sin fondo ni borde, o indicadores funcionales directos en un color semántico discreto, manteniendo un aspecto profesional y limpio.
11. **Prohibido anidar tarjetas blancas o grises con bordes y sombras para contener elementos de datos simples, textos de ayuda o botones de navegación de flechas (como `< 1 / 2 >`).** Estos elementos deben fluir de forma directa y transparente sobre el fondo general (o del contenedor padre) sin recuadros adicionales innecesarios. Las microinteracciones de los botones de navegación se deben lograr mediante un hover translúcido sutil sobre el ícono suelto.
12. **Prohibido glassmorphism decorativo (`backdrop-filter: blur()`) aplicado sin propósito funcional real.** El blur no debe usarse como atajo visual para "parecer moderno". Si un elemento no necesita separar fondos superpuestos (modales, dropdowns), no lleva blur.
13. **Prohibido gradient text en métricas, títulos o cualquier elemento textual.** El texto con gradiente (`background: linear-gradient` + `-webkit-background-clip: text`) es un patrón ubicuo de IA que parece moderno pero comunica "plantilla". Usar colores sólidos semánticos o de marca.
14. **Prohibido paletas neón y combinaciones cyan-on-dark (`text-cyan-400` sobre `bg-slate-900` o similar).** Estas paletas son el default de IA para "verse moderno". Equarys usa British Racing Green Metallic con una paleta sobria y profesional. Los acentos neón no pertenecen al sistema.
15. **Prohibido usar emojis como iconos de navegación, bullets de listas, reemplazo de iconos funcionales o decoración de secciones.** Los emojis solo están permitidos en microcopy con tono, nunca como elemento de interfaz. Usar Lucide icons consistentes.
16. **Prohibido botones con gradiente (`bg-gradient-to-r from-* to-*`).** Los botones deben ser sólidos, con color de marca plano y hover sutil por opacidad. Los gradientes en botones son un patrón Web 2.0 que la IA reprodujo masivamente.
17. **Prohibido el patrón de secciones con fondos alternados (zebra striping: `bg-gray-50 → bg-white → bg-gray-50 → bg-white`) como estructura de página.** El fondo alternado sin razón de contenido es template puro. Usar el fondo base consistente y solo cambiar cuando hay un cambio genuino de contexto de información.
18. **Prohibido repetir el mismo layout de 3 columnas idénticas (`grid-cols-3 gap-4`) para secciones distintas.** La estructura de layout debe responder al contenido: 2 columnas, 4 columnas, asymmetrical, full-width, según lo que el dato requiera.
19. **Prohibido usar múltiples acentos de color en distintos elementos sin lógica semántica.** El color es un recurso compartido: un solo acento de marca, colores semánticos solo para estados reales (error, success, warning). Si todo está destacado, nada lo está.
20. **Prohibido usar Inter, Roboto, Open Sans o `system-ui` como familia tipográfica principal sin justificación.** Estos son los defaults de entrenamiento de IA. En Equarys la tipografía debe alinearse con el sistema de diseño definido.
21. **Prohibido el hero layout predecible de IA (badge → h1 → 2 CTAs → 3-column features).**
22. **Prohibido encajonar botones o chips de estado de filtros rápidos en pequeñas tarjetitas con bordes rígidos y fondos sólidos que simulen una tarjeta individual flotante.** Deben integrarse de forma plana al fondo general usando fondos translúcidos sin bordes.
23. **Prohibido el uso de status dots (puntitos decorativos de color) antes del texto en botones de filtro rápidos de estado.** La semántica debe ser transmitida a través del propio icono funcional de negocio (ej: PackageX, AlertTriangle) o la tipografía.
24. **Prohibido el uso injustificado de barras laterales (aside sidebars) para estructurar paneles principales cuando no hay contenido secundario sustancial.** La información debe organizarse en una grilla o bento equilibrado de una sola columna o flujo integrado, evitando fragmentar la pantalla en columnas desbalanceadas de 2/3 y 1/3 sin necesidad operativa real.


## Reglas de Componentes (Filtros y Chips)

- **Prohibición de puntos de colores decorativos (dots) en filtros**: Prohibido usar puntos de estado genéricos (círculos de colores) dentro de los chips o toggles de filtrado. En su lugar, los controles de filtro deben usar iconos explícitos y específicos del dominio (como `PackageX` de Lucide para "sin stock" y `AlertTriangle` para "stock bajo") para transmitir un significado inmediato.
- **Prohibición de tarjetas blancas flotantes y píldoras toscas para chips**: Prohibido envolver chips de filtro en cajas flotantes blancas pesadas o formas de cápsula/óvalo (`rounded-full`). En su lugar, usar chips redondeados rectangulares limpios (`rounded-xl` o `rounded-lg`) con texto de alto contraste e iconos específicos del dominio.
- **Prohibición de tarjetas blancas flotantes o bordes rígidos en selectores de estado/toggles/chips activos o inactivos**: No usar tarjetas blancas flotantes rígidas con bordes de color gris sólido para contener selectores/chips. Se deben preferir de forma obligatoria diseños planos (flat) o translúcidos con fondos atenuados que se integren al fondo del panel y cambien de estado suavemente sin bordes rígidos innecesarios.


## Flujo mínimo de revisión

1. Detectar anti-patrones en el diff (clases, iconos, badges, gradientes).
2. Reemplazar por patrón funcional y theme-safe (tokens, jerarquía, microcopy integrado).
3. Validar que cada elemento visual tenga propósito de negocio.
4. Confirmar consistencia con reglas globales de `AGENTS.md` (sin rediseño no pedido, copy neutral, accesibilidad).

## Anti-patrones → reemplazo recomendado

| Anti-patrón | Evitar | Reemplazo |
|---|---|---|
| Borde izquierdo decorativo | `border-l-4 ...` | Card completa con `border` + `surface` tokenizada |
| “Magia IA” genérica | `Sparkles` | Ícono funcional del dominio (estado/acción real) |
| Gradiente plantilla IA | `from-blue-* to-purple-*` | Paleta/tokens Equarys (`--brand-primary`, `--surface-*`) |
| Badge sueltos sin acción | “Precios de lanzamiento” flotante | Microcopy integrado en bloque principal |
| Ícono ornamental | Íconos grandes sin semántica | Ícono ligado a métrica, estado o CTA |
| Borde/línea decorativa simulada de un solo lado | Divs absolutos en cualquier borde (ej: `left-0 w-1 bg-...`) o `after:border-l-*`/`after:border-t-*` | Indicador funcional nativo integrado (status dot, badge a la derecha o contraste tipográfico) |
| Íconos con fondos pasteles | Íconos dentro de contenedores con fondos suaves (ej. `bg-blue-50`, `bg-yellow-100`) | Ícono solo con su color semántico directo y sin fondo decorativo artificial |
| Pill badges pastel de estado con icono check o versión | Pill badges redondeados con fondo/borde pastel y check genérico o versión | Texto plano limpio, o indicador funcional de color semántico discreto sin fondo/borde |
| Anidar tarjetas de datos simples/ayuda/navegación | Tarjetas blancas/grises con bordes/sombras para datos simples, textos de ayuda o botones (ej. `< 1 / 2 >`) | Fluir directo y transparente sobre fondo general; microinteracciones con hover translúcido sutil sobre ícono suelto |
| Chips de estado rápidos en tarjetas blancas | Chips de stock con fondo blanco y borde gris sutil tipo tarjeta flotante | Diseño plano translúcido integrado al fondo (`bg-transparent border-none`) |
| Puntito decorativo en botón de filtro rápido | Puntito de estado de color al lado de "Sin stock" o "Stock bajo" | Ícono de negocio específico del dominio (`PackageX`, `AlertTriangle`) |
| Glassmorphism decorativo | `backdrop-filter: blur()` aplicado como efecto decorativo sin superposición real de capas | Superficies con bordes sutiles y fondos semánticos sin blur. El blur solo en modales/dropdowns con superposición de capas |
| Gradient text en métricas | `background: linear-gradient(...)` + `-webkit-background-clip: text` en números grandes o títulos | Color sólido de marca o semántico. Si necesita énfasis, usar peso tipográfico o tamaño, no gradiente |
| Paleta neón / cyan-on-dark | `text-cyan-400` sobre `bg-slate-900`, acentos neón eléctricos | Paleta British Racing Green Metallic. Acentos sobrios y profesionales |
| Emojis como iconos de UI | Emojis usados como iconos de navbar, bullets, secciones o navegación | Lucide icons consistentes con el sistema. Emojis solo en microcopy contextual |
| Botón con gradiente | `bg-gradient-to-r from-X to-Y` en botones primarios | Botón sólido con bg-metallic-green y hover por opacidad |
| Secciones con fondos alternados (zebra) | `bg-gray-50 → bg-white → bg-gray-50 → bg-white` en secciones de página | Fondo base consistente. Cambiar solo cuando hay cambio genuino de contexto de información |
| Layout 3-columnas idénticas repetido | `grid-cols-3 gap-4` para secciones distintas | Variar estructura: 2 col, 4 col, asymmetrical, full-width según contenido |
| Múltiples acentos de color compitiendo | Cards/sidebar con bordes/accesorios de colores distintos sin lógica semántica | Un solo acento de marca. Colores semánticos solo para estados reales |
| Inter/Roboto/Open Sans default | `font-family: 'Inter', 'Roboto', 'Open Sans', system-ui` sin otra opción | Tipografía definida en el sistema de diseño de Equarys |
| Hero layout predecible de IA | Badge → H1 → Description → 2 CTAs → 3-column features siempre igual | Macro-estructura que responda al contenido específico, no a plantilla SaaS |
| Barras laterales (aside sidebars) injustificadas | Fragmentar la pantalla en columnas desbalanceadas (ej: 2/3 y 1/3) con un aside vacío o de poco contenido | Estructura en grilla o bento equilibrado de flujo integrado o fila única |
## Comandos

```bash
# Buscar patrones vibecoded clásicos
rg "border-l-|Sparkles|from-blue-|to-purple-|rounded-full.*(lanzamiento|nuevo|promo)" apps

# Buscar glassmorphism decorativo
rg "backdrop-filter: blur|backdrop-blur-"

# Buscar gradient text
rg "-webkit-background-clip: text|background-clip: text.*linear-gradient" --include "*.css"

# Buscar emojis como iconos UI (🚀🔥💡✅⚠️🎯📊⭐💎🎉)
rg "[🔄🔧🚀💡✅⚠️🎯📊⭐💎🎉🔍🏆⚡💪🔒🎨📈💰]" apps --include "*.tsx" --include "*.jsx"

# Buscar botones con gradiente
rg "bg-gradient-to-r.*from-" apps

# Buscar paletas neón / cyan-on-dark
rg "text-cyan-|text-teal-400|bg-slate-900|bg-gray-900" apps

# Buscar Inter/Roboto default
rg "font-family.*['\"]?(Inter|Roboto|Open Sans)['\"]?" --include "*.css"

# Buscar hardcodes en rutas theme-aware (ajustar alcance según módulo)
rg "bg-(blue|purple|gray)-|text-(blue|purple|gray)-|#[0-9a-fA-F]{6}" apps
```

## Recursos

- **Guía base**: [VIBECODED_AVOIDANCE_GUIDE.md](references/vibecoded-avoidance-guide.md)

## Checklist rápido

- [ ] No usa `border-l-*` decorativo.
- [ ] No usa sparkles fuera de Synara.
- [ ] No usa gradientes azul-purpura genéricos.
- [ ] Cada ícono tiene propósito funcional.
- [ ] No agrega badges/chips sin función operativa.
- [ ] No encajonas contenidos principales de bienvenida en tarjetas blancas flotantes rígidas sobre fondos grises.
- [ ] No encajonas iconos en contenedores circulares o cuadrados con fondos pastel suaves.
- [ ] No usa tags superiores con estilos llamativos genéricos.
- [ ] No utiliza pre-títulos pequeños "voladores" en mayúsculas como categoría del módulo.
- [ ] No encajonas listas de pasos en tarjetas contenedoras secundarias de color suave.
- [ ] No añade barras de direcciones artificiales que obstruyan la notch o cámara del dispositivo en mockups.
- [ ] Usa `<iframe>` interactivo en mockups de previsualización en vivo en lugar de PNG estático con scroll CSS.
- [ ] No usa tipografías toscas e hiper-pesadas desproporcionadas en títulos.
- [ ] No apila iconos de cabecera verticalmente si se puede usar alineación horizontal elegante.
- [ ] Usa scroll vertical real (`overflow-y-auto`) y anchos máximos en contenedores de onboarding.
- [ ] No usa diseño mobile plano e impersonal (ERP look) en onboarding (usa banners/miniaturas de marca).
- [ ] No usa checklists planos en móvil (usa tarjetas táctiles con buen padding).
- [ ] No decora fondos hero únicamente con círculos repetidos (combina formas geométricas distintas).
- [ ] No usa micro-subtítulos eyebrow en mayúsculas como section-label flotante ("CATÁLOGO ONLINE", "PROCESO DE CONFIGURACIÓN"). La jerarquía la dan el h1 y los iconos.
- [ ] No usa puntitos de colores ni círculos parpadeantes/animados al lado de los títulos de sección.
- [ ] No usa badges semitransparentes tipo pastilla con puntitos parpadeantes/animados para textos decorativos o estáticos.
- [ ] No usa glassmorphism decorativo (`backdrop-filter: blur()`) sin propósito funcional.
- [ ] No usa gradient text en métricas, títulos ni headings.
- [ ] No anida cards más de 2 niveles de profundidad.
- [ ] No usa paletas neón ni cyan-on-dark.
- [ ] No usa emojis como iconos de navegación ni reemplazo de iconos funcionales.
- [ ] No usa botones con gradiente (`bg-gradient-to-r`).
- [ ] No usa fondos alternados tipo zebra striping sin razón de contenido.
- [ ] No repite el mismo layout de 3 columnas para todas las secciones.
- [ ] No usa múltiples acentos de color compitiendo sin lógica semántica.
- [ ] No usa Inter/Roboto/Open Sans como tipografía default.
- [ ] No usa hero layout predecible de IA (badge → h1 → 2 CTAs → 3-column features).
- [ ] No encajona botones rápidos de estado de filtros en tarjetas blancas con bordes duros.
- [ ] No usa status dots decorativos antes del texto en botones de filtro rápidos.
- [ ] No usa barras laterales (aside sidebars) injustificadas si no hay contenido secundario sustancial.
- [ ] Usa tokens de tema.
- [ ] Mantiene identidad Equarys.