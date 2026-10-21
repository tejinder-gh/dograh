import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

async function bootstrap() {
  console.log(`[business-api] Service ready on http://${env.HOST}:${env.PORT}`);
}

if (import.meta.main) {
  bootstrap().catch((err) => {
    console.error('[business-api] Bootstrap error:', err);
    process.exit(1);
  });
}

export default {
  port: env.PORT,
  hostname: env.HOST,
  fetch: app.fetch,
};
