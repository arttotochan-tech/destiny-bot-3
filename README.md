# Destiny Semanal Bot

Publica automáticamente en Discord un resumen semanal de Destiny 2 en español.

## Información incluida

- Dos incursiones destacadas.
- Dos mazmorras destacadas.
- Desafíos y modificadores oficiales disponibles en Bungie.
- Ocaso/Gran Maestro cuando Bungie lo expone públicamente.
- Noticias oficiales recientes de Destiny 2.
- Rotación calculada de la próxima semana.

El bot usa un sistema híbrido: consulta Bungie en vivo y mantiene un calendario local como respaldo. Si Bungie entra en mantenimiento, el mensaje semanal sigue funcionando.

## Subir desde cero a GitHub

Sube **el contenido de esta carpeta**, no una carpeta contenedora adicional. En la raíz del repositorio deben verse directamente:

```text
src/
package.json
tsconfig.json
railway.toml
README.md
```

No subas `.env`, `node_modules`, `dist` ni `.data`.

## Railway

1. Crea un proyecto con **Deploy from GitHub Repo**.
2. En **Variables**, agrega `BUNGIE_API_KEY` con tu clave.
3. Railway ejecutará `npm run build` y luego `npm start`.
4. Cuando aparezca `Deployment successful`, el bot publicará el resumen por el webhook configurado.

No hacen falta `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, OAuth ni una cuenta de Destiny para el modo webhook.

## Desarrollo local

```bash
npm install
npm test
npm start
```

Copia `.env.example` como `.env` y completa `BUNGIE_API_KEY` para probar las consultas reales. `.env` está excluido de Git.

## Healthcheck

Railway puede consultar `GET /health`. Una respuesta `200` indica que el proceso y el webhook están listos.
