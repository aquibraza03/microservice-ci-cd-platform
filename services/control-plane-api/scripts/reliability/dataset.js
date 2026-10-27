const crypto = require("crypto");

function generator(seed) {
  let value = Number.parseInt(
    crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8),
    16,
  );
  return () => (value = (1664525 * value + 1013904223) >>> 0) / 2 ** 32;
}

function generateDataset({
  seed = "phase4-capacity-v1",
  organizations = 4,
  projectsPerOrganization = 8,
  deploymentsPerProject = 25,
  auditsPerOrganization = 100,
  users = 12,
  configurationsPerProject = 3,
} = {}) {
  const random = generator(seed);
  const dataset = { schemaVersion: 1, seed, organizations: [], users: [] };
  for (let u = 0; u < users; u++)
    dataset.users.push({
      id: `usr_${u.toString().padStart(4, "0")}`,
      email: `synthetic-${u}@example.invalid`,
    });
  for (let o = 0; o < organizations; o++) {
    const organization = {
      id: `org_${o.toString().padStart(4, "0")}`,
      projects: [],
      auditEvents: [],
    };
    for (let p = 0; p < projectsPerOrganization; p++) {
      const project = {
        id: `prj_${o}_${p}`,
        services: [
          { id: `svc_${o}_${p}`, configurations: [], deployments: [] },
        ],
      };
      for (let c = 0; c < configurationsPerProject; c++)
        project.services[0].configurations.push({
          version: c + 1,
          cpuMillicores: 100 + Math.floor(random() * 400),
          memoryMiB: 128 + Math.floor(random() * 384),
        });
      for (let d = 0; d < deploymentsPerProject; d++)
        project.services[0].deployments.push({
          id: `dep_${o}_${p}_${d}`,
          state: random() > 0.08 ? "ready" : "failed",
          digest: `sha256:${crypto.createHash("sha256").update(`${seed}:${o}:${p}:${d}`).digest("hex")}`,
        });
      organization.projects.push(project);
    }
    for (let a = 0; a < auditsPerOrganization; a++)
      organization.auditEvents.push({
        sequence: a + 1,
        action: a % 5 === 0 ? "deployment.create" : "deployment.read",
        result: "success",
      });
    dataset.organizations.push(organization);
  }
  dataset.summary = {
    organizations,
    projects: organizations * projectsPerOrganization,
    deployments:
      organizations * projectsPerOrganization * deploymentsPerProject,
    auditEvents: organizations * auditsPerOrganization,
    users,
    configurations:
      organizations * projectsPerOrganization * configurationsPerProject,
  };
  return dataset;
}

module.exports = { generateDataset };
