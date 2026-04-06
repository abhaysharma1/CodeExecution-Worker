# Worker Change Documentation

## What Changed Initially
- Created a modular TypeScript worker service.
- Added SQS polling and message deletion flow.
- Added Prisma DB layer and Piston execution integration.
- Added Winston logger and Morgan HTTP logging.
- Added Dockerfile and environment template.

## Prisma 7 Migration Changes
- Upgraded to Prisma 7 dependencies in package.json.
- Switched schema generator to prisma-client output.
- Added/used prisma.config.ts for datasource URL.
- Updated runtime Prisma import strategy to generated client.

## Schema Alignment Changes (Latest)
- Worker now reads test data from TestCase.cases JSON array.
- Case parsing supports both keys:
  - output
  - ouptut (typo-compatible for existing data)
- Submission update fields now match current schema:
  - passedTestcases
  - totalTestcases
  - executionTime
  - memory
  - aiStatus
  - status
- Status mapping implemented:
  - Start processing: aiStatus=PROCESSING, status=RUNNING
  - Success all pass: aiStatus=COMPLETED, status=ACCEPTED
  - Partial pass: aiStatus=COMPLETED, status=PARTIAL
  - No pass: aiStatus=COMPLETED, status=WRONG_ANSWER
  - Runtime/internal failure: aiStatus=FAILED, status=INTERNAL_ERROR

## Testing API Clarification Applied
You requested a simple in-project endpoint only to verify execution.

- Test API simplified to one main endpoint:
  - POST /test/execute
- This endpoint executes submitted code directly through Piston.
- Optional expectedOutput allows immediate pass/fail check in response.
- This endpoint does not require DB lookups.

### Example Request
```json
{
  "language": "javascript",
  "sourceCode": "const fs=require('fs');const i=fs.readFileSync(0,'utf8').trim();console.log(i)",
  "input": "hello",
  "expectedOutput": "hello"
}
```

### Example Response Fields
- stdout
- stderr
- timeMs
- memoryKb
- passed (only when expectedOutput is provided)

## Current Worker Processing Flow
1. Poll SQS message.
2. Read submissionId from queue payload.
3. Fetch Submission by id.
4. Mark submission as running (aiStatus/status).
5. Fetch TestCase by problemId.
6. Parse TestCase.cases array.
7. Execute each testcase via Piston.
8. Aggregate pass count, time, memory.
9. Update submission final state.
10. Delete SQS message only after successful processing.

## Why These Changes Were Necessary
- Existing code expected an old schema with fields/tables that no longer exist.
- New schema stores testcases as JSON array in TestCase.cases.
- Submission lifecycle now uses aiStatus + SubmissionStatus enums.
- You requested a minimal direct testing endpoint inside this same project.
