/** Password reset by emailed one-time token. Only the SHA-256 of the token is stored. */
import { deliver } from "./alerts";
import { hashPassword, sha256Hex, signJwt, tokenUrlsafe } from "./crypto";
import { emailAvailable, Env, nowIso, num } from "./env";
import { clientIp, HttpError, json, readJson, validation } from "./http";
import { isEmail } from "./validate";
import { enforce, limiter } from "./routes";

export const RESET_TTL_MS = 3600_000;
export const RESET_UNAVAILABLE = "Password reset is not available on this host (email is not configured)";
export const RESET_INVALID = "Reset link is invalid or has expired";
const JWT_EXPIRE_DAYS = 7;

export async function forgot(env: Env, request: Request): Promise<Response> {
  enforce(limiter(env, "auth"), clientIp(request));
  if (!emailAvailable(env)) throw new HttpError(503, RESET_UNAVAILABLE);
  const body = await readJson(request);
  if (!isEmail(body?.email)) throw validation("value is not a valid email address", ["body", "email"]);
  const email = body.email.toLowerCase().trim();
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
  if (row) {
    const token = tokenUrlsafe(32);
    const expires = new Date(Date.now() + RESET_TTL_MS).toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(row.id),
      env.DB.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at, used_at) VALUES (?, ?, ?, NULL)").bind(await sha256Hex(token), row.id, expires),
    ]);
    const appUrl = (env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
    const link = `${appUrl}/reset?token=${token}`;
    const text = ["Someone asked to reset the password for this VerifyRuns account.", "", `Set a new password here (the link works once, for one hour):`, link, "", "If that wasn't you, ignore this email — nothing changes."].join("\n");
    const r = await deliver(env, "email", email, text, "Reset your VerifyRuns password");
    if (!r.ok) {
      console.error("reset email failed", r.error);
      throw new HttpError(502, "The reset email could not be sent. Try again in a minute.");
    }
  }
  return json({ ok: true });
}

export async function resetPassword(env: Env, request: Request): Promise<Response> {
  enforce(limiter(env, "auth"), clientIp(request));
  const body = await readJson(request);
  if (typeof body?.token !== "string" || !body.token) throw validation("token is required", ["body", "token"]);
  if (typeof body.password !== "string" || body.password.length < 6) throw validation("ensure this value has at least 6 characters", ["body", "password"]);
  const hash = await sha256Hex(body.token);
  const row = await env.DB.prepare("SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?").bind(hash).first<{ user_id: string; expires_at: string; used_at: string | null }>();
  if (!row || row.used_at || row.expires_at <= nowIso()) throw new HttpError(400, RESET_INVALID);
  const user = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(row.user_id).first<{ id: string; email: string }>();
  if (!user) throw new HttpError(400, RESET_INVALID);
  const pw = await hashPassword(body.password, num(env.VR_PBKDF2_ITERATIONS, 100000));
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(pw, user.id),
    env.DB.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?").bind(nowIso(), hash),
    env.DB.prepare("DELETE FROM password_resets WHERE user_id = ? AND token_hash != ?").bind(user.id, hash),
  ]);
  const exp = Math.floor(Date.now() / 1000) + JWT_EXPIRE_DAYS * 86400;
  return json({ token: await signJwt({ sub: user.id, email: user.email, exp }, env.JWT_SECRET), user: { id: user.id, email: user.email } });
}

export async function expireResetTokens(env: Env, now: Date): Promise<number> {
  const res = await env.DB.prepare("DELETE FROM password_resets WHERE expires_at < ? OR used_at IS NOT NULL").bind(now.toISOString()).run();
  return res.meta.changes || 0;
}
