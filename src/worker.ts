import { config } from "./config";
import {
  connectDb,
  disconnectDb,
  getDriverCodeByProblemIdAndLanguage,
  getProblemTestGeneratorByProblemId,
  getSelfSubmissionById,
  getSubmissionById,
  getTestcasesByProblemId,
  markSelfSubmissionCompleted,
  markSelfSubmissionFailed,
  markSelfSubmissionProcessing,
  markSubmissionCompleted,
  markSubmissionFailed,
  markSubmissionProcessing
} from "./db";
import {
  executeSubmission,
  runComplexityCheck,
  SubmissionExecutionError,
} from "./executor";
import { logger } from "./logger";
import { deleteMessage, pollMessages, PolledMessage } from "./sqs";

function errorToLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { raw: error };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processExamSubmissionById(submissionId: string): Promise<void> {
  const startedAt = Date.now();
  logger.info(`Exam submission processing started`, { submissionId });

  const submission = await getSubmissionById(submissionId);
  if (!submission) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  logger.info("Loaded exam submission", {
    submissionId,
    problemId: submission.problemId,
    language: submission.language,
    sourceLength: submission.sourceCode?.length ?? 0,
  });

  await markSubmissionProcessing(submissionId);
  logger.info("Exam submission marked as RUNNING", { submissionId });

  const testcases = await getTestcasesByProblemId(submission.problemId);
  logger.info("Fetched exam submission testcases", {
    submissionId,
    problemId: submission.problemId,
    testcaseCount: testcases.length,
  });

  if (testcases.length === 0) {
    await markSubmissionFailed(submissionId, "No testcases found for problem");
    logger.warn("Exam submission failed due to missing testcases", { submissionId, problemId: submission.problemId });
    return;
  }

  try {
    const driver = await getDriverCodeByProblemIdAndLanguage(
      submission.problemId,
      submission.language,
    );
    const execution = await executeSubmission(submission, testcases, driver ?? undefined);

    const allPassed = execution.passedCount === execution.totalTestcases;
    if (!allPassed) {
      await markSubmissionCompleted(submissionId, execution);
      logger.info("Exam submission finished (functional cases only)", {
        submissionId,
        passedCount: execution.passedCount,
        totalTestcases: execution.totalTestcases,
        executionTimeMs: execution.executionTimeMs,
        memoryKb: execution.memoryKb,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    const generator = await getProblemTestGeneratorByProblemId(
      submission.problemId,
    );

    if (!generator) {
      await markSubmissionCompleted(submissionId, execution);
      logger.info("Exam submission finished (no complexity generator)", {
        submissionId,
        passedCount: execution.passedCount,
        totalTestcases: execution.totalTestcases,
        executionTimeMs: execution.executionTimeMs,
        memoryKb: execution.memoryKb,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    const complexityResult = await runComplexityCheck(
      submission,
      generator,
      driver ?? undefined,
    );

    if (!complexityResult) {
      await markSubmissionCompleted(submissionId, execution);
      logger.warn("Exam submission skipped complexity check", {
        submissionId,
        problemId: submission.problemId,
      });
      return;
    }

    await markSubmissionCompleted(
      submissionId,
      execution,
      complexityResult.status,
    );

    logger.info("Exam submission finished (complexity check)", {
      submissionId,
      passedCount: execution.passedCount,
      totalTestcases: execution.totalTestcases,
      executionTimeMs: execution.executionTimeMs,
      memoryKb: execution.memoryKb,
      elapsedMs: Date.now() - startedAt,
      complexity: complexityResult.complexity,
      expectedComplexity: complexityResult.expectedComplexity,
      complexityStatus: complexityResult.status,
    });
  } catch (error) {
    if (error instanceof SubmissionExecutionError) {
      logger.error("Exam submission execution failed", {
        submissionId,
        context: error.context,
        ...errorToLog(error),
      });
      await markSubmissionFailed(submissionId, error.message, {
        status: error.context.status,
        stderr: error.context.stderr,
      });
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unknown execution error";
    logger.error("Exam submission unexpected failure", {
      submissionId,
      ...errorToLog(error),
    });
    await markSubmissionFailed(submissionId, message);
    throw error;
  }
}

export async function processPracticeSubmissionById(selfSubmissionId: string): Promise<void> {
  const startedAt = Date.now();
  logger.info("Practice submission processing started", { selfSubmissionId });

  const selfSubmission = await getSelfSubmissionById(selfSubmissionId);
  if (!selfSubmission) {
    throw new Error(`Self submission not found: ${selfSubmissionId}`);
  }

  logger.info("Loaded practice submission", {
    selfSubmissionId,
    problemId: selfSubmission.problemId,
    language: selfSubmission.language,
    sourceLength: selfSubmission.sourceCode?.length ?? 0,
  });

  await markSelfSubmissionProcessing(selfSubmissionId);
  logger.info("Practice submission marked as RUNNING", { selfSubmissionId });

  const testcases = await getTestcasesByProblemId(selfSubmission.problemId);
  logger.info("Fetched practice submission testcases", {
    selfSubmissionId,
    problemId: selfSubmission.problemId,
    testcaseCount: testcases.length,
  });

  if (testcases.length === 0) {
    await markSelfSubmissionFailed(selfSubmissionId, "No testcases found for problem");
    logger.warn("Practice submission failed due to missing testcases", {
      selfSubmissionId,
      problemId: selfSubmission.problemId,
    });
    return;
  }

  try {
    const driver = await getDriverCodeByProblemIdAndLanguage(
      selfSubmission.problemId,
      selfSubmission.language,
    );
    const execution = await executeSubmission(selfSubmission, testcases, driver ?? undefined);

    const allPassed = execution.passedCount === execution.totalTestcases;
    if (!allPassed) {
      await markSelfSubmissionCompleted(selfSubmissionId, execution);
      logger.info("Practice submission finished (functional cases only)", {
        selfSubmissionId,
        passedCount: execution.passedCount,
        totalTestcases: execution.totalTestcases,
        executionTimeMs: execution.executionTimeMs,
        memoryKb: execution.memoryKb,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    const generator = await getProblemTestGeneratorByProblemId(
      selfSubmission.problemId,
    );

    if (!generator) {
      await markSelfSubmissionCompleted(selfSubmissionId, execution);
      logger.info("Practice submission finished (no complexity generator)", {
        selfSubmissionId,
        passedCount: execution.passedCount,
        totalTestcases: execution.totalTestcases,
        executionTimeMs: execution.executionTimeMs,
        memoryKb: execution.memoryKb,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    const complexityResult = await runComplexityCheck(
      selfSubmission,
      generator,
      driver ?? undefined,
    );

    if (!complexityResult) {
      await markSelfSubmissionCompleted(selfSubmissionId, execution);
      logger.warn("Practice submission skipped complexity check", {
        selfSubmissionId,
        problemId: selfSubmission.problemId,
      });
      return;
    }

    await markSelfSubmissionCompleted(
      selfSubmissionId,
      execution,
      complexityResult.status,
    );

    logger.info("Practice submission finished (complexity check)", {
      selfSubmissionId,
      passedCount: execution.passedCount,
      totalTestcases: execution.totalTestcases,
      executionTimeMs: execution.executionTimeMs,
      memoryKb: execution.memoryKb,
      elapsedMs: Date.now() - startedAt,
      complexity: complexityResult.complexity,
      expectedComplexity: complexityResult.expectedComplexity,
      complexityStatus: complexityResult.status,
    });
  } catch (error) {
    if (error instanceof SubmissionExecutionError) {
      logger.error("Practice submission execution failed", {
        selfSubmissionId,
        context: error.context,
        ...errorToLog(error),
      });
      await markSelfSubmissionFailed(selfSubmissionId, error.message, {
        status: error.context.status,
        stderr: error.context.stderr,
      });
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unknown execution error";
    logger.error("Practice submission unexpected failure", {
      selfSubmissionId,
      ...errorToLog(error),
    });
    await markSelfSubmissionFailed(selfSubmissionId, message);
    throw error;
  }
}

async function processQueueMessage(message: PolledMessage): Promise<void> {
  const startedAt = Date.now();

  logger.info("Queue message received", {
    queueType: message.queueType,
    messageId: message.messageId,
    payload: message.payload,
  });

  try {
    if (message.queueType === "exam") {
      await processExamSubmissionById(message.payload.submissionId);
    } else {
      await processPracticeSubmissionById(message.payload.selfSubmissionId);
    }

    await deleteMessage(message.queueType, message.receiptHandle);
    logger.info("Queue message processed and deleted", {
      queueType: message.queueType,
      messageId: message.messageId,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error("Queue message processing failed", {
      queueType: message.queueType,
      messageId: message.messageId,
      elapsedMs: Date.now() - startedAt,
      ...errorToLog(error),
    });
  }
}

export async function startWorker(): Promise<void> {
  logger.info("Worker startup initiated", {
    nodeEnv: config.nodeEnv,
    awsRegion: config.awsRegion,
    sqsWaitTimeSeconds: config.sqsWaitTimeSeconds,
    workerIdleSleepMs: config.workerIdleSleepMs,
    examQueueConfigured: Boolean(config.examSqsQueueUrl),
    practiceQueueConfigured: Boolean(config.practiceSqsQueueUrl),
    pistonUrl: config.pistonUrl,
    logLevel: process.env.LOG_LEVEL ?? "info",
    pid: process.pid,
  });

  await connectDb();
  logger.info("Worker started and polling SQS");

  let loopCount = 0;

  while (true) {
    loopCount += 1;

    try {
      const examPollStartedAt = Date.now();
      const examMessages = await pollMessages("exam", 5);
      logger.info("Exam queue poll completed", {
        loopCount,
        count: examMessages.length,
        elapsedMs: Date.now() - examPollStartedAt,
      });

      const practicePollStartedAt = Date.now();
      const messages = examMessages.length > 0 ? examMessages : await pollMessages("practice", 5);
      if (examMessages.length === 0) {
        logger.info("Practice queue poll completed", {
          loopCount,
          count: messages.length,
          elapsedMs: Date.now() - practicePollStartedAt,
        });
      }

      if (messages.length === 0) {
        if (loopCount % 10 === 0) {
          logger.info("Worker idle heartbeat", {
            loopCount,
            sleepMs: config.workerIdleSleepMs,
          });
        }
        await sleep(config.workerIdleSleepMs);
        continue;
      }

      for (const message of messages) {
        await processQueueMessage(message);
      }
    } catch (error) {
      logger.error("Worker loop error", {
        loopCount,
        ...errorToLog(error),
      });
      await sleep(config.workerIdleSleepMs);
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info("Shutdown signal received", { signal, pid: process.pid });
  await disconnectDb();
  process.exit(0);
}

if (require.main === module) {
  process.on("uncaughtException", (error) => {
    logger.error("uncaughtException", errorToLog(error));
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("unhandledRejection", { ...errorToLog(reason) });
  });

  process.on("beforeExit", (code) => {
    logger.warn("Process beforeExit", { code, pid: process.pid });
  });

  process.on("exit", (code) => {
    logger.warn("Process exit", { code, pid: process.pid });
  });

  process.on("SIGINT", () => {
    shutdown("SIGINT").catch((error) => {
      logger.error("Error during SIGINT shutdown", errorToLog(error));
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch((error) => {
      logger.error("Error during SIGTERM shutdown", errorToLog(error));
      process.exit(1);
    });
  });

  startWorker().catch((error) => {
    logger.error("Fatal worker startup error", errorToLog(error));
    process.exit(1);
  });
}
