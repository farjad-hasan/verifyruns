/** Only same-origin paths may be a post-login destination — never `//host`, a full URL, or a
 *  backslash form (`/\evil.com` — browsers normalise `\` to `/` during URL resolution). */
export function safeNext(next) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
}
