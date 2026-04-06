-- Unify Submission.status and selfSubmission.status into ExecutionStatus.
-- Data mapping decision:
-- selfSubmission.BAD_ALGORITHM -> ExecutionStatus.WRONG_ANSWER

CREATE TYPE "ExecutionStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'ACCEPTED',
  'PARTIAL',
  'WRONG_ANSWER',
  'TIME_LIMIT',
  'MEMORY_LIMIT',
  'RUNTIME_ERROR',
  'COMPILE_ERROR',
  'INTERNAL_ERROR',
  'BAD_SCALING'
);

ALTER TABLE "Submission"
ALTER COLUMN "status" TYPE "ExecutionStatus"
USING ("status"::text::"ExecutionStatus");

ALTER TABLE "selfSubmission"
ALTER COLUMN "status" TYPE "ExecutionStatus"
USING (
  CASE
    WHEN "status"::text = 'BAD_ALGORITHM' THEN 'WRONG_ANSWER'
    ELSE "status"::text
  END::"ExecutionStatus"
);

DROP TYPE "SubmissionStatus";
DROP TYPE "submissionStatus";
