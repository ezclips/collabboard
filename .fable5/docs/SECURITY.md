# Security

Threat model, controls, and audit findings. Extends `.claude/rules/common/security.md` with Fable-5 specifics. Education market = minors' data = the bar is higher than typical SaaS (COPPA/FERPA/GDPR exposure).

## 1. Threat Model (what actually matters for us)

| Asset | Primary threats |
|---|---|
| Board content (incl. minors' data) | IDOR across boards, share-token leakage/guessing, RLS gaps |
| Accounts | Credential stuffing, session fixation via invite/share flows |
| User-generated content | **Stored XSS** (rich text, embeds, link previews, SVG uploads), CSRF on API routes |
| Uploads/Storage | Malware distribution, public-bucket misconfiguration, path traversal in export/import |
| Billing | Webhook forgery, entitlement bypass |
| AI pipeline | Prompt injection via board content → data exfiltration in AI output; cost abuse |

## 2. Controls by Area

### AuthZ (with PERMISSIONS.md)
- RLS on **every** table, same-migration rule; deny-by-default.
- All server routes resolve permission via the single resolver; no route trusts client-sent role/board ids without ownership checks.
- Share tokens: 128-bit random, hashed at rest (leaked DB ≠ leaked links), revocable, optional expiry/password. Tokens never in logs or referrer headers (`Referrer-Policy: same-origin`).

### XSS (our #1 practical risk)
- TipTap/HTML content sanitized with DOMPurify **server-side on write** (client-side is UX, not security). One shared sanitizer config in `lib/html-utils.ts` — audit all `dangerouslySetInnerHTML` call sites against it (grep gate in CI).
- Embeds (YouTube, social, `react-social-media-embed`): allowlisted providers only, rendered in sandboxed iframes (`sandbox="allow-scripts allow-same-origin"` minimum necessary).
- Link previews (`app/api/link-preview`): fetcher must be **SSRF-proof** — block private IP ranges/redirect-to-internal, timeout, size cap; sanitize og:* strings. ⚠️ Audit this route in Phase 1.
- SVG uploads sanitized or served with `Content-Disposition: attachment` from a separate origin; user media served from the storage domain, never the app origin.
- CSP: `default-src 'self'` + explicit allowlist (Supabase, Mapbox, Stripe, embed providers); no `unsafe-inline` scripts. Add via middleware in Phase 1.

### API routes
- Zod validation on every body/param (boundary rule, CODING_STANDARDS.md §1).
- Rate limiting (`lib/auth/rate-limit.ts` exists — apply uniformly): auth endpoints, invitation/share resolution (token brute-force), AI endpoints (cost), anonymous posting (token+IP).
- Stripe webhooks: signature verification + idempotency keys (audit `app/api/webhooks` in Phase 1); entitlements only ever derived server-side.
- ⚠️ Remove `app/api/test`, `app/api/test-db`, `app/debug-db` from production builds — debug surfaces found in audit; gate by env or delete.

### Secrets & platform
- No secrets in client bundle: only `NEXT_PUBLIC_*` may be public; service-role key exists **only** in server env, never in `lib` code importable by client (lint boundary helps). Startup env validation with zod.
- Dependency scanning (npm audit + Renovate/Dependabot) in CI; `dompurify` and friends pinned and patched promptly.
- Imports integrations (Google Drive/OneDrive OAuth in `lib/imports`): tokens encrypted at rest, minimal scopes, refresh-token handling server-side only. Audit `clientAuth.ts` for tokens touching localStorage.

### AI pipeline
- Treat board content in prompts as untrusted (prompt injection): AI output passes the same zod validators (`lib/ai/validators.ts` — good) **and** the same HTML sanitizer before persistence; AI endpoints rate-limited and quota-metered per plan.

## 3. Privacy & Compliance (education wedge prerequisite)

- Data minimization for anonymous visitors (no shadow profiles); minors: no ads/trackers, COPPA-conscious defaults (private boards, approval-on for classroom templates).
- GDPR: export + delete account flows (deletion cascades through storage objects too); DPA-ready subprocessor list (Supabase, Vercel, Stripe, Mapbox, AI provider).
- Telemetry excludes content payloads (op *types* not op *bodies* — PERFORMANCE.md §4, CODING_STANDARDS.md §5).

## 4. Licensing (legal security, P7) ⚠️

- **dhtmlx-gantt / dhtmlx-scheduler are GPLv2-or-commercial.** Shipping them in a proprietary SaaS bundle without a commercial license is a compliance violation. Decision required in Phase 1: buy licenses or replace (ARCHITECTURE.md challenges them anyway on bundle/architecture grounds — recommendation: replace).
- Excalidraw fork (MIT): keep LICENSE + attribution in the fork directory. `react-chrono`, `open-color`, etc.: verify and record licenses in a `THIRD_PARTY.md` generated in CI.
- "Padlet" naming purge before anything is public (P7).

## 5. Process

- Security checklist from `.claude/rules/common/security.md` on every PR touching auth/uploads/routes/RLS; security-reviewer pass before merging those PRs.
- Phase 1 one-time audit tasks: link-preview SSRF, webhook signatures, debug routes, RLS coverage diff (every table × every verb), storage bucket policies, `dangerouslySetInnerHTML` census.
- Incident playbook: rotate exposed secret → assess blast radius via logs → notify affected users if content exposed → postmortem in docs/adr. Secrets rotation drill once per quarter.
