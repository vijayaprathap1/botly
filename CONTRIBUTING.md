# Contributing to Botly

Thanks for helping. Botly is a small codebase with real customers, so the rules below keep `main` safe. **`main` deploys to production (https://botly.in) automatically.**

## Branches and pull requests

1. Start from an up-to-date `main`:
   ```bash
   git checkout main && git pull
   git checkout -b <short-topic>     # e.g. fix-lead-email-text, docs-user-guide
   ```
2. Keep each pull request to one topic. Don't mix refactors with fixes.
3. Open the pull request against `main` with:
   - **what changed and why**, in plain words
   - **how you tested it** (commands and results, screenshots for UI)
   - **migrations** to apply, in order, and whether they're safe to re-run
   - **env vars** added or changed (names only)
   - anything the reviewer must do before merging (for example, "apply 0011 first")
4. If your branch depends on another open pull request, say so at the top ("Stacked on #1") and target or rebase accordingly.
5. **Only the owner (Vijayaprathap) merges.** Contributors and bots don't merge, force-push to `main` or deploy. Vercel builds a preview for each pull request; production changes only when the owner merges.

## Before you push

Run these and paste the results into the pull request:

```bash
npm run typecheck
npm test                  # Vitest unit tests (tests/unit)
npm run widget:size       # if you touched widget/src: must stay under the 35 KB gzipped budget
```

Also run, when relevant:

| You changed | Also run |
|---|---|
| SQL, RLS, or `lib/retrieval` | `npm run test:db` against a fresh local database (`DB=botly_test bash scripts/local-db.sh`) |
| Widget, dashboard flows, sign-up, or anything a user clicks | The Playwright suite: `scripts/local-stack/e2e.sh` (see README → Testing) |
| Prompts, tools, the knowledge pipeline, or the model | `npm run eval -- --fixture evals/ananya-handlooms.yaml`. All prompt-injection cases must pass |
| Supported languages | `npm run llm:check` (and `npm run eval:languages` once PR #4 is merged) |
| `evals/ananya-handlooms.yaml` | `npm run seed:gen`, and commit the regenerated `supabase/seed.sql` |

There's no CI yet, so these local runs are the check.

## Database migrations

- Migrations live in `supabase/migrations/`, numbered `NNNN_name.sql`, and are applied **in filename order**.
- Use the **next free number**. Check open pull requests first: `0011`, `0012` and `0013` are taken by #1, #3 and #5 at the time of writing.
- Never edit a migration that's already on `main`. Add a new one.
- Prefer additive and re-runnable SQL (`if not exists`, `create or replace`). Every table gets RLS. Don't add anon policies; public traffic goes through the server with the service role after key and origin checks.
- List the migration in the README table and in the pull request body. Deploys don't run migrations; the owner applies them in Supabase.

## No secrets, ever

- Never commit `.env`, `.env.local`, `.env.local-stack`, API keys, tokens, webhook secrets, the service role key, `ENCRYPTION_KEY`, or customer data. They're gitignored; keep it that way.
- In docs, issues and pull requests, refer to environment variables **by name only**.
- Use fake data in tests, fixtures and screenshots (the seeded "Ananya Handlooms" business, `example.com`, `+91 90000 00000`-style numbers). Blur or replace real emails and phone numbers.
- Never put analytics or third-party scripts in `widget/src`.
- If you spot a leaked secret, tell the owner privately so it can be rotated. Don't open a public issue.

## Code style

- TypeScript strict; run `npm run typecheck`.
- Server-only code (service role, LLM keys) stays in route handlers, Server Actions and `lib/`. Never import it into client components.
- Validate request bodies with zod (`lib/validation`), and whitelist the fields Server Actions write.
- Keep the widget framework-free and small. It runs on other people's websites.
- Write user-facing text in plain, short English.

## Docs

Update `README.md`, `docs/USER-GUIDE.md` or `docs/ADMIN-DEMO-GUIDE.md` in the same pull request when you change behaviour they describe. Don't document features that aren't on `main`.
