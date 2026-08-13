---
name: surgical-file-reader
description: Lee solo lo necesario del repositorio usando una secuencia mínima de exploración, búsqueda y lectura focalizada para ahorrar tokens.
---

# Surgical File Reader

## Objetivo

Reducir al mínimo el costo de contexto al inspeccionar un proyecto. Esta skill guía una lectura quirúrgica: primero ubica, luego filtra, después identifica definiciones y solo al final abre archivos concretos o fragmentos estrictamente necesarios.

## Cuándo usarla

- Cuando necesitas entender una parte puntual del código sin recorrer archivos completos.
- Cuando el repositorio es grande y leer de más aumentaría el gasto de tokens.
- Cuando ya existe una hipótesis sobre dónde está la información, pero falta validarla.
- Cuando vas a editar, depurar o responder preguntas y necesitas contexto suficiente, no contexto exhaustivo.
- Cuando otra skill ya resumió el estado general y ahora hace falta confirmar detalles concretos.

## Jerarquía de herramientas

1. `list_files`
   - Para mapear estructura, carpetas candidatas y nombres de archivos.
   - Úsala antes de asumir rutas o abrir contenido.

2. `search_files`
   - Para localizar símbolos, textos, configuraciones, endpoints, props, clases o patrones.
   - Prefiere búsquedas precisas antes de leer archivos completos.

3. `list_code_definition_names`
   - Para detectar funciones, clases, componentes o definiciones top-level en áreas candidatas.
   - Sirve para decidir qué archivo merece lectura real.

4. `read_file`
   - Último recurso.
   - Léelo solo cuando ya sabes qué archivo contiene la información necesaria y qué parte quieres extraer.

## Proceso

1. Delimitar la pregunta
   - Define exactamente qué dato falta: ubicación, firma, flujo, dependencia, configuración o comportamiento.
   - Evita leer si la necesidad aún es ambigua.

2. Mapear el terreno con `list_files`
   - Lista la carpeta más probable, no todo el repositorio salvo que sea imprescindible.
   - Identifica nombres relevantes por convención, dominio o proximidad funcional.

3. Filtrar con `search_files`
   - Busca el símbolo, texto o patrón exacto.
   - Si no aparece, amplía gradualmente: sinónimos, variantes de nombre, strings visibles o claves relacionadas.

4. Priorizar candidatos con `list_code_definition_names`
   - Si la búsqueda apunta a una carpeta o módulo amplio, lista definiciones para ubicar la pieza correcta.
   - Elige el archivo con mayor densidad de señal útil.

5. Leer quirúrgicamente con `read_file`
   - Abre solo el archivo más prometedor.
   - Si basta con una confirmación breve, no continúes leyendo archivos vecinos.
   - Si el archivo no responde la pregunta, vuelve a buscar; no encadenes lecturas por intuición.

6. Consolidar hallazgos
   - Resume en pocas líneas: archivo, símbolo, hecho confirmado y cualquier duda pendiente.
   - Deja explícito si la respuesta es completa o si falta una lectura adicional.

## Heurísticas

- Empieza por la carpeta más específica posible.
- Un nombre de archivo correcto vale más que varias lecturas completas.
- Si una búsqueda devuelve muchos resultados, refina el patrón antes de abrir archivos.
- Si ya conoces el símbolo, usa ese símbolo; si no, busca texto visible, nombres de props, claves de config o mensajes de error.
- Si solo necesitas confirmar existencia o ubicación, no leas contenido completo.
- Si varios archivos parecen similares, prioriza:
  1. el más cercano al punto de uso,
  2. el que contiene la definición,
  3. el que conecta el flujo.
- No leas tests, mocks o archivos generados salvo que la pregunta trate específicamente sobre ellos.
- Si un archivo supera lo necesario para responder, detén la lectura y resume.
- Después de cada lectura, decide: ¿ya tengo la respuesta? Si sí, corta la exploración.

## Guardrails

- No abrir archivos por curiosidad.
- No leer directorios completos cuando una subcarpeta basta.
- No usar `read_file` como herramienta inicial si antes puedes ubicar con `list_files`, `search_files` o `list_code_definition_names`.
- No repetir lecturas del mismo archivo sin una nueva hipótesis.
- No arrastrar contexto completo al siguiente paso; conserva solo hechos confirmados.
- No mezclar suposiciones con evidencia. Marca claramente qué fue encontrado y dónde.
- Si la búsqueda no da señal suficiente, ajusta la estrategia antes de seguir leyendo.

## Salida esperada

Una respuesta breve y utilitaria con:

- archivos candidatos inspeccionados,
- herramienta usada para llegar a cada uno,
- hecho confirmado,
- archivo final relevante,
- siguiente paso mínimo recomendado, solo si todavía hace falta.

Formato sugerido:

- `Pregunta:` qué se intentó confirmar.
- `Ruta elegida:` carpeta o archivo priorizado.
- `Señal encontrada:` resultado útil de búsqueda o definición.
- `Confirmación:` hecho validado tras lectura mínima.
- `Próximo paso:` solo si aún falta una verificación puntual.