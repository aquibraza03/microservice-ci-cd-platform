import groovy.json.JsonOutput

def call(Map config = [:]) {

  def webhook = config.webhook ?: env.SLACK_WEBHOOK_URL
  def status = (config.status ?: 'info').toLowerCase()
  def title = config.title ?: 'Jenkins Notification'
  def message = config.message ?: 'Pipeline event'
  def channel = config.channel ?: ''
  def username = config.username ?: 'Jenkins'
  def icon = config.icon ?: ':rocket:'
  def mention = config.mention ?: ''
  def footer = config.footer ?: 'CI/CD Notification'

  if (!webhook?.trim()) {
    echo "Slack webhook not configured. Skipping notification."
    return
  }

  def color = '#439FE0'

  switch (status) {
    case 'success':
      color = 'good'
      break
    case 'warning':
      color = 'warning'
      break
    case 'failure':
      color = 'danger'
      break
  }

  def runUrl = env.BUILD_URL ?: ''
  def repo = env.JOB_NAME ?: 'unknown'
  def build = env.BUILD_NUMBER ?: '0'
  def branch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'unknown'

  def payload = [
    username   : username,
    icon_emoji : icon,
    attachments: [[
      color     : color,
      title     : title,
      title_link: runUrl,
      text      : "${mention} ${message}".trim(),
      fields    : [
        [title: 'Job', value: repo, short: true],
        [title: 'Build', value: build, short: true],
        [title: 'Branch', value: branch, short: true],
        [title: 'Status', value: status, short: true]
      ],
      footer    : footer
    ]]
  ]

  if (channel?.trim()) {
    payload.channel = channel
  }

  def body = JsonOutput.toJson(payload)

  retry(2) {
    httpRequest(
      httpMode: 'POST',
      url: webhook,
      contentType: 'APPLICATION_JSON',
      requestBody: body,
      validResponseCodes: '200:299',
      consoleLogResponseBody: false
    )
  }

  echo "Slack notification sent (${status})"
}
