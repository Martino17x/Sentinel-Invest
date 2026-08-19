import type { ToolDefinition, ToolPermission, ToolScope } from "./types.js";

// ============================================================
// Permisos — matriz allow | ask | exclude
// El gate de seguridad del executor decide AQUÍ si un tool corre.
// ============================================================

export const ALLOWED_PERMISSIONS: readonly ToolPermission[] = ["allow", "ask", "exclude"];

export type PermissionVerdict =
  | { allowed: true }
  | { allowed: false; code: "excluded" | "needs_approval"; reason: string };

/**
 * Verdict de permiso para una tool call.
 * - exclude → jamás ejecuta (tools deshabilitados; place_order ya no es exclude: ahora es allow con gates en su execute).
 * - ask → requiere aprobación humana: flujo diseñado pero NO implementado
 *   (spec out of scope), así que en esta fase tampoco ejecuta.
 * - allow → pasa al dispatch (siempre y cuando el scope del MCP lo permita;
 *   el filtrado por scope es responsabilidad de la capa MCP, fase G).
 */
export function checkPermission(tool: ToolDefinition, _scope: ToolScope): PermissionVerdict {
  if (tool.permission === "exclude") {
    return {
      allowed: false,
      code: "excluded",
      reason: `El tool "${tool.name}" no está permitido`,
    };
  }
  if (tool.permission === "ask") {
    return {
      allowed: false,
      code: "needs_approval",
      reason: `El tool "${tool.name}" requiere aprobación humana, que no está disponible`,
    };
  }
  return { allowed: true };
}
