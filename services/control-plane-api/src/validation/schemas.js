const { z } = require("zod");

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase slug")
  .min(2)
  .max(64);
const organizationInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug,
  displayName: z.string().trim().min(2).max(120).optional(),
});
const projectInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug,
  description: z.string().trim().max(500).optional(),
});
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["active", "archived"]).optional(),
});
const repositoryInput = z.object({
  provider: z.string().trim().min(1).max(32),
  externalId: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  defaultBranch: z.string().trim().min(1).max(255),
  visibility: z.enum(["public", "private", "internal"]),
});
const environmentInput = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["development", "staging", "production", "custom"]),
});
const userId = z.string().min(1).max(128);
const role = z.enum([
  "owner",
  "admin",
  "security_admin",
  "platform_engineer",
  "developer",
  "operator",
  "approver",
  "auditor",
  "viewer",
]);
const membershipInput = z.object({ userId, role });
const roleUpdateInput = z.object({
  role,
  version: z.number().int().positive(),
});
const currentOrganizationInput = z.object({
  organizationId: z.string().min(1).max(128),
});
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) return { error: result.error.flatten() };
  return { data: result.data };
}
module.exports = {
  organizationInput,
  projectInput,
  repositoryInput,
  environmentInput,
  membershipInput,
  roleUpdateInput,
  currentOrganizationInput,
  listQuery,
  parse,
};
