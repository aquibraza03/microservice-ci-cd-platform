const path = require("path");
const fs = require("fs/promises");
const { ControlPlaneError } = require("../errors");
const { run } = require("./workspace");
class RootlessBuildKitExecutor {
  constructor({
    runImpl = run,
    command = "buildctl-daemonless.sh",
    timeoutMs = 900000,
    maxArtifactBytes = 2147483648,
  } = {}) {
    this.run = runImpl;
    this.command = command;
    this.timeoutMs = timeoutMs;
    this.maxArtifactBytes = maxArtifactBytes;
  }
  async build({ repository, contract, imageTag, onOutput, signal }) {
    if (
      process.env.DOCKER_HOST?.includes("docker.sock") ||
      process.env.BUILDKIT_HOST?.includes("docker.sock")
    )
      throw new ControlPlaneError(
        500,
        "HOST_DOCKER_SOCKET_FORBIDDEN",
        "Host Docker socket is forbidden",
      );
    const root = path.resolve(repository, contract.root),
      context = path.resolve(root, contract.context),
      dockerfile = path.resolve(root, contract.dockerfile);
    for (const target of [root, context, dockerfile])
      if (
        target !== repository &&
        !target.startsWith(`${repository}${path.sep}`)
      )
        throw new ControlPlaneError(
          400,
          "BUILD_CONTEXT_ESCAPE",
          "Build context escapes repository",
        );
    const metadata = path.join(repository, "build-metadata.json"),
      artifact = path.join(repository, "image.oci");
    await this.run(
      this.command,
      [
        "build",
        "--frontend=dockerfile.v0",
        `--local=context=${context}`,
        `--local=dockerfile=${path.dirname(dockerfile)}`,
        `--opt=filename=${path.basename(dockerfile)}`,
        `--output=type=oci,name=${imageTag},dest=${artifact}`,
        `--metadata-file=${metadata}`,
      ],
      { cwd: repository, env: {}, timeoutMs: this.timeoutMs, onOutput, signal },
    );
    if ((await fs.stat(artifact)).size > this.maxArtifactBytes)
      throw new ControlPlaneError(
        413,
        "ARTIFACT_TOO_LARGE",
        "Build artifact exceeds limit",
      );
    return {
      imageTag,
      metadataPath: metadata,
      artifactPath: artifact,
      published: false,
    };
  }
}
class TestBuildExecutor {
  constructor({ delay = 0, fail = false } = {}) {
    this.delay = delay;
    this.fail = fail;
  }
  async build({ imageTag, onOutput, signal }) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, this.delay);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(
            new ControlPlaneError(499, "BUILD_CANCELLED", "Build cancelled"),
          );
        },
        { once: true },
      );
    });
    if (this.fail)
      throw new ControlPlaneError(
        422,
        "BUILD_FAILED",
        "Controlled test build failed",
      );
    onOutput?.("build completed without registry push\n");
    return { imageTag, digest: null, published: false };
  }
}
module.exports = { RootlessBuildKitExecutor, TestBuildExecutor };
