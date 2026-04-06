import express, { Request, Response } from "express";
import morgan from "morgan";
import { config } from "./config";
import { logger, morganStream } from "./logger";
import { executeCode } from "./executor";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, service: "code-execution-worker-test-api" });
});

app.post("/test/execute", async (req: Request, res: Response) => {
  const body = req.body as {
    language?: unknown;
    version?: unknown;
    files?: unknown;
    file?: unknown;
    sourceCode?: unknown;
    stdin?: unknown;
    input?: unknown;
    expectedOutput?: unknown;
  };

  const language = typeof body.language === "string" ? body.language : undefined;
  const version = typeof body.version === "string" ? body.version : "*";

  const normalizedFiles = (() => {
    const result: Array<{ name?: string; content: string }> = [];

    if (Array.isArray(body.files)) {
      for (const file of body.files) {
        const typed = file as { name?: unknown; content?: unknown };
        if (typeof typed.content !== "string") {
          continue;
        }
        result.push({
          name: typeof typed.name === "string" ? typed.name : undefined,
          content: typed.content
        });
      }
      return result;
    }

    const singleFile = body.file as { name?: unknown; content?: unknown } | undefined;
    if (singleFile && typeof singleFile.content === "string") {
      result.push({
        name: typeof singleFile.name === "string" ? singleFile.name : undefined,
        content: singleFile.content
      });
      return result;
    }

    if (typeof body.sourceCode === "string") {
      result.push({
        name: "main",
        content: body.sourceCode
      });
      return result;
    }

    return result;
  })();

  if (typeof language !== "string" || normalizedFiles.length === 0) {
    res.status(400).json({
      error: "language and files[].content are required",
      expected: {
        language: "string",
        version: "string (optional)",
        files: [{ name: "string (optional)", content: "string" }],
        stdin: "string (optional)"
      },
      alsoAccepted: ["sourceCode + input", "file + stdin"]
    });
    return;
  }

  try {
    const result = await executeCode({
      language,
      version,
      files: normalizedFiles,
      stdin: typeof body.stdin === "string" ? body.stdin : typeof body.input === "string" ? body.input : ""
    });

    const normalizedActual = result.stdout.replace(/\r\n/g, "\n").trim();
    const normalizedExpected =
      typeof body.expectedOutput === "string"
        ? body.expectedOutput.replace(/\r\n/g, "\n").trim()
        : undefined;

    res.status(200).json({
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
      timeMs: result.timeMs,
      memoryKb: result.memoryKb,
      passed: normalizedExpected === undefined ? undefined : normalizedActual === normalizedExpected
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ ok: false, error: message });
  }
});

async function startApi(): Promise<void> {
  app.listen(config.port, () => {
    logger.info(`Test API listening on port ${config.port}`);
  });
}

process.on("SIGINT", () => {
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});

if (require.main === module) {
  startApi().catch((error) => {
    logger.error("Fatal API startup error", { error });
    process.exit(1);
  });
}
