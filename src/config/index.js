require("dotenv").config();

const path = require("path");

const config = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  EXEC_TIMEOUT_MS: Number(process.env.EXEC_TIMEOUT_MS) || 10000,
  MAX_CODE_LENGTH: Number(process.env.MAX_CODE_LENGTH) || 20000,
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 20,
  MAX_BUFFER_BYTES: 5 * 1024 * 1024,
  ALLOWED_EXTENSIONS: [".sa", ".js", ".py", ".cpp", ".c", ".rb"],
  SANDBOX_DIR: path.join(__dirname, "..", "tmp"),
};

module.exports = config;