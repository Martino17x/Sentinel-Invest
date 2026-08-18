import { Link } from "react-router-dom";
import { TrendingUp } from "lucide-react";

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center gap-2">
        <Link to="/login" className="flex items-center gap-2 font-semibold">
          <TrendingUp className="h-5 w-5 text-primary" />
          <span>Sentinel</span>
        </Link>
      </div>

      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Política de Privacidad</h1>
      <p className="mb-8 text-sm text-muted-foreground">Última actualización: 13 de agosto de 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">1. Introducción</h2>
          <p>
            Esta Política de Privacidad explica cómo Sentinel ("la aplicación", "nosotros") recopila,
            utiliza y protege la información personal de los usuarios. Al utilizar Sentinel, aceptás
            las prácticas descriptas en esta política.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">2. Información que recopilamos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Datos de cuenta:</strong> nombre, dirección de email y
              contraseña cifrada (o tu perfil de Google si ingresás con esa opción).
            </li>
            <li>
              <strong className="text-foreground">Datos de inversión:</strong> las credenciales de tu
              cuenta de InvertirOnline (usuario y contraseña), que se almacenan <strong>cifradas</strong> y
              se utilizan exclusivamente para consultar tu cartera, saldos, operaciones y cotizaciones
              en tu nombre.
            </li>
            <li>
              <strong className="text-foreground">Datos de uso:</strong> información sobre cómo
              interactuás con la aplicación (páginas visitadas, funciones utilizadas), para mejorar el
              servicio.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">3. Cómo usamos tu información</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Para autenticarte y mantener tu sesión segura.</li>
            <li>Para consultar y mostrar tu cartera de inversiones, saldos y operaciones.</li>
            <li>Para generar reportes y análisis de rendimiento de tu cartera.</li>
            <li>Para mostrar cotizaciones del mercado en tiempo real.</li>
            <li>Para mejorar la seguridad y el funcionamiento de la aplicación.</li>
          </ul>
          <p className="mt-2">
            <strong className="text-foreground">Importante:</strong> Sentinel{" "}
            <strong>no ejecuta operaciones de compra o venta</strong> en tu cuenta de InvertirOnline.
            La aplicación funciona únicamente en modo lectura. Nunca vendemos ni compartimos tus datos
            con terceros con fines comerciales.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">4. Seguridad de tus datos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Tus contraseñas se almacenan con <strong>hashing bcrypt</strong> (nunca en texto plano).
            </li>
            <li>
              Las credenciales de InvertirOnline se almacenan <strong>cifradas con AES-256</strong>{" "}
              usando una clave maestra que nunca se expone en el código ni en el navegador.
            </li>
            <li>
              Las sesiones usan tokens con expiración corta y cookies <strong>HttpOnly</strong> que
              protegen contra ataques de robo de sesión.
            </li>
            <li>
              Toda la comunicación se realiza sobre <strong>HTTPS</strong> en producción.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">5. Compartir información</h2>
          <p>
            No vendemos, alquilamos ni compartimos tu información personal con terceros, excepto en los
            siguientes casos: (a) con tu consentimiento explícito; (b) para cumplir con obligaciones
            legales; (c) con proveedores de infraestructura (hosting, base de datos) que están obligados
            a mantener la confidencialidad de los datos.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">6. Retención de datos</h2>
          <p>
            Conservamos tus datos mientras tu cuenta esté activa. Podés solicitar la eliminación de tu
            cuenta y de todos tus datos en cualquier momento contactándonos a través de los canales de
            la aplicación.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">7. Tus derechos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Acceder a los datos personales que tenemos sobre vos.</li>
            <li>Solicitar la corrección de datos inexactos.</li>
            <li>Solicitar la eliminación de tus datos y cuenta.</li>
            <li>Oponerte al tratamiento de tus datos.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">8. Cambios a esta política</h2>
          <p>
            Podemos actualizar esta política periódicamente. Los cambios importantes se te notificarán
            a través de la aplicación o por email. El uso continuado de Sentinel después de los cambios
            implica su aceptación.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">9. Contacto</h2>
          <p>
            Si tenés preguntas sobre esta política de privacidad, contactanos a través del email
            registrado en tu cuenta o por los canales de contacto de la aplicación.
          </p>
        </section>
      </div>
    </div>
  );
}
