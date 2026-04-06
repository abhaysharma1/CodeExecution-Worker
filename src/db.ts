import { PrismaClient, type Submission, type selfSubmission as SelfSubmission } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "./config";
import { logger } from "./logger";
import { ExecutionResult, NormalizedTestcase } from "./types";

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });

export async function connectDb(): Promise<void> {
  await prisma.$connect();
  logger.info("Connected to PostgreSQL via Prisma");
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  logger.info("Disconnected from PostgreSQL");
}

export async function getSubmissionById(submissionId: string): Promise<Submission | null> {
  return prisma.submission.findUnique({ where: { id: submissionId } });
}

export async function getSelfSubmissionById(selfSubmissionId: string): Promise<SelfSubmission | null> {
  return prisma.selfSubmission.findUnique({ where: { id: selfSubmissionId } });
}

type RawCaseItem = { input?: unknown; output?: unknown; ouptut?: unknown };

function toNormalizedTestcases(cases: unknown): NormalizedTestcase[] {
  if (!Array.isArray(cases)) {
    return [];
  }

  return cases
    .map((item, index) => {
      const row = item as RawCaseItem;
      const input = typeof row.input === "string" ? row.input : "";
      const output =
        typeof row.output === "string"
          ? row.output
          : typeof row.ouptut === "string"
            ? row.ouptut
            : "";

      if (output.length === 0) {
        return null;
      }

      return {
        testcaseId: `tc-${index + 1}`,
        input,
        expectedOutput: output
      } satisfies NormalizedTestcase;
    })
    .filter((item): item is NormalizedTestcase => item !== null);
}

export async function getTestcasesByProblemId(problemId: string): Promise<NormalizedTestcase[]> {
  const record = await prisma.testCase.findUnique({
    where: { problemId }
  });

  if (!record) {
    return [];
  }

  return toNormalizedTestcases(record.cases);
}

export async function markSubmissionProcessing(submissionId: string): Promise<void> {
  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      aiStatus: "PROCESSING",
      status: "RUNNING"
    }
  });
}

export async function markSubmissionCompleted(
  submissionId: string,
  execution: ExecutionResult
): Promise<void> {
  const allPassed = execution.passedCount === execution.totalTestcases;
  const status = allPassed
    ? "ACCEPTED"
    : execution.passedCount > 0
      ? "PARTIAL"
      : "WRONG_ANSWER";

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      aiStatus: "COMPLETED",
      status,
      passedTestcases: execution.passedCount,
      totalTestcases: execution.totalTestcases,
      executionTime: execution.executionTimeMs,
      memory: execution.memoryKb
    }
  });
}

export async function markSubmissionFailed(
  submissionId: string,
  error: string,
  partial?: Partial<Pick<ExecutionResult, "passedCount" | "totalTestcases" | "executionTimeMs" | "memoryKb">>
): Promise<void> {
  logger.error(`Submission ${submissionId} failed`, { error });

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      aiStatus: "FAILED",
      status: "INTERNAL_ERROR",
      passedTestcases: partial?.passedCount ?? 0,
      totalTestcases: partial?.totalTestcases ?? 0,
      executionTime: partial?.executionTimeMs ?? 0,
      memory: partial?.memoryKb ?? 0
    }
  });
}

export async function markSelfSubmissionProcessing(selfSubmissionId: string): Promise<void> {
  await prisma.selfSubmission.update({
    where: { id: selfSubmissionId },
    data: {
      status: "RUNNING"
    }
  });
}

export async function markSelfSubmissionCompleted(
  selfSubmissionId: string,
  execution: ExecutionResult
): Promise<void> {
  const allPassed = execution.passedCount === execution.totalTestcases;
  const status = allPassed
    ? "ACCEPTED"
    : execution.passedCount > 0
      ? "PARTIAL"
      : "WRONG_ANSWER";

  await prisma.selfSubmission.update({
    where: { id: selfSubmissionId },
    data: {
      status,
      passedTestcases: execution.passedCount,
      totalTestcases: execution.totalTestcases,
      executionTime: execution.executionTimeMs,
      memory: execution.memoryKb
    }
  });
}

export async function markSelfSubmissionFailed(
  selfSubmissionId: string,
  error: string,
  partial?: Partial<Pick<ExecutionResult, "passedCount" | "totalTestcases" | "executionTimeMs" | "memoryKb">>
): Promise<void> {
  logger.error(`Self submission ${selfSubmissionId} failed`, { error });

  await prisma.selfSubmission.update({
    where: { id: selfSubmissionId },
    data: {
      status: "INTERNAL_ERROR",
      passedTestcases: partial?.passedCount ?? 0,
      totalTestcases: partial?.totalTestcases ?? 0,
      executionTime: partial?.executionTimeMs ?? 0,
      memory: partial?.memoryKb ?? 0
    }
  });
}
