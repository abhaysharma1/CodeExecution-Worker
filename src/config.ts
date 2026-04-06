import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric environment variable: ${name}=${raw}`);
  }
  return parsed;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  awsRegion: requireEnv("AWS_REGION"),
  examSqsQueueUrl: requireEnv("EXAM_SQS_QUEUE_URL"),
  practiceSqsQueueUrl: requireEnv("PRACTICE_SQS_QUEUE_URL"),
  databaseUrl: requireEnv("DATABASE_URL"),
  pistonUrl: requireEnv("PISTON_URL").replace(/\/$/, ""),
  port: parseIntEnv("PORT", 3000),
  sqsWaitTimeSeconds: parseIntEnv("SQS_WAIT_TIME_SECONDS", 20),
  workerIdleSleepMs: parseIntEnv("WORKER_IDLE_SLEEP_MS", 2000)
};
