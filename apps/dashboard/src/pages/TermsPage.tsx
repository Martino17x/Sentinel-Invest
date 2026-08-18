import { Link } from "react-router-dom";
import { TrendingUp } from "lucide-react";

export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center gap-2">
        <Link to="/login" className="flex items-center gap-2 font-semibold">
          <TrendingUp className="h-5 w-5 text-primary" />
          <span>Sentinel</span>
        </Link>
      </div>

      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Términos y Condiciones</h1>
      <p className="mb-8 text-sm text-muted-foreground">Última actualización: 13 de agosto de 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">1. Aceptación de los términos</h2>
          <p>
            Al acceder y utilizar Sentinel ("la aplicación") aceptás estos Términos y Condiciones en su
            totalidad. Si no estás de acuerdo con alguna parte de estos términos, no debés utilizar la
            aplicación.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">2. Naturaleza del servicio</h2>
          <p>
            Sentinel es una aplicación de <strong>monitoreo y visualización de inversiones</strong> que
            te permite consultar tu cartera, saldos, operaciones históricas y cotizaciones de mercado de
            tu cuenta en InvertirOnline.
          </p>
          <p className="mt-2">
            <strong>Limitación fundamental:</strong> Sentinel{" "}
            <strong>no constituye asesoramiento financiero, de inversión o impositivo</strong>. La
            información mostrada es de carácter informativo. Las decisiones de inversión son
            exclusivamente tu responsabilidad.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">3. No ejecutamos operaciones</h2>
          <p>
            Sentinel funciona en <strong>modo lectura</strong> sobre tu cuenta de InvertirOnline. La
            aplicación <strong>no ejecuta órdenes de compra, venta, suscripción o rescate</strong> de
            activos. Cualquier operación debe realizarse directamente a través de los canales oficiales
            de tu bróker.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">4. Responsabilidad del usuario</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Ser el titular legítimo de las cuentas que conectás a la aplicación.</li>
            <li>Mantener la confidencialidad de tu contraseña de Sentinel.</li>
            <li>Usar la aplicación únicamente para fines legítimos y personales.</li>
            <li>
              No intentar acceder a cuentas de otros usuarios ni vulnerar la seguridad del sistema.
            </li>
            <li>
              No compartir tus credenciales de InvertirOnline con terceros (la aplicación las cifra,
              pero la responsabilidad del uso de tu cuenta es tuya).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">5. Precisión de la información</h2>
          <p>
            Si bien realizamos esfuerzos razonables para que los datos mostrados (saldos, cotizaciones,
            operaciones) sean precisos, la información proviene de servicios de terceros y puede tener
            demoras o errores. Sentinel <strong>no garantiza</strong> la exactitud, integridad u
            oportunidad de la información mostrada.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">6. Limitación de responsabilidad</h2>
          <p>
            Sentinel se proporciona "tal cual", sin garantías de ningún tipo. En ningún caso Sentinel,
            sus desarrolladores o colaboradores serán responsables por daños directos, indirectos,
            incidentales o consecuentes derivados del uso o la imposibilidad de uso de la aplicación,
            incluyendo pérdidas financieras, pérdida de datos o interrupción del servicio.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">7. Servicios de terceros</h2>
          <p>
            La aplicación se integra con servicios de terceros, incluyendo InvertirOnline y Google
            (para autenticación). Estos servicios tienen sus propios términos y políticas de privacidad.
            Sentinel no controla ni es responsable por el funcionamiento, disponibilidad o cambios en
            dichos servicios de terceros.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">8. Propiedad intelectual</h2>
          <p>
            El código, diseño, marcas y contenido de Sentinel son propiedad de sus desarrolladores. No
            se otorga ninguna licencia de uso sobre ellos, salvo la necesaria para operar la aplicación.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">9. Suspensión y cancelación</h2>
          <p>
            Podemos suspender o cancelar el acceso a la aplicación si detectamos uso indebido, violación
            de estos términos o riesgos de seguridad. El usuario puede eliminar su cuenta y sus datos en
            cualquier momento.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">10. Ley aplicable</h2>
          <p>
            Estos términos se rigen por las leyes de la República Argentina. Cualquier controversia se
            someterá a la jurisdicción de los tribunales ordinarios de la Ciudad Autónoma de Buenos
            Aires.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">11. Contacto</h2>
          <p>
            Para consultas sobre estos términos, contactanos a través de los canales de la aplicación.
          </p>
        </section>
      </div>
    </div>
  );
}
