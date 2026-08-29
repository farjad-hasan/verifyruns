export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ENC_KEY: string;
  VR_TICK_SECRET?: string;
  RESEND_API_KEY?: string;
  ALERT_FROM?: string;
  PUBLIC_APP_URL?: string;
  CORS_ORIGINS?: string;
  VR_EARLY_ACCESS?: string;
  VR_ALLOW_PRIVATE_EGRESS?: string;
  VR_RETRY_DELAY_SECONDS?: string;
  VR_LAZY_TICK_SECONDS?: string;
  VR_AIRTABLE_MAX_PAGES?: string;
  VR_MAX_RESPONSE_BYTES?: string;
  VR_PBKDF2_ITERATIONS?: string;
  VR_RATE_AUTH_PER_MIN?: string;
  VR_RATE_HOOK_PER_MIN?: string;
  VR_RATE_CREATE_PER_MIN?: string;
  VR_PG_COUNT_TIMEOUT_MS?: string;
  VR_PG_SAMPLE_TIMEOUT_MS?: string;
  VR_PG_CONNECT_TIMEOUT_MS?: string;
  VR_SAMPLE_TTL_DAYS?: string;
  VR_HEALTH_MAX_TICK_AGE_SECONDS?: string;
  VR_TEST_PG_DSN?: string;
}

export const num = (v: string | undefined, dflt: number): number => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : dflt;
};

export const flag = (v: string | undefined, dflt: boolean): boolean =>
  v === undefined || v === "" ? dflt : ["1", "true", "yes"].includes(v.toLowerCase());

export const nowIso = (): string => new Date().toISOString();

export const emailAvailable = (env: Env): boolean => !!(env.RESEND_API_KEY && env.ALERT_FROM);
