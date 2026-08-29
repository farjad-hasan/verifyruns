## 1. Tests first (worker/test/hardening.test.ts)
- [x] 1.1 PATCH unknown kind → 400; kind change without config → 400; kind change with config → 200 and the new config is stored
- [x] 1.2 channel targets: metadata-address Slack webhook refused on create, on add, and via the legacy field; non-URL refused; bad email refused; good ones accepted

## 2. Worker
- [x] 2.1 patchCheck rules
- [x] 2.2 `validateChannelTarget` in validate.ts, wired at the four call sites

## 3. Verify
- [x] 3.1 suite green, typecheck, validate
