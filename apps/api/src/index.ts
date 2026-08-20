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
import portfolioMovementsRouter from "./routes/portfolioMovements.js";
import operationsRouter from "./routes/operations.js";
import ordersRouter from "./routes/orders.js";
import quotesRouter from "./routes/quotes.js";
import analysisRouter from "./routes/analysis.js";
import ratesRouter from "./routes/rates.js";
import radarRouter from "./routes/radar.js";
import bondsRouter from "./routes/bonds.js";
import agentRouter from "./routes/agent.js";
import apiKeysRouter from "./routes/api-keys.js";
import { mountMcpHttp } from "./mcp/http.js";
import { startScheduledJobs } from "./jobs/scheduler.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// Kill switch del agente (AI): AGENT_ENABLED=false desmonta /api/agent
// y /mcp — rollback de 2 líneas, sin tocar el resto de la API.
const agentEnabled = process.env.AGENT_ENABLED !== "false";

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
app.use("/api/portfolio", portfolioMovementsRouter);
app.use("/api/operations", operationsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/analysis", analysisRouter);
app.use("/api/rates", ratesRouter);
app.use("/api/radar", radarRouter);
app.use("/api/bonds", bondsRouter);
// API keys — infraestructura de credenciales para agentes externos
// (el consumo MCP se monta/desmonta con AGENT_ENABLED en fase G).
// Se monta SIEMPRE: el usuario debe poder gestionar sus keys aunque
// el agente esté deshabilitado (rollback del chat no rompe el perfil).
app.use("/api/apikeys", apiKeysRouter);
if (agentEnabled) {
  app.use("/api/agent", agentRouter);
  // MCP (stdio + Streamable HTTP): se monta/desmonta con el mismo flag —
  // clientes externos dejan de existir con AGENT_ENABLED=false.
  mountMcpHttp(app);
}

app.listen(PORT, () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
});

// Migraciones idempotentes al arranque — nunca deben romper el boot.
// Los jobs diarios (snapshot 17:30 ART, reconciliación) arrancan SOLO
// tras ensureSchema OK; el scheduler tiene su propio guard de tabla
// (D2): si la tabla falta, no agenda y la app sigue viva.
ensureSchema()
  .then(async () => {
    console.log("✅ ensure-schema: OK");
    await startScheduledJobs();
  })
  .catch((err) => console.warn("⚠️ ensure-schema:", err instanceof Error ? err.message : err));
















