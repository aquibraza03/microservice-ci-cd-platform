def call(Map config = [:]) {

  def defaultContainer = config.container ?: 'runner'
  def mode = config.mode ?: (params.MODE ?: 'security')
  def environmentName = config.env ?: (params.ENV ?: 'dev')
  def autoApprove = config.get('autoApprove', false)

  pipeline {

    agent {
      kubernetes {
        yamlFile 'jenkins/agents/k8s-pod.yaml'
        defaultContainer defaultContainer
      }
    }

    options {
      skipDefaultCheckout(true)
      timestamps()
      ansiColor('xterm')
      disableConcurrentBuilds()
      timeout(time: 60, unit: 'MINUTES')
      buildDiscarder(logRotator(
        numToKeepStr: '30',
        artifactNumToKeepStr: '15'
      ))
    }

    environment {
      CI = "true"
      PLATFORM_ENV = "${environmentName}"
      OPS_MODE = "${mode}"
    }

    stages {

      stage('Checkout') {
        steps {
          checkout scm
        }
      }

      stage('Init') {
        steps {
          container(defaultContainer) {
            sh '''
              chmod +x ci/*.sh scripts/*.sh infra/*.sh release/*.sh deploy/*.sh 2>/dev/null || true
              mkdir -p reports
            '''
          }
        }
      }

      stage('Security Mode') {
        when {
          expression { return OPS_MODE == 'security' }
        }

        steps {
          container(defaultContainer) {
            retry(2) {
              sh '''
                if [ -f ./ci/security.sh ]; then
                  ./ci/security.sh
                else
                  echo "Missing ci/security.sh"
                  exit 1
                fi
              '''
            }
          }
        }
      }

      stage('Dependency Update Mode') {
        when {
          expression { return OPS_MODE == 'dependency-update' }
        }

        steps {
          container(defaultContainer) {
            retry(2) {
              sh '''
                if [ -f ./ci/dependency-update.sh ]; then
                  ./ci/dependency-update.sh
                else
                  echo "Missing ci/dependency-update.sh"
                  exit 1
                fi
              '''
            }
          }
        }
      }

      stage('Infra Plan') {
        when {
          expression { return OPS_MODE == 'infra' }
        }

        steps {
          container(defaultContainer) {
            sh """
              if [ -f ./infra/terraform-plan.sh ]; then
                ./infra/terraform-plan.sh ${PLATFORM_ENV}
              elif [ -f ./terraform/plan.sh ]; then
                ./terraform/plan.sh ${PLATFORM_ENV}
              else
                echo "Terraform plan script missing"
                exit 1
              fi
            """
          }
        }
      }

      stage('Infra Approval') {
        when {
          expression {
            return OPS_MODE == 'infra' &&
                   (PLATFORM_ENV == 'prod' || !autoApprove)
          }
        }

        steps {
          timeout(time: 20, unit: 'MINUTES') {
            input(
              message: "Approve infrastructure apply for ${PLATFORM_ENV}?",
              ok: "Apply"
            )
          }
        }
      }

      stage('Infra Apply') {
        when {
          expression { return OPS_MODE == 'infra' }
        }

        steps {
          container(defaultContainer) {
            sh """
              if [ -f ./infra/terraform-apply.sh ]; then
                ./infra/terraform-apply.sh ${PLATFORM_ENV}
              elif [ -f ./terraform/apply.sh ]; then
                ./terraform/apply.sh ${PLATFORM_ENV}
              fi
            """
          }
        }
      }

      stage('Resolve Version') {
        when {
          expression { return OPS_MODE == 'release' }
        }

        steps {
          container(defaultContainer) {
            script {
              env.VERSION = sh(
                script: './ci/versioning.sh',
                returnStdout: true
              ).trim()
            }
          }
        }
      }

      stage('Release Approval') {
        when {
          expression {
            return OPS_MODE == 'release' &&
                   (PLATFORM_ENV == 'prod' || !autoApprove)
          }
        }

        steps {
          timeout(time: 20, unit: 'MINUTES') {
            input(
              message: "Approve release ${env.VERSION} to ${PLATFORM_ENV}?",
              ok: "Release"
            )
          }
        }
      }

      stage('Publish Release') {
        when {
          expression { return OPS_MODE == 'release' }
        }

        steps {
          container(defaultContainer) {
            sh """
              if [ -f ./release/release.sh ]; then
                ./release/release.sh ${env.VERSION} ${PLATFORM_ENV}
              elif [ -f ./ci/release.sh ]; then
                ./ci/release.sh ${env.VERSION}
              else
                echo "Release script missing"
                exit 1
              fi
            """
          }
        }
      }
    }

    post {

      success {
        echo "✅ OPS pipeline completed"

        container(defaultContainer) {
          sh """
            if [ -f ./scripts/notify.sh ]; then
              ./scripts/notify.sh success \
              "OPS success: ${OPS_MODE} (${PLATFORM_ENV})"
            fi
          """
        }
      }

      failure {
        echo "❌ OPS pipeline failed"

        container(defaultContainer) {
          sh """
            if [ -f ./scripts/notify.sh ]; then
              ./scripts/notify.sh failure \
              "OPS failed: ${OPS_MODE} (${PLATFORM_ENV})"
            fi
          """
        }
      }

      always {
        junit(
          allowEmptyResults: true,
          testResults: '**/test-results.xml'
        )

        archiveArtifacts(
          artifacts: '**/plan.json, **/*.tfplan, reports/**',
          allowEmptyArchive: true
        )

        publishHTML([
          allowMissing: true,
          alwaysLinkToLastBuild: true,
          keepAll: true,
          reportDir: 'reports',
          reportFiles: 'index.html',
          reportName: 'Pipeline Report'
        ])

        script {
          currentBuild.description =
            "${OPS_MODE} | ${PLATFORM_ENV}"
        }
      }
    }
  }
}
