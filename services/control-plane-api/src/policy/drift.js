const { PERMISSIONS } = require("../auth/rbac");

function compareDrift(expected, observed) {
  if (!observed || observed.accessible === false)
    return [
      { category: "unknown_or_inaccessible", expected: null, observed: null },
    ];
  const out = [];
  if (expected.imageDigest !== observed.imageDigest)
    out.push({
      category: "image_drift",
      expected: expected.imageDigest,
      observed: observed.imageDigest || null,
    });
  if (expected.configurationSnapshotHash !== observed.configurationSnapshotHash)
    out.push({
      category: "configuration_drift",
      expected: expected.configurationSnapshotHash,
      observed: observed.configurationSnapshotHash || null,
    });
  if (
    expected.targetId !== observed.targetId ||
    expected.namespace !== observed.namespace
  )
    out.push({
      category: "target_drift",
      expected: { targetId: expected.targetId, namespace: expected.namespace },
      observed: {
        targetId: observed.targetId || null,
        namespace: observed.namespace || null,
      },
    });
  const required = expected.ownershipLabels || {};
  if (
    Object.entries(required).some(
      ([k, v]) => observed.ownershipLabels?.[k] !== v,
    )
  )
    out.push({
      category: "ownership_drift",
      expected: required,
      observed: observed.ownershipLabels || {},
    });
  if (expected.policyStatus !== observed.policyStatus)
    out.push({
      category: "policy_drift",
      expected: expected.policyStatus,
      observed: observed.policyStatus || "unknown",
    });
  if (
    JSON.stringify(expected.service || null) !==
      JSON.stringify(observed.service || null) ||
    JSON.stringify(expected.ingress || null) !==
      JSON.stringify(observed.ingress || null)
  )
    out.push({
      category: "configuration_drift",
      expected: {
        service: expected.service || null,
        ingress: expected.ingress || null,
      },
      observed: {
        service: observed.service || null,
        ingress: observed.ingress || null,
      },
    });
  const expectedRefs = (expected.secretReferences || [])
      .map((x) => `${x.id}:${x.referenceVersion}`)
      .sort(),
    observedRefs = (observed.secretReferences || [])
      .map((x) => `${x.id}:${x.referenceVersion}`)
      .sort();
  if (JSON.stringify(expectedRefs) !== JSON.stringify(observedRefs))
    out.push({
      category: "configuration_drift",
      expected: { secretReferences: expectedRefs },
      observed: { secretReferences: observedRefs },
    });
  return out;
}
class DriftDetector {
  constructor(repository, { inspect }) {
    this.repository = repository;
    this.inspect = inspect;
  }
  async run(actorId, organizationId, expected) {
    await this.repository.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.DRIFT_RUN,
    );
    const observed = await this.inspect(expected);
    return {
      organizationId,
      deploymentId: expected.deploymentId,
      evaluatedAt: new Date().toISOString(),
      status: "completed",
      drifted: compareDrift(expected, observed).length > 0,
      findings: compareDrift(expected, observed),
    };
  }
}
module.exports = { compareDrift, DriftDetector };
