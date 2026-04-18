def call(Map config = [:]) {

  def reportDir = config.reportDir ?: 'reports'
  def reportFiles = config.reportFiles ?: 'index.html'
  def reportName = config.reportName ?: 'Pipeline Report'
  def keepAll = config.get('keepAll', true)
  def allowMissing = config.get('allowMissing', true)
  def alwaysLinkToLastBuild = config.get('alwaysLinkToLastBuild', true)

  try {
    publishHTML([
      allowMissing: allowMissing,
      alwaysLinkToLastBuild: alwaysLinkToLastBuild,
      keepAll: keepAll,
      reportDir: reportDir,
      reportFiles: reportFiles,
      reportName: reportName
    ])

    echo "HTML report published: ${reportDir}/${reportFiles}"

  } catch (err) {

    if (allowMissing) {
      echo "HTML report not found: ${reportDir}/${reportFiles}"
    } else {
      throw err
    }
  }
}
