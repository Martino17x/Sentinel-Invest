/**
 * Shim transitorio — re-exporta api-client (auth + apiFetch) + shims por dominio.
 * Fuente única auth/apiFetch vive en lib/api-client.ts (122L). No duplicar.
 * Gate C8: 57 consumers bloquean delete, TODO SDD7 documenta deuda, wc -l target ≤120.
 */
export * from "./api-client";

// SDD7 debt 2026-08-24: cotizaciones 3 consumers (InstrumentPicker, OperarSymbolPage, QuoteDetailPage) + radarApi migrados a features/*
// Gate C8: outside features 39→35, inside features 18→17 (OperarSymbolPage migrado). lib/api.ts 108L→46L (solo re-exports). shim retained hasta 0 consumers
// Fuente única cotizaciones: features/cotizaciones/api.ts (77L); radar: features/radar/api.ts. NO borrar shim hasta 0 hits fuera de features
export * from "../features/cotizaciones/api";

// Shim portafolio — fuente única en features/portafolio/api.ts (SDD dashboard-features-resto C2)
export * from "../features/portafolio/api";

// Shim reportes — fuente única en features/reportes/api.ts (SDD dashboard-features-resto C5)
export * from "../features/reportes/api";

// Shim auth — fuente única en features/auth/api.ts (SDD dashboard-features-resto C6)
// Contiene: authApi, profileApi, connectionsApi + tipos UserProfile, IolConnectionState
export * from "../features/auth/api";

// Shim operar — fuente única en features/operar/api.ts (SDD dashboard-features-resto C3)
export * from "../features/operar/api";

// Shim dolar — fuente única en features/dolar/api.ts (SDD dashboard-features-resto C6)
export * from "../features/dolar/api";

// Shim analisis — fuente única en features/analisis/api.ts (SDD dashboard-features-resto C4)
export * from "../features/analisis/api";

// Shim noticias — fuente única en features/noticias/api.ts (SDD dashboard-features-resto C5)
export * from "../features/noticias/api";

// Shim radar — fuente única en features/radar/api.ts (SDD7 debt — RadarRow/CclResponse aislados)
export * from "../features/radar/api";

// Shim renta-fija — fuente única en features/renta-fija/api.ts (SDD dashboard-features-resto C1)
export * from "../features/renta-fija/api";

// Shim agente — fuente única en features/agente/api.ts (SDD dashboard-features-resto C6)
// Contiene: agentApi, apiKeysApi + tipos AgentSession, AgentChatMessage, ApiKeySummary
export * from "../features/agente/api";
