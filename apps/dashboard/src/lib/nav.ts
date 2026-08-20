/**
 * Determina si una ruta de navegación debe mostrarse como activa según la ruta actual.
 * Maneja rutas anidadas (ej. /quotes/:symbol, /analysis/:symbol, /operar/:symbol).
 */
export function isRouteActive(targetPath: string, currentPathname: string): boolean {
  if (targetPath === "/inicio") {
    return currentPathname === "/" || currentPathname === "/inicio";
  }

  if (targetPath === "/portfolio") {
    return (
      currentPathname === "/portfolio" ||
      currentPathname.startsWith("/portfolio/") ||
      currentPathname === "/dashboard" ||
      currentPathname.startsWith("/dashboard/")
    );
  }

  if (targetPath === "/operations") {
    return (
      currentPathname === "/operations" ||
      currentPathname.startsWith("/operations/")
    );
  }

  if (targetPath === "/quotes") {
    return (
      currentPathname === "/quotes" ||
      currentPathname.startsWith("/quotes/") ||
      currentPathname.startsWith("/analysis/") ||
      currentPathname === "/operar" ||
      currentPathname.startsWith("/operar/")
    );
  }

  if (targetPath === "/explorar") {
    return (
      currentPathname === "/explorar" ||
      currentPathname.startsWith("/explorar/") ||
      currentPathname === "/screener" ||
      currentPathname.startsWith("/screener/")
    );
  }

  if (targetPath === "/news") {
    return (
      currentPathname === "/news" ||
      currentPathname.startsWith("/news/")
    );
  }

  if (targetPath === "/reports") {
    return (
      currentPathname === "/reports" ||
      currentPathname.startsWith("/reports/")
    );
  }

  return currentPathname === targetPath || currentPathname.startsWith(`${targetPath}/`);
}
