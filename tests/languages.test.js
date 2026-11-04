// POST /api/<language>: compiles and runs a program on the Quantum VM.
// These run the real engine (qrun); they are skipped when it isn't built.
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || "1000";

const request = require("supertest");
const app = require("../src/app");
const { resolveQrunPath } = require("../src/services/qrun.service");

const haveEngine = Boolean(resolveQrunPath());
const engine = haveEngine ? describe : describe.skip;

describe("GET /api/languages", () => {
  it("lists every endpoint with its mode", async () => {
    const res = await request(app).get("/api/languages");
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.languages.map((l) => [l.id, l]));
    expect(Object.keys(byId).sort()).toEqual(["c", "cpp", "css", "html", "java", "js", "py", "rb", "sa"]);
    for (const id of ["c", "cpp", "css", "html", "java", "js", "py", "rb"]) expect(byId[id].mode).toBe("strict");
    expect(byId.sa.mode).toBe("flexible");
    expect(byId.cpp.endpoint).toBe("/api/cpp");
    expect(byId.py.aliases).toEqual(["/api/python"]);
    expect(byId.js.aliases).toEqual(["/api/javascript"]);
    expect(byId.rb.aliases).toEqual(["/api/ruby"]);
    expect(byId.sa.aliases).toEqual(["/api/quantum"]);
  });
});

describe("POST /api/<language> — validation", () => {
  it("rejects a missing code field", async () => {
    const res = await request(app).post("/api/c").send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, language: "c" });
  });

  it("rejects non-string stdin", async () => {
    const res = await request(app).post("/api/cpp").send({ code: "int main(){}", stdin: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stdin/);
  });

  it("rejects bad args", async () => {
    const res = await request(app).post("/api/sa").send({ code: "print(1)", args: [1, 2] });
    expect(res.status).toBe(400);
  });

  it("answers other methods with 405 and an Allow header", async () => {
    const res = await request(app).get("/api/java");
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("POST");
  });

  it("rejects a non-string css field", async () => {
    const res = await request(app).post("/api/html").send({ code: "<p>x</p>", css: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/css/);
  });

  it("validates on alias endpoints too", async () => {
    const res = await request(app).post("/api/python").send({ code: "   " });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, language: "py" });
    expect((await request(app).get("/api/ruby")).status).toBe(405);
  });
});

engine("POST /api/c", () => {
  it("runs a C program", async () => {
    const res = await request(app)
      .post("/api/c")
      .send({ code: '#include <stdio.h>\nint main(void) { printf("%d\\n", 6 * 7); return 0; }' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, language: "c", mode: "strict", stage: "run", output: "42\n" });
  });

  it("reports compile errors the way gcc does", async () => {
    const res = await request(app).post("/api/c").send({ code: "int main(void) { return y; }" });
    expect(res.body.success).toBe(false);
    expect(res.body.stage).toBe("compile");
    expect(res.body.compileError).toMatch(/'y' undeclared/);
  });

  it("modifies strings through char pointers", async () => {
    const code = [
      "#include <stdio.h>",
      "#include <string.h>",
      "static void rev(char *s) { for (int i = 0, j = (int)strlen(s) - 1; i < j; i++, j--) { char t = s[i]; s[i] = s[j]; s[j] = t; } }",
      'int main(void) { char b[16] = "quantum"; rev(b); puts(b); return 0; }',
    ].join("\n");
    const res = await request(app).post("/api/c").send({ code });
    expect(res.body.output).toBe("mutnauq\n");
  });

  it("reads stdin with scanf", async () => {
    const code = '#include <stdio.h>\nint main(void) { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", a + b); return 0; }';
    const res = await request(app).post("/api/c").send({ code, stdin: "19 23\n" });
    expect(res.body.output).toBe("42\n");
  });
});

engine("POST /api/cpp", () => {
  it("runs C++ with stdin and reports the exit code", async () => {
    const code =
      '#include <iostream>\n#include <string>\nint main() { std::string s; std::cin >> s; std::cout << "hi " << s << std::endl; return 3; }';
    const res = await request(app).post("/api/cpp").send({ code, stdin: "Ada" });
    expect(res.body).toMatchObject({ success: false, stage: "run", output: "hi Ada\n", exitCode: 3 });
  });

  it("is also served at the root alias", async () => {
    const res = await request(app)
      .post("/cpp")
      .send({ code: "#include <iostream>\nint main() { std::cout << 1 + 1; }" });
    expect(res.body).toMatchObject({ success: true, output: "2" });
  });

  it("rejects other languages' syntax", async () => {
    const res = await request(app).post("/api/cpp").send({ code: 'print("not C++")' });
    expect(res.body.stage).toBe("compile");
    expect(res.body.success).toBe(false);
  });

  it("rejects what g++ rejects", async () => {
    const programs = [
      "int main() { const int n = 1; n = 2; }",
      "#include <iostream>\nint main() { cout << 1; }",
      "class B { int s = 1; };\nint main() { B b; return b.s; }",
      "void f() { return 5; }\nint main() { f(); }",
    ];
    for (const code of programs) {
      const res = await request(app).post("/api/cpp").send({ code });
      expect(res.body.stage).toBe("compile");
    }
  });

  it("keeps 64-bit integers exact", async () => {
    const code =
      "#include <iostream>\n#include <climits>\nint main() { long long f = 1; for (int i = 1; i <= 20; i++) f *= i; std::cout << f << ' ' << LLONG_MAX; }";
    const res = await request(app).post("/api/cpp").send({ code });
    expect(res.body.output).toBe("2432902008176640000 9223372036854775807");
  });

  it("runs destructors when objects go out of scope", async () => {
    const code = [
      "#include <iostream>",
      'struct T { const char *n; T(const char *s) : n(s) { std::cout << "+" << n; } ~T() { std::cout << "-" << n; } };',
      'int main() { T a("a"); { T b("b"); } T c("c"); }',
    ].join("\n");
    const res = await request(app).post("/api/cpp").send({ code });
    expect(res.body.output).toBe("+a+b-b+c-c-a");
  });
});

engine("POST /api/java", () => {
  it("runs a Java program", async () => {
    const code = 'public class Main { public static void main(String[] a) { System.out.println("sum=" + (40 + 2)); } }';
    const res = await request(app).post("/api/java").send({ code });
    expect(res.body).toMatchObject({ success: true, language: "java", output: "sum=42\n" });
  });

  it("reports javac-style compile errors", async () => {
    const code = "public class Main { public static void main(String[] a) { int x = 1 } }";
    const res = await request(app).post("/api/java").send({ code });
    expect(res.body.stage).toBe("compile");
    expect(res.body.compileError).toMatch(/error: ';' expected/);
  });

  it("reports an uncaught exception like the JVM", async () => {
    const code = "public class Main { public static void main(String[] a) { int[] v = new int[2]; v[5] = 1; } }";
    const res = await request(app).post("/api/java").send({ code });
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/ArrayIndexOutOfBoundsException/);
  });
});

engine("POST /api/js", () => {
  it("runs JavaScript the way node prints it", async () => {
    const code = "const a = [1, 2, 3];\nconsole.log(a.map((x) => x * 2), { a: 1 });\nconsole.log(`t=${typeof null}`);";
    const res = await request(app).post("/api/js").send({ code });
    expect(res.body).toMatchObject({
      success: true,
      language: "js",
      mode: "strict",
      stage: "run",
      output: "[ 2, 4, 6 ] { a: 1 }\nt=object\n",
    });
  });

  it("is also served as /api/javascript and /javascript", async () => {
    for (const url of ["/api/javascript", "/javascript"]) {
      const res = await request(app).post(url).send({ code: "console.log(6 * 7)" });
      expect(res.body).toMatchObject({ success: true, language: "js", output: "42\n" });
    }
  });

  it("reads stdin", async () => {
    const code = 'const lines = require("fs").readFileSync(0, "utf8").trim().split("\\n");\nconsole.log(lines.map(Number).reduce((a, b) => a + b));';
    const res = await request(app).post("/api/js").send({ code, stdin: "19\n23\n" });
    expect(res.body.output).toBe("42\n");
  });

  it("passes args as process.argv", async () => {
    const res = await request(app).post("/api/js").send({ code: "console.log(process.argv.slice(2));", args: ["x", "y z"] });
    expect(res.body.output).toBe("[ 'x', 'y z' ]\n");
  });

  it("reports syntax errors at compile time, like node, without server paths", async () => {
    const res = await request(app).post("/api/js").send({ code: "let x = ;\n" });
    expect(res.body).toMatchObject({ success: false, stage: "compile", output: "" });
    expect(res.body.compileError).toBe("main.js:1\nlet x = ;\n        ^\n\nSyntaxError: Unexpected token ';'\n\nNode.js v20.20.2");
  });

  it("rejects other languages' syntax", async () => {
    const res = await request(app).post("/api/js").send({ code: 'print("hello")\nif x > 1:\n    print(2)\n' });
    expect(res.body.stage).toBe("compile");
    expect(res.body.compileError).toMatch(/SyntaxError: Unexpected identifier 'x'/);
  });

  it("reports an uncaught exception the way node does", async () => {
    const res = await request(app).post("/api/js").send({ code: "console.log('before');\nnull.foo;\n" });
    expect(res.body).toMatchObject({ success: false, stage: "run", output: "before\n", exitCode: 1 });
    expect(res.body.error).toMatch(/^TypeError: Cannot read properties of null \(reading 'foo'\)/);
    expect(res.body.error).toMatch(/\(main\.js:2:6\)/);
    expect(res.body.error).not.toMatch(/run_[0-9a-f]+/);
  });
});

engine("POST /api/py", () => {
  it("runs Python with stdin", async () => {
    const code = 'x = [1, 2, 3]\nprint(x, None, True)\nprint(sum(i * i for i in x))\nname = input()\nprint(f"hi {name}")\n';
    const res = await request(app).post("/api/py").send({ code, stdin: "Ada\n" });
    expect(res.body).toMatchObject({
      success: true,
      language: "py",
      mode: "strict",
      output: "[1, 2, 3] None True\n14\nhi Ada\n",
    });
  });

  it("is also served as /api/python", async () => {
    const res = await request(app).post("/api/python").send({ code: "print(6 * 7)" });
    expect(res.body).toMatchObject({ success: true, language: "py", output: "42\n" });
  });

  it("reads stdin through sys.stdin", async () => {
    const code = [
      "import sys",
      "n = int(sys.stdin.readline())",
      "rest = [int(line) for line in sys.stdin]",
      "print(n, sum(rest))",
    ].join("\n");
    const res = await request(app).post("/api/python").send({ code, stdin: "3\n10\n20\n12" });
    expect(res.body).toMatchObject({ success: true, output: "3 42\n" });
  });

  it("passes args as sys.argv", async () => {
    const res = await request(app).post("/api/python").send({ code: "import sys\nprint(sys.argv)", args: ["x", "y z"] });
    expect(res.body.output).toBe("['main.py', 'x', 'y z']\n");
  });

  it("raises EOFError when input() runs out, like python", async () => {
    const res = await request(app).post("/api/python").send({ code: "print(input())\nprint(input())\n", stdin: "only\n" });
    expect(res.body).toMatchObject({ success: false, stage: "run", output: "only\n" });
    expect(res.body.error).toMatch(/EOFError: EOF when reading a line\n$/);
  });

  it("reports syntax errors at compile time, like python", async () => {
    const res = await request(app).post("/api/python").send({ code: "if x\n    print(1)\n" });
    expect(res.body).toMatchObject({ success: false, stage: "compile" });
    expect(res.body.compileError).toMatch(/^ {2}File "main\.py", line 1\n {4}if x\n/);
    expect(res.body.compileError).toMatch(/SyntaxError: /);
  });

  it("reports indentation errors as IndentationError", async () => {
    const res = await request(app).post("/api/python").send({ code: "def f():\nreturn 1\n" });
    expect(res.body.stage).toBe("compile");
    expect(res.body.compileError).toMatch(/IndentationError: expected an indented block/);
  });

  it("rejects other languages' syntax", async () => {
    const res = await request(app).post("/api/python").send({ code: "let x = 5;\nconsole.log(x);\n" });
    expect(res.body.stage).toBe("compile");
    expect(res.body.compileError).toMatch(/SyntaxError/);
  });

  it("reports an uncaught exception with only python's traceback", async () => {
    const res = await request(app).post("/api/python").send({ code: 'print("before")\nprint(1 / 0)\n' });
    expect(res.body).toMatchObject({ success: false, stage: "run", output: "before\n", exitCode: 1 });
    expect(res.body.error).toBe('Traceback (most recent call last):\n  File "main.py", line 2\nZeroDivisionError: division by zero\n');
  });

  it("passes sys.exit's status through", async () => {
    const res = await request(app).post("/api/python").send({ code: "import sys\nprint('bye')\nsys.exit(4)\n" });
    expect(res.body).toMatchObject({ success: false, stage: "run", output: "bye\n", exitCode: 4, error: null });
  });
});

engine("POST /api/rb", () => {
  it("runs Ruby", async () => {
    const code = 'a = [1, 2, 3]\nputs a.map { |x| x * 2 }.inspect\np({a: 1})\nputs "x=#{a.sum}"\n';
    const res = await request(app).post("/api/rb").send({ code });
    expect(res.body).toMatchObject({
      success: true,
      language: "rb",
      mode: "strict",
      output: "[2, 4, 6]\n{a: 1}\nx=6\n",
    });
  });

  it("is also served as /api/ruby, and reads stdin", async () => {
    const res = await request(app).post("/api/ruby").send({ code: "n = gets.to_i\nputs n * 2\n", stdin: "21\n" });
    expect(res.body).toMatchObject({ success: true, language: "rb", output: "42\n" });
  });

  it("passes args as ARGV", async () => {
    const res = await request(app).post("/api/ruby").send({ code: "p ARGV\nputs $0", args: ["x", "y z"] });
    expect(res.body.output).toBe('["x", "y z"]\nmain.rb\n');
  });

  it("reports syntax errors at compile time, like ruby", async () => {
    const res = await request(app).post("/api/ruby").send({ code: "puts(1 +)\n" });
    expect(res.body).toMatchObject({ success: false, stage: "compile" });
    expect(res.body.compileError).toBe("main.rb:1: syntax error, unexpected ')' (SyntaxError)\nputs(1 +)");
  });

  it("rejects other languages' syntax", async () => {
    const res = await request(app)
      .post("/api/ruby")
      .send({ code: "for (let i = 0; i < 3; i++) {\n  console.log(i);\n}\n" });
    expect(res.body.stage).toBe("compile");
    expect(res.body.compileError).toMatch(/^main\.rb:1: syntax error, .* \(SyntaxError\)/);
  });

  it("reports an uncaught exception the way ruby does", async () => {
    const res = await request(app).post("/api/ruby").send({ code: 'puts "before"\nraise ArgumentError, "boom"\n' });
    expect(res.body).toMatchObject({ success: false, stage: "run", output: "before\n", exitCode: 1 });
    expect(res.body.error).toBe("main.rb:2:in '<main>': boom (ArgumentError)\n");
  });
});

const page = (body) =>
  `<!DOCTYPE html>\n<html lang="en">\n<head><title>T</title></head>\n<body>${body}</body>\n</html>\n`;

engine("POST /api/html", () => {
  it("compiles a page to the document a browser builds", async () => {
    const res = await request(app)
      .post("/api/html")
      .send({ code: page("<p>One<p>Two &amp; &copy;<ul><li>a<li>b</ul>") });
    expect(res.body).toMatchObject({ success: true, language: "html", mode: "strict", stage: "run" });
    expect(res.body.output).toBe(
      // whitespace after </body> and </html> belongs to the body, as in a browser
      '<!DOCTYPE html>\n<html lang="en"><head><title>T</title></head>\n<body><p>One</p><p>Two &amp; ©</p><ul><li>a</li><li>b</li></ul>\n\n</body></html>\n'
    );
  });

  it("applies the css field as style.css, and reports its problems under that name", async () => {
    const ok = await request(app).post("/api/html").send({ code: page('<p class="x">Hi</p>'), css: ".x { color: tomato; }" });
    expect(ok.body.success).toBe(true);
    expect(ok.body.output).toContain("<style>.x { color: tomato; }</style></head>");

    const bad = await request(app).post("/api/html").send({ code: page("<p>Hi</p>"), css: ".x { colr: tomato; }" });
    expect(bad.body).toMatchObject({ success: false, stage: "compile" });
    expect(bad.body.compileError).toMatch(/^style\.css:1:6: error: Unknown property "colr"\. Did you mean "color"\?/);
  });

  it("inlines a linked stylesheet", async () => {
    const code = page("<h1>Hi</h1>").replace("</head>", '<link rel="stylesheet" href="style.css"></head>');
    const res = await request(app).post("/api/html").send({ code, css: "h1 { margin: 0; }" });
    expect(res.body.success).toBe(true);
    expect(res.body.output).toContain("<style>h1 { margin: 0; }</style>");
    expect(res.body.output).not.toContain("<link");
  });

  it("reports what a validator reports", async () => {
    const res = await request(app).post("/api/html").send({ code: page("<div><span>text</div>\n<foo>x</foo>") });
    expect(res.body).toMatchObject({ success: false, stage: "compile" });
    expect(res.body.compileError).toMatch(/index\.html:4:12: error: Unclosed element "span"\./);
    expect(res.body.compileError).toMatch(/error: End tag "div" seen, but there were open elements\./);
    expect(res.body.compileError).toMatch(/error: Unknown element "foo"\./);
  });

  it("checks CSS inside the page", async () => {
    const code = page('<p style="width: 10">x</p>').replace("</head>", "<style>h1 { display: flexx; }</style></head>");
    const res = await request(app).post("/api/html").send({ code });
    expect(res.body.compileError).toMatch(/index\.html:3:44: error: "flexx" is not a valid value for "display"\. Did you mean "flex"\?/);
    expect(res.body.compileError).toMatch(/error: "10" needs a unit, like "10px"\./);
  });

  it("compiles a fragment, with only a warning about the doctype", async () => {
    const res = await request(app).post("/api/html").send({ code: "<h1>Hi</h1>" });
    expect(res.body).toMatchObject({ success: true, output: "<html><head></head><body><h1>Hi</h1></body></html>\n" });
    expect(res.body.warnings).toMatch(/warning: Start tag seen without seeing a doctype first/);
  });
});

engine("POST /api/css", () => {
  it("compiles a stylesheet to the rules a browser keeps", async () => {
    const res = await request(app)
      .post("/api/css")
      .send({ code: "/* site */\nbody{margin:0;color:#333}\n@media (max-width: 600px){ .card{padding:8px 16px} }" });
    expect(res.body).toMatchObject({ success: true, language: "css", mode: "strict" });
    expect(res.body.output).toBe(
      "body {\n  margin: 0;\n  color: #333;\n}\n\n@media (max-width: 600px) {\n  .card {\n    padding: 8px 16px;\n  }\n}\n"
    );
  });

  it("reports what a validator reports", async () => {
    const res = await request(app).post("/api/css").send({ code: "h1 { colr: red; font-size: 20 }\n.x { color: bleu }" });
    expect(res.body).toMatchObject({ success: false, stage: "compile" });
    expect(res.body.compileError).toMatch(/style\.css:1:6: error: Unknown property "colr"\. Did you mean "color"\?/);
    expect(res.body.compileError).toMatch(/style\.css:1:28: error: "20" needs a unit, like "20px"\./);
    expect(res.body.compileError).toMatch(/style\.css:2:13: error: "bleu" is not a valid color\. Did you mean "blue"\?/);
  });

  it("rejects other languages' syntax", async () => {
    const res = await request(app).post("/api/css").send({ code: 'print("hello")\n' });
    expect(res.body.stage).toBe("compile");
    expect(res.body.compileError).toMatch(/error: Expected "\{" after the selector\./);
  });
});

engine("POST /api/sa", () => {
  it("compiles a page written in a .sa file", async () => {
    const res = await request(app).post("/api/sa").send({ code: page("<h1>Hi</h1>") });
    expect(res.body).toMatchObject({ success: true, language: "sa", mode: "flexible" });
    expect(res.body.output).toContain("<h1>Hi</h1>");
  });

  it("compiles a stylesheet written in a .sa file", async () => {
    const res = await request(app).post("/api/quantum").send({ code: ".btn { padding: 8px }" });
    expect(res.body).toMatchObject({ success: true, output: ".btn {\n  padding: 8px;\n}\n" });
  });

  it("writes a .sa page with mistakes, warning about them", async () => {
    const res = await request(app).post("/api/sa").send({ code: page("<div>open") });
    expect(res.body).toMatchObject({ success: true, stage: "run" });
    expect(res.body.warnings).toMatch(/error: Unclosed element "div"\./);
    expect(res.body.output).toContain("<div>open</div>");
  });
});

engine("POST /api/sa — programs", () => {
  it("accepts mixed syntax", async () => {
    const code = 'print("python style")\nconsole.log("js style")\nlet x = 2\nif x > 1:\n    print("indent block")';
    const res = await request(app).post("/api/sa").send({ code });
    expect(res.body).toMatchObject({
      success: true,
      mode: "flexible",
      output: "python style\njs style\nindent block\n",
    });
  });

  it("is also served as /api/quantum", async () => {
    const res = await request(app).post("/api/quantum").send({ code: 'puts "ruby style"\nconsole.log(1 + 1)' });
    expect(res.body).toMatchObject({ success: true, language: "sa", output: "ruby style\n2\n" });
  });
});
