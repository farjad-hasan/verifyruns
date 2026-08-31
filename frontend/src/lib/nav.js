/** Only same-origin paths may be a post-login destination — never `//host` or a full URL. */
export function safeNext(next) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}
