---
description: entrada repo-aware para tareas complejas en Equarys con lectura mínima y ahorro de tokens
---
# Workflow: Repo-Aware Entry (Equarys)

Usar este workflow cuando la tarea sea compleja, transversal o el dominio no sea obvio dentro de Equarys.

## Objetivo

Entrar por la parte correcta del repo con el menor costo posible de contexto, evitando exploración masiva y relecturas innecesarias.

## Cuándo usarlo

- Cuando el usuario describe una tarea amplia sin archivo exacto.
- Cuando la tarea cruza frontend, servicios y Supabase.
- Cuando el dominio no es obvio (`ventas`, `cuenta corriente`, `finanzas`, `logística`, etc.).
- Cuando existe continuidad previa pero no alcanza para ubicar la ruta correcta.

## Cuándo NO usarlo

- Si el usuario ya dio archivo, símbolo o pantalla exacta.
- Si el cambio es pequeño y localizado en un archivo conocido.
- Si ya quedó identificado el dominio y el entrypoint en el paso anterior.

## Pasos

1. Leer `AGENTS.md` (raíz).
2. Si hay continuidad real, recuperar contexto con `mem_context` una sola vez.
3. Leer `docs/about_project/token_optimization/README.md`.
4. Leer `docs/about_project/token_optimization/02_repo_aware_token_map.md`.
5. Identificar estas 3 cosas antes de abrir componentes grandes:
   - app correcta
   - dominio correcto
   - entrypoint correcto
6. Entrar al dashboard por este orden cuando aplique:
   - `apps/dashboard/src/App.tsx`
   - `apps/dashboard/src/AppMain.tsx`
   - `apps/dashboard/src/contexts/`
   - `apps/dashboard/src/services/`
   - `apps/dashboard/src/hooks/queries/`
7. Leer componentes grandes solo después de validar el servicio, hook o contexto que realmente gobierna el flujo.
8. Si la tarea toca base de datos:
   - usar `docs/DATABASE_SCHEMA.md` solo como mapa rápido
   - validar esquema actual con MCP de Supabase o migraciones
   - no leer muchas migraciones sin hipótesis concreta
9. Si la tarea toca permisos o acceso:
   - `AuthContext.tsx`
   - `PermissionsContext.tsx`
   - `BranchContext.tsx`
   - ruta protegida en `AppMain.tsx` o `AdminMain.tsx`
10. Si la tarea toca POS o checkout, asumir cruce potencial entre:
   - stock
   - caja
   - cuenta corriente
   - pricing/promociones
   - emisión

## Regla de oro

No empezar por `components/` grandes si todavía no se confirmó la ruta real del dominio y su fuente de verdad en `services/`, `hooks/queries/` o `contexts/`.

## Salida esperada

Antes de implementar, el agente debería poder responder en 4 líneas:

- dominio detectado
- entrypoint mínimo
- servicio o contexto fuente de verdad
- siguiente lectura puntual
