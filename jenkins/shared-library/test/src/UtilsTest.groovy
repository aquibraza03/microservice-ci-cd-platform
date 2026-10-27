import org.junit.Before
import org.junit.Test
import static org.junit.Assert.*

import org.platform.Utils

class UtilsTest {

    def steps
    def utils

    @Before
    void setUp() {

        steps = [
            env: [
                BRANCH_NAME : "main",
                GIT_BRANCH  : "origin/main",
                BUILD_NUMBER: "42",
                JOB_NAME    : "platform-ci"
            ],

            fileExists: { String path ->
                return path == "services/api"
            },

            sh: { Map m ->
                if (m.returnStdout) {
                    return " output-value \n"
                }
                return 0
            },

            echo: { String msg -> },

            error: { String msg ->
                throw new RuntimeException(msg)
            },

            currentBuild: [
                description: ""
            ]
        ]

        utils = new Utils(steps)
    }

    @Test
    void shouldReturnBranchName() {
        assertEquals("main", utils.branchName())
    }

    @Test
    void shouldDetectMainBranch() {
        assertTrue(utils.isMainBranch())
    }

    @Test
    void shouldReturnFalseForNonMainBranch() {
        steps.env.BRANCH_NAME = "feature/test"
        assertFalse(utils.isMainBranch())
    }

    @Test
    void shouldValidateExistingService() {
        utils.requireService("api")
    }

    @Test(expected = RuntimeException.class)
    void shouldFailWhenServiceMissing() {
        utils.requireService("missing-service")
    }

    @Test
    void shouldTrimShellOutput() {
        assertEquals(
            "output-value",
            utils.shOut("echo test")
        )
    }

    @Test
    void shouldReturnDefaultWhenEmpty() {
        assertEquals(
            "fallback",
            utils.defaultIfEmpty("", "fallback")
        )
    }

    @Test
    void shouldReturnOriginalWhenPresent() {
        assertEquals(
            "real",
            utils.defaultIfEmpty("real", "fallback")
        )
    }

    @Test
    void shouldBuildDisplayString() {
        assertEquals(
            "#42 platform-ci",
            utils.buildDisplay()
        )
    }

    @Test
    void shouldSetBuildDescription() {
        utils.setDescription("Deploying")

        assertEquals(
            "Deploying",
            steps.currentBuild.description
        )
    }
}
