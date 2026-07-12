const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

fs.mkdirSync(config.SANDBOX_DIR, { recursive: true });

let cachedQrunPath = null;

// Search known locations for the qrun binary. Cached once found.
function resolveQrunPath() {
  if (cachedQrunPath && fs.existsSync(cachedQrunPath)) return cachedQrunPath;

  const candidates = [
    process.env.QRUN_PATH,
    path.resolve(__dirname, "..", "..", "compiler", "qrun.exe"),
    path.resolve(__dirname, "..", "..", "compiler", "build", "qrun.exe"),
    path.resolve(__dirname, "..", "..", "..", "QuantumLanguage", "qrun.exe"),
    path.resolve(__dirname, "..", "..", "..", "QuantumLanguage", "qrun.bat"),
    path.resolve(__dirname, "..", "..", "..", "QuantumLanguage", "build", "qrun.exe"),
    path.resolve(__dirname, "..", "..", "..", "QuantumLanguage", "build", "qrun.bat"),
    path.resolve(__dirname, "..", "..", "..", "QuantumLanguage", "build", "qrun"),
    path.resolve(__dirname, "..", "..", "qrun.exe"),
    path.resolve(__dirname, "..", "..", "qrun.bat"),
    path.resolve(__dirname, "..", "..", "qrun"),
  ].filter(Boolean);

  cachedQrunPath = candidates.find((candidate) => fs.existsSync(candidate)) || null;
  return cachedQrunPath;
}

function stripAnsi(text) {
  return text ? text.replace(/\u001b\[[0-9;]*m/g, "").trim() : null;
}

// Runs code through qrun. Resolves with the raw execFile result so the
// controller can shape the response. Never rejects.
function runCode(code, extension) {
  return new Promise((resolve) => {
    const qrunPath = resolveQrunPath();
    if (!qrunPath) {
      return resolve({ noBinary: true });
    }

    const fileHash = crypto.randomBytes(8).toString("hex");
    const tempFilePath = path.join(config.SANDBOX_DIR, `sandbox_${fileHash}${extension}`);

    fs.writeFile(tempFilePath, code, (writeErr) => {
      if (writeErr) {
        return resolve({ writeError: true });
      }

      execFile(
        qrunPath,
        [tempFilePath],
        { timeout: config.EXEC_TIMEOUT_MS, maxBuffer: config.MAX_BUFFER_BYTES },
        (execError, stdout, stderr) => {
          fs.unlink(tempFilePath, () => {});
          resolve({ execError, stdout: stdout || "", stderr: stderr || "" });
        }
      );
    });
  });
}

module.exports = { resolveQrunPath, runCode, stripAnsi };