import winston from "winston";

const isProd = process.env.NODE_ENV === "production";

const consoleFormat = winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
  const normalizedMeta = Object.entries(meta).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (key === "metadata" && value && typeof value === "object") {
      return { ...acc, ...(value as Record<string, unknown>) };
    }

    acc[key] = value;
    return acc;
  }, {});

  const details = Object.keys(normalizedMeta).length > 0 ? ` ${JSON.stringify(normalizedMeta)}` : "";
  const errorStack = typeof stack === "string" ? `\n${stack}` : "";
  return `${timestamp} ${level}: ${message}${details}${errorStack}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ["timestamp", "level", "message", "stack"] }),
    isProd ? winston.format.json() : consoleFormat
  ),
  transports: [new winston.transports.Console()]
});

export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  }
};
