const { ControlPlaneError } = require("../errors");
class SecretReferenceProvider {
  capabilities() {
    return [];
  }
  async validateReference() {
    throw new ControlPlaneError(
      422,
      "SECRET_PROVIDER_UNSUPPORTED",
      "Secret provider is unsupported",
    );
  }
  renderRuntimeReference() {
    throw new ControlPlaneError(
      422,
      "SECRET_PROVIDER_UNSUPPORTED",
      "Secret provider is unsupported",
    );
  }
}
class AwsSecretsManagerReferenceProvider extends SecretReferenceProvider {
  capabilities() {
    return [
      {
        id: "runtime-reference",
        supportLevel: "beta",
        enabled: true,
        evidence: "unit-tested",
      },
    ];
  }
  async validateReference(reference, context) {
    if (
      !/^arn:(aws|aws-us-gov|aws-cn):secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$/.test(
        reference.externalIdentifier,
      )
    )
      throw new ControlPlaneError(
        400,
        "SECRET_IDENTIFIER_INVALID",
        "Secret identifier is invalid",
      );
    if (!context.connection || context.connection.status !== "active")
      throw new ControlPlaneError(
        409,
        "SECRET_PROVIDER_CONNECTION_UNAVAILABLE",
        "Secret provider connection is unavailable",
      );
    if (
      reference.externalIdentifier.split(":")[4] !==
      context.connection.expectedAccountId
    )
      throw new ControlPlaneError(
        403,
        "SECRET_ACCOUNT_MISMATCH",
        "Secret account does not match the provider connection",
      );
    return {
      status: "active",
      category: "validated",
      checkedAt: new Date().toISOString(),
    };
  }
  renderRuntimeReference(reference) {
    return {
      remoteRef: {
        key: reference.externalIdentifier,
        ...(reference.versionSelector
          ? { version: reference.versionSelector }
          : {}),
      },
    };
  }
}
class KubernetesExternalSecretReferenceProvider extends SecretReferenceProvider {
  capabilities() {
    return [
      {
        id: "runtime-reference",
        supportLevel: "beta",
        enabled: true,
        evidence: "unit-tested",
      },
    ];
  }
  async validateReference(reference, context) {
    if (
      !/^[a-z0-9][a-z0-9./_-]{0,252}[a-z0-9]$/i.test(
        reference.externalIdentifier,
      )
    )
      throw new ControlPlaneError(
        400,
        "SECRET_IDENTIFIER_INVALID",
        "Secret identifier is invalid",
      );
    if (!context.target?.capabilityResults?.externalSecrets)
      throw new ControlPlaneError(
        409,
        "EXTERNAL_SECRETS_UNAVAILABLE",
        "External Secrets Operator is unavailable",
      );
    return {
      status: "active",
      category: "validated",
      checkedAt: new Date().toISOString(),
    };
  }
  renderRuntimeReference(reference) {
    return {
      remoteRef: {
        key: reference.externalIdentifier,
        ...(reference.versionSelector
          ? { version: reference.versionSelector }
          : {}),
      },
    };
  }
}
function renderExternalSecretManifest({
  reference,
  namespace,
  workloadName,
  provider,
}) {
  return {
    apiVersion: "external-secrets.io/v1beta1",
    kind: "ExternalSecret",
    metadata: {
      name: `${workloadName}-${reference.id.slice(-8)}`.toLowerCase(),
      namespace,
      labels: {
        "platform.example/secret-reference-id": reference.id,
        "platform.example/secret-reference-version": String(
          reference.referenceVersion,
        ),
      },
    },
    spec: {
      refreshInterval: "1h",
      secretStoreRef: { name: "platform-runtime", kind: "ClusterSecretStore" },
      target: { name: `${workloadName}-runtime`, creationPolicy: "Owner" },
      data: [
        {
          secretKey: reference.injectionKey,
          ...provider.renderRuntimeReference(reference),
        },
      ],
    },
  };
}
module.exports = {
  SecretReferenceProvider,
  AwsSecretsManagerReferenceProvider,
  KubernetesExternalSecretReferenceProvider,
  renderExternalSecretManifest,
};
