"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  EffectivePermissions,
  OrganizationMembership,
  OrganizationRole,
  SecretReference
} from "@saas/types";
import { Button, PageHeader, StatusBadge } from "@saas/ui";
import { useActiveOrganization } from "@saas/features/platform";
import { getAppComposition } from "@/lib/composition";
const roles: OrganizationRole[] = [
  "owner",
  "admin",
  "security_admin",
  "platform_engineer",
  "developer",
  "operator",
  "approver",
  "auditor",
  "viewer"
];
export function AccessSecurityView() {
  const { controlPlane, search, notifications } = getAppComposition();
  const organizationId = useActiveOrganization({
    controlPlane,
    search,
    notifications
  }).organizationId;
  const [members, setMembers] = useState<OrganizationMembership[]>([]),
    [permissions, setPermissions] = useState<EffectivePermissions | null>(null),
    [secrets, setSecrets] = useState<SecretReference[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({ email: "", role: "viewer" as OrganizationRole }),
    [inviteToken, setInviteToken] = useState("");
  const [form, setForm] = useState({
    projectId: "",
    environmentId: "",
    providerConnectionId: "",
    deploymentTargetId: "",
    displayName: "",
    providerType: "aws_secrets_manager",
    externalIdentifier: "",
    versionSelector: "",
    injectionKey: "",
    destination: "environment",
    protected: true
  });
  const load = useCallback(async () => {
    if (!organizationId) return;
    const [m, p, s] = await Promise.all([
      controlPlane.listMemberships(organizationId),
      controlPlane.getEffectivePermissions(organizationId),
      controlPlane.listSecretReferences(organizationId)
    ]);
    setMembers(m.items);
    setPermissions(p);
    setSecrets(s.items);
  }, [controlPlane, organizationId]);
  useEffect(() => {
    void load().catch((e) => setError(String(e)));
  }, [load]);
  async function createSecret() {
    if (!organizationId) return;
    setBusy(true);
    setError("");
    try {
      await controlPlane.createSecretReference(organizationId, {
        ...form,
        providerConnectionId: form.providerConnectionId || undefined,
        deploymentTargetId: form.deploymentTargetId || undefined,
        versionSelector: form.versionSelector || undefined
      });
      setForm((x) => ({ ...x, externalIdentifier: "", versionSelector: "" }));
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Access and managed secrets"
        description="Backend-evaluated role scopes and references to external secrets. Secret values are never displayed or stored here."
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <section className="rounded border bg-card p-4">
        <h2 className="font-semibold">Your effective permissions</h2>
        <p className="text-sm">
          Policy version {permissions?.policyVersion ?? "—"} · authorization version{" "}
          {permissions?.authorizationVersion ?? "—"}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {permissions?.permissions.join(", ") || "No permissions returned"}
        </p>
      </section>
      <section className="rounded border bg-card p-4">
        <h2 className="font-semibold">Members</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="rounded border bg-background p-2"
            placeholder="member@example.com"
            value={invite.email}
            onChange={(e) => setInvite((x) => ({ ...x, email: e.target.value }))}
          />
          <select
            className="rounded border bg-background p-2"
            value={invite.role}
            onChange={(e) => setInvite((x) => ({ ...x, role: e.target.value as OrganizationRole }))}
          >
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <Button
            disabled={busy}
            onClick={() => {
              if (!organizationId) return;
              setBusy(true);
              void controlPlane
                .inviteMember(organizationId, invite.email, invite.role)
                .then((x) => setInviteToken(x.token))
                .then(load)
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            Create invitation
          </Button>
        </div>
        {inviteToken ? (
          <p className="mt-2 text-xs">
            One-time invitation token created. Deliver it through an approved secure channel; it is
            not stored in browser persistence.
          </p>
        ) : null}
        {members.map((m) => (
          <div
            key={m.userId}
            className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"
          >
            <div>
              <b>{m.userId}</b>
              <p className="text-xs">
                {m.role} · {m.status} · authorization version {m.authorizationVersion ?? "—"}
              </p>
            </div>
            <div className="flex gap-2">
              <select
                className="rounded border bg-background p-2"
                value={m.role}
                onChange={(e) =>
                  organizationId &&
                  void controlPlane
                    .updateMembershipRole(
                      organizationId,
                      m.userId,
                      e.target.value as OrganizationRole,
                      m.version
                    )
                    .then(load)
                    .catch((x) => setError(String(x)))
                }
              >
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <Button
                variant="destructive"
                onClick={() =>
                  organizationId &&
                  void controlPlane
                    .removeMembership(organizationId, m.userId, m.version)
                    .then(load)
                    .catch((x) => setError(String(x)))
                }
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </section>
      <section className="rounded border bg-card p-4">
        <h2 className="font-semibold">Create managed secret reference</h2>
        <p className="text-xs text-muted-foreground">
          Runtime references only. Build secrets are unsupported. Production references are excluded
          from previews and fork events by default.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {Object.entries(form)
            .filter(([k]) => k !== "protected")
            .map(([key, value]) => (
              <label key={key} className="text-sm">
                {key}
                {key === "providerType" ? (
                  <select
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={String(value)}
                    onChange={(e) => setForm((x) => ({ ...x, providerType: e.target.value }))}
                  >
                    <option value="aws_secrets_manager">AWS Secrets Manager</option>
                    <option value="kubernetes_external_secret">Kubernetes External Secret</option>
                  </select>
                ) : (
                  <input
                    className="mt-1 w-full rounded border bg-background p-2"
                    type={key === "externalIdentifier" ? "password" : "text"}
                    autoComplete="off"
                    value={String(value)}
                    onChange={(e) => setForm((x) => ({ ...x, [key]: e.target.value }))}
                  />
                )}
              </label>
            ))}
        </div>
        <label className="mt-3 flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.protected}
            onChange={(e) => setForm((x) => ({ ...x, protected: e.target.checked }))}
          />
          Protected production reference
        </label>
        <Button className="mt-3" disabled={busy} onClick={() => void createSecret()}>
          Create reference
        </Button>
      </section>
      <section className="rounded border bg-card p-4">
        <h2 className="font-semibold">Secret references</h2>
        {secrets.map((s) => (
          <div
            key={s.id}
            className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"
          >
            <div>
              <b>{s.displayName}</b>{" "}
              <StatusBadge tone={s.status === "active" ? "success" : "warning"}>
                {s.status}
              </StatusBadge>
              <p className="text-sm">
                {s.providerType} · {s.externalIdentifier} · {s.injectionKey}
              </p>
              <p className="text-xs">
                Reference v{s.referenceVersion} · {s.validationCategory || "not validated"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={busy || ["disabled", "revoked"].includes(s.status)}
                onClick={() =>
                  organizationId &&
                  void controlPlane
                    .secretReferenceAction(organizationId, s.id, "validate", {
                      expectedVersion: s.version
                    })
                    .then(load)
                    .catch((e) => setError(String(e)))
                }
              >
                Validate
              </Button>
              {s.status !== "revoked" ? (
                <Button
                  variant="destructive"
                  onClick={() =>
                    organizationId &&
                    void controlPlane
                      .secretReferenceAction(organizationId, s.id, "revoke", {
                        expectedVersion: s.version
                      })
                      .then(load)
                      .catch((e) => setError(String(e)))
                  }
                >
                  Revoke
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
