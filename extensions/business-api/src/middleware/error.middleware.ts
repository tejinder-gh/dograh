import type { Context } from 'hono';
import { ZodError } from 'zod';

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof ZodError) {
    return c.json(
      {
        error: 'Validation failed',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
      400
    );
  }

  const message = err.message || 'Internal server error';

  if (message.includes('not found')) {
    return c.json({ error: message }, 404);
  }

  if (message.includes('already exists') || message.includes('unique constraint') || message.includes('duplicate')) {
    return c.json({ error: message }, 409);
  }

  if (message.includes('Unauthorized') || message.includes('Forbidden')) {
    return c.json({ error: message }, 403);
  }

  console.error('[business-api error]:', err);
  return c.json({ error: message }, 500);
}
