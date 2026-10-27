"use client";
import { useEffect, useState } from "react";
import type { CustomDomain } from "@saas/types";
import { useActiveOrganization } from "@saas/features/platform";
import { Button, Input, PageHeader, StatusBadge } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";
export function DomainManagementView() {
  const { controlPlane, search, notifications } = getAppComposition(),
    active = useActiveOrganization({ controlPlane, search, notifications }),
    org = active.organizationId,
    [items, setItems] = useState<CustomDomain[]>([]),
    [hostname, setHostname] = useState(""),
    [projectId, setProjectId] = useState(""),
    [serviceId, setServiceId] = useState(""),
    [challenge, setChallenge] = useState<{
      domainId: string;
      name: string;
      value: string;
      expiresAt: string;
    } | null>(null),
    [token, setToken] = useState(""),
    [error, setError] = useState("");
  const load = () =>
    org
      ? controlPlane
          .listCustomDomains(org)
          .then((x) => setItems(x.items))
          .catch((e) => setError(String(e)))
      : Promise.resolve();
  useEffect(() => {
    void load();
  }, [org]);
  const request = () =>
    void controlPlane
      .requestCustomDomain(org!, { hostname, projectId, serviceId })
      .then((x) => {
        setChallenge({
          domainId: x.domain.id,
          name: x.instructions.name,
          value: x.instructions.value,
          expiresAt: x.instructions.expiresAt
        });
        void load();
      })
      .catch((e) => setError(String(e)));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Custom domains"
        description="Verify ownership before routing and certificate activation."
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <section className="grid gap-2 rounded border bg-card p-4 md:grid-cols-3">
        <Input
          aria-label="Hostname"
          placeholder="app.example.com"
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
        />
        <Input
          aria-label="Project ID"
          placeholder="Project ID"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        />
        <Input
          aria-label="Service ID"
          placeholder="Service ID"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        />
        <Button onClick={request}>Request verification</Button>
      </section>
      {challenge ? (
        <section className="rounded border bg-card p-4 text-sm">
          <h2 className="font-semibold">DNS TXT challenge</h2>
          <p>
            Name: <code>{challenge.name}</code>
          </p>
          <p>
            Value: <code>{challenge.value}</code>
          </p>
          <p>Expires: {new Date(challenge.expiresAt).toLocaleString()}</p>
          <Input
            className="mt-2"
            aria-label="Verification token"
            placeholder="Token returned after platform-verification="
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button
            className="mt-2"
            onClick={() =>
              void controlPlane.verifyCustomDomain(org!, challenge.domainId, token).then(load)
            }
          >
            Verify
          </Button>
        </section>
      ) : null}
      <div className="grid gap-3">
        {items.map((item) => (
          <article
            className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card p-4"
            key={item.id}
          >
            <div>
              <h2 className="font-semibold">{item.hostnameAscii}</h2>
              <StatusBadge
                tone={
                  item.status === "active"
                    ? "success"
                    : item.status.includes("failed")
                      ? "destructive"
                      : "warning"
                }
              >
                {item.status}
              </StatusBadge>
            </div>
            <Button
              variant="destructive"
              onClick={() => void controlPlane.removeCustomDomain(org!, item.id).then(load)}
            >
              Remove
            </Button>
          </article>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Local verification and public DNS/TLS verification are reported separately; local host
        mapping never proves public ownership.
      </p>
    </div>
  );
}
