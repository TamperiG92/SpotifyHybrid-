import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración de Capacitor (app nativa Android/iOS).
 * - webDir: carpeta que genera `ng build`.
 * - androidScheme 'https': la WebView de Android sirve la app como
 *   https://localhost (contexto seguro; cumple la regla "solo tráfico HTTPS").
 */
const config: CapacitorConfig = {
  appId: 'dev.spotifyhybrid.app',
  appName: 'SpotifyHybrid',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
};

export default config;
