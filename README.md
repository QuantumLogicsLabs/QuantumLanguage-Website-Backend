# QuantumLanguage Backend

Remote execution API that powers the QuantumLanguage web IDE. It accepts source
code from the frontend, runs it through the `qrun` compiler/interpreter, and
returns the result as JSON.

Expected folder layout (monorepo):

```
QuantumLanguage/
├── backend/     (this project)
├── compiler/    # C++ source; build.bat / build-fast.bat produce qrun.exe here
└── frontend/
```

`resolveQrunPath()` looks for the built binary at `QRUN_PATH`, then
`bin/qrun.exe`, `../compiler/build/qrun.exe` and `../compiler/qrun.exe`.

## Requirements

- Node.js 18+
- A built `qrun` executable from the QuantumLanguage compiler (optional — see
  [Demo mode](#demo-mode) below if you don't have one yet)

## Setup

```bash
npm install
cp .env.example .env
npm run dev   # nodemon, restarts on file changes
# or
npm start     # plain node
```

The server listens on `PORT` (default `5000`).

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `development` | Environment name, echoed by `/api/health` |
| `ALLOWED_ORIGINS` | *(empty = allow all)* | Comma-separated list of allowed CORS origins |
| `QRUN_PATH` | *(auto-detected)* | Absolute path to the `qrun` executable |
| `QRUN_LAUNCHER` | *(empty)* | Program that runs `qrun.exe`, e.g. `wine` on Linux |
| `EXEC_TIMEOUT_MS` | `10000` | Kill a running program after this many ms |
| `WS_EXEC_TIMEOUT_MS` | `300000` | Same, for interactive IDE runs over the WebSocket |
| `MAX_CODE_LENGTH` | `20000` | Reject submissions with more characters than this |
| `MAX_STDIN_LENGTH` | `65536` | Reject `stdin` longer than this |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window for `/api/execute` and the language endpoints |
| `RATE_LIMIT_MAX` | `20` | Max requests per window per IP |

## Strict languages vs. reflexive `.sa`

Every language except Quantum runs under `qrun --strict`. The program must be
valid in its own language: anything the real tool would reject (gcc, g++,
javac, python, node or ruby) is a compile error, and the program never runs.
That includes another language's syntax, a missing `;`, `cout` without
`std::`, or an undeclared name in C/C++. The error is printed the way that
tool prints it:

| Language | Compile error | Uncaught error at run time |
| --- | --- | --- |
| C / C++ | `main.cpp:5:5: error: expected ';' before 'cout'` + source line and caret | `terminate called after throwing ...` |
| Java | `Main.java:3: error: ';' expected` + source line and caret | `Exception in thread "main" java.lang....` + stack trace |
| Python | `File "main.py", line 1` / source line / caret / `SyntaxError: ...` (or `IndentationError`) | `Traceback (most recent call last): ...` |
| JavaScript | `main.js:1` / source line / caret / `SyntaxError: ...` | node's `TypeError: ...` + stack trace |
| Ruby | `main.rb:1: syntax error, unexpected ')' (SyntaxError)` + source line | `main.rb:2:in '<main>': boom (ArgumentError)` |

Only `.sa` files get Quantum's reflexive mixed-syntax mode, where Python,
JavaScript, Ruby, Java and C++ can share one file.

Every program runs on the Quantum VM: qrun has its own C, C++, Java, Python,
JavaScript and Ruby front-ends. Python, Node.js, Ruby, gcc and the JDK are
never installed or called.

## API

### `GET /api/health`

```json
{ "status": "ok", "qrunAvailable": true, "environment": "development" }
```

### Language endpoints: `POST /api/<language>`

Each endpoint compiles and runs one program on the Quantum VM and returns its
output. They are also served without the `/api` prefix (`POST /cpp` is the same
endpoint as `POST /api/cpp`). An alias is the same endpoint under another name:
`POST /api/python` is `POST /api/py`. All of them share one rate-limit budget.

| Endpoint | Aliases | Language | Mode |
| --- | --- | --- | --- |
| `/api/c` | | C | **strict**: the code must be valid C (as gcc accepts it) |
| `/api/cpp` | | C++ | **strict**: the code must be valid C++ (as g++ accepts it) |
| `/api/java` | | Java | **strict**: one compilation unit, as `javac` accepts it |
| `/api/js` | `/api/javascript` | JavaScript | **strict**: a Node.js script (CommonJS: `require`, `process`, `fs`) |
| `/api/py` | `/api/python` | Python | **strict**: a Python 3 program |
| `/api/rb` | `/api/ruby` | Ruby | **strict**: a Ruby program |
| `/api/sa` | `/api/quantum` | Quantum | **flexible**: Python, JavaScript, C/C++, Java and Ruby syntax may be mixed |

Request body:

```json
{ "code": "name = input()\nprint(f\"hi {name}\")", "stdin": "Ada\n" }
```

| Field | Required | Description |
| --- | --- | --- |
| `code` | yes | The program (at most `MAX_CODE_LENGTH` characters) |
| `stdin` | no | Text fed to the program's standard input (alias: `input`); after it the program reads end-of-file |
| `args` | no | Command-line arguments: up to 32 strings (`sys.argv[1:]`, `process.argv.slice(2)`, `ARGV`, `argv`) |

Response:

```json
{
  "success": true,
  "language": "py",
  "mode": "strict",
  "stage": "run",
  "output": "hi Ada\n",
  "error": null,
  "compileError": null,
  "warnings": null,
  "exitCode": 0,
  "timedOut": false,
  "truncated": false,
  "executionTimeMs": 41
}
```

- `language` is the endpoint's id (`py` for both `/api/py` and `/api/python`).
- `stage` is `"compile"` when the program was rejected (then `compileError`
  holds the diagnostics and nothing ran) and `"run"` otherwise.
- `success` is `true` only when the program compiled, ran to completion within
  `EXEC_TIMEOUT_MS`, and exited with status 0. A non-zero `exitCode` (from
  `return 3;` in `main`, `exit(1)`, `System.exit(2)`, `sys.exit(4)`,
  `process.exit(1)`, an uncaught exception) makes it `false`; `error` then
  carries the program's stderr, such as Python's traceback or node's stack
  trace.
- Messages name the file `main.c`, `main.cpp`, `<PublicClass>.java`,
  `main.js`, `main.py`, `main.rb` or `main.sa`, never a server path.
- Invalid requests get `400` (missing/empty `code`, non-string `stdin`, bad
  `args`) or `413` (too long); other HTTP methods get `405`.

Example: a Python syntax error.

```bash
curl -X POST http://localhost:5000/api/python \
  -H 'Content-Type: application/json' \
  -d '{"code":"if x\n    print(1)\n"}'
```

```json
{
  "success": false,
  "language": "py",
  "stage": "compile",
  "compileError": "  File \"main.py\", line 1\n    if x\n        ^\nSyntaxError: expected ':'",
  "...": "..."
}
```

`GET /api/languages` lists the endpoints:

```json
{
  "success": true,
  "languages": [
    {
      "id": "py",
      "name": "Python",
      "endpoint": "/api/py",
      "aliases": ["/api/python"],
      "extension": ".py",
      "mode": "strict",
      "description": "Standard Python: the code must be valid Python; anything else is a compile error."
    }
  ]
}
```

### `POST /api/execute`

Request body:

```json
{
  "ext": ".cpp",
  "code": "#include <iostream>\nint main() {\n    int a, b;\n    std::cin >> a >> b;\n    std::cout << a + b << std::endl;\n}\n",
  "stdin": "3 4\n"
}
```

`ext` must be one of `.c`, `.cpp`, `.java`, `.js`, `.py`, `.rb`, `.sa`; all but
`.sa` are strict (see above). `code` is the raw source text (capped at
`MAX_CODE_LENGTH`). `stdin` is optional; the program reads it and then gets
end-of-file.

Success:

```json
{
  "success": true,
  "stage": null,
  "strict": true,
  "exitCode": 0,
  "hasWarnings": false,
  "output": "7",
  "error": null,
  "compiledOutput": "7",
  "compilerError": null
}
```

Compile error (the program did not run):

```json
{
  "success": false,
  "stage": "compile",
  "strict": true,
  "exitCode": 1,
  "output": "",
  "error": "script.cpp:5:5: error: expected ';' before 'cout'\n    5 |     cout << x << endl;\n      |     ^~~~",
  "compilerError": "script.cpp:5:5: error: expected ';' before 'cout'\n    5 |     cout << x << endl;\n      |     ^~~~"
}
```

Runtime error (it compiled, then failed): `stage` is `"runtime"`, `output`
holds whatever it printed first, `error` its stderr, and `compilerError` is
`null`. A timeout returns HTTP 504 with `error: "Execution timed out after
…ms."`.

`compiledOutput`/`compilerError` mirror `output`/`error` for older clients.
This endpoint is rate-limited per IP via `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX`.

```bash
curl -X POST https://your-host/api/execute \
  -H 'Content-Type: application/json' \
  -d '{"ext":".cpp","code":"#include <iostream>\nint main(){ std::cout << 42; }"}'
```

### WebSocket (the IDE terminal)

Connect to `ws://host:PORT`. Each connection runs at most one program at a
time, independently of other connections. Messages are JSON:

| Direction | Message |
| --- | --- |
| → | `{ "type": "run", "ext": ".cpp", "payload": "<code>", "name": "main.cpp" }` (starting a run replaces the current one; `name` is used in compiler messages) |
| → | `{ "type": "input", "payload": "Ada\n" }` — written to the program's stdin |
| → | `{ "type": "stop" }` |
| ← | `{ "type": "stdout" \| "stderr", "payload": "..." }` |
| ← | `{ "type": "process_completion", "exitCode": 0, "stage": null }` — `stage` is `"compile"`, `"runtime"` or `null`; `"stopped": true` after a stop |

## Deploying

`qrun.exe` is a Windows binary, but it only imports core system DLLs, so the
included `Dockerfile` runs it under Wine on Linux. That image works on any
Docker host (Render, Railway, Fly.io, a VPS, ...):

```bash
cp ../compiler/build/qrun.exe bin/qrun.exe   # refresh after each compiler build
docker build -t quantum-backend .
docker run -p 5000:5000 -e ALLOWED_ORIGINS=https://your-frontend.example quantum-backend
```

For a platform that builds from the git repo, `bin/qrun.exe` must be
committed. On a Windows host, skip Docker: `npm ci --omit=dev && npm start`
with `QRUN_PATH` pointing at `qrun.exe` and `QRUN_LAUNCHER` empty.

### Language endpoints: `POST /api/c`, `/api/cpp`, `/api/java`, `/api/sa`

Each endpoint compiles and runs one program on the Quantum VM and returns its
output. They are also served without the `/api` prefix (`POST /cpp` is the same
endpoint as `POST /api/cpp`, sharing one rate-limit budget).

| Endpoint | Language | Mode |
| --- | --- | --- |
| `/api/c` | C | **strict**: the code must be valid C (as gcc accepts it) |
| `/api/cpp` | C++ | **strict**: the code must be valid C++ (as g++ accepts it) |
| `/api/java` | Java | **strict**: one compilation unit, as `javac` accepts it |
| `/api/sa` | Quantum | **flexible**: Python, JavaScript, C/C++ and Ruby syntax may be mixed |

In strict mode, programs the real compiler rejects — for example another
language's syntax, an undeclared name, a C library call without its header,
`std::cout` without `<iostream>` or `using namespace std`, assigning a `const`,
using a private member, or `return 5;` in a `void` function — are reported as
compile errors in the real compiler's format (`main.cpp:3:5: error: ...`,
javac's `Main.java:3: error: ...`).

Request body:

```json
{ "code": "#include <iostream>\nint main(){ int x; std::cin >> x; std::cout << x * 2; }", "stdin": "21" }
```

| Field | Required | Description |
| --- | --- | --- |
| `code` | yes | The program (at most `MAX_CODE_LENGTH` characters) |
| `stdin` | no | Text fed to the program's standard input (alias: `input`) |
| `args` | no | Command-line arguments: up to 32 strings |

Response:

```json
{
  "success": true,
  "language": "cpp",
  "mode": "strict",
  "stage": "run",
  "output": "42",
  "error": null,
  "compileError": null,
  "warnings": null,
  "exitCode": 0,
  "timedOut": false,
  "truncated": false,
  "executionTimeMs": 41
}
```

- `stage` is `"compile"` when the program was rejected (then `compileError`
  holds the diagnostics and nothing ran) and `"run"` otherwise.
- `success` is `true` only when the program compiled, ran to completion within
  `EXEC_TIMEOUT_MS`, and exited with status 0. A non-zero `exitCode` (from
  `return 3;` in `main`, `exit(1)`, `System.exit(2)`, an uncaught exception)
  makes it `false`; `error` then carries the program's stderr (for Java, the
  JVM-style stack trace).
- Invalid requests get `400` (missing/empty `code`, non-string `stdin`, bad
  `args`) or `413` (too long); other HTTP methods get `405`.

`GET /api/languages` lists the endpoints:

```json
{
  "success": true,
  "languages": [
    { "id": "cpp", "name": "C++", "endpoint": "/api/cpp", "extension": ".cpp", "mode": "strict", "description": "..." }
  ]
}
```

## Demo mode

If `qrun` hasn't been built yet, the two sample programs shipped in the
frontend IDE (the `SecureServer`/`socket` example and the
`checkSimilarity`/`levenshtein` example) still produce correct output — the
server computes them directly instead of shelling out. Everything else
requires a real `qrun` binary and returns a 500 explaining how to configure
`QRUN_PATH`.

## Security notes

This endpoint executes arbitrary submitted code via `execFile`. Current
mitigations: per-request execution timeout, output size cap, request body
size cap, source length cap, and IP-based rate limiting. There is **no**
process sandboxing (no container, no seccomp, no resource/network isolation)
beyond what `qrun` itself does — do not expose this service to the public
internet without adding one (e.g. run `qrun` inside a locked-down container
or VM with no network access and a CPU/memory ceiling).
