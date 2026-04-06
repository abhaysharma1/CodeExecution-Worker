# Agent Handoff Notes

Last updated: 2026-04-06

## Current Project Shape

This repository currently runs in a DB-backed architecture (not the earlier placeholder-only worker).

Main runtime files:
- src/worker.ts: strict-priority dual-queue worker loop (exam queue first, practice queue second), executes testcases, updates DB, and deletes SQS message on success.
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
- EXAM_SQS_QUEUE_URL
- PRACTICE_SQS_QUEUE_URL
- DATABASE_URL
- PISTON_URL

Also used:
- PORT (default 3000)
- SQS_WAIT_TIME_SECONDS (default 20)
- WORKER_IDLE_SLEEP_MS (default 2000)
- LOG_LEVEL

## Execution Flow Summary

Worker flow (src/worker.ts):
1. Poll exam queue first.
2. If exam queue is empty, poll practice queue.
3. Parse payload by queue type:
	- exam: { submissionId: string }
	- practice: { selfSubmissionId: string }
4. Fetch submission/selfSubmission from DB.
5. Mark status as RUNNING (and aiStatus=PROCESSING for exam Submission).
6. Fetch problem testcases from DB.
7. Execute testcase inputs via Piston (src/executor.ts).
8. Aggregate pass/time/memory.
9. Mark record completed or failed.
10. Delete SQS message only after successful handling.

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
