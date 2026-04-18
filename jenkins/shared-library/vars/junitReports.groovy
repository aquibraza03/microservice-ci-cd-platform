def call(Map config = [:]) {

  def pattern = config.pattern ?: '**/test-results.xml'
  def allowEmpty = config.get('allowEmpty', true)
  def healthScaleFactor = config.get('healthScaleFactor', 1.0)
  def keepLongStdio = config.get('keepLongStdio', false)
  def skipMarkingBuildUnstable = config.get('skipMarkingBuildUnstable', false)

  try {
    junit(
      testResults: pattern,
      allowEmptyResults: allowEmpty,
      healthScaleFactor: healthScaleFactor,
      keepLongStdio: keepLongStdio,
      skipMarkingBuildUnstable: skipMarkingBuildUnstable
    )

    echo "JUnit reports published: ${pattern}"

  } catch (err) {

    if (allowEmpty) {
      echo "No JUnit reports found for pattern: ${pattern}"
    } else {
      throw err
    }
  }
}
