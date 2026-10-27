package org.platform

class Utils implements Serializable {

  def steps

  Utils(steps) {
    this.steps = steps
  }

  String branchName() {
    return steps.env.BRANCH_NAME ?: steps.env.GIT_BRANCH ?: 'unknown'
  }

  boolean isMainBranch() {
    def branch = branchName()
    return branch == 'main' || branch == 'master'
  }

  boolean fileExists(String path) {
    return steps.fileExists(path)
  }

  void requireFile(String path) {
    if (!steps.fileExists(path)) {
      steps.error("Required file missing: ${path}")
    }
  }

  void requireService(String service) {
    if (!service?.trim()) {
      steps.error("Service name is required")
    }

    if (!steps.fileExists("services/${service}")) {
      steps.error("Service not found: services/${service}")
    }
  }

  String shOut(String cmd) {
    return steps.sh(
      script: cmd,
      returnStdout: true
    ).trim()
  }

  void shRun(String cmd) {
    steps.sh(script: cmd)
  }

  String defaultIfEmpty(def value, String fallback) {
    return value?.toString()?.trim() ? value.toString().trim() : fallback
  }

  void info(String msg) {
    steps.echo("INFO: ${msg}")
  }

  void warn(String msg) {
    steps.echo("WARN: ${msg}")
  }

  void fail(String msg) {
    steps.error(msg)
  }

  String buildDisplay() {
    return "#${steps.env.BUILD_NUMBER} ${steps.env.JOB_NAME}"
  }

  void setDescription(String text) {
    steps.currentBuild.description = text
  }
}
