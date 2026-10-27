const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { ControlPlaneError } = require("../errors");
function run(
  command,
  args,
  { cwd, env, stdin, timeoutMs = 300000, onOutput = () => {}, signal } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: cwd || process.cwd(),
        GIT_TERMINAL_PROMPT: "0",
        ...env,
      },
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let settled = false,
      stdout = "",
      stderr = "";
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(
        new ControlPlaneError(
          408,
          "WORKER_TIMEOUT",
          "Worker command timed out",
        ),
      );
    }, timeoutMs);
    const collect = (target) => (chunk) => {
      const value = chunk.toString();
      if (target === "stdout") stdout += value;
      else stderr += value;
      onOutput(value);
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    const abort = () => {
      child.kill("SIGTERM");
      finish(new ControlPlaneError(499, "BUILD_CANCELLED", "Build cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    child.on("error", (error) => finish(error));
    child.on("close", (code) =>
      code === 0
        ? finish(null, { stdout, stderr, code })
        : finish(
            new ControlPlaneError(
              422,
              "STAGE_COMMAND_FAILED",
              `Command exited with code ${code}`,
            ),
          ),
    );
    if (stdin !== undefined) {
      child.stdin.end(stdin);
    }
  });
}
async function createWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "platform-build-"));
}
async function verifyTree(root, maxBytes) {
  let total = 0;
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name),
        relative = path.relative(root, target);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new ControlPlaneError(
          400,
          "WORKSPACE_ESCAPE",
          "Repository path escapes workspace",
        );
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink()) {
        const resolved = await fs.realpath(target);
        if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`))
          throw new ControlPlaneError(
            400,
            "SYMLINK_ESCAPE",
            "Repository symlink escapes workspace",
          );
      } else if (stat.isDirectory()) await walk(target);
      else total += stat.size;
      if (total > maxBytes)
        throw new ControlPlaneError(
          413,
          "REPOSITORY_TOO_LARGE",
          "Repository exceeds worker size limit",
        );
    }
  }
  await walk(root);
  return total;
}
async function checkout({
  workspace,
  repositoryUrl,
  commitSha,
  token,
  maxBytes = 536870912,
  submodules = "forbid",
  runImpl = run,
  onOutput,
  signal,
}) {
  if (
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(
      repositoryUrl,
    )
  )
    throw new ControlPlaneError(
      400,
      "REPOSITORY_URL_INVALID",
      "Repository URL is invalid",
    );
  if (!/^[a-f0-9]{40,64}$/i.test(commitSha))
    throw new ControlPlaneError(400, "COMMIT_INVALID", "Commit SHA is invalid");
  const askpass = path.join(workspace, "askpass.sh");
  await fs.writeFile(
    askpass,
    '#!/bin/sh\ncase "$1" in *Username*) printf \'%s\' "x-access-token";; *) printf \'%s\' "$GIT_INSTALLATION_TOKEN";; esac\n',
    { mode: 0o700 },
  );
  const repo = path.join(workspace, "repository");
  const env = {
    GIT_ASKPASS: askpass,
    GIT_INSTALLATION_TOKEN: token,
    GIT_CONFIG_NOSYSTEM: "1",
  };
  try {
    await runImpl("git", ["init", repo], {
      cwd: workspace,
      env,
      onOutput,
      signal,
    });
    await runImpl(
      "git",
      ["-C", repo, "remote", "add", "origin", repositoryUrl],
      { cwd: workspace, env, onOutput, signal },
    );
    await runImpl(
      "git",
      ["-C", repo, "fetch", "--depth=1", "--no-tags", "origin", commitSha],
      { cwd: workspace, env, onOutput, signal },
    );
    await runImpl("git", ["-C", repo, "checkout", "--detach", commitSha], {
      cwd: workspace,
      env,
      onOutput,
      signal,
    });
    if (submodules !== "forbid")
      throw new ControlPlaneError(
        400,
        "SUBMODULE_POLICY",
        "Submodules are disabled in Checkpoint 4",
      );
    await verifyTree(repo, maxBytes);
    return repo;
  } finally {
    await fs.rm(askpass, { force: true });
  }
}
async function cleanup(workspace) {
  await fs.rm(workspace, { recursive: true, force: true, maxRetries: 3 });
  try {
    await fs.access(workspace);
    throw new Error("Workspace cleanup verification failed");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
module.exports = { run, createWorkspace, verifyTree, checkout, cleanup };
