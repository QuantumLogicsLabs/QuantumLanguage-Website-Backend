require("dotenv").config();

const path = require("path");

// Every language the engine runs. Each gets POST /api/<id> (and POST /<id>),
// plus the same endpoint under each alias.
// strict: the program must be valid in that language (qrun --strict) —
// syntax from another language is a compile error, reported the way gcc,
// javac, python, node or ruby would report it (HTML and CSS: the way a
// validator reports it). `.sa` is Quantum's multi-syntax mode: Python,
// JavaScript, C/C++, Java and Ruby styles may be mixed in one file, and a
// .sa file may also hold an HTML page or a stylesheet.
const LANGUAGES = {
  c: { name: "C", extension: ".c", strict: true, defaultFile: "main.c", aliases: [] },
  cpp: { name: "C++", extension: ".cpp", strict: true, defaultFile: "main.cpp", aliases: [] },
  java: { name: "Java", extension: ".java", strict: true, defaultFile: "Main.java", aliases: [] },
  js: { name: "JavaScript", extension: ".js", strict: true, defaultFile: "main.js", aliases: ["javascript"] },
  py: { name: "Python", extension: ".py", strict: true, defaultFile: "main.py", aliases: ["python"] },
  rb: { name: "Ruby", extension: ".rb", strict: true, defaultFile: "main.rb", aliases: ["ruby"] },
  html: { name: "HTML", extension: ".html", strict: true, defaultFile: "index.html", aliases: [] },
  css: { name: "CSS", extension: ".css", strict: true, defaultFile: "style.css", aliases: [] },
  sa: { name: "Quantum", extension: ".sa", strict: false, defaultFile: "main.sa", aliases: ["quantum"] },
};

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
  // What /api/execute and the IDE WebSocket accept, and which of those run
  // under qrun --strict: every language but .sa, which alone gets Quantum's
  // mixed-syntax leniency.
  ALLOWED_EXTENSIONS: Object.values(LANGUAGES).map((l) => l.extension),
  STRICT_EXTENSIONS: Object.values(LANGUAGES)
    .filter((l) => l.strict)
    .map((l) => l.extension),
  SANDBOX_DIR: path.join(__dirname, "..", "tmp"),

  LANGUAGES,
};

module.exports = config;