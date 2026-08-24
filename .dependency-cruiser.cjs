/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-domain-to-upper-layers',
      severity: 'error',
      comment: 'dominio (packages/domain, apps/api/src/dominio) no puede importar de aplicacion/interfaces/infraestructura — DIP',
      from: { path: 'domain|dominio' },
      to: { path: 'aplicacion|interfaces|infraestructura' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: false,
  },
};
