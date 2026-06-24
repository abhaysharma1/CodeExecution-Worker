export type QueueType = "exam" | "practice";

export interface ExamQueueSubmissionMessage {
  submissionId: string;
}

export interface PracticeQueueSubmissionMessage {
  selfSubmissionId: string;
}

export interface NormalizedTestcase {
  testcaseId: string;
  input: string;
  expectedOutput: string;
}

export interface ExecutionResult {
  passedCount: number;
  totalTestcases: number;
  executionTimeMs: number;
  memoryKb: number;
  failedCaseIndex: number | null;
  details: Array<{
    testcaseId: string;
    passed: boolean;
    stdout: string;
    expectedOutput: string;
    stderr?: string;
    timeMs: number;
    memoryKb: number;
  }>;
}

export interface ExecutionFailureContext {
  status: "COMPILE_ERROR" | "INTERNAL_ERROR";
  stderr?: string;
}

export interface ExecuteCodeRequest {
  language: string;
  version?: string;
  files: Array<{
    name?: string;
    content: string;
  }>;
  stdin?: string;
  run_timeout?: number;
  compile_timeout?: number;
}

export interface ExecuteCodeResponse {
  stdout: string;
  stderr?: string;
  exitCode?: number;
  timeMs: number;
  memoryKb: number;
}

export interface PerformanceTestResult {
  status: "ACCEPTED" | "WRONG_ANSWER" | "BAD_SCALING";
  executionTimeMs: number;
  memoryKb: number;
  failedCaseName?: string;
  passedCount: number;
  totalTestcases: number;
}
