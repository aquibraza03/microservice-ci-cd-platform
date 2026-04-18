def call(Map config = [:]) {

  def defaultContainer = config.container ?: 'runner'
  def environmentName = config.env ?: (params.ENV ?: 'dev')
  def serviceName = config.service ?: (params.SERVICE ?: '')
  def autoRollback = config.get('autoRollback', true)
  def requireApproval = config.get('requireApproval', true)

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
      timeout(time: 45, unit: 'MINUTES')
      buildDiscarder(logRotator(
        numToKeepStr: '20',
        artifactNumToKeepStr: '10'
      ))
    }

    environment {
      CI = "true"
      PLATFORM_ENV = "${environmentName}"
      SERVICE_NAME = "${serviceName}"
    }

    stages {

      stage('Checkout') {
        steps {
          checkout scm
        }
      }

      stage('Validate Inputs') {
        steps {
          script {
            if (!env.SERVICE_NAME?.trim()) {
              error("SERVICE is required")
            }

            if (!fileExists("services/${env.SERVICE_NAME}")) {
              error("Service not found: services/${env.SERVICE_NAME}")
            }

            env.IMAGE = config.image ?: (params.IMAGE_REF ?: '').trim()

            if (!env.IMAGE) {
              env.IMAGE = sh(
                script: './ci/versioning.sh',
                returnStdout: true
              ).trim()
            }

            if (!env.IMAGE) {
              error("Unable to resolve deployment image")
            }
          }
        }
      }

      stage('Policy Checks') {
        steps {
          container(defaultContainer) {
            sh '''
              chmod +x ci/*.sh deploy/*.sh scripts/*.sh 2>/dev/null || true

              if [ -f ./ci/policy.sh ]; then
                ./ci/policy.sh
              fi
            '''
          }
        }
      }

      stage('Pre-Deploy Validation') {
        steps {
          container(defaultContainer) {
            sh """
              if [ -f ./ci/validate-service.sh ]; then
                ./ci/validate-service.sh ${SERVICE_NAME}
              fi
            """
          }
        }
      }

      stage('Approval Gate') {
        when {
          expression {
            return PLATFORM_ENV == 'prod' && requireApproval
          }
        }

        steps {
          timeout(time: 20, unit: 'MINUTES') {
            input(
              message: "Approve deployment of ${SERVICE_NAME} to PROD?",
              ok: "Deploy"
            )
          }
        }
      }

      stage('Deploy') {
        steps {
          container(defaultContainer) {
            retry(2) {
              sh """
                export SERVICE=${SERVICE_NAME}
                export IMAGE_REF=${IMAGE}

                ./deploy/deploy.sh ${PLATFORM_ENV}
              """
            }
          }
        }
      }

      stage('Smoke Test') {
        steps {
          container(defaultContainer) {
            sh """
              if [ -f ./ci/smoke-test.sh ]; then
                ./ci/smoke-test.sh ${SERVICE_NAME}
              fi
            """
          }
        }
      }
    }

    post {

      success {
        echo "✅ Deployment succeeded"

        container(defaultContainer) {
          sh """
            if [ -f ./scripts/notify.sh ]; then
              ./scripts/notify.sh success \
              "Deployment successful: ${SERVICE_NAME} -> ${PLATFORM_ENV}"
            fi
          """
        }
      }

      failure {
        echo "❌ Deployment failed"

        script {
          if (autoRollback) {
            container(defaultContainer) {
              sh """
                if [ -f ./deploy/rollback.sh ]; then
                  ./deploy/rollback.sh ${PLATFORM_ENV} ${SERVICE_NAME}
                fi
              """
            }
          }
        }

        container(defaultContainer) {
          sh """
            if [ -f ./scripts/notify.sh ]; then
              ./scripts/notify.sh failure \
              "Deployment failed: ${SERVICE_NAME} -> ${PLATFORM_ENV}"
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
          artifacts: 'reports/**',
          allowEmptyArchive: true
        )

        script {
          currentBuild.description =
            "${SERVICE_NAME} | ${PLATFORM_ENV} | ${IMAGE}"
        }
      }
    }
  }
}
