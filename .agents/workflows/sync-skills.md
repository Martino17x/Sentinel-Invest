---
description: Sincronizar skills entre todos los agentes de Equarys
---

# Sync Skills

Ejecutar el sincronizador de skills para unificar cambios entre agentes.

## Pasos

1. Ejecutar dry-run para ver qué cambiaría:
   ```bash
   python scripts/sync_skills.py --dry-run
   ```

2. Si hay cambios de un solo agente (caso común), ejecutar sync completo:
   ```bash
   python scripts/sync_skills.py
   ```

3. Si hay merge con conflictos, revisar los marcadores `<!-- CONFLICTO -->` en los SKILL.md afectados y resolver manualmente.

4. Para sincronizar solo una skill:
   ```bash
   python scripts/sync_skills.py --skill interface-design
   ```

## Estrategia de merge

- **1 agente cambió** → se copia a los demás (sin pérdida)
- **2+ agentes cambiaron la misma skill** → merge por secciones (`## headings`):
  - Secciones iguales: se conservan una vez
  - Secciones diferentes: se combinan con marcadores de conflicto
  - Secciones nuevas: se agregan de cada agente

## Agentes incluidos

- `.windsurf/skills/`
- `.gemini/skills/`
- `.agents/skills/`
- `.cursor/skills/`
- `.antigravitycli/skills/`
