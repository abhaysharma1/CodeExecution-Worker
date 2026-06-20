import {
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { config } from "./config";

const s3Client = new S3Client({
  region: config.awsRegion,
  endpoint: config.s3Endpoint,
  forcePathStyle: config.s3Endpoint ? true : undefined,
});

export async function downloadFromS3(key: string): Promise<string> {
  if (!config.performanceTestCasesBucket) {
    throw new Error("PERFORMANCE_TEST_CASES_BUCKET is not configured");
  }

  const command = new GetObjectCommand({
    Bucket: config.performanceTestCasesBucket,
    Key: key,
  });

  const response = await s3Client.send(command);
  const body = await response.Body?.transformToString("utf-8");

  if (body === undefined) {
    throw new Error(`Empty S3 object: ${key}`);
  }

  return body;
}
