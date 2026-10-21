import { Hono } from 'hono';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/error.middleware';

export function createApp(): Hono {
  const app = new Hono();

  // Global error handler
  app.onError((err, c) => {
    return errorHandler(err, c);
  });

  // Mount API router
  app.route('/', apiRouter);

  return app;
}
