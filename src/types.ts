export interface QueueSubmissionMessage {
  submissionId: string;
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

export interface ExecuteCodeRequest {
  language: string;
  version?: string;
  files: Array<{
    name?: string;
    content: string;
  }>;
  stdin?: string;
}

export interface ExecuteCodeResponse {
  stdout: string;
  stderr?: string;
  timeMs: number;
  memoryKb: number;
}
