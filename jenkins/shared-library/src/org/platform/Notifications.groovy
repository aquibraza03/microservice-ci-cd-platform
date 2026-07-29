package org.platform

import groovy.json.JsonOutput
import groovy.json.JsonSlurper

class Notifications implements Serializable {

  def steps

  Notifications(steps) {
    this.steps = steps
  }

  private Map loadConfig() {
    try {
      def raw = steps.libraryResource('notifications/slack.json')
      return new JsonSlurper().parseText(raw)
    } catch (err) {
      return [:]
    }
  }

  void slack(Map cfg = [:]) {
    def slackCfg = loadConfig()

    def webhook = cfg.webhook ?: steps.env.SLACK_WEBHOOK_URL
    if (!webhook?.trim()) {
      steps.echo("Slack webhook missing. Skip.")
      return
    }

    def status = (cfg.status ?: 'info').toLowerCase()
    def titles = slackCfg.titles ?: [:]
    def colors = slackCfg.colors ?: [:]
    def mentions = slackCfg.mentions ?: [:]

    def title = cfg.title ?: titles[status] ?: 'Jenkins Notification'
    def message = cfg.message ?: 'Pipeline event'
    def mention = cfg.mention ?: mentions[status] ?: ''
    def channel = cfg.channel ?: (slackCfg.defaultChannel ?: '')
    def username = cfg.username ?: (slackCfg.username ?: 'Jenkins')
    def icon = cfg.icon ?: (slackCfg.icon ?: ':rocket:')
    def footer = cfg.footer ?: (slackCfg.footer ?: 'CI/CD Notification')

    def color = colors[status] ?: '#439FE0'

    def payload = [
      username   : username,
      icon_emoji : icon,
      attachments: [[
        color     : color,
        title     : title,
        title_link: steps.env.BUILD_URL ?: '',
        text      : "${mention} ${message}".trim(),
        fields    : [
          [title: 'Job', value: steps.env.JOB_NAME ?: 'unknown', short: true],
          [title: 'Build', value: steps.env.BUILD_NUMBER ?: '0', short: true],
          [title: 'Branch', value: steps.env.BRANCH_NAME ?: 'unknown', short: true]
        ],
        footer    : footer
      ]]
    ]

    if (channel?.trim()) {
      payload.channel = channel
    }

    steps.httpRequest(
      httpMode: 'POST',
      url: webhook,
      contentType: 'APPLICATION_JSON',
      requestBody: JsonOutput.toJson(payload),
      validResponseCodes: '200:299'
    )
  }

  void email(Map cfg = [:]) {
    def to = cfg.to ?: ''
    if (!to?.trim()) {
      steps.echo("Email recipients missing. Skip.")
      return
    }

    def subject = cfg.subject ?: 'Jenkins Notification'
    def body = cfg.body ?: 'Pipeline event'

    steps.mail(
      to: to,
      subject: subject,
      body: body
    )
  }

  void pipelineStatus(String status, String message) {
    slack(
      status: status,
      title: "Pipeline ${status.toUpperCase()}",
      message: message
    )
  }

  void approvalNeeded(String message) {
    slack(
      status: 'warning',
      title: 'Approval Required',
      message: message,
      mention: '@here'
    )
  }

  void failure(String message) {
    slack(
      status: 'failure',
      title: 'Pipeline Failed',
      message: message,
      mention: '@here'
    )
  }

  void success(String message) {
    slack(
      status: 'success',
      title: 'Pipeline Succeeded',
      message: message
    )
  }
}
