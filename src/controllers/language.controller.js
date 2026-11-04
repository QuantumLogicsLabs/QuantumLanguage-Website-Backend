const config = require("../config");
const { runProgram } = require("../services/runner.service");

const MAX_ARGS = 32;
const MAX_ARG_LENGTH = 1000;

// Validates a POST /<language> body. Returns an error response tuple
// [status, message], or null when the body is usable.
function validate(body) {
  const { code, args } = body;
  const stdin = body.stdin !== undefined ? body.stdin : body.input;
  if (code === undefined || code === null) return [400, "Missing required field: 'code'."];
  if (typeof code !== "string") return [400, "'code' must be a string."];
  if (!code.trim()) return [400, "'code' must not be empty."];
  if (code.length > config.MAX_CODE_LENGTH)
    return [413, `Code exceeds maximum length of ${config.MAX_CODE_LENGTH} characters.`];
  if (stdin !== undefined && stdin !== null && typeof stdin !== "string")
    return [400, "'stdin' must be a string."];
  if (typeof stdin === "string" && stdin.length > config.MAX_STDIN_LENGTH)
    return [413, `Input exceeds maximum length of ${config.MAX_STDIN_LENGTH} characters.`];
  if (args !== undefined && args !== null) {
    if (!Array.isArray(args) || !args.every((a) => typeof a === "string"))
      return [400, "'args' must be an array of strings."];
    if (args.length > MAX_ARGS || args.some((a) => a.length > MAX_ARG_LENGTH))
      return [413, `At most ${MAX_ARGS} arguments of up to ${MAX_ARG_LENGTH} characters each.`];
  }
  if (body.css !== undefined && body.css !== null) {
    if (typeof body.css !== "string") return [400, "'css' must be a string."];
    if (body.css.length > config.MAX_CODE_LENGTH)
      return [413, `CSS exceeds maximum length of ${config.MAX_CODE_LENGTH} characters.`];
  }
  return null;
}

// POST /api/<language>: compiles and runs the submitted program.
function runLanguage(language) {
  const lang = config.LANGUAGES[language];
  return async function run(req, res) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const invalid = validate(body);
    if (invalid) return res.status(invalid[0]).json({ success: false, language, error: invalid[1] });

    const stdin = body.stdin !== undefined ? body.stdin : body.input;
    const result = await runProgram({
      language,
      code: body.code,
      stdin: typeof stdin === "string" ? stdin : "",
      args: body.args || [],
      css: typeof body.css === "string" ? body.css : undefined,
    });

    if (result.noBinary) {
      return res.status(500).json({
        success: false,
        language,
        error: "Execution engine not found. Set QRUN_PATH or build qrun.exe in ../compiler.",
      });
    }
    if (result.writeError) {
      return res.status(500).json({ success: false, language, error: "Failed to allocate space in execution sandbox." });
    }

    const compileFailed = result.stage === "compile";
    let error = null;
    if (compileFailed) error = result.compileOutput || "Compilation failed.";
    else if (result.timedOut)
      error = `Execution timed out after ${config.EXEC_TIMEOUT_MS}ms.` + (result.stderr ? `\n${result.stderr}` : "");
    else if (result.stderr) error = result.stderr;

    res.json({
      success: !compileFailed && !result.timedOut && !result.truncated && result.exitCode === 0,
      language,
      mode: lang.strict ? "strict" : "flexible",
      stage: result.stage,
      output: result.stdout,
      error,
      compileError: compileFailed ? error : null,
      warnings: !compileFailed && result.compileOutput ? result.compileOutput : null,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
      executionTimeMs: result.durationMs,
    });
  };
}

// GET /api/languages: what each endpoint accepts.
function listLanguages(req, res) {
  res.json({
    success: true,
    languages: Object.entries(config.LANGUAGES).map(([id, lang]) => ({
      id,
      name: lang.name,
      endpoint: `/api/${id}`,
      aliases: lang.aliases.map((alias) => `/api/${alias}`),
      extension: lang.extension,
      mode: lang.strict ? "strict" : "flexible",
      description: lang.strict
        ? `Standard ${lang.name}: the code must be valid ${lang.name}; anything else is a compile error.`
        : "Quantum multi-syntax: Python, JavaScript, C/C++, Java and Ruby styles may be mixed freely; a .sa file may also be an HTML page or a stylesheet.",
    })),
  });
}

module.exports = { runLanguage, listLanguages, validate };
