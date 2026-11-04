const request = require("supertest");
const app = require("../src/app");
const { resolveQrunPath, splitStages, buildCommand, STAGE_MARKER } = require("../src/services/qrun.service");

const run = (ext, code, stdin) =>
  request(app).post("/api/execute").send(stdin === undefined ? { ext, code } : { ext, code, stdin });

describe("buildCommand", () => {
  it("passes --strict for C and C++", () => {
    expect(buildCommand("qrun", ".cpp", "f.cpp").args).toContain("--strict");
    expect(buildCommand("qrun", ".c", "f.c").args).toContain("--strict");
  });

  it("passes --strict for Java, JavaScript, Python and Ruby", () => {
    for (const ext of [".java", ".js", ".py", ".rb"]) {
      expect(buildCommand("qrun", ext, `f${ext}`).args).toContain("--strict");
    }
  });

  it("leaves .sa lenient", () => {
    expect(buildCommand("qrun", ".sa", "f.sa").args).not.toContain("--strict");
  });
});

describe("splitStages", () => {
  it("treats stderr without the marker as compiler output", () => {
    const s = splitStages("main.cpp:1:1: error: boom\n");
    expect(s.compiled).toBe(false);
    expect(s.compileLog).toContain("error: boom");
  });

  it("separates runtime stderr after the marker", () => {
    const s = splitStages(`${STAGE_MARKER}\nwhat(): boom\n`);
    expect(s.compiled).toBe(true);
    expect(s.compileLog).toBe("");
    expect(s.runtimeError).toBe("what(): boom\n");
  });
});

const describeWithQrun = resolveQrunPath() ? describe : describe.skip;

describeWithQrun("POST /api/execute — strict C++", () => {
  it("runs valid C++ and returns its output", async () => {
    const res = await run(
      ".cpp",
      '#include <iostream>\nusing namespace std;\nint main() {\n    int x = 5;\n    cout << "x = " << x * 2 << endl;\n    return 0;\n}\n'
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stage).toBeNull();
    expect(res.body.output).toBe("x = 10");
  });

  it("rejects a missing semicolon with a gcc-style error", async () => {
    const res = await run(
      ".cpp",
      "#include <iostream>\nusing namespace std;\nint main() {\n    int x = 5\n    cout << x << endl;\n}\n"
    );
    expect(res.body.success).toBe(false);
    expect(res.body.stage).toBe("compile");
    expect(res.body.error).toMatch(/script\.cpp:5:5: error: expected ';' before 'cout'/);
    expect(res.body.output).toBe("");
  });

  it("rejects Python-style code in a .cpp file", async () => {
    const res = await run(".cpp", 'print("hello")\n');
    expect(res.body.success).toBe(false);
    expect(res.body.stage).toBe("compile");
  });

  it("rejects JavaScript-style code in a .cpp file", async () => {
    const res = await run(".cpp", "int main() {\n    let y = 3;\n    console.log(y);\n}\n");
    expect(res.body.success).toBe(false);
    expect(res.body.stage).toBe("compile");
  });

  it("rejects cout without std:: or using namespace std", async () => {
    const res = await run(".cpp", '#include <iostream>\nint main() {\n    cout << "hi";\n}\n');
    expect(res.body.stage).toBe("compile");
    expect(res.body.error).toMatch(/'cout' was not declared in this scope/);
  });

  it("rejects undeclared identifiers", async () => {
    const res = await run(".cpp", "#include <iostream>\nint main() {\n    std::cout << z;\n}\n");
    expect(res.body.stage).toBe("compile");
    expect(res.body.error).toMatch(/'z' was not declared/);
  });

  it("reports runtime failures separately from compile errors", async () => {
    const res = await run(
      ".cpp",
      '#include <iostream>\n#include <stdexcept>\nint main() {\n    std::cout << "before" << std::endl;\n    throw std::runtime_error("boom");\n}\n'
    );
    expect(res.body.success).toBe(false);
    expect(res.body.stage).toBe("runtime");
    expect(res.body.output).toBe("before");
    expect(res.body.error).toMatch(/boom/);
    expect(res.body.compilerError).toBeNull();
  });

  it("feeds stdin to the program", async () => {
    const res = await run(
      ".cpp",
      "#include <iostream>\nint main() {\n    int a, b;\n    std::cin >> a >> b;\n    std::cout << a + b << std::endl;\n}\n",
      "3 4\n"
    );
    expect(res.body.success).toBe(true);
    expect(res.body.output).toBe("7");
  });

  it("never serves the .sa demo samples for C++", async () => {
    const res = await run(".cpp", "SecureServer(8080)\nsocket()\nlisten(8080)");
    expect(res.body.success).toBe(false);
    expect(res.body.output).not.toMatch(/listening/i);
  });
});

describeWithQrun("POST /api/execute — strict JavaScript, Python, Ruby and Java", () => {
  it("rejects another language's syntax in .js, .py and .rb", async () => {
    for (const [ext, code] of [
      [".js", 'print("hello")\nif x > 1:\n    print(2)\n'],
      [".py", "let x = 5;\nconsole.log(x);\n"],
      [".rb", "for (let i = 0; i < 3; i++) {\n  console.log(i);\n}\n"],
    ]) {
      const res = await run(ext, code);
      expect(res.body).toMatchObject({ success: false, stage: "compile", strict: true });
    }
  });

  it("names a JavaScript error's file without the server's folders", async () => {
    const res = await run(".js", "let x = ;\n");
    expect(res.body.stage).toBe("compile");
    expect(res.body.error).toMatch(/^script\.js:1\n/);
  });

  it("runs Java", async () => {
    const res = await run(".java", 'public class Main { public static void main(String[] a) { System.out.println("hi"); } }');
    expect(res.body).toMatchObject({ success: true, strict: true, output: "hi" });
  });
});

describeWithQrun("POST /api/execute — .sa stays reflexive", () => {
  it("accepts Python, JavaScript and C++ syntax mixed in one file", async () => {
    const res = await run(".sa", 'print("py")\nconsole.log("js")\nint x = 5;\ncout << x << endl;\n');
    expect(res.body.success).toBe(true);
    expect(res.body.output.split(/\r?\n/)).toEqual(["py", "js", "5"]);
  });

  it("still reports real .sa parse errors", async () => {
    const res = await run(".sa", "let x = ;\n");
    expect(res.body.success).toBe(false);
    expect(res.body.stage).toBe("compile");
    expect(res.body.error).toMatch(/Unexpected token/);
  });
});
