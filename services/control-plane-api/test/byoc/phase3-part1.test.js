const { describe, it } = require("mocha");
const { expect } = require("chai");
const crypto = require("crypto");
const { setup } = require("../deployments/state-and-queue.test");
const { AwsCloudAccountProvider } = require("../../src/byoc/aws-provider");
const {
  CustomerKubernetesTargetProvider,
} = require("../../src/byoc/kubernetes-provider");
const { MemoryByocStore } = require("../../src/byoc/store");
const {
  encryptCredential,
  decryptCredential,
  validateApiServerOrigin,
} = require("../../src/byoc/security");
const {
  UnsupportedCapabilityError,
  capability,
} = require("../../src/providers/contracts");
const { manifests } = require("../../src/providers/deployment-target");

function fixture({
  account = "123456789012",
  clusterUid = "cluster-a",
  permission = true,
} = {}) {
  const x = setup(),
    key = crypto.randomBytes(32).toString("base64"),
    aws = new AwsCloudAccountProvider({
      platformPrincipalArn: "arn:aws:iam::999999999999:role/platform",
      sts: {
        assumeRoleAndGetIdentity: async () => ({
          accountId: account,
          principalArn: `arn:aws:sts::${account}:assumed-role/customer/platform`,
        }),
      },
      supportLevel: "beta",
    }),
    kube = new CustomerKubernetesTargetProvider({
      production: true,
      lookup: async () => [{ address: "203.0.113.10", family: 4 }],
      clientFactory: ({ rejectRedirects, pinnedAddresses }) => ({
        discover: async () => ({
          clusterUid,
          caFingerprint: "ca-1",
          version: "v1.30.2",
          apiGroups: ["kyverno.io", "external-secrets.io"],
          namespaceCreate: false,
          rejectRedirects,
          pinnedAddresses,
        }),
        namespaceExists: async () => true,
        selfSubjectAccessReview: async (rules, namespaces) =>
          rules.flatMap(([group, resource, verbs]) =>
            namespaces.flatMap((namespace) =>
              verbs.map((verb) => ({
                group,
                resource,
                verb,
                namespace,
                allowed: permission,
              })),
            ),
          ),
      }),
      supportLevel: "beta",
    }),
    store = new MemoryByocStore(x.r, {
      awsProvider: aws,
      kubernetesProvider: kube,
      encryptionKey: key,
    });
  return { x, key, aws, kube, store };
}
const awsInput = {
  providerType: "aws",
  displayName: "Customer AWS",
  roleArn: "arn:aws:iam::123456789012:role/platform-deployer",
  expectedAccountId: "123456789012",
  permittedRegions: ["us-east-1", "ap-south-1"],
};
const targetInput = {
  name: "Customer cluster",
  clusterFingerprint: null,
  apiServerOrigin: "https://cluster.example.test:6443",
  allowedNamespaces: ["team-a"],
  allowedEnvironments: ["staging"],
  authenticationMethod: "service_account_token",
  serviceAccountToken: "synthetic-token-never-returned",
};

describe("Phase 3 Part 1 BYOC foundation", () => {
  it("uses separate capability-oriented provider contracts and honest support", () => {
    const { store } = fixture(),
      catalog = store.providers();
    expect(catalog.find((x) => x.type === "aws")).to.include({
      resourceType: "cloud_connection",
      supportLevel: "beta",
      connectable: true,
    });
    expect(catalog.find((x) => x.type === "kubernetes")).to.include({
      resourceType: "deployment_target",
      supportLevel: "beta",
      connectable: true,
    });
    expect(
      catalog
        .filter((x) => ["azure", "gcp"].includes(x.type))
        .every((x) => !x.connectable && x.supportLevel === "planned"),
    ).to.equal(true);
    expect(() => {
      throw new UnsupportedCapabilityError("dns");
    })
      .to.throw()
      .with.property("code", "PROVIDER_CAPABILITY_UNSUPPORTED");
    expect(capability("identity", "beta", true).enabled).to.equal(true);
  });
  it("creates unique external IDs and never returns them in safe metadata", () => {
    const { x, store } = fixture(),
      a = store.createAws(x.u.id, x.o.id, awsInput, "connection-one"),
      b = store.createAws(
        x.u.id,
        x.o.id,
        { ...awsInput, displayName: "Second" },
        "connection-two",
      );
    expect(
      a.trustPolicy.Statement[0].Condition.StringEquals["sts:ExternalId"],
    ).not.to.equal(
      b.trustPolicy.Statement[0].Condition.StringEquals["sts:ExternalId"],
    );
    expect(JSON.stringify(a.connection)).not.to.include("ExternalId");
    expect(
      JSON.stringify(store.listConnections(x.u.id, x.o.id)),
    ).not.to.include(
      a.trustPolicy.Statement[0].Condition.StringEquals["sts:ExternalId"],
    );
    expect(a.trustPolicy.Statement[0].Principal.AWS).to.equal(
      "arn:aws:iam::999999999999:role/platform",
    );
  });
  it("validates AWS identity and rejects account substitution", async () => {
    const ok = fixture(),
      made = ok.store.createAws(ok.x.u.id, ok.x.o.id, awsInput, "aws-valid");
    expect(
      (await ok.store.validateAws(ok.x.u.id, ok.x.o.id, made.connection.id, 1))
        .status,
    ).to.equal("active");
    const wrong = fixture({ account: "210987654321" }),
      other = wrong.store.createAws(
        wrong.x.u.id,
        wrong.x.o.id,
        awsInput,
        "aws-wrong",
      );
    let error;
    try {
      await wrong.store.validateAws(
        wrong.x.u.id,
        wrong.x.o.id,
        other.connection.id,
        1,
      );
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("AWS_ACCOUNT_MISMATCH");
    expect(wrong.store.connections.get(other.connection.id).status).to.equal(
      "invalid",
    );
  });
  it("rejects invalid role ARN and arbitrary regions", () => {
    const { x, store } = fixture();
    for (const input of [
      { ...awsInput, roleArn: "arn:aws:iam::*:role/admin" },
      { ...awsInput, permittedRegions: ["http://internal"] },
    ])
      expect(() =>
        store.createAws(x.u.id, x.o.id, input, crypto.randomUUID()),
      ).to.throw();
  });
  it("rejects cross-tenant access and disabled or revoked validation", async () => {
    const { x, store } = fixture(),
      made = store.createAws(x.u.id, x.o.id, awsInput, "tenant-aws"),
      other = x.r.createOrganization(x.u.id, {
        name: "Other",
        slug: `other-${Date.now()}`,
      });
    expect(() => store.connection(x.u.id, other.id, made.connection.id))
      .to.throw()
      .with.property("code", "PROVIDER_CONNECTION_NOT_FOUND");
    const disabled = store.lifecycle(
      x.u.id,
      x.o.id,
      made.connection.id,
      "disable",
      1,
    );
    let error;
    try {
      await store.validateAws(
        x.u.id,
        x.o.id,
        made.connection.id,
        disabled.version,
      );
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("CONNECTION_NOT_USABLE");
    const revoked = store.lifecycle(
      x.u.id,
      x.o.id,
      made.connection.id,
      "revoke",
      disabled.version,
    );
    expect(() =>
      store.lifecycle(
        x.u.id,
        x.o.id,
        made.connection.id,
        "disable",
        revoked.version,
      ),
    )
      .to.throw()
      .with.property("code", "CONNECTION_TRANSITION_INVALID");
  });
  it("prevents concurrent validation and stale updates", async () => {
    const f = fixture();
    let release;
    f.aws.sts.assumeRoleAndGetIdentity = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const made = f.store.createAws(f.x.u.id, f.x.o.id, awsInput, "concurrent"),
      running = f.store.validateAws(f.x.u.id, f.x.o.id, made.connection.id, 1);
    await new Promise((r) => setImmediate(r));
    let error;
    try {
      await f.store.validateAws(f.x.u.id, f.x.o.id, made.connection.id, 2);
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("VALIDATION_ALREADY_RUNNING");
    release({ accountId: awsInput.expectedAccountId, principalArn: "safe" });
    await running;
    expect(() =>
      f.store.updateAws(f.x.u.id, f.x.o.id, made.connection.id, awsInput, 1),
    )
      .to.throw()
      .with.property("code", "VERSION_CONFLICT");
  });
  it("encrypts service-account credentials with authenticated encryption and rotates them", () => {
    const { x, key, store } = fixture(),
      result = store.createKubernetesTarget(
        x.u.id,
        x.o.id,
        targetInput,
        "target-create",
      ),
      raw = store.targets.get(result.target.id);
    expect(JSON.stringify(result.target)).not.to.include(
      targetInput.serviceAccountToken,
    );
    expect(decryptCredential(raw.encryptedCredential, key)).to.equal(
      targetInput.serviceAccountToken,
    );
    const rotated = store.rotateTargetCredential(
      x.u.id,
      x.o.id,
      result.target.id,
      "replacement-token-value",
      1,
    );
    expect(rotated.credentialVersion).to.equal(2);
    expect(JSON.stringify(rotated)).not.to.include("replacement-token-value");
    expect(store.credentials.get(`${result.target.id}:1`).revokedAt).to.be.a(
      "string",
    );
    const encrypted = encryptCredential("secret", key);
    encrypted.tag = Buffer.alloc(16).toString("base64");
    expect(() => decryptCredential(encrypted, key)).to.throw();
  });
  it("validates cluster identity, namespaces, version, capabilities and minimum permissions", async () => {
    const f = fixture(),
      made = f.store.createKubernetesTarget(
        f.x.u.id,
        f.x.o.id,
        targetInput,
        "target-valid",
      ),
      valid = await f.store.validateTarget(
        f.x.u.id,
        f.x.o.id,
        made.target.id,
        1,
      );
    expect(valid).to.include({
      status: "active",
      permissionValidation: "passed",
      kubernetesVersion: "v1.30.2",
    });
    expect(valid.capabilities).to.include({
      kyverno: true,
      externalSecrets: true,
      namespaceCreate: false,
    });
    const mismatch = fixture(),
      item = mismatch.store.createKubernetesTarget(
        mismatch.x.u.id,
        mismatch.x.o.id,
        { ...targetInput, clusterFingerprint: "wrong" },
        "mismatch",
      );
    let error;
    try {
      await mismatch.store.validateTarget(
        mismatch.x.u.id,
        mismatch.x.o.id,
        item.target.id,
        1,
      );
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("KUBERNETES_CLUSTER_IDENTITY_MISMATCH");
  });
  it("rejects insufficient permissions and namespace restrictions", async () => {
    const f = fixture({ permission: false }),
      made = f.store.createKubernetesTarget(
        f.x.u.id,
        f.x.o.id,
        targetInput,
        "no-permission",
      );
    let error;
    try {
      await f.store.validateTarget(f.x.u.id, f.x.o.id, made.target.id, 1);
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("KUBERNETES_PERMISSION_INSUFFICIENT");
    const wildcard = f.store.createKubernetesTarget(
      f.x.u.id,
      f.x.o.id,
      { ...targetInput, allowedNamespaces: ["*"] },
      "wildcard-ns",
    );
    try {
      await f.store.validateTarget(f.x.u.id, f.x.o.id, wildcard.target.id, 1);
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("KUBERNETES_NAMESPACE_INVALID");
  });
  it("blocks SSRF, unsafe schemes, redirects-by-contract and DNS rebinding", async () => {
    for (const url of [
      "http://cluster.example.test",
      "https://localhost:6443",
      "https://user:pass@cluster.example.test:6443/path",
      "https://cluster.example.test:8443",
    ]) {
      let error;
      try {
        await validateApiServerOrigin(url, {
          production: true,
          lookup: async () => [{ address: "203.0.113.10", family: 4 }],
        });
      } catch (e) {
        error = e;
      }
      expect(error).to.exist;
    }
    let error;
    try {
      await validateApiServerOrigin("https://cluster.example.test:6443", {
        production: true,
        lookup: async () => [{ address: "10.0.0.1", family: 4 }],
      });
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("KUBERNETES_API_SSRF_BLOCKED");
  });
  it("uses an approved target namespace in deployment rendering", () => {
    const items = manifests({
      organizationSlug: "org",
      projectSlug: "project",
      serviceSlug: "api",
      deploymentId: crypto.randomUUID(),
      imageReference: `registry.example/api@sha256:${"a".repeat(64)}`,
      port: 3000,
      resources: {
        requests: { cpu: "100m", memory: "128Mi" },
        limits: { cpu: "500m", memory: "512Mi" },
      },
      startupPath: "/health",
      readinessPath: "/ready",
      healthPath: "/health",
      targetNamespace: "team-a",
    });
    expect(
      items
        .filter((x) => x.kind !== "Namespace")
        .every((x) => x.metadata.namespace === "team-a"),
    ).to.equal(true);
  });
});
