package org.platform

import groovy.json.JsonSlurper

class Governance implements Serializable {

  def steps

  Governance(steps) {
    this.steps = steps
  }

  private def loadJson(String path) {
    def raw = steps.libraryResource(path)
    return new JsonSlurper().parseText(raw)
  }

  String branchName() {
    return steps.env.BRANCH_NAME ?: steps.env.GIT_BRANCH ?: 'unknown'
  }

  boolean isProduction(String envName) {
    return envName?.trim()?.toLowerCase() == 'prod'
  }

  void validateBranchForEnv(String envName) {

    def rules = loadJson('policies/branch-rules.json')
    def allowed = rules[envName] ?: []

    if (!allowed.contains(branchName())) {
      steps.error(
        "Branch '${branchName()}' not allowed for ${envName}. Allowed: ${allowed}"
      )
    }
  }

  void blockIfFreezeEnabled() {

    def cfg = loadJson('policies/freeze-window.json')

    if (cfg.enabled == true) {
      steps.error(cfg.reason ?: 'Change freeze enabled')
    }
  }

  void requireApproval(String envName, String message = null) {

    if (isProduction(envName)) {
      steps.timeout(time: 20, unit: 'MINUTES') {
        steps.input(
          message: message ?: "Approve production operation?",
          ok: "Approve"
        )
      }
    }
  }

  void protectService(String service, String envName = 'global') {

    def cfg = loadJson('policies/protected-services.json')

    def list = []
    list += cfg.global ?: []
    list += cfg[envName] ?: []

    if (list.contains(service)) {
      requireApproval(
        envName,
        "Protected service '${service}' requires approval"
      )
    }
  }

  void validateDeploy(String service, String envName) {

    if (!service?.trim()) {
      steps.error("Service is required")
    }

    blockIfFreezeEnabled()
    validateBranchForEnv(envName)
    protectService(service, envName)
  }

  void info(String msg) {
    steps.echo("GOVERNANCE: ${msg}")
  }
}
