import winston from "winston";

const isProd = process.env.NODE_ENV === "production";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isProd ? winston.format.json() : winston.format.simple()
  ),
  transports: [new winston.transports.Console()]
});

export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  }
};
