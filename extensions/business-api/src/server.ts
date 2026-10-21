import { createApp } from './app';
import { env } from './config/env';
import { runMigrations } from './config/migrator';

const app = createApp();

async function bootstrap() {
  console.log('Ensuring business_ext database migrations are up to date...');
  await runMigrations();
  console.log(`[business-api] Service ready on http://127.0.0.1:${env.PORT}`);
}

if (import.meta.main) {
  bootstrap().catch((err) => {
    console.error('[business-api] Bootstrap error:', err);
    process.exit(1);
  });
}

export default {
  port: env.PORT,
  fetch: app.fetch,
};
