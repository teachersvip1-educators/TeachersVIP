import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8443),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:8443'),
  SESSION_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('TeachersVIP <verification@example.com>'),
  RESEND_TO_EMAIL: z.email().optional(),
  SUPERADMIN_EMAILS: z.string().default(''),
  SUPERADMIN_REGISTRATION_PIN: z.string().regex(/^\d{4,12}$/).default('0509'),
  PASS2U_API_KEY: z.string().min(20).optional(),
  PASS2U_MODEL_ID: z.string().min(1).optional(),
  PASS2U_MEMBER_NAME_FIELD: z.string().default('name'),
  PASS2U_MEMBER_ID_FIELD: z.string().default('memberid'),
  PASS2U_STATUS_FIELD: z.string().default('status'),
  MAPBOX_ACCESS_TOKEN: z.string().min(8).optional(),
  VERIFICATION_TEST_MODE: z.preprocess(
    (value) => typeof value === 'string' ? value.toLowerCase() === 'true' : value,
    z.boolean().default(false),
  ),
  ACTIVATION_LOCATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
})

export type Config = z.infer<typeof schema>

export function getConfig(overrides: Partial<Record<keyof Config, unknown>> = {}): Config {
  return schema.parse({ ...process.env, ...overrides })
}
