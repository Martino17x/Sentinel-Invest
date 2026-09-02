import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pool } from "./db/index.js";
import { ensureSchema } from "./db/ensure-schema.js";
import authRouter from "./interfaces/http/routes/auth.js";
import googleRouter from "./interfaces/http/routes/google.js";
import accountsRouter from "./interfaces/http/routes/accounts.js";
import connectionsRouter from "./interfaces/http/routes/connections.js";
import profileRouter from "./interfaces/http/routes/profile.js";
import portfolioRouter from "./interfaces/http/routes/portfolio.js";
import portfolioMovementsRouter from "./interfaces/http/routes/portfolioMovements.js";
import operationsRouter from "./interfaces/http/routes/operations.js";
import ordersRouter from "./interfaces/http/routes/orders.js";
import quotesRouter from "./interfaces/http/routes/quotes.js";
import analysisRouter from "./interfaces/http/routes/analysis.js";
import ratesRouter from "./interfaces/http/routes/rates.js";
import radarRouter from "./interfaces/http/routes/radar.js";
import bondsRouter from "./interfaces/http/routes/bonds.js";
import agentRouter from "./interfaces/http/routes/agent.js";
import investorProfileRouter from "./interfaces/http/routes/investorProfile.js";
import apiKeysRouter from "./interfaces/http/routes/api-keys.js";
import virtualPortfoliosRouter from "./interfaces/http/routes/virtualPortfolios.js";
import { mountMcpHttp } from "./interfaces/mcp/http.js";
import { startScheduledJobs } from "./jobs/scheduler.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// Kill switch del agente (AI): AGENT_ENABLED=false desmonta /api/agent
// y /mcp — rollback de 2 líneas, sin tocar el resto de la API.
const agentEnabled = process.env.AGENT_ENABLED !== "false";

// CORS: acepta localhost + LAN (192.168.x.x, 10.x.x.x, 172.16-31.x.x) en :5173
// CLIENT_ORIGIN puede ser lista separada por comas: "http://localhost:5173,http://192.168.1.3:5173"
const rawOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const allowedOrigins = rawOrigin
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const lanOriginRegex =
  /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):5173$/;

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests sin Origin (curl, health checks, mobile webview inicial) → permitir
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || lanOriginRegex.test(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} no permitido`));
    },
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
app.use("/api/virtual-portfolios", virtualPortfoliosRouter);
app.use("/api/investor-profile", investorProfileRouter);
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

// 404 para rutas no matcheadas de /api (útil para debug, no rompe 502)
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// Error handler global — evita 502 por excepciones no capturadas (Vite proxy)
// Debe ir DESPUÉS de todas las rutas (incluido el 404) y ANTES del listen.
// Express lo reconoce por tener 4 args (err, req, res, next).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[errorHandler]", err instanceof Error ? err.message : err, err instanceof Error ? err.stack : "");
  if (res.headersSent) return;
  const message = err instanceof Error ? err.message : "Error interno";
  res.status(500).json({ error: "Error interno del servidor", detail: message });
});

app.listen(PORT, "0.0.0.0", () => {
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
















