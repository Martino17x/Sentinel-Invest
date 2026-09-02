import { z } from "zod";

/** Convierte un input numérico (es-AR o US) a number: acepta coma o punto decimal. */
export function parseDecimal(input: string): number {
  const s = input.trim().replace(/\s/g, "");
  if (!s) return NaN;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let normalized = s;
  if (hasComma && hasDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = s.replace(",", ".");
  }
  return Number(normalized);
}

export const tradeFormSchema = z
  .object({
    symbol: z.string().trim().min(1, "Ingresá un símbolo").max(10, "Símbolo muy largo"),
    side: z.enum(["buy", "sell"]),
    mode: z.enum(["qty", "amount"]),
    qty: z.number().optional(),
    amount: z.number().optional(),
    priceType: z.enum(["market", "limit"]),
    price: z.number().optional(),
    term: z.enum(["t0", "t1", "t2"]),
    validity: z.enum(["1d", "7d"]),
    market: z.enum(["bcba", "nyse", "nasdaq", "bonds"]),
    specie: z.enum(["normal", "D"]).optional(),
  })
  .superRefine((data, ctx) => {
    const value = data.mode === "qty" ? data.qty : data.amount;
    if (value == null || !Number.isFinite(value) || value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [data.mode === "qty" ? "qty" : "amount"],
        message: "Ingresá una cantidad o monto mayor a cero",
      });
    }
    if (data.priceType === "limit" && (data.price == null || !Number.isFinite(data.price) || data.price <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "Ingresá un precio válido para la orden límite",
      });
    }
  });

export const fciSchema = z
  .object({
    symbol: z.string().trim().min(1, "Ingresá el símbolo del FCI").max(20, "Símbolo muy largo"),
    mode: z.enum(["subscribe", "rescue"]),
    amount: z.number().optional(),
    quantity: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    const value = data.mode === "subscribe" ? data.amount : data.quantity;
    if (value == null || !Number.isFinite(value) || value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [data.mode === "subscribe" ? "amount" : "quantity"],
        message:
          data.mode === "subscribe"
            ? "Ingresá un monto mayor a cero"
            : "Ingresá una cantidad de cuotapartes mayor a cero",
      });
    }
  });

export type TradeFormValues = z.infer<typeof tradeFormSchema>;
