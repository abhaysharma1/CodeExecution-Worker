import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient
} from "@aws-sdk/client-sqs";
import { config } from "./config";
import { logger } from "./logger";
import {
  ExamQueueSubmissionMessage,
  PracticeQueueSubmissionMessage,
  QueueType
} from "./types";

const sqsClient = new SQSClient({ region: config.awsRegion });

export interface ExamPolledMessage {
  queueType: "exam";
  receiptHandle: string;
  messageId: string | undefined;
  payload: ExamQueueSubmissionMessage;
}

export interface PracticePolledMessage {
  queueType: "practice";
  receiptHandle: string;
  messageId: string | undefined;
  payload: PracticeQueueSubmissionMessage;
}

export type PolledMessage = ExamPolledMessage | PracticePolledMessage;

function queueUrl(queueType: QueueType): string {
  return queueType === "exam" ? config.examSqsQueueUrl : config.practiceSqsQueueUrl;
}

export async function pollMessages(queueType: QueueType, maxMessages = 1): Promise<PolledMessage[]> {
  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl(queueType),
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: config.sqsWaitTimeSeconds,
    VisibilityTimeout: 120
  });

  const response = await sqsClient.send(command);
  const messages = response.Messages ?? [];

  const parsed = messages
    .map((message) => {
      if (!message.ReceiptHandle || !message.Body) {
        logger.warn(`Skipping malformed SQS message: ${message.MessageId ?? "unknown"}`);
        return null;
      }

      try {
        const payload = JSON.parse(message.Body) as {
          submissionId?: unknown;
          selfSubmissionId?: unknown;
        };

        if (queueType === "exam") {
          if (!payload.submissionId || typeof payload.submissionId !== "string") {
            logger.warn(`Skipping exam message with missing submissionId: ${message.MessageId ?? "unknown"}`);
            return null;
          }

          return {
            queueType: "exam",
            receiptHandle: message.ReceiptHandle,
            messageId: message.MessageId,
            payload: { submissionId: payload.submissionId }
          } satisfies ExamPolledMessage;
        }

        if (!payload.selfSubmissionId || typeof payload.selfSubmissionId !== "string") {
          logger.warn(`Skipping practice message with missing selfSubmissionId: ${message.MessageId ?? "unknown"}`);
          return null;
        }

        return {
          queueType: "practice",
          receiptHandle: message.ReceiptHandle,
          messageId: message.MessageId,
          payload: { selfSubmissionId: payload.selfSubmissionId }
        } satisfies PracticePolledMessage;
      } catch (error) {
        logger.error(`Failed to parse ${queueType} SQS message body for ${message.MessageId ?? "unknown"}`, {
          error
        });
        return null;
      }
    })
    .filter((item): item is PolledMessage => item !== null);

  return parsed;
}

export async function deleteMessage(queueType: QueueType, receiptHandle: string): Promise<void> {
  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl(queueType),
      ReceiptHandle: receiptHandle
    })
  );
}

export async function sendTestMessage(queueType: QueueType, submissionId: string): Promise<void> {
  const messageBody =
    queueType === "exam"
      ? JSON.stringify({ submissionId })
      : JSON.stringify({ selfSubmissionId: submissionId });

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl(queueType),
      MessageBody: messageBody
    })
  );
}
