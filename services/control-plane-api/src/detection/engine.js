const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const YAML = require("yaml");
const { ControlPlaneError } = require("../errors");
const { recognizeExperimental } = require("./tier2-rules");

const ENGINE_VERSION = "1.0.0";
const DEFAULT_LIMITS = {
  maxBytes: 64 * 1024 * 1024,
  maxFiles: 10000,
  maxDepth: 24,
  maxFileBytes: 512 * 1024,
  timeoutMs: 5000,
};
const IGNORED = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
]);
const SENSITIVE =
  /(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|id_rsa|credentials(?:\.json)?|secrets?\.(?:ya?ml|json))$/i;
const TEXT =
  /(?:^|\/)(?:service\.ya?ml|Dockerfile(?:\.[\w.-]+)?|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|pyproject\.toml|go\.mod|pom\.xml|build\.gradle(?:\.kts)?|[\w.-]+\.(?:js|cjs|mjs|ts|tsx|json|ya?ml))$/i;

function safeRelative(value, label = "path") {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    path.isAbsolute(value)
  )
    throw new ControlPlaneError(
      400,
      "DETECTION_PATH_INVALID",
      `${label} is invalid`,
    );
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../"))
    throw new ControlPlaneError(
      400,
      "DETECTION_PATH_INVALID",
      `${label} escapes repository root`,
    );
  return normalized === "" ? "." : normalized;
}
function field(value, confidence, evidence) {
  return {
    value: value ?? null,
    confidence,
    evidence: Array.isArray(evidence) ? evidence : [evidence],
  };
}
function candidateId(repositoryId, commitSha, root) {
  return `cand_${crypto.createHash("sha256").update(`${repositoryId}\0${commitSha}\0${root}`).digest("hex").slice(0, 24)}`;
}
function cleanCommand(value) {
  return typeof value === "string" &&
    value.length <= 512 &&
    !/[\r\n\0]/.test(value)
    ? value
    : null;
}
function envNames(text) {
  const found = new Set();
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
    /\$\{([A-Z][A-Z0-9_]*)\}/g,
  ];
  for (const re of patterns)
    for (const match of text.matchAll(re)) found.add(match[1]);
  return [...found].sort().slice(0, 200);
}

async function scan(root, limits = {}) {
  const config = { ...DEFAULT_LIMITS, ...limits };
  const started = Date.now();
  const files = new Map();
  let bytes = 0;
  let count = 0;
  const absoluteRoot = await fs.realpath(root);
  async function walk(directory, depth) {
    if (Date.now() - started > config.timeoutMs)
      throw new ControlPlaneError(
        408,
        "DETECTION_TIMEOUT",
        "Repository detection timed out",
      );
    if (depth > config.maxDepth)
      throw new ControlPlaneError(
        413,
        "REPOSITORY_NESTING_EXCESSIVE",
        "Repository nesting depth exceeds detection limit",
      );
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || IGNORED.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path
        .relative(absoluteRoot, absolute)
        .split(path.sep)
        .join("/");
      const stat = await fs.lstat(absolute);
      count += 1;
      bytes += stat.size;
      if (count > config.maxFiles)
        throw new ControlPlaneError(
          413,
          "REPOSITORY_FILE_COUNT_EXCESSIVE",
          "Repository file count exceeds detection limit",
        );
      if (bytes > config.maxBytes)
        throw new ControlPlaneError(
          413,
          "REPOSITORY_TOO_LARGE",
          "Repository exceeds detection size limit",
        );
      if (stat.isSymbolicLink())
        throw new ControlPlaneError(
          400,
          "DETECTION_SYMLINK_REJECTED",
          "Symlinks are not inspected during detection",
        );
      if (stat.isDirectory()) {
        await walk(absolute, depth + 1);
        continue;
      }
      if (!stat.isFile() || SENSITIVE.test(relative) || !TEXT.test(relative))
        continue;
      if (stat.size > config.maxFileBytes)
        throw new ControlPlaneError(
          413,
          "DETECTION_FILE_TOO_LARGE",
          "An inspected metadata file exceeds the size limit",
        );
      const buffer = await fs.readFile(absolute);
      if (buffer.includes(0)) continue;
      files.set(relative, buffer.toString("utf8"));
    }
  }
  await walk(absoluteRoot, 0);
  return {
    root: absoluteRoot,
    files,
    stats: { fileCount: count, totalBytes: bytes },
  };
}

function parseServiceYaml(text, source, warnings) {
  let doc;
  try {
    doc = YAML.parse(text);
  } catch {
    warnings.push({
      code: "SERVICE_YML_INVALID",
      message: `${source} is invalid YAML`,
    });
    return null;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    warnings.push({
      code: "SERVICE_YML_INVALID",
      message: `${source} must contain an object`,
    });
    return null;
  }
  const service =
    doc.service && typeof doc.service === "object" ? doc.service : doc;
  return {
    name: service.name,
    dockerfile: service.dockerfile || service.build?.dockerfile,
    context: service.context || service.build?.context,
    build: service.buildCommand || service.build?.command,
    test: service.testCommand || service.test?.command,
    start: service.startCommand || service.run?.command,
    port: service.port || service.containerPort,
    health: service.healthPath || service.health?.path,
    readiness: service.readinessPath || service.readiness?.path,
  };
}
function packageManager(files, root) {
  if (files.has(path.posix.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (files.has(path.posix.join(root, "yarn.lock"))) return "yarn";
  return "npm";
}
function dockerRoots(files) {
  return [...files.keys()]
    .filter((f) => path.posix.basename(f) === "Dockerfile")
    .map((f) => path.posix.dirname(f) || ".");
}
function packageRoots(files) {
  return [...files.keys()]
    .filter((f) => path.posix.basename(f) === "package.json")
    .map((f) => path.posix.dirname(f) || ".");
}
function readPackage(files, root, warnings) {
  try {
    return JSON.parse(
      files.get(path.posix.join(root === "." ? "" : root, "package.json")),
    );
  } catch {
    warnings.push({
      code: "PACKAGE_JSON_INVALID",
      message: `Invalid package.json at ${root}`,
    });
    return null;
  }
}

async function detectRepository({ root, repositoryId, commitSha, limits }) {
  if (!repositoryId || !/^[a-f0-9]{40,64}$/i.test(commitSha || ""))
    throw new ControlPlaneError(
      400,
      "DETECTION_INPUT_INVALID",
      "Repository ID and immutable commit SHA are required",
    );
  const inventory = await scan(root, limits);
  const warnings = [];
  const roots = new Set([
    ...dockerRoots(inventory.files),
    ...packageRoots(inventory.files),
  ]);
  for (const file of inventory.files.keys())
    if (/service\.ya?ml$/i.test(file))
      roots.add(path.posix.dirname(file) || ".");
  const candidates = [];
  for (const rootPath of [...roots].sort()) {
    const prefix = rootPath === "." ? "" : `${rootPath}/`;
    const serviceFile = [...inventory.files.keys()].find(
      (f) => f === `${prefix}service.yml` || f === `${prefix}service.yaml`,
    );
    const svc = serviceFile
      ? parseServiceYaml(
          inventory.files.get(serviceFile),
          serviceFile,
          warnings,
        )
      : null;
    const dockerfilePath = `${prefix}Dockerfile`;
    const hasDockerfile = inventory.files.has(dockerfilePath);
    const pkg = inventory.files.has(`${prefix}package.json`)
      ? readPackage(inventory.files, rootPath, warnings)
      : null;
    if (!svc && !hasDockerfile && !pkg) continue;
    const evidence = [];
    if (serviceFile) evidence.push(serviceFile);
    if (hasDockerfile) evidence.push(dockerfilePath);
    if (pkg) evidence.push(`${prefix}package.json`);
    const nameSources = [
      svc?.name,
      pkg?.name,
      path.posix.basename(rootPath),
    ].filter(Boolean);
    const distinctNames = [...new Set(nameSources)];
    const conflicts = [];
    if (
      distinctNames.length > 1 &&
      svc?.name &&
      pkg?.name &&
      svc.name !== pkg.name
    )
      conflicts.push({
        field: "serviceName",
        values: [
          { source: serviceFile, value: svc.name },
          { source: `${prefix}package.json`, value: pkg.name },
        ],
      });
    const scripts = pkg?.scripts || {};
    const pm = pkg ? packageManager(inventory.files, rootPath) : null;
    const env = new Set();
    for (const [file, text] of inventory.files)
      if (file.startsWith(prefix))
        for (const key of envNames(text)) env.add(key);
    const dockerEvidence = hasDockerfile ? dockerfilePath : serviceFile;
    const serviceRoot = safeRelative(rootPath, "service root");
    const context = safeRelative(
      svc?.context
        ? path.posix.join(rootPath === "." ? "" : rootPath, svc.context)
        : rootPath,
      "build context",
    );
    const docker = safeRelative(
      svc?.dockerfile
        ? path.posix.join(rootPath === "." ? "" : rootPath, svc.dockerfile)
        : hasDockerfile
          ? dockerfilePath
          : `${prefix}Dockerfile`,
      "Dockerfile path",
    );
    const runtime = pkg ? "node" : hasDockerfile ? "container" : "unknown";
    const framework =
      pkg?.dependencies?.next || pkg?.devDependencies?.next
        ? "nextjs"
        : pkg?.dependencies?.express
          ? "express"
          : null;
    candidates.push({
      id: candidateId(repositoryId, commitSha, serviceRoot),
      serviceRoot: field(serviceRoot, "high", evidence),
      serviceName: field(
        svc?.name || pkg?.name || path.posix.basename(serviceRoot),
        svc?.name ? "high" : pkg?.name ? "medium" : "low",
        evidence,
      ),
      runtime: field(
        runtime,
        pkg ? "high" : hasDockerfile ? "medium" : "low",
        evidence,
      ),
      framework: field(framework, framework ? "high" : "low", evidence),
      dockerfilePath: field(
        docker,
        hasDockerfile || svc?.dockerfile ? "high" : "low",
        dockerEvidence,
      ),
      buildContext: field(
        context,
        svc?.context ? "high" : "medium",
        serviceFile || evidence,
      ),
      packageManager: field(
        pm,
        pm ? "high" : "low",
        pkg ? `${prefix}package.json` : evidence,
      ),
      proposedBuildCommand: field(
        cleanCommand(svc?.build) ||
          (pkg?.scripts?.build ? `${pm} run build` : null),
        svc?.build ? "high" : scripts.build ? "medium" : "low",
        serviceFile || `${prefix}package.json`,
      ),
      proposedTestCommand: field(
        cleanCommand(svc?.test) || (pkg?.scripts?.test ? `${pm} test` : null),
        svc?.test ? "high" : scripts.test ? "medium" : "low",
        serviceFile || `${prefix}package.json`,
      ),
      proposedStartCommand: field(
        cleanCommand(svc?.start) ||
          (pkg?.scripts?.start ? `${pm} start` : null),
        svc?.start ? "high" : scripts.start ? "medium" : "low",
        serviceFile || `${prefix}package.json`,
      ),
      containerPort: field(
        Number.isInteger(Number(svc?.port)) ? Number(svc.port) : null,
        svc?.port ? "high" : "low",
        serviceFile || evidence,
      ),
      healthPath: field(
        svc?.health || null,
        svc?.health ? "high" : "low",
        serviceFile || evidence,
      ),
      readinessPath: field(
        svc?.readiness || null,
        svc?.readiness ? "high" : "low",
        serviceFile || evidence,
      ),
      environmentVariableNames: field(
        [...env],
        env.size ? "medium" : "low",
        [...inventory.files.keys()].filter((f) => f.startsWith(prefix)),
      ),
      conflicts,
      requiresConfirmation: conflicts.length > 0 || !hasDockerfile,
      evidence,
      warnings: [],
    });
  }
  const duplicates = new Map();
  for (const c of candidates) {
    const n = c.serviceName.value;
    duplicates.set(n, (duplicates.get(n) || 0) + 1);
  }
  for (const c of candidates)
    if (duplicates.get(c.serviceName.value) > 1) {
      c.warnings.push({
        code: "DUPLICATE_SERVICE_NAME",
        message: "Candidate name is not unique",
      });
      c.requiresConfirmation = true;
    }
  for (let i = 0; i < candidates.length; i += 1)
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i].buildContext.value,
        b = candidates[j].buildContext.value;
      if (
        a === b ||
        a === "." ||
        b === "." ||
        a.startsWith(`${b}/`) ||
        b.startsWith(`${a}/`)
      ) {
        for (const c of [candidates[i], candidates[j]]) {
          c.warnings.push({
            code: "OVERLAPPING_BUILD_CONTEXT",
            message:
              "Build context overlaps another candidate and must be narrowed before save",
          });
          c.requiresConfirmation = true;
        }
      }
    }
  if (!candidates.length)
    warnings.push({
      code: "UNSUPPORTED_PROJECT",
      message: "No deployable Tier 1 service candidate was found",
    });
  return {
    schemaVersion: "1",
    detectionEngineVersion: ENGINE_VERSION,
    repositoryId,
    commitSha: commitSha.toLowerCase(),
    candidates,
    warnings,
    inspected: inventory.stats,
    tier2: recognizeExperimental(inventory.files.keys()),
  };
}
module.exports = {
  ENGINE_VERSION,
  DEFAULT_LIMITS,
  detectRepository,
  scan,
  safeRelative,
  candidateId,
};
