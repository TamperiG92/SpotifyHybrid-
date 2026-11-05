# SpotifyHybrid

App híbrida (Ionic 9 + Angular 22 + Capacitor 8) con login, registro y reproductor.

## Requisitos

- **Node.js 22.22.3 o superior** (o 24.15+). Con versiones anteriores, Angular 22 no instala ni compila.
  Comprueba tu versión con `node -v`. Si usas nvm: `nvm install` (lee `.nvmrc`).
- npm (viene con Node).

## Ejecutar

```bash
npm ci        # instala exactamente las versiones de package-lock.json
npm start     # http://localhost:4200 → abre /login
```

Credenciales de prueba (backend simulado, no hay servidor real):

| Usuario | Contraseña |
|---|---|
| `demo` o `demo@spotifyhybrid.dev` | `Demo1234!` |

También puedes crear una cuenta en **SIGN UP** (dura hasta que recargues la página).
Tras iniciar sesión la app pasa a `/home` (reproductor).

### Probar en el celular (misma red Wi-Fi)

```bash
npx ng serve --host 0.0.0.0
```

Y abre `http://<IP-de-tu-PC>:4200` en el celular (`ipconfig` en Windows para ver la IP).

### Build de producción

```bash
npm run build   # genera la carpeta www/
```

### App nativa con Capacitor (opcional)

Requiere Android Studio (Android) o Xcode en macOS (iOS).

```bash
npm run build
npx cap add android      # solo la primera vez
npx cap sync
npx cap open android
```

## Notas

- `node_modules/`, `www/` y `.angular/` no se suben al repositorio (están en `.gitignore`); se regeneran con los comandos anteriores.
- Si `npm start` dice `Could not find the '@angular/build:dev-server' builder`, la instalación quedó incompleta: borra `node_modules` y ejecuta `npm ci` de nuevo.
- Requisitos de la Semana 11 y detalles de seguridad: ver [SECURITY.md](SECURITY.md).
