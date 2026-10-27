const fs = require("fs/promises");
const path = require("path");
const { ControlPlaneError } = require("../errors");
const { run } = require("../worker/workspace");
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMPONENT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
function component(value, label) {
  const clean = String(value || "").toLowerCase();
  if (!COMPONENT.test(clean) || clean.length > 120)
    throw new ControlPlaneError(
      400,
      "IMAGE_NAME_INVALID",
      `${label} is invalid`,
    );
  return clean;
}
function imageRepository({ owner, organization, project, service }) {
  return `ghcr.io/${component(owner, "Registry owner")}/${component(organization, "Organization")}-${component(project, "Project")}-${component(service, "Service")}`;
}
function classify(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("unauthorized") || message.includes("denied"))
    return new ControlPlaneError(
      502,
      "REGISTRY_AUTH_FAILED",
      "Registry authentication failed",
    );
  if (message.includes("too many requests") || message.includes("rate limit")) {
    const e = new ControlPlaneError(
      503,
      "REGISTRY_RATE_LIMITED",
      "Registry rate limit reached",
    );
    e.retryable = true;
    return e;
  }
  const e = new ControlPlaneError(
    502,
    "REGISTRY_OPERATION_FAILED",
    "Registry operation failed",
  );
  e.retryable = true;
  return e;
}
class RegistryProvider {
  repositoryFor() {
    throw new Error("Not implemented");
  }
  async authenticate() {
    throw new Error("Not implemented");
  }
  async validateRepositoryAccess() {
    throw new Error("Not implemented");
  }
  async ensureRepository() {
    throw new Error("Not implemented");
  }
  async pushImage() {
    throw new Error("Not implemented");
  }
  async resolveDigest() {
    throw new Error("Not implemented");
  }
  async readImageMetadata() {
    throw new Error("Not implemented");
  }
  async attachMetadata() {
    throw new Error("Not implemented");
  }
  async verifySignature() {
    throw new Error("Not implemented");
  }
}
class GhcrRegistryProvider extends RegistryProvider {
  constructor({
    owner,
    username,
    token,
    runImpl = run,
    timeoutMs = 300000,
    authFile = `/tmp/ghcr-auth-${process.pid}/config.json`,
  } = {}) {
    super();
    Object.assign(this, {
      owner,
      username,
      token,
      run: runImpl,
      timeoutMs,
      authFile,
    });
    if (!owner || !username || !token)
      throw new ControlPlaneError(
        500,
        "REGISTRY_CONFIG_INVALID",
        "GHCR configuration is incomplete",
      );
    process.env.DOCKER_CONFIG = path.dirname(authFile);
  }
  repositoryFor(input) {
    return imageRepository({ owner: this.owner, ...input });
  }
  async _exec(command, args, { stdin, env = {}, onOutput, signal } = {}) {
    try {
      return await this.run(command, args, {
        cwd: process.cwd(),
        env,
        stdin,
        timeoutMs: this.timeoutMs,
        onOutput,
        signal,
      });
    } catch (error) {
      throw classify(error);
    }
  }
  async authenticate() {
    await fs.mkdir(path.dirname(this.authFile), {
      recursive: true,
      mode: 0o700,
    });
    await this._exec(
      "skopeo",
      [
        "login",
        "--authfile",
        this.authFile,
        "ghcr.io",
        "--username",
        this.username,
        "--password-stdin",
      ],
      { stdin: `${this.token}\n` },
    );
    return { authenticated: true };
  }
  async validateRepositoryAccess(repository) {
    await this.ensureRepository(repository);
    return { repository, accessible: true };
  }
  async ensureRepository(repository) {
    if (!repository.startsWith(`ghcr.io/${this.owner.toLowerCase()}/`))
      throw new ControlPlaneError(
        400,
        "REGISTRY_REPOSITORY_FORBIDDEN",
        "Image repository is outside the configured GHCR owner",
      );
    return { repository };
  }
  async pushImage({ artifactPath, repository, tags, signal, onOutput }) {
    await this.ensureRepository(repository);
    const tag = tags[0];
    await this._exec(
      "skopeo",
      [
        "copy",
        "--authfile",
        this.authFile,
        `oci-archive:${artifactPath}`,
        `docker://${repository}:${tag}`,
      ],
      { signal, onOutput },
    );
    const digest = await this.resolveDigest({ repository, reference: tag });
    if (!DIGEST.test(digest))
      throw new ControlPlaneError(
        502,
        "REGISTRY_DIGEST_MISSING",
        "Registry did not return an immutable digest",
      );
    for (const alias of tags.slice(1))
      await this._exec(
        "skopeo",
        [
          "copy",
          "--all",
          "--authfile",
          this.authFile,
          `docker://${repository}@${digest}`,
          `docker://${repository}:${alias}`,
        ],
        { signal, onOutput },
      );
    return {
      registry: "ghcr.io",
      repository,
      tags,
      digest,
      reference: `${repository}@${digest}`,
      published: true,
    };
  }
  async resolveDigest({ repository, reference }) {
    const result = await this._exec("skopeo", [
      "inspect",
      "--authfile",
      this.authFile,
      "--format",
      "{{.Digest}}",
      `docker://${repository}:${reference}`,
    ]);
    return String(result.stdout || result.output || "").trim();
  }
  async readImageMetadata({ repository, digest }) {
    if (!DIGEST.test(digest))
      throw new ControlPlaneError(
        400,
        "IMAGE_DIGEST_INVALID",
        "Image digest is invalid",
      );
    const result = await this._exec("skopeo", [
      "inspect",
      "--authfile",
      this.authFile,
      `docker://${repository}@${digest}`,
    ]);
    return JSON.parse(result.stdout || result.output || "{}");
  }
  async attachMetadata({ reference, sbomPath, provenancePath }) {
    await this._exec(
      "cosign",
      ["attach", "sbom", "--sbom", sbomPath, reference],
      {
        env: {
          REGISTRY_AUTH_FILE: this.authFile,
          DOCKER_CONFIG: path.dirname(this.authFile),
        },
      },
    );
    return {
      reference,
      sbomReference: `${reference}#sbom`,
      provenanceReference: `${reference}#slsaprovenance`,
      provenancePath,
      attached: true,
    };
  }
  async kubernetesPullSecret() {
    return Buffer.from(await fs.readFile(this.authFile)).toString("base64");
  }
  async verifySignature({ reference, keyPath, identity, issuer }) {
    const args = ["verify", "--output=json"];
    if (keyPath) args.push("--key", keyPath);
    else
      args.push(
        "--certificate-identity",
        identity,
        "--certificate-oidc-issuer",
        issuer,
      );
    args.push(reference);
    await this._exec("cosign", args);
    return { verified: true, reference };
  }
}
class LocalRegistryProvider extends RegistryProvider {
  constructor({
    host = "registry:5000",
    runImpl = run,
    timeoutMs = 300000,
  } = {}) {
    super();
    if (!/^[a-z0-9.-]+:\d+$/.test(host))
      throw new ControlPlaneError(
        500,
        "REGISTRY_CONFIG_INVALID",
        "Local registry host is invalid",
      );
    Object.assign(this, { host, run: runImpl, timeoutMs });
  }
  repositoryFor({ organization, project, service }) {
    return `${this.host}/${component(organization, "Organization")}-${component(project, "Project")}-${component(service, "Service")}`;
  }
  async authenticate() {
    return { authenticated: true, local: true };
  }
  async ensureRepository(repository) {
    if (!repository.startsWith(`${this.host}/`))
      throw new ControlPlaneError(
        400,
        "REGISTRY_REPOSITORY_FORBIDDEN",
        "Repository is outside the local registry",
      );
    return { repository };
  }
  async pushImage({ artifactPath, repository, tags, signal, onOutput }) {
    await this.ensureRepository(repository);
    await this.run(
      "skopeo",
      [
        "copy",
        "--dest-tls-verify=false",
        `oci-archive:${artifactPath}`,
        `docker://${repository}:${tags[0]}`,
      ],
      { cwd: process.cwd(), timeoutMs: this.timeoutMs, signal, onOutput },
    );
    const result = await this.run(
      "skopeo",
      [
        "inspect",
        "--tls-verify=false",
        "--format",
        "{{.Digest}}",
        `docker://${repository}:${tags[0]}`,
      ],
      { cwd: process.cwd(), timeoutMs: this.timeoutMs, signal, onOutput },
    );
    const digest = result.stdout.trim();
    if (!DIGEST.test(digest))
      throw new ControlPlaneError(
        502,
        "REGISTRY_DIGEST_MISSING",
        "Registry did not return an immutable digest",
      );
    return {
      registry: this.host,
      repository,
      tags,
      digest,
      reference: `${repository}@${digest}`,
      published: true,
    };
  }
  async attachMetadata({ reference, sbomPath, provenancePath }) {
    await this.run(
      "cosign",
      [
        "attach",
        "sbom",
        "--allow-insecure-registry",
        "--sbom",
        sbomPath,
        reference,
      ],
      { cwd: process.cwd(), timeoutMs: this.timeoutMs },
    );
    return {
      sbomReference: `${reference}#sbom`,
      provenanceReference: `${reference}#slsaprovenance`,
      provenancePath,
      attached: true,
    };
  }
}
class TestRegistryProvider extends RegistryProvider {
  constructor({ digest = `sha256:${"a".repeat(64)}`, fail = null } = {}) {
    super();
    this.digest = digest;
    this.fail = fail;
    this.pushes = [];
  }
  repositoryFor({ organization, project, service }) {
    return `test/${organization}-${project}-${service}`;
  }
  async authenticate() {
    if (this.fail === "auth")
      throw new ControlPlaneError(
        502,
        "REGISTRY_AUTH_FAILED",
        "Registry authentication failed",
      );
    return { authenticated: true };
  }
  async ensureRepository(repository) {
    return { repository };
  }
  async pushImage(input) {
    if (this.fail === "push")
      throw new ControlPlaneError(
        502,
        "REGISTRY_OPERATION_FAILED",
        "Registry operation failed",
      );
    if (this.fail === "digest") this.digest = "";
    this.pushes.push(input);
    if (!DIGEST.test(this.digest))
      throw new ControlPlaneError(
        502,
        "REGISTRY_DIGEST_MISSING",
        "Registry did not return an immutable digest",
      );
    return {
      registry: "test",
      repository: input.repository,
      tags: input.tags,
      digest: this.digest,
      reference: `${input.repository}@${this.digest}`,
      published: true,
    };
  }
  async attachMetadata({ reference }) {
    return {
      sbomReference: `${reference}#sbom`,
      provenanceReference: `${reference}#slsaprovenance`,
      attached: true,
    };
  }
  async verifySignature() {
    if (this.fail === "signature")
      throw new ControlPlaneError(
        422,
        "SIGNATURE_VERIFICATION_FAILED",
        "Image signature verification failed",
      );
    return { verified: true };
  }
}
module.exports = {
  RegistryProvider,
  GhcrRegistryProvider,
  LocalRegistryProvider,
  TestRegistryProvider,
  DIGEST,
  imageRepository,
  classify,
};
