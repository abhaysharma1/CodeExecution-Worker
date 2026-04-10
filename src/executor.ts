import axios from "axios";
import { config } from "./config";
import {
  ExecutionFailureContext,
  ExecuteCodeRequest,
  ExecuteCodeResponse,
  ExecutionResult,
  NormalizedTestcase,
} from "./types";

interface SubmissionCodeSource {
  language: string;
  sourceCode: string;
}

interface PistonResponse {
  run?: {
    output?: string;
    stdout?: string;
    stderr?: string;
    code?: number;
    signal?: string;
    cpu_time?: number;
    memory?: number;
  };
  compile?: {
    stderr?: string;
    output?: string;
    code?: number;
  };
}

interface DriverCodeSource {
  header: string | null;
  footer: string | null;
}

const CASE_START_MARKER = "__CASE_START__";
const CASE_END_MARKER = "__CASE_END__";
const ALT_CASE_START_MARKER = "CASE_START_MARKER";
const ALT_CASE_END_MARKER = "CASE_END_MARKER";
const SINGLE_CASE_START_MARKER = "_CASE_START_";
const SINGLE_CASE_END_MARKER = "_CASE_END_";

const caseStartMarkers = [
  CASE_START_MARKER,
  ALT_CASE_START_MARKER,
  SINGLE_CASE_START_MARKER,
] as const;
const caseEndMarkers = [
  CASE_END_MARKER,
  ALT_CASE_END_MARKER,
  SINGLE_CASE_END_MARKER,
] as const;
const allCaseMarkers = [...caseStartMarkers, ...caseEndMarkers] as const;

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stripCaseDelimiters(content: string): string {
  let normalized = (content ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (const marker of allCaseMarkers) {
    normalized = normalized.replace(
      new RegExp(`^\\s*${escapeRegex(marker)}\\s*$`, "gm"),
      "",
    );
  }

  return normalized.trim();
}

function extractMarkedBlocks(content: string): string[] {
  const escapedStarts = caseStartMarkers.map(escapeRegex);
  const escapedEnds = caseEndMarkers.map(escapeRegex);
  const pattern = new RegExp(
    `(?:${escapedStarts.join("|")})[\\s\\S]*?(?:${escapedEnds.join("|")})`,
    "g",
  );

  return (content.match(pattern) ?? []).map((block) => block.trim());
}

function stripBlockMarkers(block: string): string {
  return allCaseMarkers
    .reduce(
      (cleaned, marker) =>
        cleaned.replace(new RegExp(escapeRegex(marker), "g"), ""),
      block,
    )
    .trim();
}

function parseCaseCountFromInput(input: string): number | null {
  const firstLine = stripCaseDelimiters(input ?? "")
    .split("\n")[0]
    ?.trim();

  if (!firstLine) {
    return null;
  }

  const count = Number.parseInt(firstLine, 10);
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }

  return count;
}

function splitPlainLines(content: string): string[] {
  const normalized = stripCaseDelimiters(content ?? "");

  if (!normalized) {
    return [];
  }

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeInputBlock(content: string): string {
  return stripCaseDelimiters(content ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function getOutputBlocks(content: string, expectedLineCount?: number | null): string[] {
  const markedBlocks = extractMarkedBlocks(content);

  if (markedBlocks.length > 0) {
    return markedBlocks.map(stripBlockMarkers);
  }

  const lines = splitPlainLines(content);
  if (expectedLineCount && expectedLineCount > 1 && lines.length === expectedLineCount) {
    return lines;
  }

  return [lines.join("\n")];
}

function buildAggregatedInput(cases: NormalizedTestcase[]): string {
  let totalCaseCount = 0;
  const bodyParts: string[] = [];

  for (const testCase of cases) {
    const input = normalizeInputBlock(testCase.input ?? "");
    const newlineIndex = input.indexOf("\n");
    const head = newlineIndex === -1 ? input : input.slice(0, newlineIndex);
    const body = newlineIndex === -1 ? "" : input.slice(newlineIndex + 1).trim();
    const count = Number.parseInt(head.trim(), 10);

    if (!Number.isFinite(count) || count < 0) {
      return cases.map((entry) => normalizeInputBlock(entry.input ?? "")).join("\n");
    }

    totalCaseCount += count;
    if (body) {
      bodyParts.push(body);
    }
  }

  if (totalCaseCount === 0) {
    return "0";
  }

  return `${totalCaseCount}\n${bodyParts.join("\n")}`.trim();
}

function splitAggregatedInputCases(input: string, expectedCount: number): string[] {
  const cleanedInput = stripCaseDelimiters(input ?? "");
  const lines = cleanedInput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const declaredCount = Number.parseInt(lines[0], 10);
  const remaining = lines.slice(1);
  const targetCount = Number.isFinite(declaredCount) && declaredCount > 0 ? declaredCount : expectedCount;

  if (targetCount <= 0 || remaining.length === 0) {
    return [];
  }

  if (remaining.length % targetCount === 0) {
    const chunkSize = remaining.length / targetCount;
    const chunks: string[] = [];

    for (let i = 0; i < targetCount; i += 1) {
      const start = i * chunkSize;
      const end = start + chunkSize;
      chunks.push(remaining.slice(start, end).join("\n").trim());
    }

    return chunks;
  }

  return [];
}

function getInputBlocks(input: string, expectedCount: number): string[] {
  const markedBlocks = extractMarkedBlocks(input ?? "");

  if (markedBlocks.length > 0) {
    return markedBlocks.map(stripBlockMarkers);
  }

  return splitAggregatedInputCases(input, expectedCount);
}

function sanitizeSourceCode(code: string): string {
  return code
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[""`]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function normalizeLanguage(language: string): "c" | "cpp" | "python" | "java" | null {
  const value = language.trim().toLowerCase();
  if (value === "c" || value === "cpp" || value === "python" || value === "java") {
    return value;
  }
  return null;
}

export class SubmissionExecutionError extends Error {
  readonly context: ExecutionFailureContext;

  constructor(message: string, context: ExecutionFailureContext) {
    super(message);
    this.name = "SubmissionExecutionError";
    this.context = context;
  }
}

function normalizeForCompare(value: string): string {
  return splitPlainLines(value ?? "").join("\n");
}

function toMs(seconds: number): number {
  return seconds;
}

function toKb(bytes?: number): number {
  if (!bytes || Number.isNaN(bytes)) return 0;
  return Math.round(bytes / 1024);
}

async function runCode(
  request: ExecuteCodeRequest,
): Promise<ExecuteCodeResponse> {
  try {
    const response = await axios.post<PistonResponse>(
      `${config.pistonUrl}/api/v2/execute`,
      {
        language: request.language,
        version: request.version ?? "*",
        files: request.files,
        stdin: request.stdin ?? "",
      },
      {
        timeout: 30_000,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const compileError = response.data.compile?.stderr;
    if (compileError && compileError.trim().length > 0) {
      throw new SubmissionExecutionError("Compilation failed", {
        status: "COMPILE_ERROR",
        stderr: compileError,
      });
    }

    const run = response.data.run ?? {};

    return {
      stdout: run.stdout ?? run.output ?? "",
      stderr: run.stderr,
      exitCode: run.code,
      timeMs: toMs(run.cpu_time ?? 0),
      memoryKb: toKb(run.memory),
    };
  } catch (error) {
    if (error instanceof SubmissionExecutionError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const detail =
        typeof error.response?.data === "string"
          ? error.response.data
          : JSON.stringify(error.response?.data ?? {});
      throw new SubmissionExecutionError(
        `Piston execution failed: ${error.message}`,
        {
          status: "INTERNAL_ERROR",
          stderr: detail,
        },
      );
    }

    throw new SubmissionExecutionError("Execution failed unexpectedly", {
      status: "INTERNAL_ERROR",
      stderr: error instanceof Error ? error.message : "Unknown execution error",
    });
  }
}

export async function executeSubmission(
  submission: SubmissionCodeSource,
  testcases: NormalizedTestcase[],
  driver?: DriverCodeSource,
): Promise<ExecutionResult> {
  const language = normalizeLanguage(submission.language);
  if (!language) {
    throw new SubmissionExecutionError(`Unsupported language: ${submission.language}`, {
      status: "INTERNAL_ERROR",
    });
  }

  const sourceCode = sanitizeSourceCode(
    `${driver?.header ?? ""}\n${submission.sourceCode}\n${driver?.footer ?? ""}`,
  );

  const cleanedCases = testcases.map((testcase) => ({
    ...testcase,
    input: stripCaseDelimiters(testcase.input ?? ""),
    expectedOutput: (testcase.expectedOutput ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim(),
  }));

  const expectedLineCountHints =
    cleanedCases.length === 1
      ? [parseCaseCountFromInput(cleanedCases[0]?.input ?? "")]
      : cleanedCases.map(() => null);

  const expectedBlocksByCase = cleanedCases.map((testCase, index) =>
    getOutputBlocks(testCase.expectedOutput ?? "", expectedLineCountHints[index]),
  );

  const shouldExpandAggregatedCase =
    cleanedCases.length === 1 && expectedBlocksByCase[0]?.length > 1;

  const expandedInputs = shouldExpandAggregatedCase
    ? getInputBlocks(cleanedCases[0]?.input ?? "", expectedBlocksByCase[0].length)
    : [];

  const normalizedCases = shouldExpandAggregatedCase
    ? expectedBlocksByCase[0].map((block, index) => ({
        testcaseId: `tc-${index + 1}`,
        input: expandedInputs[index] || `Case ${index + 1}`,
        expectedOutput: block,
      }))
    : cleanedCases.map((testCase, index) => {
        const blocks = expectedBlocksByCase[index];
        return {
          ...testCase,
          expectedOutput: blocks.join("\n"),
        };
      });

  const expectedBlockCounts = shouldExpandAggregatedCase
    ? expectedBlocksByCase[0].map(() => 1)
    : expectedBlocksByCase.map((blocks) => Math.max(blocks.length, 1));

  const expectedTotalBlocks = expectedBlockCounts.reduce(
    (sum, count) => sum + count,
    0,
  );

  const runResult = await runCode({
    language,
    version: "*",
    files: [
      {
        name: language === "java" ? "Main.java" : "main",
        content: sourceCode,
      },
    ],
    stdin: buildAggregatedInput(cleanedCases),
  });

  const allBlocks = getOutputBlocks(runResult.stdout ?? "", expectedTotalBlocks);
  const reconciledBlocks = [...allBlocks];

  if (reconciledBlocks.length === 0) {
    reconciledBlocks.push((runResult.stdout ?? "").trim());
  }

  if (reconciledBlocks.length < expectedTotalBlocks) {
    while (reconciledBlocks.length < expectedTotalBlocks) {
      reconciledBlocks.push("");
    }
  } else if (reconciledBlocks.length > expectedTotalBlocks) {
    const head = reconciledBlocks.slice(0, expectedTotalBlocks - 1);
    const tail = reconciledBlocks.slice(expectedTotalBlocks - 1).join("\n");
    reconciledBlocks.length = 0;
    reconciledBlocks.push(...head, tail);
  }

  let passedCount = 0;
  let failedCaseIndex: number | null = null;
  let offset = 0;
  const hasCompileOrRuntimeError =
    Boolean(runResult.stderr?.trim()) ||
    (typeof runResult.exitCode === "number" && runResult.exitCode !== 0);
  const cleanedRuntimeOutput = splitPlainLines(runResult.stdout ?? "").join("\n");
  const details: ExecutionResult["details"] = [];

  for (let i = 0; i < normalizedCases.length; i += 1) {
    const testcase = normalizedCases[i];
    const blockCount = expectedBlockCounts[i] ?? 1;
    const caseBlocks = reconciledBlocks.slice(offset, offset + blockCount).join("\n");
    offset += blockCount;

    const visibleOutput = hasCompileOrRuntimeError ? cleanedRuntimeOutput : caseBlocks;
    const passed =
      !hasCompileOrRuntimeError &&
      normalizeForCompare(caseBlocks) === normalizeForCompare(testcase.expectedOutput);

    if (passed) {
      passedCount += 1;
    } else if (failedCaseIndex === null) {
      failedCaseIndex = i;
    }

    details.push({
      testcaseId: testcase.testcaseId,
      passed,
      stdout: visibleOutput,
      expectedOutput: testcase.expectedOutput,
      stderr: runResult.stderr,
      timeMs: runResult.timeMs,
      memoryKb: runResult.memoryKb,
    });
  }

  return {
    passedCount,
    totalTestcases: normalizedCases.length,
    executionTimeMs: runResult.timeMs,
    memoryKb: runResult.memoryKb,
    failedCaseIndex,
    details,
  };
}

export async function executeCode(
  request: ExecuteCodeRequest,
): Promise<ExecuteCodeResponse> {
  return runCode(request);
}
