import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from business-api directory or dograh root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().optional(),
  POSTGRES_HOST: z.string().default('127.0.0.1'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().default('postgres'),
  POSTGRES_DB: z.string().default('postgres'),
  DOGRAH_API_URL: z.string().default('http://127.0.0.1:8000'),
  DOGRAH_DEPLOYMENT_ID: z.string().default('default'),
  BUSINESS_EXT_SECRET: z.string().default('business-extension-local-secret-change-in-prod'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment configuration for business-api');
}

export const env = parsed.data;
