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
  // Interactive IDE runs wait on the user's input, so they get longer.
  WS_EXEC_TIMEOUT_MS: Number(process.env.WS_EXEC_TIMEOUT_MS) || 300000,
  MAX_CODE_LENGTH: Number(process.env.MAX_CODE_LENGTH) || 20000,
  MAX_STDIN_LENGTH: Number(process.env.MAX_STDIN_LENGTH) || 65536,
  // Optional program that runs qrun, e.g. "wine" when hosting qrun.exe on Linux.
  QRUN_LAUNCHER: process.env.QRUN_LAUNCHER || "",
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 20,
  MAX_BUFFER_BYTES: 5 * 1024 * 1024,
  ALLOWED_EXTENSIONS: [".sa", ".js", ".py", ".rb", ".cpp", ".c"],
  // Checked as real C/C++ (qrun --strict): anything g++/gcc would reject is a
  // compile error. Only .sa gets Quantum's mixed-syntax leniency.
  STRICT_EXTENSIONS: [".cpp", ".c"],
  SANDBOX_DIR: path.join(__dirname, "..", "tmp"),

  // Per-language execution endpoints (POST /api/<id> and POST /<id>).
  // strict: the program must be valid in that language (qrun --strict) —
  // syntax from another language is a compile error. `.sa` is Quantum's
  // multi-syntax mode: Python, JavaScript, C/C++ and Ruby styles may be mixed.
  LANGUAGES: {
    c: { name: "C", extension: ".c", strict: true, defaultFile: "main.c" },
    cpp: { name: "C++", extension: ".cpp", strict: true, defaultFile: "main.cpp" },
    java: { name: "Java", extension: ".java", strict: true, defaultFile: "Main.java" },
    sa: { name: "Quantum", extension: ".sa", strict: false, defaultFile: "main.sa" },
  },
};

module.exports = config;