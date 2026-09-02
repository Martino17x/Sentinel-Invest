import { z } from "zod";

/**
 * Validación allocation_target para portfolio_investment_plans.
 *
 * - Cada key es un símbolo (AL30, T2X5, SPY, cash, dollar_linked...)
 *   regex permisivo: alfanumérico + underscore, 1-20 chars, case-insensitive
 *   (el spec dice /^[A-Z0-9]{1,12}$/ pero el seed usa cash/dollar_linked).
 * - Cada value es porcentaje 0-100
 * - Suma total debe ser 100 ±0.01
 * - Al menos un entry
 *
 * Validación de existencia del símbolo (BYMA/quote) se hace en
 * InvestmentPlanService, no en Zod (requiere IO). Ver design decision
 * "Validación allocation_target" — Zod valida shape/range, service valida
 * símbolos existentes con UNKNOWN_SYMBOL.
 */
export const allocationTargetSchema = z
  .record(
    z.string().regex(/^[A-Za-z0-9_]{1,20}$/, {
      message: "INVALID_SYMBOL_FORMAT",
    }),
    z.number().min(0, { message: "INVALID_PCT_RANGE" }).max(100, { message: "INVALID_PCT_RANGE" })
  )
  .refine((m) => Object.keys(m).length > 0, {
    message: "EMPTY_ALLOCATION",
  })
  .refine(
    (m) => {
      const sum = Object.values(m).reduce((a, b) => a + b, 0);
      return Math.abs(sum - 100) <= 0.01;
    },
    { message: "INVALID_ALLOCATION_SUM" }
  );

export const constraintsSchema = z
  .object({
    maxPorActivo: z.number().positive({ message: "INVALID_CONSTRAINTS" }).max(100).optional(),
    maxSector: z.number().positive({ message: "INVALID_CONSTRAINTS" }).max(100).optional(),
    betaMax: z.number().positive({ message: "INVALID_CONSTRAINTS" }).optional(),
  })
  .strict()
  .optional();

/**
 * Schema para POST /virtual-portfolios/:id/plans
 * Soporta alias allocation_target (snake) y allocationTarget (camel).
 * Title 1-100, objective 0-1000, rationale 0-2000.
 */
const baseCreatePlanSchema = z.object({
  title: z.string().trim().min(1, { message: "INVALID_TITLE" }).max(100, { message: "INVALID_TITLE" }),
  objective: z.string().trim().max(1000, { message: "INVALID_OBJECTIVE" }).optional(),
  rationale: z.string().trim().max(2000, { message: "INVALID_RATIONALE" }).optional(),
  constraints: constraintsSchema,
});

export const createPlanSchema = baseCreatePlanSchema
  .extend({
    allocation_target: allocationTargetSchema.optional(),
    allocationTarget: allocationTargetSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const hasSnake = data.allocation_target !== undefined;
    const hasCamel = data.allocationTarget !== undefined;
    if (!hasSnake && !hasCamel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MISSING_ALLOCATION_TARGET",
        path: ["allocation_target"],
      });
    }
    if (hasSnake && hasCamel) {
      // Si vienen ambos, deben ser iguales (evita ambigüedad)
      const snakeStr = JSON.stringify(data.allocation_target);
      const camelStr = JSON.stringify(data.allocationTarget);
      if (snakeStr !== camelStr) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CONFLICTING_ALLOCATION_TARGET",
          path: ["allocation_target"],
        });
      }
    }
  })
  .transform((data) => {
    // Normaliza a allocation_target (snake) como fuente canónica
    const allocation_target = data.allocation_target ?? data.allocationTarget!;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { allocationTarget: _removed, ...rest } = data as Record<string, unknown>;
    return {
      ...rest,
      allocation_target,
    } as {
      title: string;
      objective?: string;
      rationale?: string;
      constraints?: z.infer<typeof constraintsSchema>;
      allocation_target: Record<string, number>;
    };
  });

// Re-export types
export type AllocationTarget = z.infer<typeof allocationTargetSchema>;
export type Constraints = z.infer<typeof constraintsSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

/**
 * Helper para validar allocation_target en service layer
 * (suma y formato ya validados, solo chequea símbolos existentes).
 * Retorna array de símbolos desconocidos.
 */
export function getUnknownSymbols(
  allocationTarget: Record<string, number>,
  knownSymbols: Set<string>
): string[] {
  const normalizedKnown = new Set([...knownSymbols].map((s) => s.toUpperCase()));
  return Object.keys(allocationTarget).filter((sym) => !normalizedKnown.has(sym.toUpperCase()));
}
