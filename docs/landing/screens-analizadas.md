# Pantallas analizadas — Sentinel (desktop + mobile)

> Análisis de capturas en `docs/landing/screenshots/{desktop,mobile}/` con `vision.js` (MiMo V2.5). Los montos son datos **mock del usuario demo** (cuenta `123456`). Los colores citados son aproximados (estimación del modelo de visión).

## DESKTOP (`screenshots/desktop/`)

### 1. `agent-connect.png` — Conectá Sentinel con tu Agente (MCP)
- **Muestra:** panel MCP: título "Conectá Sentinel con tu Agente", subtítulo *"Tu agente de IA puede leer tu cartera y cotizaciones en tiempo real via MCP — configuralo en minutos."*. Cards de agentes (`Claude Code`, `Cursor`, `opencode`, `Codex`) con botón "Ver configuración"; acordeón "Qué puede hacer tu agente" con tools `get_portfolio`, `get_quote`, `search_instruments`, `get_dollar_rates`.
- **UI:** cards blancas/gris muy claro `#F9FAFB`, títulos `#111827`, descripciones `#6B7280`, botones outline; FAB de chat.
- **Qué vender:** integración con IA como diferencial — "tu agente lee tu cartera en tiempo real".

### 2. `analysis.png` — Análisis de una acción (GGAL)
- **Muestra:** detalle `GGAL` ("Grupo Financiero Galicia"). "Último cierre" `$6.850,00` `▼ -3,45%` (rojo), "Mercado cerrado — último cierre 2026-08-14". "Señal técnica": `Neutral`, score `52/100`, desglose ponderado: Tendencia 30% (SMA50/200, golden cross), MACD 25%, RSI 20% (32.0), Rango 52 sem. 15%, Volumen 10%.
- **UI:** cards con barra de progreso por indicador; card "Fundamentales".
- **Qué vender:** análisis técnico compuesto, transparente y explicado en español.

### 3. `connect.png` — Conectar cuenta IOL
- **Muestra:** "Conectar cuenta IOL" / *"Vinculá tu cuenta de InvertirOnline para ver tus datos reales"*. Card "Cuenta conectada" con badge `Activa` (verde): *"Sentinel consulta tu cartera en modo lectura — nunca ejecuta órdenes"*. Datos: Usuario IOL `demo_user`; Cuentas: `123456`. Alerta de seguridad: *"Tus credenciales están cifradas con AES-256. Podés desconectar cuando quieras y se eliminan de inmediato."*. Botón "Desconectar cuenta".
- **Qué vender:** seguridad y confianza (modo lectura, AES-256, desconexión total).

### 4. `inicio.png` — Inicio (total valorizado)
- **Muestra:** "Tu total valorizado" `$ 907.346` (ARS, selector de moneda, ojo para ocultar), `↗ +$2.360,32 (+0.27% hoy)`, nota de conversión al dólar bolsa; "Disponible para invertir" Pesos `$14.352,26` / Dólares `$14.12`; acciones "Actividad"/"Sincronizar"; "Dólar hoy" (Oficial 1.460/1.510, Blue 1.525/1.545, Bolsa 1.509/1.521, CCL 1.571/1.573); donut "Mis inversiones" (Bonos 91%, CEDEARs 5%, Acciones 2,4%, Efectivo 1,6%). Footer: *"Sentinel es solo lectura — no ejecuta operaciones. Los datos provienen de IOL/BYMA y dolarapi.com."*
- **Qué vender:** la home "estilo app IOL": cartera + dólar + distribución en una vista.

### 5. `login.png` — Ingreso
- **Muestra:** "Ingresá a Sentinel" / *"Tu cartera de inversiones, controlada"*. Email (`vos@ejemplo.com`), Contraseña, botón negro "Ingresar", "o continuá con" + "Continuar con Google", "Registrate", aviso legal Términos/Privacidad. Logo = cuadrado negro con ícono trending up blanco.
- **Qué vender:** entrada simple, promesa en el subtítulo, baja fricción (Google + email).

### 6. `operations.png` — Operaciones
- **Muestra:** "Operaciones" / *"Historial completo de tus operaciones en IOL"*. Tabla `Fecha | Operación | Símbolo | Cantidad | Precio | Total | Comisión | Estado`; badges oscuros "Compra"/"Aceptada"; 5 operaciones (ej. `02/07/2026 Compra NVDA 2 $8.900 $17.800 $27 Aceptada`).
- **Qué vender:** historial transparente con comisiones y estados.

### 7. `portfolio.png` — Panel / Portafolio
- **Muestra:** "Panel" / "Cuenta 123456 — resumen de tu cartera". KPIs: Ganancia/Pérdida `$119.114,78` (+15,53%, "+0.27% hoy (+$2.360,32)"), Activos valorizados `$871.678,20`, Disponible ARS `$14.352,26`, Disponible USD `$14.12`. Gráfico "Evolución del valor" (90 días, área verde).
- **Qué vender:** vista panorámica de la cartera + evolución.

### 8. `profile.png` — Perfil
- **Muestra:** "Usuario Demo" / `demo@sentinel.dev`. Secciones: Información de la cuenta (email no editable, nombre editable, Guardar), Cambiar contraseña, **API Keys** (para MCP; secreto se muestra una sola vez).
- **Qué vender:** gestión de cuenta + API Keys como puente a los agentes IA.

### 9. `quote-detail.png` — Detalle de cotización (GGAL)
- **Muestra:** breadcrumb "Cotizaciones / GGAL", favorito ☆, "Grupo Financiero Galicia". KPIs: Último precio `$9.312,50` (`▲ +0,74%`), Moneda ARS, Actualizado. Botones "Ver análisis" / "BCBA". Gráfico con pestañas "Simplificado"/"TradingView".
- **Qué vender:** ficha completa del activo + gráfico + acceso al análisis.

### 10. `quotes.png` — Cotizaciones
- **Muestra:** "Cotizaciones" / *"Mercado argentino y americano — en tiempo real"*. Tabs `AR Argentina`/`us EEUU` + tipo (CEDEARs, Acciones, Bonos, Obligaciones Neg., Cauciones). Panel `▲ 0.65%`. Búsqueda "Buscar símbolo — ej: NVDA", favoritas, tabla `Activo|Último|Variación|Compra|Venta|Mínimo|Máximo|Volumen` (ej. AAPL `$21.450,00` ▼0.78%, bid/ask, min/max, vol 45.1k).
- **Qué vender:** la "terminal" del inversor AR+US en tiempo real.

### 11. `register.png` — Registro
- **Muestra:** "Creá tu cuenta" / *"Empezá a controlar tus inversiones"*. Nombre, Email, Contraseña (mín. 8), "Crear cuenta", Google, "¿Ya tenés cuenta? Ingresá", legal.
- **Qué vender:** onboarding en 3 campos + Google.

### 12. `reports.png` — Reportes mensuales
- **Muestra:** "Reportes mensuales" / *"Cierre de cada mes — rendimiento, actividad y comparativas"*, selector "agosto de 2026". Métricas: Valor al cierre `$886.030,46`, Rendimiento real (TWR) `+2.05%` "+$17.830,46 — excluye aportes", Aportes netos, vs Merval `+0.25%` "Merval +1.80% — le ganaste". Íconos de info.
- **Qué vender:** reporte mensual automático con TWR y comparativa vs Merval.

## MOBILE (`screenshots/mobile/`)

### 1. `login.png` — Ingreso móvil
- Igual que desktop, en card centrada; logo cuadrado negro. Nav inferior ausente (pantalla pública).

### 2. `inicio.png` — Inicio móvil
- "Tu total valorizado" `$ 907.346`, disponible ARS/USD, "Dólar hoy" (oficial/blue/bolsa), botones Actividad/Sincronizar, **nav inferior** (Inicio activa, Portafolio, Cotizaciones, Reportes), FAB chat. Fondo `#F5F5F5`, cards blancas.

### 3. `portfolio.png` — Panel móvil
- "Cuenta 123456 — resumen de tu cartera"; KPIs apilados (Ganancia/Pérdida `$119.114,78` +15,53%, Activos `$871.678,20`, Disponible ARS/USD); "Evolución del valor"; nav inferior con Portafolio activa.

### 4. `operations.png` — Operaciones móvil
- Cards por operación (NVDA 02/07/2026 TOTAL $17.800; GD35 10/06/2026 TOTAL $33.150.000) con badges Compra/Aceptada; nav inferior.

### 5. `quotes.png` — Cotizaciones móvil
- Tabs AR/US + tipos, "⚡ En tiempo real", Panel `▲ 0.65%`, búsqueda, tabla CEDEARs con bid/ask/min/max/volumen.

### 6. `quote-detail.png` — Detalle móvil
- Ficha del activo con KPIs y gráfico (análisis de visión truncado en origen; funcionalidad = desktop quote-detail).

### 7. `reports.png` — Reportes móvil
- Reporte mensual con Valor al cierre `$886.030,46`, TWR `+2.05%`, Aportes netos, vs Merval "le ganaste".

### 8. `agent-connect.png` — Agente MCP móvil
- Sección MCP en móvil: cards Claude Code/Cursor/gemini-cli con "Ver configuración".
