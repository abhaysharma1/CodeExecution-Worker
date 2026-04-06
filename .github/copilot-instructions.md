# Code Execution Worker Guidelines

## Code Style

- Write simple code.
- Avoid over engineering and unnecessary abstractions.
- Prefer readability over reusability.
- Keep logic in existing files unless a new file is clearly justified.
- Prefer functional style over classes.
- Use short, meaningful names.
- Add short comments only when logic is not obvious.

## Architecture

- Keep the worker orchestration flow in [src/worker.ts](src/worker.ts): poll exam queue first -> if empty poll practice queue -> fetch submission/selfSubmission + testcases -> execute -> update DB -> delete message.
- Keep Piston integration and output comparison logic in [src/executor.ts](src/executor.ts).
- Keep Prisma queries and submission state transitions in [src/db.ts](src/db.ts).
- Keep queue transport logic in [src/sqs.ts](src/sqs.ts).
- Keep environment loading/validation centralized in [src/config.ts](src/config.ts).
- Keep test-only HTTP execution endpoint in [src/test-api.ts](src/test-api.ts).

## Build and Run

- Install dependencies with `npm install`.
- Use `npm run dev` for worker development.
- Use `npm run dev:api` for test API development.
- Use `npm run build` before `npm run start` or `npm run start:api`.
- When Prisma schema changes, regenerate client via `npm run prisma:generate` or `npm run build`.

## Project Conventions

- Do not edit generated Prisma client files under [generated/prisma](generated/prisma), [prisma/generated](prisma/generated), or [src/generated/prisma](src/generated/prisma).
- Keep strict env validation patterns from [src/config.ts](src/config.ts): required envs fail fast; numeric envs must be non-negative.
- Preserve status mapping in [src/db.ts](src/db.ts): update both `aiStatus` and `status` together.
- Preserve backward-compatible testcase parsing in [src/db.ts](src/db.ts), including support for `output` and `ouptut`.
- Normalize output (`\r\n` to `\n`, trim) before expected-output comparisons.
- Only delete SQS messages after successful submission handling.

## Pitfalls

- API route for direct execution testing is `POST /test/execute` in [src/test-api.ts](src/test-api.ts).
- [src/sqs.ts](src/sqs.ts) expects queue-specific payloads:
	- exam queue: `{ submissionId: string }`
	- practice queue: `{ selfSubmissionId: string }`
- [src/config.ts](src/config.ts) strips trailing slash from `PISTON_URL`; keep this behavior.
- [src/executor.ts](src/executor.ts) treats Piston `cpu_time` as milliseconds and converts memory bytes to KB.

## References

- See [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md) for operational handoff and flow summary.
- See [docs/WORKER_CHANGES.md](docs/WORKER_CHANGES.md) for schema alignment and status mapping history.
