---
name: skill-sharpen-lite
description: Detecta desperdicio de tokens en skills, planes y flujos para recortar lecturas redundantes, repetición y contexto innecesario.
---

# Skill Sharpen Lite

## Objetivo

Detectar oportunidades rápidas de ahorro de tokens en una skill, respuesta o flujo ya planteado, sin rediseñar todo el proceso. Esta skill señala dónde se está leyendo de más, repitiendo información, planificando en exceso o arrastrando contexto que no aporta al siguiente paso.

## Qué revisa

- Lecturas redundantes del mismo archivo, carpeta o fragmento.
- Uso de `read_file` cuando bastaba con `list_files`, `search_files` o `list_code_definition_names`.
- Repetición de hechos ya confirmados en contexto, memoria semántica o mensajes previos.
- Planes demasiado largos para tareas pequeñas o bien acotadas.
- Resúmenes que vuelven a explicar todo en lugar de conservar solo hechos accionables.
- Contexto histórico que no cambia la decisión actual.
- Exploración amplia sin una hipótesis concreta.
- Listas, reglas o advertencias duplicadas entre skills relacionadas.

## Cuándo usarla

- Cuando una skill parece correcta, pero consume más tokens de lo necesario.
- Antes de ejecutar una cadena de pasos larga.
- Después de una exploración inicial que produjo demasiado contexto.
- Al revisar prompts, skills o procesos que tienden a repetir instrucciones.
- Cuando hay dudas sobre si una lectura adicional realmente aporta algo nuevo.

## Proceso

1. Identificar el objetivo inmediato de la tarea en una frase.
2. Marcar qué información ya está confirmada y no necesita releerse.
3. Revisar si hubo lecturas repetidas del mismo archivo o directorio.
4. Verificar si alguna lectura completa pudo evitarse con:
   - `list_files`
   - `search_files`
   - `list_code_definition_names`
   - Engram o memoria semántica
5. Detectar bloques de texto repetidos, resúmenes largos o planes con pasos que no cambian la ejecución.
6. Separar contexto útil de contexto sobrante:
   - útil: afecta la decisión actual
   - sobrante: solo agrega historial, detalle o justificación repetida
7. Proponer recortes concretos, priorizando:
   - eliminar relecturas
   - compactar instrucciones repetidas
   - reducir planeación previa
   - dejar solo próximo paso + evidencia mínima
8. Devolver una versión más afilada del flujo, manteniendo seguridad y claridad.

## Guardrails

- No recortar información crítica para editar un archivo con seguridad.
- No eliminar validaciones necesarias si existe riesgo de tocar el archivo equivocado.
- No asumir hechos no confirmados solo para ahorrar tokens.
- No reemplazar lectura necesaria por memoria si el dato debe verificarse en el archivo actual.
- No convertir el ahorro de tokens en ambigüedad operativa.
- Priorizar recortes pequeños y de alto impacto antes que reescribir toda la skill.
- Mantener las recomendaciones accionables, específicas y breves.

## Salida esperada

Una revisión corta y práctica con:

- desperdicios detectados
- por qué consumen tokens de más
- recorte recomendado
- versión simplificada del flujo o de la skill
- próximo paso mínimo suficiente

Formato sugerido:

- `Desperdicio detectado: ...`
- `Impacto: ...`
- `Ajuste recomendado: ...`
- `Flujo reducido: ...`
- `Próximo paso: ...`