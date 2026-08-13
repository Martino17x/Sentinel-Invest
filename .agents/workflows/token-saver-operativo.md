---
description: Rutina operativa para ahorrar tokens sin degradar calidad ni seguridad
---

# Workflow: Token Saver Operativo

## Objetivo
Aplicar una secuencia mínima y repetible para reducir consumo de tokens por tarea, manteniendo precisión, validaciones y seguridad.

## Rol de Engram

Usar `engram-context-first` al inicio cuando exista historial previo o continuidad de trabajo. Su función es recuperar decisiones, rutas y restricciones ya conocidas para evitar relecturas del repo sin valor nuevo.

## Protocolo de inicio

### Chat nuevo con continuidad

1. Llamar una sola vez a `mem_context`.
2. Si el trabajo anterior ya deja rutas o decisiones claras, no volver a explorar el repo completo.
3. Validar solo lo crítico con búsqueda barata o lectura puntual.

### Tarea compleja

1. Hacer primero 1 o 2 búsquedas con `mem_search` usando nombre de módulo, feature o bug.
2. Si la tarea es sobre Equarys y el dominio no es obvio, consultar `docs/about_project/token_optimization/README.md`.
3. Si la tarea sigue siendo transversal o ambigua, usar `/.windsurf/workflows/repo-aware-entry.md`.
4. Convertir lo recuperado en rutas candidatas.
5. Recién después usar búsqueda en repo o lectura quirúrgica.

### Tarea nueva o muy acotada

Si el usuario ya dio archivo, función o ruta exacta, omitir Engram y leer solo lo mínimo necesario.

## Pasos

1. Leer primero `AGENTS.md` (raíz) y confirmar restricciones activas.
2. Definir en 1 frase el objetivo inmediato de la tarea (sin contexto histórico extra).
3. Si hay continuidad o historial, recuperar contexto con `engram-context-first`.
4. Elegir solo 1 skill principal usando `token-saver-router`.
5. Ejecutar búsqueda mínima:
   - primero rutas/símbolos concretos
   - luego lectura quirúrgica de archivos
   - evitar lecturas completas si no son necesarias
6. Si hay exceso de contexto acumulado, ejecutar `context-condense` una sola vez.
7. Antes de editar, registrar alcance explícito:
   - qué archivos sí se tocan
   - qué archivos no se tocan
8. Editar de forma quirúrgica (sin refactors laterales).
9. Verificar de menor a mayor costo:
   - test/lint puntual del área modificada
   - recién después validación amplia (si aplica)
10. Entregar resumen corto:
   - cambio realizado
   - archivos tocados
   - riesgo residual
   - próximo paso mínimo

## Protocolo de cierre

1. Guardar en Engram solo trabajo significativo:
   - decisión técnica
   - bugfix
   - patrón nuevo
   - convención importante
   - archivo/ruta clave para retomar
2. Si la sesión fue larga o multifase, cerrar con `mem_session_summary`.
3. No guardar microhechos triviales que obliguen a filtrar ruido después.

## Presupuesto de lectura

- No leer archivos completos por defecto.
- Antes de cualquier lectura completa, intentar:
  - memoria útil
  - mapa repo-aware del proyecto si existe
  - búsqueda por símbolo o texto
  - lectura parcial del fragmento relevante
- Si un archivo ya fue entendido y no cambió la hipótesis, no releerlo.
- Si una búsqueda de memoria no devuelve pistas útiles en 1 o 2 intentos, cortar y pasar al repo.

## Guardrails

- No cargar varias skills en paralelo “por si acaso”.
- Máximo 2 skills en secuencia.
- Engram no reemplaza verificación de código cuando el dato actual debe confirmarse en archivo.
- No hacer `mem_context` + varias `mem_search` + lectura completa del repo por defecto en la misma fase.
- No guardar ruido en Engram; la memoria útil debe reducir lecturas futuras, no aumentarlas.
- No releer archivos ya confirmados sin hipótesis nueva.
- No resumir de forma extensa si alcanza con evidencia mínima + siguiente acción.
- Nunca sacrificar validaciones críticas por ahorrar tokens.

## Modo rápido (cuando la tarea es simple)

1. Confirmar objetivo inmediato.
2. Si hay continuidad real, usar `mem_context`; si no, saltearlo.
3. Buscar símbolo/ruta exacta.
4. Leer solo el fragmento necesario.
5. Aplicar cambio mínimo.
6. Verificación puntual.
7. Resumen de 4 líneas.
