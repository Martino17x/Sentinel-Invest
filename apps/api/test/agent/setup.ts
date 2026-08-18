// ============================================================
// Setup de tests — DEBE importarse ANTES de `dotenv/config`
//
// Fuerza el modo mock del provider IOL: los tests corren sin
// credenciales reales (spec NFR-Pruebas). dotenv NO pisa variables
// ya definidas, así que el valor se mantiene tras cargar .env.
// ============================================================
process.env.IOL_PROVIDER = "mock";
