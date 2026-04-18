package org.platform

import groovy.json.JsonOutput

class Notifications implements Serializable {

  def steps

  Notifications(steps) {
    this.steps = steps
  }

  void slack(Map cfg = [:]) {

    def webhook = cfg.webhook ?: steps.env.SLACK_WEBHOOK_URL
    if (!webhook?.trim()) {
      steps.echo("Slack webhook missing. Skip.")
      return
    }

    def status = (cfg.status ?: 'info').toLowerCase()
    def title = cfg.title ?: 'Jenkins Notification'
    def message = cfg.message ?: 'Pipeline event'
    def mention = cfg.mention ?: ''
    def channel = cfg.channel ?: ''

    def color = '#439FE0'

    switch(status) {
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

    def payload = [
      attachments: [[
        color: color,
        title: title,
        title_link: steps.env.BUILD_URL ?: '',
        text: "${mention} ${message}".trim(),
        fields: [
          [
            title: 'Job',
            value: steps.env.JOB_NAME ?: 'unknown',
            short: true
          ],
          [
            title: 'Build',
            value: steps.env.BUILD_NUMBER ?: '0',
            short: true
          ],
          [
            title: 'Branch',
            value: steps.env.BRANCH_NAME ?: 'unknown',
            short: true
          ]
        ]
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
