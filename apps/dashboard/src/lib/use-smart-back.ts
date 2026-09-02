import { useLocation, useNavigate } from "react-router-dom";

/**
 * "Volver inteligente": navega a la página ANTERIOR de la SPA si existe,
 * y si no (carga directa a una URL profunda) va al fallback.
 *
 * Señal confiable: `location.key === "default"` solo ocurre en la PRIMERA
 * entrada de la sesión (carga directa). Tras cualquier navegación interna
 * React Router genera una key única — ahí history.back() es seguro.
 * (window.history.length no sirve: cuenta páginas externas del tab.)
 */
export function useSmartBack(fallback: string) {
  const location = useLocation();
  const navigate = useNavigate();

  return {
    canGoBack: location.key !== "default",
    goBack: () => {
      if (location.key !== "default") {
        navigate(-1);
      } else {
        navigate(fallback, { replace: true });
      }
    },
  };
}
