---
name: react-solid-rules
description: Directrices de SOLID, SRP, Container-Presentational y custom hooks en React para Sentinel.
---

# React SOLID Rules & Component Architecture (Sentinel)

Esta skill define las reglas obligatorias de diseño de software y arquitectura de componentes para el frontend de Sentinel (Vite + React + TypeScript + shadcn/ui), basadas en los principios SOLID, SRP (Single Responsibility Principle) y el patrón Container-Presentational (Smart/Dumb Components).

## Principios Fundamentales (Ponete las pilas con esto, loco)

1. **S - Single Responsibility Principle (SRP)**:
   - Un componente debe hacer UNA sola cosa. Si tu componente maneja lógica de negocio, llamadas a APIs, validaciones, renderizado de UI complejo y layouts responsivos todo en uno, está MAL. Desacoplá la lógica en hooks y dividí la UI en componentes atómicos.

2. **O - Open/Closed Principle**:
   - Los componentes deben estar abiertos a la extensión pero cerrados a la modificación. Usá composición (`children`) o inyección de componentes/props para extender comportamiento en lugar de agregar condicionales complejos adentro.

3. **L - Liskov Substitution Principle**:
   - Si creás componentes derivados o wrappers, deben poder usarse de la misma forma que el elemento original sin romper la interfaz esperada. Propagá correctamente las props nativas (ej. los componentes shadcn ya lo hacen).

4. **I - Interface Segregation Principle**:
   - No obligues a un componente a depender de props que no usa. Si un componente solo necesita un texto y un color, no le pases el objeto completo. Pasale solo lo que necesita. ¿Se entiende?

5. **D - Dependency Inversion Principle**:
   - Dependé de abstracciones, no de concreciones. Usá contextos o inyección de dependencias (por ejemplo, pasándole manejadores de eventos como props) en lugar de importar instancias globales rígidas dentro de tus componentes dumb.

---

## Patrón Container-Presentational (Smart/Dumb)

En Sentinel estructuramos los componentes interactivos dividiéndolos en dos capas claras:

### 1. Smart Components (Containers / Orchestrators)
- **Rol**: Manejar el estado, interactuar con la API (nuestro backend Express), persistir datos, manejar efectos globales y orquestar subcomponentes.
- **Ubicación**: Generalmente las páginas en `client/src/pages/` o componentes de layout en `client/src/components/layout/`.
- **Regla**: NO deben renderizar estilos de presentación complejos ni layouts densos. Deben delegar el renderizado visual a los dumb components y pasarles el estado y los callbacks necesarios.

### 2. Dumb Components (Presentational Components)
- **Rol**: Renderizar la UI basándose únicamente en las props recibidas.
- **Ubicación**: `client/src/components/ui/` (primitivas shadcn) o componentes atómicos reutilizables.
- **Regla**: Deben ser puros, predecibles y reutilizables. No deben realizar efectos secundarios directos (como `useEffect` llamando a la API) ni acceder al estado global directamente si se puede evitar. Deben gatillar callbacks provistos por el container.

---

## Custom Hooks y Cliente API para Encapsulación de Lógica

Toda lógica no visual debe vivir fuera del componente de UI:

- **Data Fetching**: TODO el fetching de datos DEBE pasar por el cliente central `client/src/lib/api.ts` (apiFetch con refresh automático de tokens). Prohibido hacer `fetch` suelto en los componentes.
- **Estado global de sesión**: vive en `client/src/context/AuthContext.tsx` — consumilo con `useAuth()`, nunca dupliques la lógica de auth.
- **Efectos y State**: `useEffect` se reserva únicamente para sincronizar el componente con eventos externos (carga inicial, listeners, ResizeObserver). Nada de fetching manual con `useEffect` + `useState` si el patrón del proyecto lo resuelve mejor.
- **Naming**: Los hooks deben seguir la convención `use[Domain][Action]` (ej. `usePortfolioData`, `useConnectionState`).
- **Retorno**: Los hooks deben retornar interfaces limpias (variables de estado listas para consumir y funciones callback de alto nivel).

---

## Directrices de Calidad en Sentinel

- **Strict TypeScript**: Siempre tipar todas las props de los componentes y los retornos de los hooks. Evitar el tipo `any` (salvo mapeo de respuestas de terceros acotado al adaptador).
- **Encoding Impecable**: No se toleran errores de encoding ni mojibakes. Guardar todos los archivos en UTF-8 sin BOM.
- **Consistencia Visual**: Seguir el design system de shadcn/ui (tokens CSS en `client/src/index.css`, componentes de `client/src/components/ui/`). No inventar estilos nuevos ni meter UI vibecoded.
- **Responsive**: Tablas SOLO en desktop (≥1024px). En mobile/tablet usar el componente `ResponsiveTable` (cards) o diseño dedicado con jerarquía visual (identificación → valor principal → detalles).
- **Estados honestos**: Si un proveedor de datos falla o el mercado está cerrado, mostrar el estado real (badges, mensajes) — nunca datos falsos como si fueran reales.
