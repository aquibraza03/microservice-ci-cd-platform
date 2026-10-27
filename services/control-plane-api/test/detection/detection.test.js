const { expect } = require("chai");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { detectRepository } = require("../../src/detection/engine");
const SHA = "a".repeat(40);
async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "detect-test-"));
  for (const [name, value] of Object.entries(files)) {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, value);
  }
  return root;
}
describe("secure deterministic service detection", () => {
  let roots = [];
  afterEach(async () => {
    await Promise.all(
      roots.map((r) => fs.rm(r, { recursive: true, force: true })),
    );
    roots = [];
  });
  const make = async (f) => {
    const r = await fixture(f);
    roots.push(r);
    return r;
  };
  it("uses service.yml before Dockerfile and package metadata with field evidence", async () => {
    const root = await make({
      "service.yml":
        "service:\n  name: api\n  dockerfile: Dockerfile\n  context: .\n  port: 8080\n  healthPath: /health\n  readinessPath: /ready\n",
      Dockerfile: "FROM scratch",
      "package.json": JSON.stringify({
        name: "other",
        scripts: { start: "node index.js" },
      }),
      "index.js": "console.log(process.env.API_URL, 'secret-value')",
    });
    const r = await detectRepository({
      root,
      repositoryId: "repo1",
      commitSha: SHA,
    });
    expect(r.schemaVersion).eq("1");
    expect(r.candidates).length(1);
    expect(r.candidates[0].serviceName.value).eq("api");
    expect(r.candidates[0].serviceName.confidence).eq("high");
    expect(r.candidates[0].conflicts).length(1);
    expect(JSON.stringify(r)).not.contain("secret-value");
    expect(r.candidates[0].environmentVariableNames.value).deep.eq(["API_URL"]);
  });
  it("detects Dockerfile-only and Node services conservatively", async () => {
    const root = await make({
      Dockerfile: "FROM scratch",
      "web/package.json": JSON.stringify({
        name: "web",
        scripts: {
          build: "next build",
          test: "node --test",
          start: "next start",
        },
        dependencies: { next: "15.5.24" },
      }),
    });
    const r = await detectRepository({
      root,
      repositoryId: "repo1",
      commitSha: SHA,
    });
    expect(r.candidates).length(2);
    expect(
      r.candidates.find((c) => c.serviceRoot.value === "web").framework.value,
    ).eq("nextjs");
    expect(
      r.candidates.find((c) => c.serviceRoot.value === ".").runtime.value,
    ).eq("container");
  });
  it("finds multiple monorepo candidates with stable IDs", async () => {
    const files = {
      "apps/a/Dockerfile": "FROM scratch",
      "apps/a/package.json": '{"name":"a"}',
      "apps/b/Dockerfile": "FROM scratch",
      "apps/b/package.json": '{"name":"b"}',
    };
    const root = await make(files);
    const one = await detectRepository({
      root,
      repositoryId: "repo1",
      commitSha: SHA,
    });
    const two = await detectRepository({
      root,
      repositoryId: "repo1",
      commitSha: SHA,
    });
    expect(one.candidates).length(2);
    expect(one.candidates.map((c) => c.id)).deep.eq(
      two.candidates.map((c) => c.id),
    );
  });
  it("returns an unsupported-project warning", async () => {
    const root = await make({ "README.md": "nothing" });
    const r = await detectRepository({
      root,
      repositoryId: "repo1",
      commitSha: SHA,
    });
    expect(r.candidates).length(0);
    expect(r.warnings[0].code).eq("UNSUPPORTED_PROJECT");
  });
  it("rejects traversal input, symlinks, file-count, oversized-file and timeout", async () => {
    const traversal = await make({ Dockerfile: "FROM scratch" });
    let error;
    try {
      await detectRepository({
        root: traversal,
        repositoryId: "repo1",
        commitSha: "../bad",
      });
    } catch (e) {
      error = e;
    }
    expect(error.code).eq("DETECTION_INPUT_INVALID");
    const symlink = await make({ Dockerfile: "FROM scratch" });
    await fs.symlink("/etc/passwd", path.join(symlink, "escape"));
    try {
      await detectRepository({
        root: symlink,
        repositoryId: "repo1",
        commitSha: SHA,
      });
    } catch (e) {
      error = e;
    }
    expect(error.code).eq("DETECTION_SYMLINK_REJECTED");
    const many = await make({ Dockerfile: "FROM scratch", x: "x" });
    try {
      await detectRepository({
        root: many,
        repositoryId: "repo1",
        commitSha: SHA,
        limits: { maxFiles: 1 },
      });
    } catch (e) {
      error = e;
    }
    expect(error.code).eq("REPOSITORY_FILE_COUNT_EXCESSIVE");
    const large = await make({ "package.json": "x".repeat(20) });
    try {
      await detectRepository({
        root: large,
        repositoryId: "repo1",
        commitSha: SHA,
        limits: { maxFileBytes: 10 },
      });
    } catch (e) {
      error = e;
    }
    expect(error.code).eq("DETECTION_FILE_TOO_LARGE");
    try {
      await detectRepository({
        root: traversal,
        repositoryId: "repo1",
        commitSha: SHA,
        limits: { timeoutMs: -1 },
      });
    } catch (e) {
      error = e;
    }
    expect(error.code).eq("DETECTION_TIMEOUT");
  });
  it("never reads .env values", async () => {
    const root = await make({
      Dockerfile: "FROM scratch",
      ".env": "TOKEN=super-secret-value",
    });
    const r = await detectRepository({
      root,
      repositoryId: "repo1",
      commitSha: SHA,
    });
    expect(JSON.stringify(r)).not.contain("super-secret-value");
  });
});
