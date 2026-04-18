import org.junit.Before
import org.junit.Test
import static org.junit.Assert.*

import org.platform.Governance

class GovernanceTest {

    def steps
    def gov

    @Before
    void setUp() {

        steps = [
            env: [
                BRANCH_NAME: "main",
                GIT_BRANCH : "origin/main"
            ],

            echo: { String msg -> },

            error: { String msg ->
                throw new RuntimeException(msg)
            },

            timeout: { Map cfg, Closure c ->
                c()
            },

            input: { Map cfg ->
                return "approved"
            },

            libraryResource: { String path ->

                if (path == "policies/branch-rules.json") {
                    return '''
                    {
                      "dev": ["develop","main","feature/*"],
                      "staging": ["main","release/*"],
                      "prod": ["main","hotfix/*"]
                    }
                    '''
                }

                if (path == "policies/freeze-window.json") {
                    return '''
                    {
                      "enabled": false,
                      "reason": "Freeze active"
                    }
                    '''
                }

                if (path == "policies/protected-services.json") {
                    return '''
                    {
                      "global": ["payments-service","auth-service"],
                      "prod": ["orders-service"]
                    }
                    '''
                }

                return "{}"
            }
        ]

        gov = new Governance(steps)
    }

    @Test
    void shouldDetectProduction() {
        assertTrue(gov.isProduction("prod"))
        assertFalse(gov.isProduction("dev"))
    }

    @Test
    void shouldAllowMainBranchForProd() {
        gov.validateBranchForEnv("prod")
    }

    @Test(expected = RuntimeException.class)
    void shouldBlockInvalidBranchForProd() {
        steps.env.BRANCH_NAME = "feature/test"
        gov.validateBranchForEnv("prod")
    }

    @Test
    void shouldAllowFeatureBranchForDev() {
        steps.env.BRANCH_NAME = "feature/new-api"
        gov.validateBranchForEnv("dev")
    }

    @Test
    void shouldAllowReleaseBranchForStaging() {
        steps.env.BRANCH_NAME = "release/v1.2.0"
        gov.validateBranchForEnv("staging")
    }

    @Test
    void shouldPassWhenFreezeDisabled() {
        gov.blockIfFreezeEnabled()
    }

    @Test(expected = RuntimeException.class)
    void shouldBlockWhenFreezeEnabled() {

        steps.libraryResource = { String path ->
            if (path == "policies/freeze-window.json") {
                return '''
                {
                  "enabled": true,
                  "reason": "Quarter-end freeze"
                }
                '''
            }
            return "{}"
        }

        gov.blockIfFreezeEnabled()
    }

    @Test
    void shouldRequireApprovalForProtectedGlobalService() {
        gov.protectService("payments-service", "dev")
    }

    @Test
    void shouldRequireApprovalForProtectedProdService() {
        gov.protectService("orders-service", "prod")
    }

    @Test
    void shouldIgnoreUnprotectedService() {
        gov.protectService("catalog-service", "prod")
    }

    @Test(expected = RuntimeException.class)
    void shouldFailBranchValidationInsideDeployValidation() {
        steps.env.BRANCH_NAME = "feature/test"
        gov.validateDeploy("api", "prod")
    }

    @Test
    void shouldPassDeployValidationForMainBranch() {
        gov.validateDeploy("api", "prod")
    }
}
