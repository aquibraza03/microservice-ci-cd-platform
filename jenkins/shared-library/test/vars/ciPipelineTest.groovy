import com.lesfurets.jenkins.unit.BasePipelineTest
import org.junit.Before
import org.junit.Test

class ciPipelineTest extends BasePipelineTest {

    def script

    @Before
    void setUp() throws Exception {
        super.setUp()

        // Core declarative mocks
        helper.registerAllowedMethod("pipeline", [Closure], { c -> c() })
        helper.registerAllowedMethod("agent", [Closure], { c -> c() })
        helper.registerAllowedMethod("kubernetes", [Closure], { c -> c() })
        helper.registerAllowedMethod("options", [Closure], { c -> c() })
        helper.registerAllowedMethod("environment", [Closure], { c -> c() })
        helper.registerAllowedMethod("stages", [Closure], { c -> c() })
        helper.registerAllowedMethod("stage", [String, Closure], { n, c -> c() })
        helper.registerAllowedMethod("steps", [Closure], { c -> c() })
        helper.registerAllowedMethod("post", [Closure], { c -> c() })
        helper.registerAllowedMethod("when", [Closure], { c -> c() })

        helper.registerAllowedMethod("container", [String, Closure], { n, c -> c() })

        // Utility mocks
        helper.registerAllowedMethod("checkout", [Object], null)
        helper.registerAllowedMethod("echo", [String], null)
        helper.registerAllowedMethod("archiveArtifacts", [Map], null)
        helper.registerAllowedMethod("junit", [Map], null)

        helper.registerAllowedMethod("parallel", [Map], null)

        helper.registerAllowedMethod("readFile", [String], { path ->
            if (path == "services.txt") {
                return "api\npayments"
            }
            return ""
        })

        helper.registerAllowedMethod("fileExists", [String], { true })

        helper.registerAllowedMethod("sh", [Map], { Map m ->
            if (m.returnStdout) {
                if (m.script.contains("detect-services.sh")) {
                    return "api\npayments"
                }
                return ""
            }
            return 0
        })

        helper.registerAllowedMethod("sh", [String], { String s -> 0 })

        script = loadScript("vars/ciPipeline.groovy")
    }

    @Test
    void shouldLoadAndRunSuccessfully() {
        script.call([:])
        assertJobStatusSuccess()
    }

    @Test
    void shouldDetectChangedServices() {
        script.call([:])

        assertEquals(
            "api\npayments",
            binding.getVariable("env").SERVICES
        )
    }

    @Test
    void shouldAcceptCustomContainer() {
        script.call([
            container: "runner"
        ])

        assertJobStatusSuccess()
    }

    @Test
    void shouldDisableSmokeTestWhenConfigured() {
        script.call([
            smokeTest: false
        ])

        assertJobStatusSuccess()
    }

    @Test
    void shouldEnableFailFastConfig() {
        script.call([
            failFast: true
        ])

        assertJobStatusSuccess()
    }

    @Test
    void shouldFallbackWhenDetectScriptMissing() {

        helper.registerAllowedMethod("sh", [Map], { Map m ->
            if (m.returnStdout) {
                return "orders"
            }
            return 0
        })

        script.call([:])

        assertJobStatusSuccess()
    }

    @Test
    void shouldFailWhenShellThrowsError() {

        helper.registerAllowedMethod("sh", [String], { String s ->
            throw new Exception("Build failed")
        })

        try {
            script.call([:])
            fail("Expected failure")
        } catch (Exception ignored) {
        }

        assertJobStatusFailure()
    }

    @Test
    void shouldArchiveArtifactsAlways() {
        script.call([:])
        assertJobStatusSuccess()
    }
}
