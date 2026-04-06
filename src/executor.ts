import axios from "axios";
import { config } from "./config";
import {
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

function normalizeOutput(output: string): string {
  return output.replace(/\r\n/g, "\n").trim();
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
    throw new Error(`Compilation failed: ${compileError}`);
  }

  const run = response.data.run ?? {};

  return {
    stdout: run.output ?? "",
    stderr: run.stderr,
    timeMs: toMs(run.cpu_time ?? 0),
    memoryKb: toKb(run.memory),
  };
}

async function runSingleTestcase(
  submission: SubmissionCodeSource,
  testcase: NormalizedTestcase,
) {
  const runResult = await runCode({
    language: submission.language,
    version: "*",
    files: [
      {
        name: "main",
        content: submission.sourceCode,
      },
    ],
    stdin: testcase.input,
  });

  const passed =
    normalizeOutput(runResult.stdout) ===
    normalizeOutput(testcase.expectedOutput);

  return {
    testcaseId: testcase.testcaseId,
    passed,
    stdout: runResult.stdout,
    expectedOutput: testcase.expectedOutput,
    stderr: runResult.stderr,
    timeMs: runResult.timeMs,
    memoryKb: runResult.memoryKb,
  };
}

export async function executeSubmission(
  submission: SubmissionCodeSource,
  testcases: NormalizedTestcase[],
): Promise<ExecutionResult> {
  let passedCount = 0;
  let totalTimeMs = 0;
  let peakMemoryKb = 0;
  let failedCaseIndex: number | null = null;

  const details: ExecutionResult["details"] = [];

  for (let i = 0; i < testcases.length; i += 1) {
    const testcase = testcases[i];
    const result = await runSingleTestcase(submission, testcase);

    if (result.passed) {
      passedCount += 1;
    } else if (failedCaseIndex === null) {
      failedCaseIndex = i;
    }

    totalTimeMs += result.timeMs;
    peakMemoryKb = Math.max(peakMemoryKb, result.memoryKb);
    details.push(result);
  }

  return {
    passedCount,
    totalTestcases: testcases.length,
    executionTimeMs: totalTimeMs,
    memoryKb: peakMemoryKb,
    failedCaseIndex,
    details,
  };
}

export async function executeCode(
  request: ExecuteCodeRequest,
): Promise<ExecuteCodeResponse> {
  return runCode(request);
}
