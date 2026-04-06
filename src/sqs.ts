import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient
} from "@aws-sdk/client-sqs";
import { config } from "./config";
import { logger } from "./logger";
import { QueueSubmissionMessage } from "./types";

const sqsClient = new SQSClient({ region: config.awsRegion });

export interface PolledMessage {
  receiptHandle: string;
  messageId: string | undefined;
  payload: QueueSubmissionMessage;
}

export async function pollMessages(maxMessages = 1): Promise<PolledMessage[]> {
  const command = new ReceiveMessageCommand({
    QueueUrl: config.sqsQueueUrl,
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
        const payload = JSON.parse(message.Body) as Partial<QueueSubmissionMessage>;
        if (!payload.submissionId || typeof payload.submissionId !== "string") {
          logger.warn(`Skipping message with missing submissionId: ${message.MessageId ?? "unknown"}`);
          return null;
        }

        return {
          receiptHandle: message.ReceiptHandle,
          messageId: message.MessageId,
          payload: { submissionId: payload.submissionId }
        } satisfies PolledMessage;
      } catch (error) {
        logger.error(`Failed to parse SQS message body for ${message.MessageId ?? "unknown"}`, {
          error
        });
        return null;
      }
    })
    .filter((item): item is PolledMessage => item !== null);

  return parsed;
}

export async function deleteMessage(receiptHandle: string): Promise<void> {
  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: config.sqsQueueUrl,
      ReceiptHandle: receiptHandle
    })
  );
}

export async function sendTestMessage(submissionId: string): Promise<void> {
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: config.sqsQueueUrl,
      MessageBody: JSON.stringify({ submissionId })
    })
  );
}
