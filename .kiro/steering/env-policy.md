# Environment File Policy

The `.env` file on the production server is the **source of truth** for all environment configuration.

## Rules

- **Never modify** the `.env` file on the server — not through CI/CD, not through deploy scripts, not through any automated process.
- **Never overwrite** `.env` as part of a deploy step.
- The `.env` is gitignored intentionally — it must never be committed to the repo.
- All code must read config from environment variables at runtime — no hardcoded values.

## Current Production `.env` lives at
`/home/administrator/Desktop/doc_judge/judge0/.env`

If new environment variables are needed, document them in `.env.example` only — never touch the server's `.env` directly from code or CI/CD.
