import groovy.json.JsonOutput
import groovy.json.JsonSlurper

def call(Map config = [:]) {

  def webhook = config.webhook ?: env.SLACK_WEBHOOK_URL
  if (!webhook?.trim()) {
    echo "Slack webhook not configured. Skipping notification."
    return
  }

  def slackCfg = [:]
  try {
    def raw = libraryResource('notifications/slack.json')
    slackCfg = new JsonSlurper().parseText(raw)
  } catch (err) {
    slackCfg = [:]
  }

  def status = (config.status ?: 'info').toLowerCase()
  def title = config.title ?: (slackCfg.titles ?: [:])[status] ?: 'Jenkins Notification'
  def message = config.message ?: 'Pipeline event'
  def channel = config.channel ?: (slackCfg.defaultChannel ?: '')
  def username = config.username ?: (slackCfg.username ?: 'Jenkins')
  def icon = config.icon ?: (slackCfg.icon ?: ':rocket:')
  def mention = config.mention ?: ''
  def footer = config.footer ?: (slackCfg.footer ?: 'CI/CD Notification')

  def colors = slackCfg.colors ?: [:]
  def color = colors[status] ?: '#439FE0'

  def mentions = slackCfg.mentions ?: [:]
  def resolvedMention = mention ?: (mentions[status] ?: '')

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
      text      : "${resolvedMention} ${message}".trim(),
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
