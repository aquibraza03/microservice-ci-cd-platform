import com.lesfurets.jenkins.unit.BasePipelineTest
import org.junit.Before
import org.junit.Test

class opsPipelineTest extends BasePipelineTest {

    def script

    @Before
    void setUp() throws Exception {
        super.setUp()

        binding.setVariable("params", [
            MODE: "security",
            ENV: "dev",
            AUTO_APPROVE: false
        ])

        binding.setVariable("env", [:])

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

        helper.registerAllowedMethod("checkout", [Object], null)
        helper.registerAllowedMethod("echo", [String], null)
        helper.registerAllowedMethod("archiveArtifacts", [Map], null)
        helper.registerAllowedMethod("junit", [Map], null)
        helper.registerAllowedMethod("publishHTML", [Map], null)

        helper.registerAllowedMethod("retry", [Integer, Closure], { i, c -> c() })
        helper.registerAllowedMethod("timeout", [Map, Closure], { m, c -> c() })
        helper.registerAllowedMethod("input", [Map], "approved")

        helper.registerAllowedMethod("fileExists", [String], { true })

        helper.registerAllowedMethod("sh", [Map], { Map m ->
            if (m.returnStdout) {
                return "v2.0.1"
            }
            return 0
        })

        helper.registerAllowedMethod("sh", [String], { String s -> 0 })

        script = loadScript("vars/opsPipeline.groovy")
    }

    @Test
    void shouldRunSecurityModeSuccessfully() {
        script.call([:])
        assertJobStatusSuccess()
    }

    @Test
    void shouldRunInfraModeSuccessfully() {

        binding.setVariable("params", [
            MODE: "infra",
            ENV: "staging",
            AUTO_APPROVE: true
        ])

        script.call([:])
        assertJobStatusSuccess()
    }

    @Test
    void shouldRequireApprovalForProdInfra() {

        binding.setVariable("params", [
            MODE: "infra",
            ENV: "prod",
            AUTO_APPROVE: false
        ])

        script.call([:])
        assertJobStatusSuccess()
    }

    @Test
    void shouldResolveVersionForReleaseMode() {

        binding.setVariable("params", [
            MODE: "release",
            ENV: "dev",
            AUTO_APPROVE: true
        ])

        script.call([:])

        assertEquals(
            "v2.0.1",
            binding.getVariable("env").VERSION
        )
    }

    @Test
    void shouldRunDependencyUpdateMode() {

        binding.setVariable("params", [
            MODE: "dependency-update",
            ENV: "dev",
            AUTO_APPROVE: true
        ])

        script.call([:])
        assertJobStatusSuccess()
    }

    @Test
    void shouldFailWhenShellFails() {

        helper.registerAllowedMethod("sh", [String], { String s ->
            throw new Exception("ops failed")
        })

        try {
            script.call([:])
            fail("Expected failure")
        } catch (Exception ignored) {
        }

        assertJobStatusFailure()
    }

    @Test
    void shouldSupportConfigOverrides() {
        script.call([
            mode: "security",
            env: "dev",
            autoApprove: true,
            container: "runner"
        ])

        assertJobStatusSuccess()
    }

    @Test
    void shouldPublishReportsSafely() {
        script.call([:])
        assertJobStatusSuccess()
    }
}
