# Inventario de funcionalidades — Sentinel

> Fuente: análisis de capturas (`docs/landing/analisis/`) + código (`apps/dashboard/src/`). La app es de **solo lectura**: no ejecuta operaciones (footer real: *"Sentinel es solo lectura — no ejecuta operaciones. Los datos provienen de IOL/BYMA y dolarapi.com."*).

## 1. Portafolio
- **Panel con KPIs:** Ganancia/Pérdida ($119.114,78, +15,53%), Activos valorizados ($871.678,20), Disponible ARS ($14.352,26) y USD ($14.12), con variación del día.
- **Total valorizado en ARS:** hero del Inicio (pesos + dólares convertidos al **dólar bolsa punta compra**).
- **Evolución del valor:** gráfico de área de los últimos 90 días.
- **Distribución:** donut por tipo de activo (paleta esmeralda/violeta/azul/ámbar/cyan en `index.css`).
- **Ocultar montos** (ojo) y selector de moneda.

## 2. Operaciones
- **Historial completo IOL:** tabla (desktop) / cards (mobile) con fecha, tipo, símbolo, cantidad, precio, total, comisión y estado.
- **Badges** de tipo/estado (Compra, Aceptada) y contador de operaciones.

## 3. Cotizaciones
- **Mercados AR y US** (tabs) y filtros por tipo (CEDEARs, Acciones, Bonos, ONs, Cauciones).
- **Tabla en tiempo real:** Activo, Último, Variación, Compra, Venta, Mínimo, Máximo, Volumen; indicador "⚡ En tiempo real" y timestamp.
- **Favoritas**, **búsqueda** ("Buscar símbolo — ej: NVDA") y recarga manual.
- **Detalle de instrumento:** KPIs, gráfico (Simplificado / TradingView), botón BCBA y acceso "Ver análisis".

## 4. Análisis de acciones
- **Señal técnica compuesta 0–100** con pesos renormalizados: Tendencia 30% (SMA50/200, golden cross), MACD 25%, RSI 20%, Rango 52 semanas 15%, Volumen 10% — cada uno con barra y score.
- **Etiqueta de estado** (ej. Neutral) y sección **Fundamentales**.

## 5. Reportes mensuales
- **Reporte por mes** con: Valor al cierre, **Rendimiento real TWR** (excluye aportes), Aportes netos ("Plata que metiste / sacaste") y **comparativa vs Merval** ("le ganaste").
- Micro-copy explicativa con ícono de info.

## 6. Agente IA (MCP)
- **Server MCP local** que expone la cartera: tools `get_portfolio`, `get_quote`, `search_instruments`, `get_dollar_rates` (scope read); `place_order` queda para una próxima versión con confirmación humana.
- **Agentes soportados:** Claude Code, Cursor, opencode, Codex, gemini-cli; guías de configuración por agente.
- **API Keys** en el perfil (el secreto se muestra una sola vez).
- **Chat Synara:** FAB con gradiente verde de marca (`#0b6749 → #064028`).

## 7. Conexión IOL
- Vincular cuenta de InvertirOnline, **modo lectura garantizado**, credenciales **cifradas AES-256** y eliminación al desconectar; soporte de múltiples cuentas; estado con badge "Activa".

## 8. Dólar
- **"Dólar hoy":** oficial, blue y bolsa con punta compra/venta (fuente `dolarapi.com`); conversión automática al valorizar la cartera.

## 9. Autenticación y perfil
- **Registro:** nombre, email, contraseña (mín. 8) o Google; legal Términos/Privacidad.
- **Login:** email + contraseña o Google OAuth (maneja errores `google_denied`, `invalid_state`, `oauth_failed`).
- **Perfil:** email como identidad, nombre editable, cambio de contraseña y **API Keys** para MCP.
- **Avatar** con iniciales (UD) + **bottom nav mobile** (Inicio, Portafolio, Cotizaciones, Reportes).
