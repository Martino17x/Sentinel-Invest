---
name: context-condense
description: Compacta el contexto de trabajo en un resumen breve, accionable y sin repetición para reducir consumo de tokens entre pasos o handoffs.
---

# Context Condense

## Objetivo

Convertir contexto disperso o repetitivo en una versión compacta y útil para continuar el trabajo con el menor costo posible de tokens.

Esta skill debe preservar solo lo que impacta la siguiente acción:
- hechos confirmados,
- archivos relevantes,
- decisiones tomadas,
- restricciones activas,
- próximo paso recomendado.

## Cuándo usarla

Úsala cuando:
- ya hubo exploración y el contexto empezó a crecer,
- se necesita pasar el estado a otra skill o a otro agente,
- hay notas repetidas, planes largos o lecturas redundantes,
- hace falta retomar una tarea sin releer todo,
- conviene cerrar una fase con un resumen mínimo pero suficiente.

No la uses para reexplicar todo el proyecto ni para reescribir contenido ya claro y corto.

## Formato de salida

Entregar siempre un bloque breve con esta estructura:

```md
## Contexto condensado

### Hechos confirmados
- ...

### Archivos relevantes
- `ruta/archivo`: motivo breve

### Decisiones tomadas
- ...

### Restricciones activas
- ...

### Próximo paso
- ...
```

Reglas del formato:
- usar bullets cortos,
- incluir solo información verificable o explícitamente marcada como supuesto,
- mencionar rutas exactas cuando ayuden a evitar nuevas búsquedas,
- cerrar con un único próximo paso concreto.

## Proceso

1. Reunir solo señales de alta utilidad:
   - resultados confirmados,
   - archivos ya identificados,
   - decisiones que no deben rediscutirse,
   - límites de alcance y herramientas permitidas.

2. Eliminar ruido:
   - razonamiento largo,
   - intentos fallidos que ya no afectan la ejecución,
   - explicaciones duplicadas,
   - contexto histórico irrelevante para el siguiente paso.

3. Consolidar información repetida en una sola línea:
   - si el mismo hecho aparece varias veces, dejar una versión canónica,
   - si varios archivos cumplen la misma función, agruparlos solo si no se pierde precisión.

4. Separar hechos de inferencias:
   - los hechos confirmados van en `Hechos confirmados`,
   - cualquier inferencia debe evitarse; si es indispensable, marcarla de forma explícita y breve.

5. Priorizar referencias accionables:
   - primero archivos o carpetas a tocar,
   - luego restricciones,
   - después decisiones ya cerradas.

6. Terminar con el próximo paso mínimo:
   - una acción concreta,
   - sin plan extenso,
   - orientada a avanzar sin releer contexto adicional.

## Guardrails

- No inventar hechos, archivos, dependencias ni decisiones.
- No copiar conversaciones completas ni cadenas largas de pensamiento.
- No repetir el mismo dato en varias secciones.
- No convertir el resumen en un plan detallado si solo hace falta continuidad.
- No incluir archivos irrelevantes “por si acaso”.
- Si algo no está confirmado, omitirlo o marcarlo claramente como supuesto.
- Mantener el resumen lo bastante corto como para ser reutilizable como contexto base en el siguiente paso.

## Salida esperada

Una síntesis breve, verificable y accionable que permita continuar el trabajo sin volver a explorar todo el contexto.

Debe dejar claro:
- qué ya se sabe,
- qué archivos importan,
- qué decisiones siguen vigentes,
- qué restricción no se debe romper,
- cuál es la siguiente acción exacta.