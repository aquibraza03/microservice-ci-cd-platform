def call(Map config = [:]) {

  def defaultContainer = config.container ?: 'runner'
  def failFast = config.get('failFast', true)
  def runSmoke = config.get('smokeTest', true)

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
        numToKeepStr: '20',
        artifactNumToKeepStr: '10'
      ))
    }

    environment {
      CI = "true"
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
              chmod +x ci/*.sh scripts/*.sh deploy/*.sh 2>/dev/null || true
            '''
          }
        }
      }

      stage('Policy Checks') {
        steps {
          container(defaultContainer) {
            sh '''
              if [ -f ./ci/policy.sh ]; then
                ./ci/policy.sh
              fi
            '''
          }
        }
      }

      stage('Detect Changed Services') {
        steps {
          container(defaultContainer) {
            sh '''
              if [ -f ./ci/detect-services.sh ]; then
                ./ci/detect-services.sh > services.txt
              else
                find services -maxdepth 1 -mindepth 1 -type d | xargs -n1 basename > services.txt
              fi
            '''
          }

          script {
            env.SERVICES = readFile('services.txt').trim()
          }
        }
      }

      stage('Service Matrix CI') {
        when {
          expression { return env.SERVICES }
        }

        steps {
          script {
            def services = env.SERVICES.split("\n")
            def builds = [:]

            for (svc in services) {
              def serviceName = svc.trim()

              builds[serviceName] = {
                stage("CI - ${serviceName}") {
                  container(defaultContainer) {
                    sh """
                      export SERVICE=${serviceName}

                      if [ -f ./ci/validate-service.sh ]; then
                        ./ci/validate-service.sh ${serviceName}
                      fi

                      if [ -f ./ci/versioning.sh ]; then
                        ./ci/versioning.sh ${serviceName}
                      fi

                      if [ -f ./ci/build.sh ]; then
                        ./ci/build.sh ${serviceName}
                      fi

                      if [ -f ./ci/test.sh ]; then
                        ./ci/test.sh ${serviceName}
                      fi

                      if [ -f ./ci/security.sh ]; then
                        ./ci/security.sh ${serviceName}
                      fi
                    """
                  }
                }
              }
            }

            parallel builds + [failFast: failFast]
          }
        }
      }

      stage('Docker Build') {
        steps {
          container(defaultContainer) {
            sh '''
              if [ -f ./ci/docker-buildx.sh ]; then
                ./ci/docker-buildx.sh
              fi
            '''
          }
        }
      }

      stage('Smoke Test') {
        when {
          expression { return runSmoke }
        }

        steps {
          container(defaultContainer) {
            sh '''
              if [ -f ./ci/smoke-test.sh ]; then
                ./ci/smoke-test.sh
              fi
            '''
          }
        }
      }
    }

    post {

      success {
        echo "✅ CI pipeline succeeded"

        container(defaultContainer) {
          sh '''
            if [ -f ./scripts/notify.sh ]; then
              ./scripts/notify.sh success "CI pipeline succeeded"
            fi
          '''
        }
      }

      failure {
        echo "❌ CI pipeline failed"

        container(defaultContainer) {
          sh '''
            if [ -f ./scripts/notify.sh ]; then
              ./scripts/notify.sh failure "CI pipeline failed"
            fi
          '''
        }
      }

      always {
        junit(
          allowEmptyResults: true,
          testResults: '**/test-results.xml'
        )

        archiveArtifacts(
          artifacts: 'services.txt, reports/**',
          allowEmptyArchive: true
        )

        script {
          currentBuild.description = "Monorepo CI"
        }
      }
    }
  }
}
