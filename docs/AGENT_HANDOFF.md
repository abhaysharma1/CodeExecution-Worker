# Agent Handoff Notes

Last updated: 2026-04-06

## Current Project Shape

This repository currently runs in a DB-backed architecture (not the earlier placeholder-only worker).

Main runtime files:
- src/worker.ts: SQS worker loop that fetches submissions from DB, executes testcases, updates submission status, and deletes SQS message on success.
- src/test-api.ts: Express testing API with Morgan logging.
- src/executor.ts: Piston integration and testcase execution logic.
- src/db.ts: DB connection and submission/testcase persistence helpers.
- src/config.ts: env loading and validation.
- src/logger.ts: Winston logger + Morgan stream adapter.

Generated Prisma client lives under src/generated/prisma and generated.

## Active Endpoints

Test API server (when running npm run dev:api):
- GET /health
- POST /test/execute

Important:
- The active test route is /test/execute.
- Earlier discussions used /execute-test; that route is not used by src/test-api.ts.

## Runtime Commands

From worker:
- npm run dev       -> watches src/worker.ts
- npm run dev:api   -> watches src/test-api.ts
- npm run build     -> prisma generate + tsc
- npm run start     -> runs dist/worker.js
- npm run start:api -> runs dist/test-api.js

## Required Environment Variables

At minimum:
- AWS_REGION
- SQS_QUEUE_URL
- DATABASE_URL
- PISTON_URL

Also used:
- PORT (default 3000)
- SQS_WAIT_TIME_SECONDS (default 20)
- WORKER_IDLE_SLEEP_MS (default 2000)
- LOG_LEVEL

## Execution Flow Summary

Worker flow (src/worker.ts):
1. Poll SQS.
2. Parse submissionId from message payload.
3. Fetch submission from DB.
4. Mark submission processing.
5. Fetch problem testcases from DB.
6. Execute testcase inputs via Piston (src/executor.ts).
7. Aggregate pass/time/memory.
8. Mark submission completed or failed.
9. Delete SQS message only after successful handling.

Test API flow (src/test-api.ts):
1. Accept direct execution payload.
2. Normalize body into language/files/stdin.
3. Call executeCode from src/executor.ts.
4. Return stdout/stderr/time/memory and optional pass check.

## Piston Integration Notes

Current implementation posts to:
- ${PISTON_URL}/api/v2/execute

Payload uses:
- language
- version (defaults to *)
- files: [{ name?, content }]
- stdin

Potential compatibility pitfall:
- Some callers may send version=latest; internal executor uses * for stability.

## Known TODOs and Risks

1. Worker loop in src/worker.ts processes messages sequentially inside each batch.
- Improvement: introduce bounded parallel processing for throughput.

2. Retry behavior relies on SQS redelivery without explicit ChangeMessageVisibility backoff.
- Improvement: classify retryable errors and set visibility timeout strategically.

3. Shutdown handling is basic.
- Improvement: track in-flight jobs and drain gracefully before process exit.

4. Test API has no auth guard.
- Improvement: optional bearer token for non-local environments.

5. Logging currently mixes simple/json formats based on NODE_ENV.
- Improvement: enforce structured JSON in all environments if needed for aggregation.

## Fast Resume Checklist

1. Confirm active route is /test/execute and not /execute-test.
2. Run npm run dev:api and smoke test with POST /test/execute.
3. Run npm run dev for queue worker behavior.
4. Verify env values in .env, especially PISTON_URL and DATABASE_URL.
5. If execution fails, inspect logs from src/logger.ts and Piston response payload.

## Reference Doc

See docs/WORKER_CHANGES.md for historical schema and worker updates.
