const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");
const { resolveQrunPath, hideDir } = require("./qrun.service");

// Written to stderr by `qrun --stage-marker` once the program has compiled
// (see compiler/src/include/Cli.h.sa): diagnostics before it are compile output,
// everything after it was printed by the running program.
const STAGE_MARKER = "\x1e[quantum:compiled]\x1e";

// javac requires a public top-level class to live in a file of the same
// name, so a Java program is saved as <PublicClass>.java.
function javaFileName(code) {
  const withoutComments = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const m = withoutComments.match(
    /\bpublic\s+(?:(?:final|abstract|sealed|non-sealed|strictfp|static)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/
  );
  return m ? `${m[1]}.java` : "Main.java";
}

function sourceFileName(language, code) {
  return language === "java" ? javaFileName(code) : config.LANGUAGES[language].defaultFile;
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n");
}

// Colour codes come from qrun's own error banners; the text is otherwise
// kept exactly as printed.
function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

// Compiles and runs `code` with qrun inside a fresh sandbox folder. An HTML
// page may come with its stylesheet (`css`): saved as style.css next to it
// and applied (qrun index.html style.css) unless the page links it already.
// Resolves (never rejects) with:
//   { noBinary } | { writeError } |
//   { stage: "compile" | "run", compileOutput, stdout, stderr, exitCode,
//     timedOut, truncated, durationMs, fileName }
function runProgram({ language, code, stdin = "", args = [], css }) {
  return new Promise((resolve) => {
    const qrunPath = resolveQrunPath();
    if (!qrunPath) return resolve({ noBinary: true });

    const lang = config.LANGUAGES[language];
    const dir = path.join(config.SANDBOX_DIR, `run_${crypto.randomBytes(8).toString("hex")}`);
    const fileName = sourceFileName(language, code);
    const sheets = language === "html" && typeof css === "string" ? ["style.css"] : [];

    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, fileName), code, "utf8");
      if (sheets.length) fs.writeFileSync(path.join(dir, sheets[0]), css, "utf8");
    } catch (err) {
      fs.rm(dir, { recursive: true, force: true }, () => {});
      return resolve({ writeError: true });
    }

    // A page's arguments are the stylesheets applied to it; a stylesheet has none.
    const programArgs = language === "html" ? sheets : language === "css" ? [] : args;
    const qrunArgs = ["--stage-marker"];
    if (lang.strict) qrunArgs.push("--strict");
    qrunArgs.push(fileName, ...programArgs);

    const started = Date.now();
    const child = spawn(qrunPath, qrunArgs, { cwd: dir, windowsHide: true });
    const out = [];
    const err = [];
    let outBytes = 0;
    let errBytes = 0;
    let truncated = false;
    let timedOut = false;
    let finished = false;

    const collect = (chunks, chunk, isOut) => {
      const size = isOut ? outBytes : errBytes;
      if (size >= config.MAX_BUFFER_BYTES) {
        if (!truncated) {
          truncated = true;
          child.kill();
        }
        return;
      }
      const room = config.MAX_BUFFER_BYTES - size;
      const piece = chunk.length > room ? chunk.subarray(0, room) : chunk;
      chunks.push(piece);
      if (isOut) outBytes += piece.length;
      else errBytes += piece.length;
    };
    child.stdout.on("data", (chunk) => collect(out, chunk, true));
    child.stderr.on("data", (chunk) => collect(err, chunk, false));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, config.EXEC_TIMEOUT_MS);

    const finish = (exitCode) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      fs.rm(dir, { recursive: true, force: true }, () => {});

      // The sandbox folder never shows, even where node would print the
      // script's absolute path.
      const stdout = hideDir(normalizeNewlines(Buffer.concat(out).toString("utf8")), dir);
      const stderrAll = hideDir(normalizeNewlines(Buffer.concat(err).toString("utf8")), dir);
      const at = stderrAll.indexOf(STAGE_MARKER);
      const compiled = at !== -1;
      const compileOutput = compiled ? stderrAll.slice(0, at) : stderrAll;
      const stderr = compiled ? stderrAll.slice(at + STAGE_MARKER.length).replace(/^\n/, "") : "";

      resolve({
        stage: compiled || timedOut ? "run" : "compile",
        compileOutput: stripAnsi(compileOutput).trimEnd(),
        stdout,
        stderr: stripAnsi(stderr),
        exitCode,
        timedOut,
        truncated,
        durationMs: Date.now() - started,
        fileName,
      });
    };

    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code));

    child.stdin.on("error", () => {}); // the program may exit without reading its input
    child.stdin.end(stdin);
  });
}

module.exports = { runProgram, javaFileName, STAGE_MARKER };
