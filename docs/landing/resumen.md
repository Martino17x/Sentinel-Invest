# Resumen ejecutivo — Sentinel Invest

## Qué es
**Sentinel** es una aplicación web de **control de inversiones para cuentas de IOL (InvertirOnline), Argentina**. Se conecta a la cuenta del usuario de IOL y permite **consultar y operar** (compra/venta, FCI y MEP con confirmación explícita): centraliza: valorización de cartera, cotizaciones AR/US en tiempo real, análisis técnico de acciones, historial de operaciones, reportes mensuales, dólar del día e integración con **agentes de IA vía MCP**. Tagline real: *"Tu cartera de inversiones, controlada"*.

**Datos del demo (verificados):** cuenta `123456`; total valorizado `~$907.346 ARS`; disponible `$14.352,26`; dólar oficial `~1.460/1.510`, blue `~1.525/1.545`, bolsa `~1.509/1.521`, CCL `~1.571/1.573`; instrumentos de ejemplo: bono `GD35`, CEDEAR `NVDA`, acción `MRCUO`/`GGAL`.

## Audiencia objetivo
- **Inversores retail argentinos** que operan en IOL y quieren ver su cartera "de un vistazo" (total valorizado en pesos con conversión al dólar bolsa, disponible, dólar del día, evolución).
- **Inversores que quieren análisis y reportes simples:** señal técnica compuesta y explicada en español, reportes mensuales con TWR y comparativa vs Merval.
- **Usuarios técnicos / early adopters de IA:** developers e inversores que usan agentes (Claude Code, Cursor, Codex…) y quieren que su agente lea su cartera en tiempo real vía MCP con alcance de solo lectura.
- **Personas que valoran seguridad y transparencia:** cifrado AES-256, confirmación explícita antes de operar, desconexión inmediata.

## Propuesta de valor
1. **Control total:** toda operación exige confirmación explícita antes de enviarse a IOL; credenciales cifradas AES-256 y eliminadas al desconectar.
2. **Una sola vista de todo:** total en ARS (conversión dólar bolsa punta compra), disponible ARS/USD, ganancia del día, donut de distribución y evolución a 90 días.
3. **Análisis que se entiende:** señal técnica 0–100 con desglose por indicador (tendencia, MACD, RSI, rango 52 semanas, volumen) y estado claro.
4. **Reportes mensuales automáticos:** rendimiento real TWR excluyendo aportes y comparativa vs Merval ("le ganaste").
5. **Mercado AR + US en tiempo real:** CEDEARs, acciones, bonos, ONs y cauciones con bid/ask, min/max y volumen; dólar oficial/blue/bolsa.
6. **Tu agente de IA, conectado:** server MCP local con tools de lectura (scope `read`) y de trading (scope `trade`): `place_order`, `cancel_order`, `subscribe_fci`, `rescue_fci`. En la app, toda orden pide confirmación explícita antes de enviarse a IOL.

## Tono de voz
- **Voseo rioplatense, directo y cercano** (copy real): "Ingresá a Sentinel", "Registrate", "Conectá Sentinel con tu Agente", "configuralo en minutos", "Empezá a controlar tus inversiones", "Plata que metiste / sacaste", "Merval +1.80% — le ganaste".
- **Confiable y transparente:** "toda orden se confirma antes de ejecutarse", "tus credenciales están cifradas con AES-256", "excluye aportes", "pesos renormalizados".
- **Claro y educativo:** micro-copy con ícono de info, placeholders con ejemplos reales ("Buscar símbolo — ej: NVDA"), advertencias honestas ("Mercado cerrado — último cierre 2026-08-14").
- **Visual coherente:** interfaz blanca/negro/gris con acentos verdes (positivo) y rojos (negativo), Geist, estética "terminal financiera" sobria — con el chat Synara (verde) como único gesto de marca.
