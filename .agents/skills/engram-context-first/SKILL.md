---
name: engram-context-first
description: Recupera contexto desde Engram o memoria semántica antes de explorar archivos, para reducir lecturas y ahorrar tokens.
---

# Engram Context First

## Objetivo

Usar primero Engram o memoria semántica para recuperar contexto útil ya conocido antes de abrir archivos del repositorio. Esta skill existe para evitar lecturas repetidas, reducir exploración innecesaria y entrar más rápido en la parte exacta del problema.

La prioridad es: **memoria/vector search antes de `read_file`**. Solo se debe leer un archivo cuando la memoria no alcance, cuando haya que verificar un dato puntual o cuando se necesite editar con precisión.

## Cuándo usarla

Úsala cuando:

- llega una tarea nueva y todavía no está claro qué partes del proyecto tocar;
- ya hubo trabajo previo sobre el mismo repositorio o la misma feature;
- necesitas recordar decisiones anteriores, nombres de archivos, convenciones o restricciones;
- sospechas que el contexto ya fue descubierto antes y volver a leer sería desperdicio;
- hace falta preparar una búsqueda más precisa antes de usar `list_files`, `search_files`, `list_code_definition_names` o `read_file`.

Es especialmente útil al inicio de una tarea, después de interrupciones y antes de releer archivos grandes.

## Disparadores concretos

Usarla así:

- **Chat nuevo con continuidad clara**: primero `mem_context`, una sola vez.
- **Tarea compleja con historial incierto**: primero `mem_search` con 1 o 2 consultas bien enfocadas.
- **Pedido con archivo o símbolo exacto**: no activar esta skill; ir directo a lectura mínima.
- **Después de compaction o reset de contexto**: usar `mem_context` antes de reexplorar.

Si el proyecto es Equarys y la memoria no deja claro el dominio, usar después la carpeta `docs/about_project/token_optimization/` y `/.windsurf/workflows/repo-aware-entry.md` antes de abrir componentes grandes.

## Proceso

1. **Empezar por memoria**
   - Consultar Engram o memoria semántica para recuperar trabajo previo relacionado con la solicitud.
   - Buscar por objetivo funcional, nombres de módulos, decisiones previas, rutas, entidades y restricciones.
   - No encadenar consultas amplias sin hipótesis concreta.

2. **Extraer pistas accionables**
   - Identificar archivos posiblemente relevantes.
   - Detectar decisiones ya tomadas.
   - Recuperar términos exactos para búsquedas posteriores.
   - Separar hechos confirmados de hipótesis.

3. **Convertir memoria en plan mínimo**
   - Si la memoria ya apunta a rutas concretas, ir directo a `search_files`, `list_files` o `list_code_definition_names`.
   - Evitar `read_file` como siguiente paso por defecto.
   - Leer solo si falta validar contenido exacto.
   - Si después de 1 o 2 consultas la memoria no ayuda, cortar y pasar al repo.

4. **Verificar con herramientas baratas**
   - Usar `list_files` para confirmar estructura.
   - Usar `search_files` para ubicar símbolos, textos o rutas.
   - Usar `list_code_definition_names` para detectar definiciones top-level.
   - Recién después usar `read_file` sobre fragmentos o archivos específicos.

5. **Mantener contexto compacto**
   - Registrar un resumen corto de lo recuperado: qué ya se sabe, qué falta validar y cuál es el próximo paso mínimo.
   - Si la memoria fue suficiente, evitar reabrir archivos ya entendidos.

## Presupuesto recomendado

- `mem_context`: máximo 1 vez al inicio de una fase.
- `mem_search`: máximo 1 o 2 búsquedas antes de pasar al repo.
- `read_file`: solo después de tener una ruta o símbolo candidato.
- Si la memoria devuelve señales ambiguas, usar búsqueda barata en repo antes que una segunda ronda amplia de memoria.

## Qué debe recuperar

Antes de leer archivos, intenta recuperar desde Engram o memoria semántica:

- objetivo de la tarea o feature relacionada;
- archivos y carpetas mencionados previamente;
- nombres de funciones, clases, componentes, tablas, endpoints o símbolos relevantes;
- restricciones del proyecto, convenciones de estilo y reglas de alcance;
- decisiones previas que no deben romperse;
- cambios ya hechos o intentos anteriores;
- dudas abiertas que sí requieren verificación en código;
- palabras clave exactas para usar luego en `search_files`.

La salida de memoria debe ayudar a responder:
- qué parte del repo probablemente importa;
- qué no hace falta volver a leer;
- cuál es la verificación mínima necesaria.

## Guardrails

- **Priorizar siempre Engram/memoria semántica antes de `read_file`.**
- No usar Engram por reflejo en tareas nuevas si el usuario ya dio el archivo o función exacta.
- No asumir que todo lo recordado sigue vigente: validar solo lo crítico con herramientas de bajo costo.
- No convertir memoria en exploración masiva; el objetivo es reducir lecturas, no ampliarlas.
- No leer archivos completos si una búsqueda puntual basta.
- No repetir consultas de memoria si ya entregaron contexto suficiente.
- No guardar como verdad actual algo que solo fue útil históricamente para orientar la búsqueda.
- Si la memoria es ambigua, usar `search_files` o `list_files` antes de abrir archivos.
- Si se necesita `read_file`, limitarlo a los archivos y secciones mínimas necesarias.
- Diferenciar explícitamente entre:
  - hecho recuperado de memoria,
  - hecho confirmado por herramienta,
  - punto todavía pendiente de validar.

## Salida esperada

Una salida breve y utilizable, por ejemplo:

- **Contexto recuperado:** hechos útiles obtenidos desde Engram o memoria semántica.
- **Archivos probables:** rutas candidatas a verificar.
- **Restricciones relevantes:** decisiones, convenciones o límites de alcance.
- **Validación mínima sugerida:** qué búsqueda o lectura puntual hacer después.
- **Próximo paso:** la acción de menor costo en tokens.

La skill debe dejar al agente listo para avanzar con la menor cantidad posible de lecturas y con una regla central clara: **usar memoria/vector search primero; `read_file` solo como verificación final o edición dirigida**.