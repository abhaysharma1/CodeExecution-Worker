import {
  PrismaClient,
  type Submission,
  type selfSubmission as SelfSubmission,
  type ExecutionStatus,
  type ProblemTestGenerator,
  type ProgrammingLanguage,
} from "./generated/prisma/client";
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

export async function getSubmissionById(
  submissionId: string,
): Promise<Submission | null> {
  return prisma.submission.findUnique({ where: { id: submissionId } });
}

export async function getSelfSubmissionById(
  selfSubmissionId: string,
): Promise<SelfSubmission | null> {
  return prisma.selfSubmission.findUnique({ where: { id: selfSubmissionId } });
}

export async function getProblemTestGeneratorByProblemId(
  problemId: string,
): Promise<ProblemTestGenerator | null> {
  return prisma.problemTestGenerator.findUnique({ where: { problemId } });
}

type RawCaseItem = { input?: unknown; output?: unknown; ouptut?: unknown };

const MAX_ERROR_OUTPUT_LENGTH = 500;

function trimErrorOutput(stderr?: string): string | null {
  if (!stderr) {
    return null;
  }

  const normalized = stderr.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (normalized.length === 0) {
    return null;
  }

  return normalized.slice(0, MAX_ERROR_OUTPUT_LENGTH);
}

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
        expectedOutput: output,
      } satisfies NormalizedTestcase;
    })
    .filter((item): item is NormalizedTestcase => item !== null);
}

export async function getTestcasesByProblemId(
  problemId: string,
): Promise<NormalizedTestcase[]> {
  const runRecord = await prisma.testCase.findUnique({
    where: { problemId },
  });

  if (runRecord) {
    return toNormalizedTestcases(runRecord.cases);
  }

  const record = await prisma.testCase.findUnique({
    where: { problemId },
  });

  if (!record) {
    return [];
  }

  return toNormalizedTestcases(record.cases);
}

export async function markSubmissionProcessing(
  submissionId: string,
): Promise<void> {
  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      aiStatus: "PROCESSING",
      status: "RUNNING",
    },
  });
}

function toExecutionStatus(execution: ExecutionResult): ExecutionStatus {
  const allPassed = execution.passedCount === execution.totalTestcases;
  return allPassed
    ? "ACCEPTED"
    : execution.passedCount > 0
      ? "PARTIAL"
      : "WRONG_ANSWER";
}

// Option A (typical): more passed is better; tie-breaker is lower time, then lower memory.
function isBetterThanPrevFinal(
  execution: ExecutionResult,
  prev: {
    passedTestcases: number;
    executionTime: number | null;
    memory: number | null;
  },
): boolean {
  if (execution.passedCount !== prev.passedTestcases) {
    return execution.passedCount > prev.passedTestcases;
  }

  const prevTime = prev.executionTime ?? Number.POSITIVE_INFINITY;
  if (execution.executionTimeMs !== prevTime) {
    return execution.executionTimeMs < prevTime;
  }

  const prevMem = prev.memory ?? Number.POSITIVE_INFINITY;
  return execution.memoryKb < prevMem;
}

export async function markSubmissionCompleted(
  submissionId: string,
  execution: ExecutionResult,
): Promise<void> {
  const status = toExecutionStatus(execution);

  const curr = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, examId: true, userId: true, problemId: true },
  });

  if (!curr) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  const baseData = {
    aiStatus: "PENDING" as const,
    status,
    passedTestcases: execution.passedCount,
    totalTestcases: execution.totalTestcases,
    executionTime: execution.executionTimeMs,
    memory: execution.memoryKb,
    stderr: "",
  };

  const prevFinal = await prisma.submission.findFirst({
    where: {
      examId: curr.examId,
      userId: curr.userId,
      problemId: curr.problemId,
      isFinal: true,
      NOT: { id: submissionId },
    },
    select: {
      id: true,
      passedTestcases: true,
      executionTime: true,
      memory: true,
    },
  });

  const shouldBeFinal =
    !prevFinal || isBetterThanPrevFinal(execution, prevFinal);

  await prisma.$transaction(async (tx) => {
    if (shouldBeFinal && prevFinal) {
      await tx.submission.update({
        where: { id: prevFinal.id },
        data: { isFinal: false },
      });
    }

    await tx.submission.update({
      where: { id: submissionId },
      data: { ...baseData, isFinal: shouldBeFinal },
    });
  });
}

export async function markSubmissionFailed(
  submissionId: string,
  error: string,
  options?: {
    status?: ExecutionStatus;
    stderr?: string;
    partial?: Partial<
      Pick<
        ExecutionResult,
        "passedCount" | "totalTestcases" | "executionTimeMs" | "memoryKb"
      >
    >;
  },
): Promise<void> {
  const trimmedStderr = trimErrorOutput(options?.stderr ?? error);
  logger.error(`Submission ${submissionId} failed`, {
    error,
    stderr: trimmedStderr,
  });

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      aiStatus: "FAILED",
      status: options?.status ?? "INTERNAL_ERROR",
      stderr: trimmedStderr,
      passedTestcases: options?.partial?.passedCount ?? 0,
      totalTestcases: options?.partial?.totalTestcases ?? 0,
      executionTime: options?.partial?.executionTimeMs ?? 0,
      memory: options?.partial?.memoryKb ?? 0,
    },
  });
}

export async function markSelfSubmissionProcessing(
  selfSubmissionId: string,
): Promise<void> {
  await prisma.selfSubmission.update({
    where: { id: selfSubmissionId },
    data: {
      status: "RUNNING",
    },
  });
}

export async function markSelfSubmissionCompleted(
  selfSubmissionId: string,
  execution: ExecutionResult,
  statusOverride?: ExecutionStatus,
): Promise<void> {
  const allPassed = execution.passedCount === execution.totalTestcases;
  const status =
    statusOverride ??
    (allPassed
      ? "ACCEPTED"
      : execution.passedCount > 0
        ? "PARTIAL"
        : "WRONG_ANSWER");

  await prisma.selfSubmission.update({
    where: { id: selfSubmissionId },
    data: {
      status,
      passedTestcases: execution.passedCount,
      totalTestcases: execution.totalTestcases,
      executionTime: execution.executionTimeMs,
      memory: execution.memoryKb,
      stderr: null,
    },
  });
}

export async function markSelfSubmissionFailed(
  selfSubmissionId: string,
  error: string,
  options?: {
    status?: ExecutionStatus;
    stderr?: string;
    partial?: Partial<
      Pick<
        ExecutionResult,
        "passedCount" | "totalTestcases" | "executionTimeMs" | "memoryKb"
      >
    >;
  },
): Promise<void> {
  const trimmedStderr = trimErrorOutput(options?.stderr ?? error);
  logger.error(`Self submission ${selfSubmissionId} failed`, {
    error,
    stderr: trimmedStderr,
  });

  await prisma.selfSubmission.update({
    where: { id: selfSubmissionId },
    data: {
      status: options?.status ?? "INTERNAL_ERROR",
      stderr: trimmedStderr,
      passedTestcases: options?.partial?.passedCount ?? 0,
      totalTestcases: options?.partial?.totalTestcases ?? 0,
      executionTime: options?.partial?.executionTimeMs ?? 0,
      memory: options?.partial?.memoryKb ?? 0,
    },
  });
}

type DriverCodePayload = {
  header: string | null;
  footer: string | null;
};

function normalizeDriverLanguage(language: string): ProgrammingLanguage | null {
  const value = language.trim().toLowerCase();
  if (
    value === "c" ||
    value === "cpp" ||
    value === "python" ||
    value === "java"
  ) {
    return value as ProgrammingLanguage;
  }

  return null;
}

export async function getDriverCodeByProblemIdAndLanguage(
  problemId: string,
  language: string,
): Promise<DriverCodePayload | null> {
  const normalizedLanguage = normalizeDriverLanguage(language);
  if (!normalizedLanguage) {
    return null;
  }

  return prisma.driverCode.findUnique({
    where: {
      language_problemId: {
        language: normalizedLanguage,
        problemId,
      },
    },
    select: {
      header: true,
      footer: true,
    },
  });
}
