import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(16),
  REFRESH_TOKEN_PEPPER: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Appyflow GST lookup key. Optional on purpose: without it the server still starts and the
  // "Fetch details" button simply stays hidden, so a missing key can never take the app down.
  APPYFLOW_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
