// ============================================================
// Corpus de conocimiento — inversiones en Argentina
//
// Fuente de verdad del RAG keyword del agente (sin embeddings).
// Cada documento: id, título, tags de búsqueda y contenido markdown.
// La validación de integridad corre en getCorpus() al primer uso
// (ids únicos, títulos y contenido no vacíos) — fail-safe al boot.
//
// IMPORTANTE: contenido educativo general, con datos del mercado
// argentino a 2025. No es asesoramiento financiero ni fiscal.
// ============================================================

export interface KnowledgeDoc {
  id: string;
  title: string;
  tags: string[];
  content: string;
}

const DOCS: KnowledgeDoc[] = [
  {
    id: "cedears",
    title: "CEDEARs: qué son, ratio de conversión, comisiones y parking",
    tags: [
      "cedear", "cedears", "cedear que es", "como operar cedears", "ratio cedear",
      "acciones extranjeras", "nvidia", "apple", "aapl", "nvda", "microsoft",
      "msft", "tesla", "tsla", "parking", "comisiones cedear", "t1",
    ],
    content: `## Qué es un CEDEAR

Un CEDEAR (Certificado de Depósito Argentino) es un título local que representa
acciones de empresas del exterior (NYSE, Nasdaq), custodiadas por un banco
depositario (Caja de Valores / Banco Comafi, entre otros). Comprás CEDEARs en
pesos o dólares en la Bolsa de Buenos Aires (BYMA) y seguís expuesto al precio
de la acción subyacente, pero operando con la moneda, los horarios y las reglas
locales.

## Ratio de conversión

El ratio indica cuántos CEDEARs equivalen a UNA acción subyacente. Ejemplos
típicos: KO (Coca-Cola) 5:1, AAPL 10:1, MSFT 1:1. Si un CEDEAR tiene ratio 10:1
y la acción vale USD 180, el CEDEAR vale aproximadamente USD 18 (más el costo
de custodia, que ya está incluido en el precio). Ojo: los ratios cambian cuando
la empresa hace un split o una contra-split, así que SIEMPRE consultá el ratio
vigente en el panel de tu ALyC antes de operar.

## Comisiones y parking

- Comisiones típicas de ALyCs locales (2025): del orden del 1% + IVA en
  compras y 0,5% + IVA en ventas, con mínimos por operación. Compará entre
  comitentes antes de elegir.
- Parking: si compraste CEDEARs con pesos, no podés venderlos hasta cumplir
  3 días hábiles (72 horas) desde la liquidación. Es una restricción cambiaria
  para evitar operaciones de contado con liquidación en moneda extranjera.
- La liquidación de la operación es a 24 horas hábiles (T+1) desde 2024.

## Ventajas y riesgos

Ventajas: acceso a las empresas más grandes del mundo sin cuenta en el
exterior, liquidez alta, dolarización de la cartera. Riesgos: comisiones y
spread más caros que en el exterior, riesgo cambiario (si el peso se aprecia,
el CEDEAR baja en pesos aunque la acción suba), riesgo de parking si necesitás
el dinero rápido, y los mercados de EEUU no operan cuando Argentina está de
feriado (spreads amplios esos días). Los dividendos del subyacente se cobran en
dólares, con retención de Ganancias en la fuente.`,
  },
  {
    id: "bonos-soberanos",
    title: "Bonos soberanos argentinos: AL30, GD30, cupones, precio por VN100",
    tags: [
      "bonos", "bono", "al30", "al29", "al41", "gd30", "gd35", "gd38", "gd46",
      "bonares", "globales", "vn100", "valor nominal", "cupon", "tir",
      "duration", "riesgo pais", "bonos argentinos", "renta fija", "bono soberano",
    ],
    content: `## Cómo se leen los bonos argentinos

Los bonos del Estado se cotizan por VALOR NOMINAL (VN): el precio en pantalla
es por cada VN 100. Esto es CRUCIAL: si el AL30 cotiza a 45,80, significa que
cada título (VN US$100) vale el 45,8% de su valor nominal, es decir
US$45,80. El 100 en pantalla = la paridad (precio par).

## Bonares (ley argentina) y Globales (ley Nueva York)

- Bonares: AL30, AL29, AL41. Emitidos bajo ley argentina, cupones semestrales
  fijos y amortización integra al vencimiento (bullet). El AL30 (vencimiento
  2030) es el más operado: es la referencia del mercado y de la curva MEP.
- Globales: GD30, GD35, GD38, GD46. Ley de Nueva York, nacieron del canje de
  deuda de 2020. Cupones bajos que crecen con el tiempo (step-up): por ejemplo
  el GD30 arranco con cupon de 0,125% y va subiendo hasta 2030.
- El precio refleja la TIR (tasa interna de retorno): si el bono paga menos
  cupon que la tasa de mercado, cotiza bajo la par (por debajo de 100); si
  paga mas, cotiza sobre la par.

## Duration y riesgo pais

- Duration: sensibilidad del precio a las tasas. A mayor duration, mayor
  volatilidad. El GD38 y el GD46 (vencimientos 2038/2046) tienen duration
  larga y se mueven mucho; el AL30/GD30 (2030) tienen duration de ~3-4 años.
- Riesgo pais (EMBI+ Argentina): mide el sobrecosto de la deuda argentina
  sobre la de EEUU en puntos basicos. En 2025 rondo los 600-800 pb. Si baja,
  los bonos suben (y viceversa).
- Relacion precio-TIR: precio y TIR se mueven en direccion opuesta. TIR alta =
  bono barato, pero el mercado te pide esa tasa por el riesgo.

## Datos operativos

- Se operan en BYMA, liquidacion T+1. El AL30 en pesos comparte rueda con el
  AL30D (su version en dolares): la relacion entre ambos forma el dolar MEP.
- Comisiones similares a las acciones (~0,5-1% + IVA segun la ALyC).`,
  },
  {
    id: "acciones-bcba",
    title: "Acciones argentinas: líderes, MERVAL y panel general",
    tags: [
      "acciones", "accion", "bcba", "byma", "merval", "panel general",
      "panel lider", "ggal", "bbar", "bma", "supv", "ypf", "pamp", "teco2",
      "vist", "cepu", "metr", "loma", "cresy", "acciones argentinas", "acciones locales",
    ],
    content: `## El panel local (BYMA)

En BYMA cotizan unas 150 acciones, pero la liquidez esta MUY concentrada: un
punado de papeles concentra la mayor parte del volumen. Los clasicos del
panel lider: bancos (GGAL, BBAR, BMA, SUPV), energia (YPF, PAMP, TECO2, VIST,
EDN, TRAN, TGSU2), construccion y real estate (CEPU, METR, LOMA, CRESY, MIRG),
industria (ALUA, TXAR, BOLT) y agro (CRESY tambien, AGRO).

## MERVAL y panel general

- S&P MERVAL: el indice principal, compuesto por las acciones mas negociadas
  del panel, ponderadas por volumen y liquidez. Se recalcula en pesos; cuando
  el dolar sube y las acciones caen, puede parecer "plano" en pesos.
- Panel general: TODAS las acciones listadas en BYMA, incluidas las chicas y
  las de baja liquidez. Operar chicas y de bajo volumen implica spreads mas
  amplios y mayor riesgo de manipulacion del precio.

## Que mirar antes de operar una accion local

- Liquidez: volumen operado promedio. Un papel con volumen bajo es dificil de
  entrar y salir sin mover el precio.
- Concentracion: muchas "acciones argentinas" son holdings o estan ligadas al
  mismo negocio (energia, bancos). Cargar solo bancos NO es diversificar.
- Moneda: las acciones locales cotizan en pesos, pero los resultados de las
  empresas dependen en gran parte del dolar y de la economia real argentina.
- Horarios: rueda de 10:00 a 17:00, liquidacion T+1 desde 2024.

## Consejo practico

Si arrancas con acciones argentinas, empeza por el panel lider (las mas
liquidas), respeta el analisis fundamental (PER, ROE, deuda) y pensa en
carteras de varias acciones de sectores distintos, no en "todo el huevo en
una canasta".`,
  },
  {
    id: "obligaciones-negociables",
    title: "Obligaciones negociables (ON): deuda corporativa argentina",
    tags: [
      "on", "obligacion negociable", "obligaciones negociables", "deuda corporativa",
      "on ypf", "badlar", "cupon on", "renta fija corporativa",
    ],
    content: `## Que es una ON

Una Obligacion Negociable (ON) es un titulo de deuda emitido por una EMPRESA
privada argentina (no el Estado) para financiarse. Funciona como un prestamo:
la empresa te paga un cupon (interes) periodico y al vencimiento te devuelve
el capital. Cotizan en BYMA en el panel de ON.

## Tipos de ON

- Tasa fija: cupon conocido (ej. 8% anual).
- Tasa variable: cupon atado a un indice, comunmente Badlar (tasa de depositos
  a plazo de bancos privados) mas un margen: "Badlar + 2%".
- Ajustables: atadas a CER (inflacion), menos comunes.
- Ley argentina vs ley Nueva York: las de ley local suelen pagar cupones en
  pesos o dolares con liquidacion local; las de ley NY pagan en el exterior.
- Vencimientos: de 1 a 10 anos tipicamente; hay ON cortas y largas.

## Como se leen

El precio tambien se cotiza por valor nominal (VN 100). Ademas del precio, la
TIR (rendimiento anual hasta el vencimiento) es el numero clave: resume
cupones + amortizacion + precio. Cuanto mas alta la TIR, mas riesgo percibe el
mercado en esa emisora.

## Riesgos (clave)

- Riesgo de la empresa: si la emisora entra en default, perdes parte o todo el
  capital. NO estan garantizadas por el Estado.
- Riesgo de liquidez: muchas ON se negocian con poco volumen; la salida puede
  ser lenta o a precios malos.
- Riesgo cambiario: si la ON paga cupones en pesos, la inflacion te come el
  rendimiento real; las en dolares dependen de poder cobrar el dolar.

## Cuando sirven

Para carteras de renta fija con horizonte definido, diversificar emisores
(NUNCA todo en una sola empresa) y, si sos inversor persona humana, recorda
que las ON estan exentas de Ganancias por la venta. Igual, consulta a tu
contador: esto es informacion general, no asesoramiento fiscal.`,
  },
  {
    id: "cauciones",
    title: "Cauciones y money market: prestar pesos con garantia",
    tags: [
      "caucion", "cauciones", "caucion a 1 dia", "money market", "tomador",
      "caucionero", "plazo fijo", "t0", "badlar", "rendimiento pesos",
    ],
    content: `## Que es una cauccion bursatil

La cauccion es un prestamo de pesos garantizado con TITULOS PUBLICOS (el
deudor deja bonos en garantia). Se opera en BYMA y hay dos lados:

- Tomador: pide plata prestada, paga una tasa y deja sus títulos en garantia.
- Caucionero (el que presta): deposita pesos y cobra la tasa, con los títulos
  del tomador como colateral. Si el tomador no paga, la garantia cubre.

## La cauccion a 1 dia (la reina del money market)

La cauccion mas usada es a 1 dia habil: hoy depositas los pesos, manana te
devuelven capital + intereses. Se liquida en T+0 (el mismo dia). Es la forma
mas simple de "hacer trabajar" el efectivo que tenes parado, con riesgo bajo
(la garantia son titulos del Estado). La tasa suele rondar Badlar o un poco
por encima.

## Money market: cauccion vs FCI vs plazo fijo

- Cauccion a 1 dia: liquidez maxima (t0), riesgo bajo, tasa de mercado. La
  operas vos desde la misma cuenta de la ALyC.
- FCI money market: diversificado (muchos tomadores), rescate t0/t1, comision
  de gestion baja. Te ahorra operar una por una.
- Plazo fijo: tasa fija (Badlar ajustada), pero tu plata queda lockeada el
  plazo pactado; si lo cancelas antes, perdes los intereses.

## Cuidados

- La tasa de cauccion puede moverse dia a dia (es de mercado).
- Los intereses de cauciones y plazos fijos tributan Ganancias (retencion
  automatica en la liquidacion). Informacion general: habla con tu contador.`,
  },
  {
    id: "fci",
    title: "Fondos comunes de inversion (FCI): tipos y rescates",
    tags: [
      "fci", "fondo comun de inversion", "fondos", "money market fci",
      "renta fija fci", "renta variable fci", "rescate", "cuotaparte", "cuota parte",
    ],
    content: `## Que es un FCI

Un Fondo Comun de Inversion es un pool de dinero de muchos inversores que un
gestionador (ej. un banco o una ALyC) invierte en una canasta de activos. Vos
compras CUOTAPARTES: el valor de cada cuota se publica todos los dias habiles
(valor de cuota). El FCI ya esta diversificado y lo administra un profesional:
por eso es la puerta de entrada natural para arrancar.

## Tipos principales

- Money market: invierte en cauciones, letras y plazos fijos de muy corto
  plazo. Objetivo: preservar capital y rendir algo mas que la inflacion.
  Rescate: T+0/T+1. Ideal para el "efectivo" que no sabes cuando vas a usar.
- Renta fija: bonos (soberanos y corporativos), letras, ON. Horizonte de 6-24
  meses. Rescate: T+1/T+2. Sensible a subas de tasas (el precio de los bonos
  cae cuando las tasas suben).
- Renta variable: acciones y CEDEARs. Horizonte 3+ anos. Rescate: T+2/T+3.
  La volatilidad es alta: puede caer 20%+ en un mal trimestre, pero a largo
  plazo es la clase de activo con mejor rendimiento esperado.

## Rescates y comisiones

- El rescate es la venta de cuotapartes: el dinero vuelve a tu cuenta en los
  dias que diga el reglamento del fondo (depende del tipo, arriba).
- No suele haber comision de entrada/salida, pero el fondo cobra comision de
  gestion anual (ej. 1-3% anual, mas alta en renta variable) ya descontada del
  valor de cuota.

## Cuidados

- Leer el "perfil de riesgo" del fondo: si dice renta variable, va a fluctuar.
- Un FCI money market NO rinde "la tasa loca": si alguien te promete eso, es
  un alerta. Los rendimientos pasados no garantizan los futuros.`,
  },
  {
    id: "analisis-tecnico",
    title: "Analisis tecnico: soportes, resistencias, RSI, MACD y medias",
    tags: [
      "analisis tecnico", "soporte", "resistencia", "rsi", "macd", "medias moviles",
      "ema", "golden cross", "death cross", "indicadores", "graficos", "trading tecnico",
    ],
    content: `## Que es el analisis tecnico

El analisis tecnico estudia el PRECIO y el VOLUMEN historico para anticipar
movimientos. No mira los balances: asume que toda la informacion ya esta
descontada en el precio. Es una herramienta de TIMING, no de valoracion: sirve
para decidir cuando entrar/salir, no para saber si una accion esta cara o
barata.

## Conceptos base

- Soporte: zona de precio donde historicamente el papel rebota (los compradores
  aparecen). Resistencia: zona donde la suba se frena (los vendedores ganan).
- Si una resistencia se rompe con volumen, puede convertirse en soporte (y
  viceversa). Cuantas mas veces se probo una zona, mas relevante es.
- Volumen: confirma los movimientos. Una ruptura sin volumen suele ser falsa.

## Indicadores clasicos

- RSI (14 periodos): mide la velocidad de los movimientos. Sobrecompra > 70,
  sobreventa < 30, 50 = neutral. Extremos extremos en mercados argentinos son
  comunes: el RSI puede quedarse "pegado" en sobrecompra durante subas fuertes.
- MACD (12, 26, 9): diferencia entre dos medias exponenciales; el cruce de la
  linea de senal es la senal clasica de compra/venta. Ojo: en rangos laterales
  genera muchas senales falsas.
- Medias moviles: la EMA 50 y la EMA 200 son las mas seguidas. Golden cross
  (la 50 cruza sobre la 200) = sesgo alcista; death cross = bajista. En
  periodos largos, precio sobre la EMA 200 = tendencia alcista.

## Cuando usarlo (y cuando no)

- Uso: definir puntos de entrada/salida, stop loss, y en activos liquidos con
  mucha historia (CEDEARs grandes, bonos AL30, acciones del panel lider).
- No uso: activos iliquidos o con poca historia (el analisis se distorsiona),
  ni como unica fuente de verdad. El tecnico da probabilidades, no certezas:
  ninguna senal garantiza el futuro.`,
  },
  {
    id: "analisis-fundamental",
    title: "Analisis fundamental: EPS, PER, EV/EBITDA y dividendos",
    tags: [
      "analisis fundamental", "eps", "per", "ev/ebitda", "dividendos", "dividend yield",
      "roe", "peg", "balance", "fundamentals", "valoracion", "resultados",
    ],
    content: `## Que es el analisis fundamental

Busca el valor INTRINSECO de una empresa mirando su negocio: ingresos, costos,
deuda, ganancias, flujo de caja y perspectivas. La idea: si el precio de
mercado esta por debajo del valor razonable, es oportunidad; si esta muy por
arriba, es caro. Para CEDEARs se aplica al SUBYACENTE (la accion de EEUU):
un CEDEAR vale lo que valga la accion que representa.

## Metricas clave

- EPS (ganancia por accion): ganancia neta / cantidad de acciones. Es la base
  de casi todo lo demas.
- PER (precio / EPS): cuantos anos de ganancia pagas por la accion. Un PER de
  20 significa que pagas 20x su ganancia anual. Compara siempre contra el
  sector y la historia: un PER bajo puede ser barato O una trampa de valor si
  las ganancias caen.
- EV/EBITDA: relaciona el valor de la empresa (capital + deuda - caja) con su
  resultado operativo. Mejor que el PER para comparar empresas con distinta
  deuda.
- Dividend yield: dividendos anuales / precio. Para quienes buscan ingresos.
  Ojo: en EEUU los dividendos de CEDEARs llegan netos de retencion.
- ROE (retorno sobre patrimonio): mide que tan bien la empresa genera ganancias
  con el capital de los accionistas. ROE alto y estable suele indicar ventaja
  competitiva.
- PEG: PER / crecimiento de ganancias. Menor a 1 = barato para su crecimiento.

## Deuda y flujo

- Deuda neta / EBITDA: que tan apalancada esta. Mas de 3x es zona de alerta
  en la mayoria de los sectores.
- Free cash flow: la plata REAL que genera el negocio, despues de inversiones.
  El FCF creciente es la senal mas limpia de salud financiera.

## Fuentes para subyacentes de EEUU

Reportes trimestrales (10-Q) y anuales (10-K) en la SEC, y las conferencias de
resultados de cada empresa. Para la macro argentina y reportes de empresas
locales: la CNV, BYMA y los informes de las ALyCs.`,
  },
  {
    id: "dolar",
    title: "Dolar: oficial, blue, MEP, CCL, tarjeta y cual usar para valorizar",
    tags: [
      "dolar", "dolar oficial", "dolar blue", "dolar mep", "dolar ccl", "contado con liqui",
      "dolar tarjeta", "dolar mayorista", "dolar cripto", "mep", "ccl", "blue",
      "valorizar cartera", "dolarizacion",
    ],
    content: `## Las cotizaciones y que representan

- Oficial: el que publica el BCRA, usado para comercio exterior y transacciones
  bancarias. Hoy es el mas barato de todos.
- Mayorista: el del mercado cambiario interbancario (el que usan las empresas
  para importar/exportar). Muy cercano al oficial.
- Blue: el mercado paralelo informal. Ilegal, sin garantias y con riesgo de
  billetes truchos. Sirve como termometro de expectativas, no como vehiculo.
- MEP (dolar bolsa): se obtiene comprando un bono en pesos (ej. AL30) y
  vendiendo su version en dolares (AL30D) en BYMA. Es LEGAL y es la forma
  estandar de comprar dolares con pesos para inversores. Requiere parking de
  1 dia habil.
- CCL (contado con liquidacion): se obtiene vendiendo en el exterior lo que
  compraste local (ej. acciones con doble cotizacion, o bonos con version en
  dolares). Es el dolar "de salida": el que obtenes si liquidas tus tenencias
  en el exterior.
- Tarjeta: oficial + impuesto PAIS + percepciones de Ganancias/Bienes
  Personales. Se usa para consumos y gastos en el exterior.
- Cripto: el de los exchanges (USDT/USDC), suele estar cerca del blue o CCL.

## Cual usar para valorizar tu cartera

- Cartera en CEDEARs y bonos dollar-linked: se valora al CCL, porque es el
  dolar que efectivamente obtenes al vender esos activos.
- Decision de convertir pesos: el MEP es la referencia real para comprar
  dolares legales con pesos.
- Para comparar rendimientos en dolares de tu cartera en pesos: converti a MEP.
- Nunca mezcles cotizaciones: si vas a comparar, hacelo siempre contra el
  MISMO dolar (si comparas contra el oficial, los numeros no reflejan lo que
  realmente podes obtener).

## Cuidado con el spread

La diferencia entre compra y venta de cada dolar tambien es un costo. En el
MEP/CCL el spread puede ampliarse en dias de alta volatilidad.`,
  },
  {
    id: "riesgo",
    title: "Riesgo: diversificacion, concentracion, pais, cambiario e inflacion",
    tags: [
      "riesgo", "diversificacion", "concentracion", "riesgo pais", "riesgo cambiario",
      "inflacion", "uva", "cer", "perfil de riesgo", "volatilidad", "riesgo argentina",
    ],
    content: `## Los riesgos que tenes que conocer

- Riesgo de mercado: los precios caen. Es el mas basico: ningun activo sube
  siempre. La volatilidad no es perdedora de plata por si sola: perderla es
  vender en el peor momento.
- Riesgo de concentracion: tener mucho peso en un solo activo o sector. Si ese
  papel se derrumba, tu cartera se derrumba con el. Diversificar es el unico
  "almuerzo gratis" de las finanzas: repartir entre activos, sectores y monedas
  que no se muevan juntos reduce el riesgo sin sacrificar (tanto) rendimiento.
- Riesgo pais: el riesgo de que Argentina incumpla, devalue o cambie las reglas
  de juego. Afecta a TODO lo que cotiza localmente, aunque sea un CEDEAR de
  Microsoft: un salto del riesgo pais hace caer toda la bolsa local.
- Riesgo cambiario: si tenes activos en pesos, la inflacion te los licua; si
  tenes activos en dolares, una apreciacion del peso te los licua en pesos.
  Tener ambas monedas es la cobertura natural.
- Riesgo de inflacion: el que menos se ve. La inflacion argentina es alta:
  un activo que "rinde" 30% anual pierde contra una inflacion de 50%. Por eso
  existen los ajustables: instrumentos atados al CER/UVA (como los bonos
  ajustables o los creditos UVA) que te defienden de la inflacion pero no te
  dan rendimiento real alto.
- Riesgo de liquidez: no poder vender rapido a un precio razonable (activos
  chicos, ON de bajo volumen, y tambien los dias de feriado extranjero).
- Riesgo de fraudes: rendimientos "garantizados" del 10% mensual NO existen.
  Cualquier persona que te prometa rentabilidad fija altisima es una estafa
  (esquema ponzi).

## Reglas practicas

- Nunca inviertas plata que puedas necesitar en menos de 1-2 anos.
- Tu horizonte define tu riesgo: corto plazo = renta fija, largo plazo =
  renta variable.
- No te enamores de un papel: el riesgo no se mide por "que buena empresa es",
  sino por cuanto podes llegar a perder si las cosas salen mal.`,
  },
  {
    id: "renta-fija-vs-variable",
    title: "Renta fija vs renta variable: cuando usar cada una",
    tags: [
      "renta fija", "renta variable", "bonos", "acciones", "cuando invertir",
      "perfil conservador", "perfil agresivo", "horizonte", "asset allocation",
      "asignacion de activos",
    ],
    content: `## La diferencia de fondo

- Renta fija (bonos, ON, cauciones, letras, plazos fijos, FCI de RF): el
  emisor te promete un flujo (cupones/intereses) y la devolucion del capital.
  Mas predecible, menos volatil, rendimiento esperado menor.
- Renta variable (acciones, CEDEARs, FCI de RV): sos socio de la empresa. No
  te deben nada: ganas si el negocio crece. Alta volatilidad, rendimiento
  esperado mayor a largo plazo.

La regla de oro: a MAYOR horizonte, mayor lugar para renta variable. La
renta variable en plazos de 10 anos ha ganado a la renta fija en casi todos
los mercados del mundo; en plazos de 1-2 anos, es ruleta rusa.

## Cuando usar renta fija

- Dinero que vas a necesitar pronto (1-2 anos): reservas, gastos previstos.
- Para "estacionar" pesos rindiendo algo (caucion, money market, letras).
- Si no soportas ver tu cartera caer 20%: mejor dormir tranquilo que rendir
  un punto mas.

## Cuando usar renta variable

- Horizonte de 3-5 anos o mas (jubilacion, objetivos lejanos).
- Cuando queres ganarle a la inflacion de verdad: la renta fija en pesos
  apenas la empata (o la pierde).
- Para dolarizar: los CEDEARs y bonos en dolares son la via legal y liquida.

## El mix (asignacion de activos)

No es "todo uno u todo otro": se combina. Una regla clasica de referencia
(no una ley): porcentaje en renta variable cercano a "100 - tu edad". A los
30 anos, ~70% RV / 30% RF; a los 60, ~40/60. Y se REBALANCEA (ver el
documento de estrategia): si la RV sube mucho, se vende un poco para volver
al mix objetivo. Ajusta el mix a tu tolerancia real, no a la de tu vecino.`,
  },
  {
    id: "terminologia-mesa",
    title: "Terminologia de mesa: bid, ask, spread, volumen, t0/t1, lote",
    tags: [
      "bid", "ask", "spread", "volumen", "lote minimo", "t0", "t1", "t+1",
      "pantalla", "ultimo precio", "cierre anterior", "terminologia", "como leer",
      "book", "puntas",
    ],
    content: `## Como leer la pantalla de cotizacion

- Bid (puntam compradora): el precio maximo que alguien esta dispuesto a pagar
  por el papel AHORA.
- Ask (puntam vendedora): el precio minimo al que alguien esta dispuesto a
  vender AHORA. Si queres comprar al momento, pagas el ask; si queres vender,
  recibis el bid.
- Spread: la diferencia entre bid y ask. ES TU COSTO de transaccion: en
  papeles liquidos (AL30, GGAL, NVDA) es chico (centavos); en papeles chicos
  puede ser enorme. Un papel con spread del 2% te come 2% solo por entrar y
  salir.
- Ultimo: el precio al que se concreto la ultima operacion. No es el precio al
  que te van a ejecutar: eso depende del libro de puntas.
- Volumen y efectivo: cuantas acciones/titulos se operaron y por cuanto
  dinero. Volumen alto = liquidez = spreads sanos.
- Maximo/minimo del dia: rango recorrido por el precio en la rueda.

## Plazos de liquidacion

- T0: la operacion se liquida el mismo dia (cauciones, y contado con
  liquidacion inmediata cuando el vendedor es titular y no hay que esperar).
- T+1: liquidacion a 24 horas habiles (desde 2024, el estandar en BYMA para
  acciones, bonos y CEDEARs): si compras el lunes, el titulo y el dinero se
  acreditan el martes habil.
- Parking: ademas de la liquidacion, el tiempo minimo que tenes que esperar
  para poder vender un titulo recien comprado en ciertos casos (CEDEARs
  comprados con pesos: 3 dias habiles).

## Lotes y minimos

- Acciones y CEDEARs: se operan desde 1 unidad.
- Bonos y ON: se operan por valor nominal (VN); el precio es por VN 100 (ver
  el documento de bonos). La unidad minima de un bono es 1 titulo (VN US$100
  en los soberanos; VN $1.000 en la mayoria de las ON locales).
- Si un activo cotiza con poco volumen y una puntam desierta, la orden puede
  quedar sin ejecutar: la liquidez tambien se mide en que tan rapidamente
  CONSEGUIS contraparte.`,
  },
  {
    id: "impuestos",
    title: "Impuestos: Ganancias, Bienes Personales e informacion general",
    tags: [
      "impuestos", "ganancias", "bienes personales", "impuesto a las ganancias",
      "retencion", "cedear impuestos", "bonos impuestos", "acciones impuestos",
      "fiscal", "declarar",
    ],
    content: `## Impuesto a las Ganancias (personas humanas, Argentina)

- Venta de acciones y CEDEARs: el resultado (venta - costo de compra ajustado
  por inflacion) tributa el 15%. La diferencia ajustada por inflacion es
  clave: el costo se actualiza, no se tributa sobre la ganancia bruta.
- Venta de titulos publicos (bonos del Estado, como AL30/GD30) y ON: EXENTA
  de Ganancias para personas humanas. Esta exencion es un diferencial
  importante de la renta fija argentina.
- Dividendos de CEDEARs y acciones: tributan Ganancias (en el caso de CEDEARs,
  la ALyC retiene en la liquidacion y te llega el neto).
- Intereses de cauciones, plazos fijos y letras: gravados, con retencion
  automatica en la liquidacion.
- Quebrantos: desde 2023 solo se compensan contra ganancias del MISMO ano y de
  la misma especie (no arrastran a anos futuros).
- Los montos y alicuotas cambian con cada reforma: los 15% y las exenciones
  corresponden a la normativa vigente a 2025.

## Bienes Personales

- Grava el patrimonio al 31/12 de cada ano (titulos en el pais y en el
  exterior, incluyendo CEDEARs). El minimo no imponible es alto y las
  alicuotas bajaron progresivamente (del 1,5% al rango de 0,2-0,3% hacia
  2025-2026).
- Las ALyCs informan tus tenencias a la AFIP: lo importante es DECLARAR, no
  "esconder".

## Regla de oro

Esto es informacion GENERAL y educativa, NO asesoramiento fiscal: los detalles
dependen de tu situacion (monotributo, regimen general, residencia fiscal).
Para montos significativos, consulta a un contador. La evasion fiscal es un
delito y no te la va a resolver nadie con un "tip".`,
  },
  {
    id: "estrategia",
    title: "Estrategia: largo plazo vs trading, DCA y rebalanceo",
    tags: [
      "estrategia", "largo plazo", "trading", "dca", "rebalanceo", "comprar y mantener",
      "buy and hold", "invertir periodicamente", "promediar", "plan de inversion",
    ],
    content: `## Largo plazo (comprar y mantener)

La estrategia con mejor relacion resultado/esfuerzo: elegis activos de
calidad (o un indice/FCI amplio), compras y mantenete anos. El motor es el
interes compuesto: las ganancias se reinvierten y generan mas ganancias.
Ventajas: pagas menos comisiones, menos impuestos de corto plazo y no tenes
que acertarle al timing. El desafio: no vender por panico en las caidas
(las caidas del 20-30% son normales cada tanto, y en Argentina, parte del
paisaje).

## Trading (corto plazo)

Operar frecuente buscando captar movimientos de precio. Exige tiempo,
disciplina y un sistema con reglas escritas (entrada, salida, stop loss,
tamano de posicion). Realidad estadistica: la mayoria de los operadores
minoristas pierde contra las comisiones y sus propias emociones. Si lo haces,
hacelo con una parte chica del capital y con plata que puedas perder sin que
cambie tu vida.

## DCA (Dollar Cost Averaging)

Invertir un monto FIJO todos los meses (o semanas) en el mismo activo, sin
importar el precio. Cuando el precio baja, la misma plata compra mas
cuotapartes/acciones; cuando sube, compra menos. Elimina la pregunta
"compro hoy o espero?" y el sesgo emocional. Es la receta mas probada para
quienes cobran un sueldo y quieren construir patrimonio: pagate primero,
inverti despues.

## Rebalanceo

Tu mix objetivo (ej. 70% renta variable / 30% renta fija) se desvía solo:
si la bolsa sube mucho, la RV pasa a pesar 80%. Rebalancear = vender un poco
de lo que subio y comprar lo que quedo atras, 1-2 veces por ano, para volver
al mix. Suena contraintuitivo ("vender lo que gana?") pero te obliga a
comprar barato y vender caro de forma sistematica.`,
  },
  {
    id: "mercado-argentino",
    title: "El mercado argentino: horarios de rueda, feriados y liquidacion",
    tags: [
      "horarios", "rueda", "feriados", "liquidacion", "24 horas", "48 horas",
      "byma horarios", "cuando opera", "subasta de apertura", "subasta de cierre",
      "mercado argentino",
    ],
    content: `## Horarios de la rueda (BYMA)

- Rueda continua: de 10:00 a 17:00 (hora argentina).
- Subasta de apertura: 9:55-10:00 (ahi se forma el precio de apertura).
- Subasta de cierre: 16:55-17:00 (forma el precio de cierre).
- La rueda no opera los fines de semana ni los feriados nacionales argentinos
  (y algunos feriados especiales/bancarios que la CNV declara inhábiles).
- IMPORTANTE para CEDEARs: cuando es feriado en EEUU pero no en Argentina
  (ej. 4 de julio, Thanksgiving), la rueda local ABRE, pero el subyacente no
  cotiza: el CEDEAR opera con pocas puntas y spreads amplios. Mejor evitar
  operar CEDEARs esos dias.

## Liquidacion (cuando te acreditan)

- Acciones, bonos y CEDEARs en BYMA: liquidacion a 24 horas habiles (T+1)
  desde 2024 (antes era 48 horas, T+2). Compras el lunes, el titulo se
  acredita el martes habil.
- Cauciones: T0 (mismo dia).
- FCI: segun el fondo (money market T0/T1, renta fija T1/T2, renta variable
  T2/T3).
- Las operaciones se liquidan en dias HABILES: una operacion del viernes se
  acredita el lunes, y si el lunes es feriado, el martes.

## Particularidades argentinas

- El 24 y 31 de diciembre y algunos dias previos a feriados largos, suele
  haber rueda reducida (hasta las 13:00) cuando lo dispone la CNV/BYMA.
- Aviso util: en semanas de feriados largos o fechas de vencimiento de
  futuros/opciones, los spreads y la volatilidad suben: operar en esos
  momentos es mas caro.`,
  },
  {
    id: "como-empezar",
    title: "Como empezar a invertir en Argentina: pasos y errores comunes",
    tags: [
      "empezar", "primeros pasos", "abrir cuenta", "alyc", "cnv", "comitente",
      "como invertir", "principiante", "errores", "estafas", "rendimiento garantizado",
      "arrancar",
    ],
    content: `## Pasos para arrancar

1. Elegi una ALyC (agente de liquidacion y compensacion) regulada por la CNV:
   bancos (Santander, BBVA, Galicia) o brokers especializados (IOL invertironline,
   PPI, Balanz, Cocos, Bull Market, etc.). Verifica que este inscripta en la CNV:
   es tu principal proteccion.
2. Abri la cuenta comitente: pedido de datos, KYC y declaracion jurada de
   perfil de riesgo. En la mayoria se hace 100% online y sin costo.
3. Transferi fondos: desde tu banco hacia la cuenta de la ALyC (CVU).
4. Defini tu perfil: horizonte, tolerancia a la volatilidad y objetivo. Eso
   define tu mix de renta fija/variable (ver el documento de estrategia).
5. Empeza simple: FCI money market mientras aprendes, despues CEDEARs y bonos
   liquidos (AL30), y recien ahi acciones individuales u operaciones mas
   complejas (opciones, futuros, cauciones como tomador).

## Errores comunes (y como evitarlos)

- Invertir plata que necesitas en el corto plazo: el mercado no te debe
  devolver nada en 3 meses.
- Perseguir "la mejor accion": nadie sabe cual va a subir mas; el que te diga
  que lo sabe, te esta vendiendo algo.
- Pagar comisiones sin comparar: en operaciones chicas, una comision del 1,5%
  vs 0,5% es muchisimo dinero a lo largo del tiempo.
- Comprar sin entender el instrumento: si no sabes explicar el riesgo de lo
  que compraste, todavia no lo entendiste. Preguntale a tu broker o al
  asistente de la app hasta que te cierre.
- Caer en estafas: rendimientos "garantizados" de 5-10% mensual, "trading
  bots" que te prometen ganancias, o personas que te piden depositar a una
  cuenta "para invertir por vos". TODO eso es estafa. Nadie regala rentabilidad.
- No declarar: las tenencias se informan a la AFIP. Declarar no es opcional.`,
  },
];

// ============================================================
// Singleton con validacion fail-safe: si el corpus estuviera
// vacio o mal formado, getCorpus() lanza y searchKnowledge()
// lo traduce a un error limpio para el usuario.
// ============================================================

let instance: readonly KnowledgeDoc[] | null = null;

export function getCorpus(): readonly KnowledgeDoc[] {
  if (instance) return instance;

  const ids = new Set<string>();
  for (const doc of DOCS) {
    if (!doc.id || !doc.title || !doc.content || doc.content.length < 100) {
      throw new Error(`Documento del corpus mal formado: ${doc.id ?? "sin id"}`);
    }
    if (ids.has(doc.id)) {
      throw new Error(`Documento duplicado en el corpus: ${doc.id}`);
    }
    ids.add(doc.id);
  }
  if (DOCS.length < 5) {
    throw new Error("El corpus de conocimiento esta vacio o incompleto");
  }

  instance = Object.freeze(DOCS.map((d) => Object.freeze({ ...d, tags: Object.freeze([...d.tags]) }))) as unknown as readonly KnowledgeDoc[];
  return instance;
}
