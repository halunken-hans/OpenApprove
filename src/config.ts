import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  BASE_URL: z.string().default("http://localhost:3000"),
  STORAGE_DIR: z.string().default("./storage"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  WEBHOOK_SIGNING_SECRET: z.string().default("change-me"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  ANNOTATIONS_ENABLED: z.coerce.boolean().default(true)
});

const parsed = EnvSchema.parse(process.env);
if (!parsed.DATABASE_URL) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    parsed.DATABASE_URL = "file:./test.db";
  } else {
    throw new Error("DATABASE_URL is required");
  }
}

export const env = parsed;
