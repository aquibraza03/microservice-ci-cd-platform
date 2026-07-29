package org.platform

class PipelineLogger implements Serializable {

  def steps

  PipelineLogger(steps) {
    this.steps = steps
  }

  void info(String message) {
    steps.echo("[INFO] [${timestamp()}] ${message}")
  }

  void warn(String message) {
    steps.echo("[WARN] [${timestamp()}] ${message}")
  }

  void error(String message) {
    steps.echo("[ERROR] [${timestamp()}] ${message}")
  }

  void stage(String stageName) {
    steps.echo("[STAGE] [${timestamp()}] Entering stage: ${stageName}")
  }

  void section(String title) {
    steps.echo("")
    steps.echo("=" * 72)
    steps.echo("  ${title}")
    steps.echo("=" * 72)
  }

  void keyValue(String key, String value) {
    steps.echo("  ${key}: ${value}")
  }

  void divider() {
    steps.echo("-" * 72)
  }

  void sh(String command) {
    steps.echo("[EXEC] [${timestamp()}] ${command}")
  }

  private String timestamp() {
    return new Date().format("yyyy-MM-dd HH:mm:ss")
  }
}
