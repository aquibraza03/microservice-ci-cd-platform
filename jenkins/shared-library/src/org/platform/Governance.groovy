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

  private boolean globMatch(String pattern, String branch) {
    if (pattern == branch) return true
    if (pattern.endsWith('/*')) {
      def prefix = pattern.substring(0, pattern.length() - 1)
      return branch.startsWith(prefix)
    }
    if (pattern.endsWith('**')) {
      def prefix = pattern.substring(0, pattern.length() - 2)
      return branch.startsWith(prefix)
    }
    return false
  }

  void validateBranchForEnv(String envName) {
    def rules = loadJson('policies/branch-rules.json')
    def allowed = rules[envName] ?: []

    if (allowed.isEmpty()) {
      steps.error("No branch rules defined for environment '${envName}'")
    }

    def branch = branchName()
    def matched = allowed.any { pattern -> globMatch(pattern, branch) }

    if (!matched) {
      steps.error(
        "Branch '${branch}' not allowed for ${envName}. Allowed patterns: ${allowed}"
      )
    }
  }

  void blockIfFreezeEnabled() {
    def cfg = loadJson('policies/freeze-window.json')

    if (cfg.enabled == true) {
      steps.error(cfg.reason ?: 'Change freeze enabled')
    }

    if (cfg.freezeWindows instanceof List) {
      def now = new Date().getTime()
      for (window in cfg.freezeWindows) {
        def start = window.start ? Date.parse("yyyy-MM-dd'T'HH:mm:ss'Z'", window.start).getTime() : null
        def end = window.end ? Date.parse("yyyy-MM-dd'T'HH:mm:ss'Z'", window.end).getTime() : null
        if (start && end && now >= start && now <= end) {
          steps.error(window.reason ?: "Change freeze window active")
        }
      }
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
