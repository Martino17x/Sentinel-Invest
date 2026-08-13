---
name: planning-with-files
description: Planifica usando archivos y herramientas reales del repo, con pasos mínimos verificables y sin planes abstractos largos.
---

# Planning With Files

## Objetivo

Construir un plan corto y ejecutable apoyado en señales reales del repositorio, no en suposiciones ni en exploración amplia.

La prioridad es definir el siguiente camino de trabajo con el menor costo posible:
- qué archivo o carpeta mirar,
- con qué herramienta empezar,
- qué cambio o verificación hacer después.

## Cuándo usarla

Úsala cuando:

- hace falta planear antes de editar, pero sin escribir un plan largo;
- ya conoces el objetivo general y falta convertirlo en pasos concretos sobre archivos;
- hay riesgo de explorar de más por no fijar primero rutas, símbolos o herramientas;
- necesitas decidir un orden mínimo de inspección y ejecución;
- la tarea depende de confirmar estructura real del repo, no solo de razonar en abstracto.

No la uses para diseñar estrategias extensas si todavía falta contexto base; en ese caso conviene recuperar contexto o leer de forma quirúrgica primero.

## Proceso

1. Definir el resultado inmediato
   - Escribir en una frase qué se necesita lograr o confirmar.
   - Limitar el plan al objetivo actual, no a toda la feature.

2. Anclar el plan en evidencia
   - Identificar archivos conocidos, rutas probables o símbolos ya mencionados.
   - Si faltan, elegir la herramienta más barata para obtenerlos:
     - `list_files` para estructura,
     - `search_files` para texto o símbolos,
     - `list_code_definition_names` para definiciones,
     - `read_file` solo si ya hay un candidato claro.

3. Elegir el primer punto de contacto
   - Seleccionar una sola carpeta, archivo o búsqueda inicial.
   - Evitar planes con múltiples ramas “por si acaso”.

4. Armar un plan mínimo
   - Paso 1: verificación o lectura mínima.
   - Paso 2: archivo o cambio probable.
   - Paso 3: validación final si hace falta.
   - Si un paso no depende de un archivo, probablemente sobra.

5. Cortar lo abstracto
   - Reemplazar frases como “analizar el sistema” por acciones observables como “buscar `UserService` en `src`”.
   - Dejar solo pasos que cambian la siguiente acción real.

## Guardrails

- No planear sobre archivos hipotéticos si todavía no fueron ubicados.
- No abrir archivos completos solo para “tener contexto”.
- No hacer planes largos para tareas pequeñas.
- No listar más de 3 pasos salvo que la tarea realmente lo exija.
- No mezclar investigación amplia con ejecución; primero fija el siguiente archivo o herramienta.
- Si ya existe una ruta clara, no sigas explorando antes de actuar.
- Si aparece incertidumbre nueva, ajustar el plan con otra señal del repo, no con más abstracción.

## Salida esperada

Un plan breve, verificable y orientado a archivos, por ejemplo:

- `Objetivo inmediato:` ...
- `Punto de entrada:` ruta, símbolo o carpeta
- `Herramienta inicial:` ...
- `Plan mínimo:`
  1. ...
  2. ...
  3. ...
- `Criterio de cierre:` qué confirmación permite dejar de explorar

La salida debe dejar claro dónde empezar y cuál es la siguiente acción concreta sin cargar contexto innecesario.