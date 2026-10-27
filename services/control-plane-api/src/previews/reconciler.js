class PreviewReconciler {
  constructor({
    store,
    router,
    deploymentProvider = null,
    dnsProvider = null,
    clock = () => Date.now(),
    metrics = { inc() {} },
  }) {
    Object.assign(this, {
      store,
      router,
      deploymentProvider,
      dnsProvider,
      clock,
      metrics,
    });
  }
  async reconcileCleanup(org) {
    const results = [];
    for (const job of await this.store.due(org)) {
      const preview = await this.store.previewRecord(job.organizationId, job.previewId),
        route = await this.store.previewRoute(job.organizationId, preview.id);
      try {
        if (route)
          await this.router.deleteOwned({
            ...route,
            routeId: route.id,
            previewId: preview.id,
            organizationId: preview.organizationId,
          });
        if (this.dnsProvider && route?.verificationScope === "public")
          await this.dnsProvider.deleteOwned({
            hostname: route.hostname,
            routeId: route.id,
            organizationId: preview.organizationId,
          });
        if (this.deploymentProvider && preview.deploymentResource)
          await this.deploymentProvider.deleteOwned?.(
            preview.deploymentResource,
          );
        await this.store.cleanupComplete(job);
        this.metrics.inc("preview_cleanup_completed");
        results.push({ previewId: preview.id, status: "completed" });
      } catch (error) {
        await this.store.cleanupFailed(job, error);
        this.metrics.inc("preview_cleanup_failed");
        results.push({ previewId: preview.id, status: job.status });
      }
    }
    return results;
  }
  async reconcileOrphans(discovered = []) {
    const orphans = [];
    for (const x of discovered) {
      const org = x.labels?.['platform.example/organization-id'];
      if (!org || x.labels?.['platform.example/managed'] !== 'true') continue;
      const known = new Set(await this.store.knownPreviewIds(org));
      if (!known.has(x.labels?.['platform.example/preview-id'])) orphans.push(x);
    }
    for (const item of orphans) {
      if (
        !item.labels?.["platform.example/route-id"] ||
        !item.labels?.["platform.example/organization-id"]
      )
        continue;
      await this.router.deleteOwned({
        routeId: item.labels["platform.example/route-id"],
        previewId: item.labels["platform.example/preview-id"],
        organizationId: item.labels["platform.example/organization-id"],
        namespace: item.namespace,
        resourceName: item.name,
      });
      this.metrics.inc("preview_orphans_removed");
    }
    return orphans.length;
  }
  certificateWarnings(withinDays = 30, org) {
    const cutoff = this.clock() + withinDays * 86400000;
    const summarize = routes => routes
      .filter(
        (x) =>
          x.certificateExpiresAt &&
          Date.parse(x.certificateExpiresAt) <= cutoff &&
          x.certificateStatus !== "removed",
      )
      .map((x) => ({
        routeId: x.id,
        hostname: x.hostname,
        expiresAt: x.certificateExpiresAt,
      }));
    const routes = this.store.certificateRoutes(org);
    return routes?.then ? routes.then(summarize) : summarize(routes);
  }
}
module.exports = { PreviewReconciler };
