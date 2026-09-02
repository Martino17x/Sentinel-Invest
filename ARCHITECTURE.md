# ARCHITECTURE.md — Sentinel Invest

> Fuente única de verdad de arquitectura. Si este archivo y otro doc discrepan, manda este archivo.

---

## 1. Propósito

Este archivo es la **única fuente de verdad** de la arquitectura de Sentinel Invest.

- Define los principios (DIP, inversión de dependencias, Screaming Architecture) y la regla de una flecha `interfaces → aplicacion → dominio ← infraestructura`.
- Declara el **árbol objetivo post-Screaming** con 5 capas y `apps/dashboard/src/features/` como vertical de UI.
- Unifica la verdad de producto **OPERA** (decisión #5490): `routes/orders.ts:12,29`, `tradingGates.ts` + `auditAgentAction` — `IOL_TRADING_ENABLED` + confirmación explícita + auditoría.
- Resuelve la ubicación de `operar/` como **módulo de primera clase** cuando OPERA está activo: `packages/domain/operar` + `apps/api/src/aplicacion/operar` + `apps/api/src/infraestructura/operar`.
- Evita drift: todo nuevo feature, ADR o refactor debe referenciar esta fuente. SDD6 (`api-dominio-renames`) y SDD8 (consolidación `operar-domain` / `OrdersService`) dependen de este contrato.

Sin este archivo, SDD6 queda bloqueado por ambigüedad sobre `operar/`.

Principios que rige este archivo:

- **Screaming Architecture**: la estructura grita el negocio (`operar`, `portfolio`, `cotizaciones`), no el framework (`controllers`, `services` genéricos).
- **DIP**: `dominio` no conoce `infraestructura` ni `interfaces`. Los puertos viven en `aplicacion`.
- **Una flecha**: las dependencias apuntan hacia el centro. `interfaces → aplicacion → dominio ← infraestructura` es la única dirección válida.
- **Cero drift**: si un doc externo describe otra arquitectura, este archivo prevalece y el doc externo se corrige.
- **Verificable por grep y por cruiser**: toda afirmación aquí tiene un comando que la prueba (`ls`, `grep`, `pnpm check:deps`).
- **Evolución**: cambiar el árbol requiere PR con actualización de este archivo + `.dependency-cruiser.cjs` + `turbo.json` si cambia el scope del check.

---

## 2. Visión producto — dos modos

Sentinel opera en **dos modos** diferenciados. No existe "solo lectura absoluto" como única verdad.

- **Sentinel App: consulta y opera (POST /api/orders tras opt-in IOL_TRADING_ENABLED + confirmación explícita y auditoría)** — la app web consulta y opera. Toda orden pasa por `POST /api/orders` (`apps/api/src/routes/orders.ts:12,29`), validada por `tradingGates.ts` (gate `IOL_TRADING_ENABLED` + confirmación del usuario) y auditada por `auditAgentAction`. Sin opt-in o sin confirmación, no hay ejecución.
- **Sentinel MCP: solo lectura (scope read) + trading opcional (scope trade)** — el servidor MCP expone por defecto solo lectura (`scope read`: `get_portfolio`, `get_quote`, `search_instruments`, `get_dollar_rates`). Trading (`scope trade`: `place_order`, `cancel_order`, `subscribe_fci`, `rescue_fci`) es opt-in explícito por scope.

Referencias canónicas:

- `apps/api/src/routes/orders.ts:12,29` — endpoint de órdenes.
- `apps/api/src/aplicacion/tradingGates.ts` — gates `IOL_TRADING_ENABLED` + confirmación.
- `apps/api/src/infraestructura/audit.ts` (`auditAgentAction`) — auditoría de cada operación.
- Decisión `decision/producto-opera` #5490.

Strings canónicos para grep (no parafrasear):

- `Sentinel App: consulta y opera (POST /api/orders tras opt-in IOL_TRADING_ENABLED + confirmación explícita y auditoría)`
- `Sentinel MCP: solo lectura (scope read) + trading opcional (scope trade)`

Toda doc, landing o footer que mencione "solo lectura" debe usar estas dos frases. `grep -rn "solo lectura — no ejecuta operaciones" docs/ apps/landing` debe dar 0 fuera de estas canónicas.

Implicancias para landing y docs:

- El hero de `/` no puede prometer "solo lectura garantizado" sin matiz. Debe decir `Sentinel App: consulta y opera — Sentinel MCP: solo lectura scope read + trading opcional scope trade, todo en una vista`.
- La sección `/seguridad` distingue `App opera con gates (IOL_TRADING_ENABLED + confirmación + auditoría)` de `MCP solo lectura (scope read) + trading opcional (scope trade)`.
- El footer renderizado (`apps/landing/src/components/Footer.astro:16`) es verificado E2E por `pnpm --filter landing build && grep -q "Sentinel App: consulta y opera" apps/landing/dist/index.html`.
- El MCP por defecto es read-only. Exponer `scope trade` requiere configuración explícita del usuario y no es el default de la landing.

---

## 3. Arquitectura — árbol 5 capas

Objetivo post-Screaming Architecture: el nombre del directorio grita el dominio.

```
packages/domain              ← dominio puro (cero imports hacia arriba)
apps/api/src/
  ├─ dominio/                ← re-exporta/entidades del dominio
  ├─ aplicacion/             ← casos de uso, ports (puertos)
  ├─ infraestructura/        ← adapters (IolApiProvider, DB, BYMA)
  └─ interfaces/             ← routes, controllers (dependen de aplicacion)
apps/dashboard/src/features/ ← features verticales (SDD4 + SDD6 operar)
apps/landing/                ← Astro, independiente (no depende de api)
```

Detalle por capa:

- `packages/domain` — tipos y entidades puras del dominio. Sin imports de `apps/api/src/*`. Cero dependencias hacia arriba.
- `apps/api/src/dominio` — alias/re-export del dominio dentro de api. Mismo contrato puro que `packages/domain`.
- `apps/api/src/aplicacion` — casos de uso y puertos (interfaces). Define qué necesita el dominio, no cómo se provee. Depende solo de `dominio`.
- `apps/api/src/infraestructura` — implementa los puertos de `aplicacion` (IolApiProvider, Drizzle, BYMA, dolarapi). Depende de `aplicacion` y `dominio`.
- `apps/api/src/interfaces` — capa externa: routes, controllers, middlewares, validación. Depende de `aplicacion`. Nunca es importada por capas internas.
- `apps/dashboard/src/features/` — vertical slices de UI por feature (`portfolio/`, `cotizaciones/`, `operar/`, `renta-fija/`). SDD4 + SDD6.
- `apps/landing/` — Astro multipágina, independiente. No importa de `apps/api`.

Árbol objetivo completo (referencia para SDD6):

- `packages/domain`
- `apps/api/src/interfaces`
- `apps/api/src/aplicacion`
- `apps/api/src/dominio`
- `apps/api/src/infraestructura`
- `apps/dashboard/src/features/`

Regla visual de flujo:

```
interfaces → aplicacion → dominio ← infraestructura
                ↑                          ↑
          dashboard/features         (implementa puertos)
```

Dominio en el centro. Infraestructura a un lado, interfaces al otro. Ambas apuntan hacia el centro. Nunca al revés.

SDD6 debe mover `operar/` siguiendo este árbol como módulo de primera clase.

Convención de nombres:

- `packages/domain/{feature}.ts` — singular, kebab-case. Ej. `operar.ts`, `portfolio.ts`.
- `apps/api/src/aplicacion/{feature}/` — directorio por feature, con `index.ts` que exporta caso de uso + puerto.
- `apps/api/src/infraestructura/{feature}/` — adapter por feature, sufijo `Adapter.ts`.
- `apps/api/src/interfaces/routes/{feature}.ts` — route por feature, registra en `apps/api/src/routes/index.ts`.
- `apps/dashboard/src/features/{feature}/` — vertical slice con `components/`, `hooks/`, `api.ts` internos.

---

## 4. Reglas de dependencia — una flecha (DIP)

Inversión de dependencias (DIP): las capas internas definen abstracciones, las externas las implementan.

| Origen | No puede importar de | Por qué |
|---|---|---|
| `packages/domain` / `apps/api/src/dominio` | `apps/api/src/interfaces`, `apps/api/src/aplicacion`, `apps/api/src/infraestructura` | DIP — dominio puro, cero imports hacia arriba |
| `apps/api/src/aplicacion` | `apps/api/src/interfaces`, `apps/api/src/infraestructura` | Depende de abstracciones, no de implementaciones |
| `apps/api/src/infraestructura` | `apps/api/src/interfaces` | Adapter no conoce la capa web |
| `apps/api/src/interfaces` | (puede importar `aplicacion` y `dominio`) | Capa externa orquesta casos de uso |
| `apps/dashboard/src/features/` | `apps/api/src/infraestructura` directamente | UI consume solo `aplicacion` vía API, nunca infra directa |
| `apps/landing/` | `apps/api/src/*`, `packages/domain` | Landing aislada, solo datos estáticos/mock |

Violación típica bloqueada por enforcement:

- `packages/domain/operar.ts` importando de `apps/api/src/aplicacion/tradingGates.ts` → prohibido.
- `apps/api/src/dominio/orden.ts` importando de `apps/api/src/infraestructura/IolApiProvider.ts` → prohibido.

La regla se enforza con `dependency-cruiser` (ver Enforcement).

---

## 5. Cómo agregar un feature completo

Checklist de 6 pasos. Seguir en orden. Ejemplo con `operar`.

1. **Dominio — tipos puros**: crear `packages/domain/operar.ts` con tipos, entidades y errores del dominio. Sin imports de `aplicacion`/`infraestructura`/`interfaces`. Exportar desde `packages/domain/index.ts`.
2. **Aplicación — caso de uso + puerto**: crear `apps/api/src/aplicacion/operar/{CrearOrden.ts, puertos.ts}`. Define el port (ej. `OrdersPort`) y el caso de uso que orquesta validación + `tradingGates.ts` + auditoría.
3. **Infraestructura — adapter**: crear `apps/api/src/infraestructura/operar/IolOrdersAdapter.ts` que implementa el puerto contra IOL. Registra el provider en el contenedor/DI. Depende de `aplicacion` y `dominio`.
4. **Interfaces — route**: crear `apps/api/src/interfaces/routes/operar.ts` o `apps/api/src/routes/orders.ts` (según convención vigente) que valida input y delega al caso de uso. Documentar `POST /api/orders` y gates `IOL_TRADING_ENABLED` + confirmación.
5. **Dashboard — feature vertical**: crear `apps/dashboard/src/features/operar/{components/,hooks/,api.ts}`. Consumir el endpoint vía `aplicacion` (no infra directa). Incluir confirmación explícita y estado de auditoría en la UI.
6. **Enforcement — verificar**: correr `pnpm check:deps` (usa `.dependency-cruiser.cjs`). Debe pasar en verde. Si falla por `dominio → aplicacion`, corregir imports antes de merge. Actualizar este archivo si el árbol cambia.

Nota `operar/` como módulo de primera clase: cuando OPERA está activo, `operar` vive en las tres capas (`domain` → `aplicacion/operar` → `infraestructura/operar`) y en `dashboard/src/features/operar`. No es un subdirectorio suelto.

---

## 6. Enforcement

Validación automática de la regla `dominio` no importa de capas superiores.

Configuración:

- `.dependency-cruiser.cjs` en raíz con `forbidden: [{from:{path:"domain|dominio"}, to:{path:"aplicacion|interfaces|infraestructura"}}]`.
- Task `check:deps` en `turbo.json`: `{ "cache": false, "outputs": [] }`.
- Script `check:deps` en `package.json` raíz: `depcruise --config .dependency-cruiser.cjs apps/api/src packages/domain`.
- DevDep `dependency-cruiser` en `package.json`.

Comandos verificables:

```bash
ls ARCHITECTURE.md
grep -c "packages/domain" ARCHITECTURE.md         # >=1
grep -c "Sentinel App: consulta y opera" ARCHITECTURE.md  # >=1
pnpm check:deps                                     # debe pasar si no hay violación dominio→arriba
# o directo
npx dependency-cruiser . --validate .dependency-cruiser.cjs
```

CI: `pnpm check:deps` debe correr en verde. Si un nuevo módulo viola `dominio → aplicacion`, el cruiser falla con la regla documentada arriba.

Gates de calidad docs:

```bash
grep -rn "solo lectura — no ejecuta operaciones" docs/ apps/landing --exclude-dir=.git | grep -v "Sentinel App\|Sentinel MCP" | wc -l  # =0
grep -rn "Sentinel App.*opera" docs/ apps/landing | wc -l  # >=4
pnpm --filter landing build  # E2E OK, footer renderizado
```

Referencias: decisión #5490, `routes/orders.ts:12,29`, `tradingGates.ts`, `auditAgentAction`, SDD6 `api-dominio-renames`.

Detalle operativo del enforcement:

- El cruiser corre sobre `apps/api/src` y `packages/domain`. No escanea `apps/landing` ni `apps/dashboard` (UI aislada).
- La regla `forbidden` usa regex `domain|dominio` como origen y `aplicacion|interfaces|infraestructura` como destino. Cubre tanto `packages/domain` como `apps/api/src/dominio`.
- Un import como `import { tradingGates } from "../../aplicacion/tradingGates"` dentro de `apps/api/src/dominio/orden.ts` hace fallar el check. El mensaje del cruiser cita la regla por nombre `no-domain-to-upper-layers`.
- Para debug local: `npx depcruise --config .dependency-cruiser.cjs apps/api/src --include-only "^apps/api/src/(dominio|domain)"` muestra solo violaciones de dominio.
- El directorio `apps/api/src/infraestructura` puede importar de `aplicacion` y `dominio`, pero nunca de `interfaces`. Si un adapter necesita un DTO de `interfaces`, mover el DTO a `aplicacion` como puerto tipado.
- `apps/api/src/interfaces` es la única capa que puede importar `express`/`fastify`/`zod` de validación web. `aplicacion` y `dominio` permanecen framework-agnostic.
- `packages/domain` no puede importar de `apps/*` bajo ningún concepto. Si necesita un tipo compartido, el tipo vive en `packages/domain` y es importado hacia abajo.
- El check es parte del contrato SDD: todo PR que agregue un feature debe mostrar `pnpm check:deps` en verde en la descripción. Review checklist incluye grep de canónicas.
- Si se agrega un nuevo path alias (ej. `@/domain`), actualizar `.dependency-cruiser.cjs` para incluir el alias en `from.path` y `to.pathNot`.
- Tradeoff elegido: `dependency-cruiser` sobre `eslint-plugin-import` porque el cruiser analiza el grafo completo y detecta imports transitivos/indirectos, mientras ESLint solo ve un archivo a la vez.
- Costo: nueva devDep `dependency-cruiser` (~3MB) y ~1s extra en CI. Aceptable frente a prevenir drift arquitectónico irreversible.
- Rollback del enforcement: borrar `.dependency-cruiser.cjs`, remover task `check:deps` de `turbo.json` y `package.json`. `ARCHITECTURE.md` permanece como doc, pero sin validación automática.
- Verificación rápida post-clone: `pnpm install && pnpm check:deps && ls ARCHITECTURE.md` debe pasar sin configurar nada más.
- SDD6 usa este contrato para decidir si `operar/` va a `apps/api/src/aplicacion/operar` (caso de uso) vs `apps/api/src/dominio/operar` (entidad). La respuesta está en este archivo, no en un ADR suelto.
- Cualquier excepción a la regla debe documentarse aquí con justificación y expiración. No hay excepciones vigentes.
- El footer de la landing y los docs de `docs/landing/` son consumidores de la visión dos modos; no definen la regla. Si cambian los scopes MCP, actualizar primero este archivo y luego los 4 archivos de Commit 2.

---
