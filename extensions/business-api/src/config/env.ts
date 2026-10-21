import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { KNOWN_INSECURE_SECRETS } from './constants';

// Load .env from business-api directory or dograh root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const envSchema = z
  .object({
    PORT: z.coerce.number().default(4000),
    HOST: z.string().default(process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().optional(),
    MIGRATION_DATABASE_URL: z.string().optional(),
    TEST_ADMIN_DATABASE_URL: z.string().optional(),
    POSTGRES_HOST: z.string().default('127.0.0.1'),
    POSTGRES_PORT: z.coerce.number().default(5432),
    POSTGRES_USER: z.string().default('business_app_user'),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_DB: z.string().default('postgres'),
    DOGRAH_API_URL: z.string().default('http://127.0.0.1:8000'),
    DOGRAH_DEPLOYMENT_ID: z.string().default('default'),
    BUSINESS_EXT_SECRET: z
      .string({
        required_error: 'BUSINESS_EXT_SECRET is required and must be explicitly configured',
      })
      .min(32, 'BUSINESS_EXT_SECRET must be at least 32 characters in length')
      .refine(
        (val) => !KNOWN_INSECURE_SECRETS.has(val),
        'BUSINESS_EXT_SECRET must not use a known insecure default secret'
      ),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (data.DATABASE_URL) {
        if (
          data.DATABASE_URL.includes('://postgres:') ||
          data.DATABASE_URL.includes('@postgres:') ||
          data.DATABASE_URL.includes('user=postgres')
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['DATABASE_URL'],
            message: 'Production DATABASE_URL must not connect as superuser postgres; use business_app_user',
          });
        }
      } else {
        if (data.POSTGRES_USER === 'postgres') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['POSTGRES_USER'],
            message: 'Production POSTGRES_USER must not connect as superuser postgres; use business_app_user',
          });
        }
        if (!data.POSTGRES_PASSWORD) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['POSTGRES_PASSWORD'],
            message: 'Production POSTGRES_PASSWORD must be configured',
          });
        }
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Sanitize errors so no secrets are leaked in error logs
  const issues = parsed.error.issues.map((i) => ({
    field: i.path.join('.'),
    message: i.message,
  }));
  console.error('Fatal configuration error: Environment validation failed:', issues);
  throw new Error('Fatal configuration error: Missing or insecure environment configuration for business-api');
}

export const env = parsed.data;
