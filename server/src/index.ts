import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pool } from "./db/index.js";
import { ensureSchema } from "./db/ensure-schema.js";
import authRouter from "./routes/auth.js";
import googleRouter from "./routes/google.js";
import accountsRouter from "./routes/accounts.js";
import connectionsRouter from "./routes/connections.js";
import profileRouter from "./routes/profile.js";
import portfolioRouter from "./routes/portfolio.js";
import operationsRouter from "./routes/operations.js";
import quotesRouter from "./routes/quotes.js";
import ratesRouter from "./routes/rates.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    credentials: true, // necesario para que el navegador guarde la cookie httpOnly
  })
);
app.use(express.json());
app.use(cookieParser());

// Health check — también verifica la conexión a la base de datos
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "disconnected", message: String(err) });
  }
});

// Rutas de la API
app.use("/api/auth", authRouter);
app.use("/api/auth", googleRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/api/operations", operationsRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/rates", ratesRouter);

app.listen(PORT, () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
});

// Migraciones idempotentes al arranque — nunca deben romper el boot
ensureSchema()
  .then(() => console.log("✅ ensure-schema: OK"))
  .catch((err) => console.warn("⚠️ ensure-schema:", err instanceof Error ? err.message : err));












