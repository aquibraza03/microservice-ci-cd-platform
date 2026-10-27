// Recognition-only provider rules. They never execute manifests or project code.
// These are intentionally experimental until each runtime has complete fixtures and acceptance tests.
const RULES = Object.freeze([
  { runtime: "python", files: ["pyproject.toml", "requirements.txt"] },
  { runtime: "go", files: ["go.mod"] },
  { runtime: "java-maven", files: ["pom.xml"] },
  { runtime: "java-gradle", files: ["build.gradle", "build.gradle.kts"] },
]);
function recognizeExperimental(files) {
  return RULES.filter((rule) =>
    rule.files.some((name) =>
      [...files].some((file) => file === name || file.endsWith(`/${name}`)),
    ),
  ).map((rule) => ({
    runtime: rule.runtime,
    status: "experimental",
    evidence: rule.files.filter((name) =>
      [...files].some((file) => file === name || file.endsWith(`/${name}`)),
    ),
  }));
}
module.exports = { RULES, recognizeExperimental };
