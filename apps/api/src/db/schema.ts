import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================
// ENUMS
// ============================================================

export const marketEnum = pgEnum("market", ["bcba", "nyse", "nasdaq", "bonds", "fci", "crypto"]);

export const operationTypeEnum = pgEnum("operation_type", ["buy", "sell", "subscription", "redemption"]);

export const operationStatusEnum = pgEnum("operation_status", ["pending", "accepted", "rejected", "cancelled"]);

export const currencyEnum = pgEnum("currency", ["ARS", "USD"]);

export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "tool"]);

export const apiKeyScopeEnum = pgEnum("api_key_scope", ["read", "trade"]);

// ============================================================
// USERS — el corazón del multitenant
// ============================================================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  passwordHash: text("password_hash").notNull(),
  googleId: text("google_id"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  iolConnections: many(iolConnections),
  accounts: many(accounts),
  aiChatSessions: many(aiChatSessions),
  apiKeys: many(apiKeys),
  agentActions: many(agentActions),
}));

// ============================================================
// IOL CONNECTIONS — credenciales del usuario en IOL (cifradas)
// ============================================================

export const iolConnections = pgTable(
  "iol_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Credenciales de IOL — SIEMPRE cifradas en la capa de servicio
    iolUsername: text("iol_username").notNull(),
    iolPasswordEncrypted: text("iol_password_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("iol_connections_user_idx").on(table.userId),
    uniqueIndex("iol_connections_user_unique").on(table.userId),
  ]
);

export const iolConnectionsRelations = relations(iolConnections, ({ one }) => ({
  user: one(users, { fields: [iolConnections.userId], references: [users.id] }),
}));

// ============================================================
// ACCOUNTS — cuentas comitente del usuario en IOL
// ============================================================

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Número de cuenta en IOL (para /api/v2/portafolio/{cuenta})
    iolAccountNumber: text("iol_account_number").notNull(),
    name: text("name"),
    currency: currencyEnum("currency").default("ARS").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("accounts_user_idx").on(table.userId),
    uniqueIndex("accounts_iol_number_unique").on(table.userId, table.iolAccountNumber),
  ]
);

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  positions: many(positions),
  operations: many(operations),
  snapshots: many(portfolioSnapshots),
}));

// ============================================================
// POSITIONS — cartera actual (sincronizada desde IOL)
// ============================================================

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    market: marketEnum("market").notNull(),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    avgPrice: numeric("avg_price", { precision: 20, scale: 6 }),
    lastPrice: numeric("last_price", { precision: 20, scale: 6 }),
    currency: currencyEnum("currency").default("ARS").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("positions_account_idx").on(table.accountId),
    uniqueIndex("positions_symbol_unique").on(table.accountId, table.symbol, table.market),
  ]
);

export const positionsRelations = relations(positions, ({ one }) => ({
  account: one(accounts, { fields: [positions.accountId], references: [accounts.id] }),
}));

// ============================================================
// OPERATIONS — historial de operaciones (para análisis)
// ============================================================

export const operations = pgTable(
  "operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    // ID de la operación en IOL — clave única para evitar duplicados al sincronizar
    iolOperationId: text("iol_operation_id").notNull(),
    symbol: text("symbol").notNull(),
    market: marketEnum("market").notNull(),
    type: operationTypeEnum("type").notNull(),
    status: operationStatusEnum("status").default("accepted").notNull(),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    price: numeric("price", { precision: 20, scale: 6 }).notNull(),
    total: numeric("total", { precision: 20, scale: 2 }).notNull(),
    commission: numeric("commission", { precision: 20, scale: 2 }).default("0"),
    currency: currencyEnum("currency").default("ARS").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("operations_account_idx").on(table.accountId),
    index("operations_symbol_idx").on(table.symbol),
    index("operations_date_idx").on(table.date),
    uniqueIndex("operations_iol_id_unique").on(table.iolOperationId),
  ]
);

export const operationsRelations = relations(operations, ({ one }) => ({
  account: one(accounts, { fields: [operations.accountId], references: [accounts.id] }),
}));

// ============================================================
// PORTFOLIO SNAPSHOTS — valor de cartera en el tiempo
// (la materia prima del análisis de patrones)
// ============================================================

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    totalValue: numeric("total_value", { precision: 20, scale: 2 }).notNull(),
    totalValueUsd: numeric("total_value_usd", { precision: 20, scale: 2 }).default("0").notNull(),
    cash: numeric("cash", { precision: 20, scale: 2 }).notNull(),
    cashArs: numeric("cash_ars", { precision: 20, scale: 2 }).default("0").notNull(),
    cashUsd: numeric("cash_usd", { precision: 20, scale: 2 }).default("0").notNull(),
    positionsValue: numeric("positions_value", { precision: 20, scale: 2 }).default("0").notNull(),
    unrealizedGain: numeric("unrealized_gain", { precision: 20, scale: 2 }).default("0").notNull(),
    dayChangePct: numeric("day_change_pct", { precision: 10, scale: 4 }).default("0").notNull(),
    currency: currencyEnum("currency").default("ARS").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("snapshots_account_idx").on(table.accountId),
    index("snapshots_captured_at_idx").on(table.capturedAt),
    uniqueIndex("snapshots_account_time_unique").on(table.accountId, table.capturedAt),
  ]
);

export const portfolioSnapshotsRelations = relations(portfolioSnapshots, ({ one }) => ({
  account: one(accounts, { fields: [portfolioSnapshots.accountId], references: [accounts.id] }),
}));

// ============================================================
// PRICE HISTORY — cotizaciones históricas
// (DATO DE MERCADO: compartido, NO por usuario — es público)
// ============================================================

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    market: marketEnum("market").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    open: numeric("open", { precision: 20, scale: 6 }),
    high: numeric("high", { precision: 20, scale: 6 }),
    low: numeric("low", { precision: 20, scale: 6 }),
    close: numeric("close", { precision: 20, scale: 6 }).notNull(),
    volume: integer("volume"),
    currency: currencyEnum("currency").default("ARS").notNull(),
  },
  (table) => [
    index("price_history_symbol_idx").on(table.symbol),
    uniqueIndex("price_history_symbol_date_unique").on(table.symbol, table.market, table.date),
  ]
);

export const priceHistoryRelations = relations(priceHistory, () => ({}));

// ============================================================
// AI CHAT SESSIONS — sesiones del asistente conversacional
// (motor de agente, dominio aislado por usuario)
// ============================================================

export const aiChatSessions = pgTable(
  "ai_chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Título auto-derivado de la primera oración del primer mensaje
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("ai_chat_sessions_user_idx").on(table.userId)]
);

export const aiChatSessionsRelations = relations(aiChatSessions, ({ one, many }) => ({
  user: one(users, { fields: [aiChatSessions.userId], references: [users.id] }),
  messages: many(aiChatMessages),
}));

// ============================================================
// AI CHAT MESSAGES — mensajes de una sesión (historial LLM)
// ============================================================

export const aiChatMessages = pgTable(
  "ai_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => aiChatSessions.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    content: text("content"),
    // Tool calls crudas del LLM — SIEMPRE sanitizadas antes de persistir
    toolCalls: jsonb("tool_calls"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("ai_chat_messages_session_idx").on(table.sessionId, table.createdAt)]
);

export const aiChatMessagesRelations = relations(aiChatMessages, ({ one }) => ({
  session: one(aiChatSessions, { fields: [aiChatMessages.sessionId], references: [aiChatSessions.id] }),
}));

// ============================================================
// API KEYS — claves personales para agentes externos (MCP)
// (solo se guarda el hash SHA-256; el secreto se muestra UNA vez)
// ============================================================

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Prefijo público: "sk-sentinel-" + 4 chars (identifica la key sin exponerla)
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scope: apiKeyScopeEnum("scope").default("read").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("api_keys_user_idx").on(table.userId),
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
  ]
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

// ============================================================
// AGENT ACTIONS — auditoría de cada tool call del agente
// (chat UI o MCP: clientName "chat" | "mcp:*")
// ============================================================

export const agentActions = pgTable(
  "agent_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    // Args con campos PII reemplazados por "***" — nunca loguear lo sensible
    argsSanitized: jsonb("args_sanitized"),
    resultStatus: text("result_status").notNull(),
    clientName: text("client_name").default("chat").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("agent_actions_user_idx").on(table.userId, table.createdAt)]
);

export const agentActionsRelations = relations(agentActions, ({ one }) => ({
  user: one(users, { fields: [agentActions.userId], references: [users.id] }),
}));
