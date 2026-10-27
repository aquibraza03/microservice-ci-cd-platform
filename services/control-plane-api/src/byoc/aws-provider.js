const { ControlPlaneError } = require("../errors");
const { CloudAccountProvider, capability } = require("../providers/contracts");
const ROLE_ARN =
  /^arn:(aws|aws-us-gov|aws-cn):iam::([0-9]{12}):role\/([A-Za-z0-9+=,.@_/-]{1,512})$/;
class AwsCloudAccountProvider extends CloudAccountProvider {
  constructor({
    sts,
    platformPrincipalArn,
    timeoutMs = 10000,
    supportLevel = "beta",
  }) {
    super();
    Object.assign(this, { sts, platformPrincipalArn, timeoutMs, supportLevel });
  }
  capabilities() {
    return [
      capability("identity", this.supportLevel, true, "unit-tested"),
      capability("regions", this.supportLevel, true, "unit-tested"),
      capability("connection-rotation", this.supportLevel, true, "unit-tested"),
    ];
  }
  validateConfiguration(input) {
    const match = ROLE_ARN.exec(input.roleArn || "");
    if (!match || match[2] !== input.expectedAccountId)
      throw new ControlPlaneError(
        400,
        "AWS_ROLE_ARN_INVALID",
        "AWS role ARN and expected account are invalid",
      );
    const regions = [...new Set(input.permittedRegions || [])];
    if (
      !regions.length ||
      regions.some((x) => !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(x))
    )
      throw new ControlPlaneError(
        400,
        "AWS_REGION_INVALID",
        "AWS permitted regions are invalid",
      );
    return {
      roleArn: input.roleArn,
      expectedAccountId: input.expectedAccountId,
      permittedRegions: regions,
    };
  }
  trustPolicy({ roleArn, externalId }) {
    if (!this.platformPrincipalArn || !ROLE_ARN.test(this.platformPrincipalArn))
      throw new ControlPlaneError(
        500,
        "AWS_PLATFORM_PRINCIPAL_INVALID",
        "AWS trust policy configuration is unavailable",
      );
    return {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: this.platformPrincipalArn },
          Action: "sts:AssumeRole",
          Condition: { StringEquals: { "sts:ExternalId": externalId } },
        },
      ],
      customerRoleArn: roleArn,
    };
  }
  async validateIdentity(configuration) {
    const timeout = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new ControlPlaneError(
              504,
              "AWS_VALIDATION_TIMEOUT",
              "AWS validation timed out",
            ),
          ),
        this.timeoutMs,
      ),
    );
    let identity;
    try {
      identity = await Promise.race([
        this.sts.assumeRoleAndGetIdentity({
          roleArn: configuration.roleArn,
          externalId: configuration.externalId,
          sessionName: "platform-connection-validation",
          durationSeconds: 900,
        }),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      const e = new ControlPlaneError(
        error.retryable ? 503 : 422,
        error.rateLimited ? "AWS_RATE_LIMITED" : "AWS_CONNECTION_FAILED",
        error.rateLimited
          ? "AWS rate limit reached; retry later"
          : "AWS connection validation failed",
      );
      e.retryable = Boolean(error.retryable || error.rateLimited);
      throw e;
    }
    if (String(identity.accountId) !== configuration.expectedAccountId)
      throw new ControlPlaneError(
        409,
        "AWS_ACCOUNT_MISMATCH",
        "AWS account identity did not match the configured account",
      );
    return {
      accountId: String(identity.accountId),
      principalArn: String(identity.principalArn || "").slice(0, 512),
      validatedAt: new Date().toISOString(),
    };
  }
}
module.exports = { AwsCloudAccountProvider, ROLE_ARN };
