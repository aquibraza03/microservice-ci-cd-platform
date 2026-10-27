@Library('platform-shared-library') _

// Root Jenkinsfile - auto-detects pipeline type based on triggering event
// For monorepo CI: push/PR to main/develop with service changes
// For deployment: manual trigger with service parameters
// For operations: security, infra, release, or dependency-update

def pipelineType = currentBuild.rawBuild.getCauses().any { cause ->
  cause.toString().contains("UserIdCause") || cause.toString().contains("ManualCause")
} ? "manual" : "auto"

if (pipelineType == "manual") {
  // Manual trigger - use ops pipeline
  opsPipeline(
    mode: params.MODE ?: "security",
    env: params.ENV ?: "dev",
    autoApprove: params.AUTO_APPROVE ?: false
  )
} else {
  // Auto trigger - use CI pipeline for monorepo
  ciPipeline(
    smokeTest: true,
    failFast: false
  )
}
