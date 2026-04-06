import { config } from "./config";
import {
  connectDb,
  disconnectDb,
  getSubmissionById,
  getTestcasesByProblemId,
  markSubmissionCompleted,
  markSubmissionFailed,
  markSubmissionProcessing
} from "./db";
import { executeSubmission } from "./executor";
import { logger } from "./logger";
import { deleteMessage, pollMessages, PolledMessage } from "./sqs";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processSubmissionById(submissionId: string): Promise<void> {
  logger.info(`Processing submission ${submissionId}`);

  const submission = await getSubmissionById(submissionId);
  if (!submission) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  await markSubmissionProcessing(submissionId);

  const testcases = await getTestcasesByProblemId(submission.problemId);
  if (testcases.length === 0) {
    await markSubmissionFailed(submissionId, "No testcases found for problem");
    return;
  }

  try {
    const execution = await executeSubmission(submission, testcases);
    await markSubmissionCompleted(submissionId, execution);
    logger.info(`Submission ${submissionId} finished`, {
      passedCount: execution.passedCount,
      totalTestcases: execution.totalTestcases,
      executionTimeMs: execution.executionTimeMs,
      memoryKb: execution.memoryKb
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error";
    await markSubmissionFailed(submissionId, message);
    throw error;
  }
}

async function processQueueMessage(message: PolledMessage): Promise<void> {
  try {
    await processSubmissionById(message.payload.submissionId);
    await deleteMessage(message.receiptHandle);
    logger.info(`Deleted SQS message ${message.messageId ?? "unknown"}`);
  } catch (error) {
    logger.error(`Failed processing message ${message.messageId ?? "unknown"}`, { error });
  }
}

export async function startWorker(): Promise<void> {
  await connectDb();
  logger.info("Worker started and polling SQS");

  while (true) {
    try {
      const messages = await pollMessages(5);
      if (messages.length === 0) {
        await sleep(config.workerIdleSleepMs);
        continue;
      }

      for (const message of messages) {
        await processQueueMessage(message);
      }
    } catch (error) {
      logger.error("Worker loop error", { error });
      await sleep(config.workerIdleSleepMs);
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down worker`);
  await disconnectDb();
  process.exit(0);
}

if (require.main === module) {
  process.on("SIGINT", () => {
    shutdown("SIGINT").catch((error) => {
      logger.error("Error during SIGINT shutdown", { error });
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch((error) => {
      logger.error("Error during SIGTERM shutdown", { error });
      process.exit(1);
    });
  });

  startWorker().catch((error) => {
    logger.error("Fatal worker startup error", { error });
    process.exit(1);
  });
}
