const fs = require("fs/promises");
const path = require("path");
const { ControlPlaneError } = require("../errors");
const { run } = require("../worker/workspace");
const { DIGEST } = require("../providers/registry");
class VulnerabilityPolicy {
  constructor({
    high = "warn",
    allowExceptions = process.env.ALLOW_VULNERABILITY_EXCEPTIONS === "true",
  } = {}) {
    this.high = high;
    this.allowExceptions = allowExceptions;
  }
  evaluate(report, { exception = null } = {}) {
    const results = report.Results || [],
      all = results.flatMap((r) => r.Vulnerabilities || []),
      critical = all.filter((v) => v.Severity === "CRITICAL"),
      high = all.filter((v) => v.Severity === "HIGH");
    if (critical.length && !this._exception(exception, "critical"))
      throw new ControlPlaneError(
        422,
        "CRITICAL_VULNERABILITY_BLOCKED",
        "Image contains critical vulnerabilities",
      );
    if (
      this.high === "block" &&
      high.length &&
      !this._exception(exception, "high")
    )
      throw new ControlPlaneError(
        422,
        "HIGH_VULNERABILITY_BLOCKED",
        "Image contains high vulnerabilities",
      );
    return {
      status: "passed",
      critical: critical.length,
      high: high.length,
      highPolicy: this.high,
      exceptionId: exception?.id || null,
    };
  }
  _exception(value, severity) {
    return Boolean(
      this.allowExceptions &&
      value?.id &&
      value?.approvedBy &&
      value?.reason &&
      value?.expiresAt &&
      new Date(value.expiresAt) > new Date() &&
      value.severities?.includes(severity),
    );
  }
}
class SupplyChainVerifier {
  constructor({
    runImpl = run,
    policy = new VulnerabilityPolicy(),
    cosignKeyPath,
    cosignPassword = process.env.COSIGN_PASSWORD,
    certificateIdentity,
    certificateIssuer,
    timeoutMs = 300000,
  } = {}) {
    Object.assign(this, {
      policy,
      cosignKeyPath,
      certificateIdentity,
      certificateIssuer,
      timeoutMs,
    });
    this.run = (command, args, options = {}) =>
      runImpl(command, args, {
        ...options,
        env: {
          ...(options.env || {}),
          ...(process.env.DOCKER_CONFIG
            ? { DOCKER_CONFIG: process.env.DOCKER_CONFIG }
            : {}),
          ...(command === "cosign" && cosignPassword
            ? { COSIGN_PASSWORD: cosignPassword }
            : {}),
        },
      });
  }
  async verify({ reference, workspace, exception, signal, onOutput }) {
    if (!/@sha256:[a-f0-9]{64}$/.test(reference))
      throw new ControlPlaneError(
        422,
        "REGISTRY_DIGEST_MISSING",
        "An immutable image digest is required",
      );
    const insecure = /^(?:localhost|127\.0\.0\.1|registry):\d+\//.test(
        reference,
      ),
      scanPath = path.join(workspace, "trivy.json"),
      sbomPath = path.join(workspace, "sbom.cdx.json"),
      provenancePath = path.join(workspace, "provenance.json"),
      trivyArgs = [
        "image",
        "--quiet",
        "--format",
        "json",
        "--output",
        scanPath,
      ];
    if (insecure) trivyArgs.push("--insecure");
    trivyArgs.push(reference);
    await this.run("trivy", trivyArgs, {
      cwd: workspace,
      timeoutMs: this.timeoutMs,
      signal,
      onOutput,
    });
    const scan = this.policy.evaluate(
      JSON.parse(await fs.readFile(scanPath, "utf8")),
      { exception },
    );
    await this.run("syft", [reference, "-o", `cyclonedx-json=${sbomPath}`], {
      cwd: workspace,
      env: insecure ? { SYFT_REGISTRY_INSECURE_SKIP_TLS_VERIFY: "true" } : {},
      timeoutMs: this.timeoutMs,
      signal,
      onOutput,
    });
    const provenance = {
      predicateType: "https://slsa.dev/provenance/v1",
      subject: [
        {
          name: reference.split("@")[0],
          digest: { sha256: reference.split("sha256:")[1] },
        },
      ],
    };
    await fs.writeFile(provenancePath, JSON.stringify(provenance));
    const signArgs = ["sign", "--yes"];
    if (insecure) signArgs.push("--allow-insecure-registry");
    if (this.cosignKeyPath) signArgs.push("--key", this.cosignKeyPath);
    signArgs.push(reference);
    await this.run("cosign", signArgs, {
      cwd: workspace,
      timeoutMs: this.timeoutMs,
      signal,
      onOutput,
    });
    const attestArgs = [
      "attest",
      "--yes",
      "--predicate",
      provenancePath,
      "--type",
      "slsaprovenance",
    ];
    if (insecure) attestArgs.push("--allow-insecure-registry");
    if (this.cosignKeyPath) attestArgs.push("--key", this.cosignKeyPath);
    attestArgs.push(reference);
    await this.run("cosign", attestArgs, {
      cwd: workspace,
      timeoutMs: this.timeoutMs,
      signal,
      onOutput,
    });
    const verifyArgs = ["verify", "--output=json"];
    if (insecure) verifyArgs.push("--allow-insecure-registry");
    if (this.cosignKeyPath) verifyArgs.push("--key", this.cosignKeyPath);
    else {
      if (!this.certificateIdentity || !this.certificateIssuer)
        throw new ControlPlaneError(
          500,
          "SIGNING_CONFIG_INVALID",
          "Keyless verification identity and issuer are required",
        );
      verifyArgs.push(
        "--certificate-identity",
        this.certificateIdentity,
        "--certificate-oidc-issuer",
        this.certificateIssuer,
      );
    }
    verifyArgs.push(reference);
    await this.run("cosign", verifyArgs, {
      cwd: workspace,
      timeoutMs: this.timeoutMs,
      signal,
      onOutput,
    }).catch(() => {
      throw new ControlPlaneError(
        422,
        "SIGNATURE_VERIFICATION_FAILED",
        "Image signature verification failed",
      );
    });
    return {
      scan,
      sbomPath,
      provenancePath,
      signature: { status: "verified" },
      verified: true,
    };
  }
}
class TestSupplyChainVerifier {
  constructor({ critical = 0, high = 0, fail = null } = {}) {
    Object.assign(this, { critical, high, fail });
  }
  async verify({ reference }) {
    if (!DIGEST.test(reference.split("@")[1] || ""))
      throw new ControlPlaneError(
        422,
        "REGISTRY_DIGEST_MISSING",
        "An immutable image digest is required",
      );
    if (this.fail === "critical")
      throw new ControlPlaneError(
        422,
        "CRITICAL_VULNERABILITY_BLOCKED",
        "Image contains critical vulnerabilities",
      );
    if (this.fail === "signature")
      throw new ControlPlaneError(
        422,
        "SIGNATURE_VERIFICATION_FAILED",
        "Image signature verification failed",
      );
    return {
      scan: {
        status: "passed",
        critical: this.critical,
        high: this.high,
        highPolicy: "warn",
      },
      sbomPath: "test://sbom",
      provenancePath: "test://provenance",
      signature: { status: "verified" },
      verified: true,
    };
  }
}
module.exports = {
  VulnerabilityPolicy,
  SupplyChainVerifier,
  TestSupplyChainVerifier,
};
