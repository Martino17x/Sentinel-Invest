---
name: git-commit-rules
description: Reglas estrictas para inspección previa, staging atómico granular, formato de commits y prohibición de atribución IA en Equarys.
---

# Git Commit Rules & Conventions (Equarys)

Esta skill define las reglas obligatorias para el manejo de versiones, inspección de diffs, staging atómico y mensajes de commit en el repositorio Equarys.

## 1. Inspección Previa OBLIGATORIA
Antes de realizar cualquier staging (`git add`), es **estrictamente obligatorio**:
1. Ejecutar `git status` para revisar el estado del árbol de trabajo (archivos modificados, creados o eliminados).
2. Ejecutar `git diff` (o `git diff --cached`) para auditar las líneas exactas modificadas, verificando que no existan:
   - Archivos temporales, logs o artefactos accidentales.
   - Caracteres de mojibake o errores de encoding.
   - Cambios de formato no deseados ni `console.log` sueltos.

## 2. Staging Atómico y Granular
- **PROHIBIDO usar `git add .` o `git add -A` a ciegas.**
- El staging DEBE ser focalizado y granular: seleccionar explícitamente los archivos específicos pertenecientes a la tarea, feature o bugfix actual (`git add path/to/file1 path/to/file2`).
- Agrupar cambios en commits lógicos independientes cuando una tarea abarque múltiples áreas no relacionadas.

## 3. Frecuencia de Commits
- Realizar commits pequeños y cohesivos por cambio o corrección específica.
- Al finalizar una fase o ciclo completo de SDD (Spec-Driven Development), realizar el commit final de cierre de fase.

## 4. Formato Conventional Commits
Todos los mensajes de commit deben seguir el estándar **Conventional Commits**:

`<type>(<scope>): <short description in lower case>`

### Tipos permitidos (`type`):
- `feat`: Nueva funcionalidad.
- `fix`: Corrección de un error o bug.
- `refactor`: Cambio de código que ni agrega feature ni corrige bug.
- `style`: Formateo, espacios, puntos y comas (sin cambios de lógica).
- `test`: Adición o corrección de pruebas unitarias/integración.
- `docs`: Cambios exclusivamente en documentación.
- `chore`: Tareas de build, dependencias o configuración sin tocar fuente.

### Ámbito (`scope`):
- Opcional pero altamente recomendado. Indica el módulo afectado (ej. `promotions`, `pos`, `catalog`, `auth`, `rbac`, `db`).

### Ejemplo:
`feat(promotions): add payment method restrictions to promotions`

## 5. Prohibición Estricta de Atribución de IA
- **PROHIBIDO** incluir cabeceras de atribución de IA como `Co-Authored-By: CoPilot/ChatGPT/Gemini/Claude` o comentarios similares en el mensaje del commit o en el código.
- Los commits deben ser firmados/atribuidos únicamente mediante la autoría git estándar del desarrollador/entorno sin marcas de agua de IA.
