/**
 * ENTORNO DE PRODUCCIÓN
 * ---------------------------------------------------------------------------
 * - El proyecto aún NO tiene backend real, así que el backend simulado sigue
 *   ACTIVO también en el build de producción (`ng build`, `ionic build`,
 *   Capacitor). Sin esto, cualquier login fallaba y nunca se llegaba a /home.
 *   Cuando exista una API real: `useMockBackend: false` y `demoHint: null`.
 * - La API se sirve bajo el mismo dominio (reverse proxy).
 * - Nunca incluir secretos: este archivo también es público.
 */
export const environment = {
  production: true,
  apiUrl: '/api',
  useMockBackend: true,
  demoHint: 'Demo: demo / Demo1234!' as string | null,
};
