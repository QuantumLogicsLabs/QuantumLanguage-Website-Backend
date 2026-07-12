const request = require("supertest");
const app = require("../src/app");

describe("GET /api/health", () => {
  it("returns ok status and reports environment", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body).toHaveProperty("qrunAvailable");
    expect(res.body).toHaveProperty("environment");
  });
});

describe("POST /api/execute — validation", () => {
  it("rejects missing fields with 400", async () => {
    const res = await request(app).post("/api/execute").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Missing required fields/i);
  });

  it("rejects non-string code with 400", async () => {
    const res = await request(app)
      .post("/api/execute")
      .send({ ext: ".sa", code: 123 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects oversized code with 413", async () => {
    const bigCode = "x".repeat(20001);
    const res = await request(app)
      .post("/api/execute")
      .send({ ext: ".sa", code: bigCode });
    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
  });

  it("rejects unsupported extension with 400", async () => {
    const res = await request(app)
      .post("/api/execute")
      .send({ ext: ".txt", code: "print(1)" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported file type/i);
  });
});

describe("POST /api/execute — demo samples (no qrun needed)", () => {
  it("computes the SecureServer socket sample", async () => {
    const code = "SecureServer(8080)\nsocket()\nlisten(8080)";
    const res = await request(app)
      .post("/api/execute")
      .send({ ext: ".sa", code });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.output).toMatch(/listening on port 8080/i);
  });

  it("computes the levenshtein similarity sample", async () => {
    const code = 'levenshtein("kitten", "sitting")\ncheckSimilarity("kitten", "sitting")';
    const res = await request(app)
      .post("/api/execute")
      .send({ ext: ".sa", code });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.output).toMatch(/Similarity:/i);
  });
});
