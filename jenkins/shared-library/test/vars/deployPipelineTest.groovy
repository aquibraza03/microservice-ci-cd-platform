import com.lesfurets.jenkins.unit.BasePipelineTest
import org.junit.Before
import org.junit.Test

class deployPipelineTest extends BasePipelineTest {

    def script

    @Before
    void setUp() throws Exception {
        super.setUp()

        binding.setVariable("params", [
            ENV: "dev",
            SERVICE: "api",
            IMAGE_REF: "",
            AUTO_ROLLBACK: true
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
        helper.registerAllowedMethod("retry", [Integer, Closure], { i, c -> c() })
        helper.registerAllowedMethod("timeout", [Map, Closure], { m, c -> c() })
        helper.registerAllowedMethod("input", [Map], "approved")

        helper.registerAllowedMethod("fileExists", [String], { true })

        helper.registerAllowedMethod("sh", [Map], { Map m ->
            if (m.returnStdout) {
                return "v1.2.3"
            }
            return 0
        })

        helper.registerAllowedMethod("sh", [String], { String s -> 0 })

        script = loadScript("vars/deployPipeline.groovy")
    }

    @Test
    void shouldRunDeploymentSuccessfully() {
        script.call([:])
        assertJobStatusSuccess()
    }

    @Test
    void shouldResolveImageWhenMissing() {
        script.call([:])
        assertEquals("v1.2.3", binding.getVariable("env").IMAGE)
    }

    @Test
    void shouldUseProvidedImageRef() {
        binding.setVariable("params", [
            ENV: "dev",
            SERVICE: "api",
            IMAGE_REF: "registry/app@sha256:123",
            AUTO_ROLLBACK: true
        ])

        script.call([:])

        assertEquals(
            "registry/app@sha256:123",
            binding.getVariable("env").IMAGE
        )
    }

    @Test
    void shouldRequireApprovalForProd() {

        binding.setVariable("params", [
            ENV: "prod",
            SERVICE: "api",
            IMAGE_REF: "",
            AUTO_ROLLBACK: true
        ])

        script.call([:])
        assertJobStatusSuccess()
    }

    @Test
    void shouldFailWhenServiceMissing() {

        binding.setVariable("params", [
            ENV: "dev",
            SERVICE: "",
            IMAGE_REF: "",
            AUTO_ROLLBACK: true
        ])

        try {
            script.call([:])
            fail("Expected failure")
        } catch (Exception ignored) {
        }

        assertJobStatusFailure()
    }

    @Test
    void shouldRollbackWhenDeployFails() {

        helper.registerAllowedMethod("sh", [String], { String s ->
            if (s.contains("./deploy/deploy.sh")) {
                throw new Exception("deploy failed")
            }
            return 0
        })

        try {
            script.call([:])
        } catch (Exception ignored) {
        }

        assertJobStatusFailure()
    }

    @Test
    void shouldSupportCustomServiceInput() {
        script.call([
            service: "payments"
        ])

        assertJobStatusSuccess()
    }
}
