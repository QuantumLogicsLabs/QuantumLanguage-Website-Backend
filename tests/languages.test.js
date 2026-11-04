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
    expect(Object.keys(byId).sort()).toEqual(["c", "cpp", "java", "sa"]);
    expect(byId.c.mode).toBe("strict");
    expect(byId.cpp.mode).toBe("strict");
    expect(byId.java.mode).toBe("strict");
    expect(byId.sa.mode).toBe("flexible");
    expect(byId.cpp.endpoint).toBe("/api/cpp");
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

engine("POST /api/sa", () => {
  it("accepts mixed syntax", async () => {
    const code = 'print("python style")\nconsole.log("js style")\nlet x = 2\nif x > 1:\n    print("indent block")';
    const res = await request(app).post("/api/sa").send({ code });
    expect(res.body).toMatchObject({
      success: true,
      mode: "flexible",
      output: "python style\njs style\nindent block\n",
    });
  });
});
