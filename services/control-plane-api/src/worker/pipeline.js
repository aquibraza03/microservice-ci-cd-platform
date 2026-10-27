const { ControlPlaneError } = require("../errors");
const { revalidateDeployment } = require('./authorization');
const { createWorkspace, checkout, cleanup, run } = require("./workspace");
const { loadContract } = require("./service-contract");
const BUILD_STAGES = [
  { state: "validating", name: "validation" },
  { state: "testing", name: "tests" },
  { state: "scanning", name: "security" },
  { state: "building", name: "build" },
];
class DeploymentPipeline {
  constructor({
    store,
    repository,
    gitProvider,
    buildExecutor,
    registryProvider = null,
    supplyChainVerifier = null,
    deploymentProvider = null,
    healthVerifier = null,
    routeVerifier = null,
    alertSink = null,
    registryOwner = null,
    workspaceFactory = createWorkspace,
    checkoutImpl = checkout,
    cleanupImpl = cleanup,
    runImpl = run,
    heartbeatMs = 5000,
    maxRepositoryBytes = 536870912,
    observability = null,
  }) {
    Object.assign(this, {
      store,
      repository,
      gitProvider,
      buildExecutor,
      registryProvider,
      supplyChainVerifier,
      deploymentProvider,
      healthVerifier,
      routeVerifier,
      alertSink,
      registryOwner,
      workspaceFactory,
      checkoutImpl,
      cleanupImpl,
      runImpl,
      heartbeatMs,
      maxRepositoryBytes,
      observability,
    });
    this.controllers = new Map();
  }
  async execute(deploymentId, { workerId = `worker-${process.pid}`, organizationId } = {}) {
    const controller = new AbortController();
    this.controllers.set(deploymentId, controller);
    let workspace, attempt, heartbeat;
    try {
      let d =
        this.store.deployments?.get(deploymentId) ||
        (await this._get(deploymentId));
      if (organizationId && d.organizationId !== organizationId)
        throw new ControlPlaneError(403, 'DEPLOYMENT_RESOURCE_CHANGED', 'Deployment organization changed');
      if (['ready', 'rolled_back', 'cancelled'].includes(d.currentState)) return d;
      await revalidateDeployment(this.repository, d);
      if (
        d.triggerSource === "rollback" &&
        ["rolling_back", "verifying"].includes(d.currentState)
      ) {
        d = await this._transition(
          d,
          "failed",
          `rollback-recovery-fail:${d.stateVersion}`,
          "Previous rollback worker attempt was interrupted",
          "ROLLBACK_WORKER_INTERRUPTED",
        );
        d = await this._transition(
          d,
          "rollback_queued",
          `rollback-recovery-queue:${d.stateVersion}`,
          "Rollback recovered after worker restart",
        );
      }
      if (d.currentState === "rollback_queued")
        return await this.executeRollback(d, { workerId, controller });
      if (
        [
          "validating",
          "testing",
          "scanning",
          "building",
          "pushing",
          "deploying",
          "verifying",
        ].includes(d.currentState)
      ) {
        d = await this._transition(
          d,
          "failed",
          `recovery-fail:${d.stateVersion}`,
          "Previous worker attempt was interrupted",
          "WORKER_INTERRUPTED",
        );
      }
      if (d.currentState === "failed")
        d = await this._transition(
          d,
          "queued",
          `recovery-queue:${d.stateVersion}`,
          "Worker retry queued",
        );
      attempt = await this.store.addAttempt(deploymentId, workerId);
      heartbeat = setInterval(
        () =>
          void Promise.resolve(
            this.store.isCancellationRequested(deploymentId),
          ).then((cancelled) =>
            cancelled
              ? controller.abort()
              : this.store.heartbeat(deploymentId, attempt.attempt),
          ),
        this.heartbeatMs,
      );
      workspace = await this.workspaceFactory();
      const trusted = await this.repository.getRepositoryForWorker(
          d.repositoryId,
          d.organizationId,
        ),
        repoRecord = trusted.repository,
        installation = trusted.installation,
        token = await this._provider("github", "installation_token", () =>
          this.gitProvider.refreshInstallationToken(
            installation.providerInstallationId,
          ),
        ),
        log = (stage, text) =>
          this.store.appendLog(d.id, d.organizationId, stage, text, [token], {
            attempt: attempt.attempt,
            source: stage,
          });
      await this._advance(d, "validating", attempt, async () => {
        await this._stage(d, "checkout", attempt, async () => {
          d._repo = await this._provider("github", "source_fetch", () =>
            this.checkoutImpl({
              workspace,
              repositoryUrl: `https://github.com/${repoRecord.name}.git`,
              commitSha: d.commitSha,
              token,
              maxBytes: this.maxRepositoryBytes,
              onOutput: (x) => log("checkout", x),
              signal: controller.signal,
            }),
          );
        });
        await this._stage(d, "detection", attempt, async () => {
          d._contract = await loadContract(
            d._repo,
            d.configurationSnapshot.serviceFile || "service.yml",
          );
        });
      });
      await this._advance(d, "testing", attempt, async () => {
        await this._commands(d, "install", log, controller.signal);
        await this._commands(d, "test", log, controller.signal);
      });
      await this._advance(d, "scanning", attempt, () =>
        this._commands(d, "security", log, controller.signal),
      );
      let image;
      await this._advance(d, "building", attempt, async () => {
        image = await this.buildExecutor.build({
          repository: d._repo,
          contract: d._contract,
          imageTag:
            d.imageTag ||
            `local/${d._contract.name}:${d.commitSha.slice(0, 12)}`,
          onOutput: (x) => log("build", x),
          signal: controller.signal,
        });
        await this.store.saveImage(d.id, image);
      });
      const runtimeContract = d._contract;
      d = await this._current(d.id);
      d = await this._transition(
        d,
        "build_complete",
        `${attempt.attempt}:build-complete`,
        "Image built locally",
      );
      d._contract = runtimeContract;
      if (
        !this.registryProvider ||
        !this.supplyChainVerifier ||
        !this.deploymentProvider ||
        !this.healthVerifier
      ) {
        await this.store.finishAttempt(d.id, attempt.attempt, "completed");
        return image;
      }
      const snapshot = d.configurationSnapshot,
        repositoryName = this.registryProvider.repositoryFor({
          owner: this.registryOwner,
          organization: snapshot.organizationSlug,
          project: snapshot.projectSlug,
          service: snapshot.serviceSlug,
        }),
        tags = [d.commitSha.slice(0, 12), `deployment-${d.id}`];
      await this.store.setDeliverySnapshot(d.id, {
        registryRepository: repositoryName,
        port: d._contract.port,
        startupPath: d._contract.health.startup,
        readinessPath: d._contract.health.readiness,
        healthPath: d._contract.health.liveness,
        resources: d._contract.resources,
      });
      let published, verification, release, pullSecret;
      await this._advance(d, "pushing", attempt, async () => {
        await this.registryProvider.authenticate();
        pullSecret = await this.registryProvider.kubernetesPullSecret?.();
        published = await this._provider("registry", "push", () =>
          this.registryProvider.pushImage({
            artifactPath: image.artifactPath,
            repository: repositoryName,
            tags,
            signal: controller.signal,
            onOutput: (x) => log("push", x),
          }),
        );
        verification = await this.supplyChainVerifier.verify({
          reference: published.reference,
          workspace,
          exception: snapshot.vulnerabilityException,
          signal: controller.signal,
          onOutput: (x) => log("supply-chain", x),
        });
        if (!verification.verified)
          throw new ControlPlaneError(
            422,
            "SUPPLY_CHAIN_VERIFICATION_FAILED",
            "Image supply-chain verification failed",
          );
        const attachments = await this.registryProvider.attachMetadata({
          reference: published.reference,
          sbomPath: verification.sbomPath,
          provenancePath: verification.provenancePath,
        });
        verification = {
          ...verification,
          sbomPath: attachments.sbomReference,
          provenancePath: attachments.provenanceReference,
        };
        await this.store.savePublishedImage(d.id, published, verification);
        await this.store.recordEvent(
          d.id,
          "supply_chain.verified",
          "pushing",
          "Image digest, scan policy and signature verified",
          {
            digest: published.digest,
            critical: verification.scan.critical,
            high: verification.scan.high,
            signatureStatus: verification.signature.status,
            exceptionId: verification.scan.exceptionId || null,
          },
        );
      });
      await this._advance(d, "deploying", attempt, async () => {
        await revalidateDeployment(this.repository, d);
        release = await this._provider("kubernetes", "apply", () =>
          this.deploymentProvider.apply(
            this._deploymentInput(
              d,
              published.reference,
              controller.signal,
              (x) => log("kubernetes", x),
              pullSecret,
            ),
          ),
        );
        await this._provider("kubernetes", "rollout", () =>
          this.deploymentProvider.waitForRollout({
            ...release,
            signal: controller.signal,
            onOutput: (x) => log("rollout", x),
          }),
        );
        await this.store.setEndpoint(d.id, release.endpoint);
        await this.store.recordEvent(
          d.id,
          "kubernetes.rollout_succeeded",
          "deploying",
          "Kubernetes rollout completed",
          { namespace: release.namespace, workload: release.workload },
        );
      });
      await this._advance(d, "verifying", attempt, async () => {
        if (!release.endpoint)
          throw new ControlPlaneError(
            502,
            "ENDPOINT_UNAVAILABLE",
            "No verifiable deployment endpoint was produced",
          );
        await this.healthVerifier.verify({
          endpoint: release.endpoint,
          readinessPath: d._contract.health.readiness,
          healthPath: d._contract.health.liveness,
          signal: controller.signal,
        });
        await this.store.recordEvent(
          d.id,
          "health.verified",
          "verifying",
          "Readiness and liveness verification passed",
          { endpoint: release.endpoint },
        );
      });
      d = await this._current(d.id);
      await this._transition(
        d,
        "ready",
        `${attempt.attempt}:ready`,
        "Deployment rollout and health verification passed",
      );
      await this.store.finishAttempt(d.id, attempt.attempt, "completed");
      return { ...published, ...release, verification };
    } catch (error) {
      if (!attempt && [403, 404].includes(error.status)) {
        const current = await this._current(deploymentId);
        if ((!organizationId || current.organizationId === organizationId) && ['queued', 'rollback_queued'].includes(current.currentState))
          await this._transition(current, 'failed', `authorization-rejected:${current.stateVersion}`, 'Current authorization rejected execution', error.code);
      }
      if (attempt) {
        const current = await this._current(deploymentId);
        if (current.currentState === "cancel_requested")
          await this._transition(
            current,
            "cancelled",
            `${attempt.attempt}:cancelled`,
            "Deployment cancelled",
          );
        else if (
          !["failed", "build_complete", "ready", "rolled_back"].includes(
            current.currentState,
          )
        )
          await this._transition(
            current,
            "failed",
            `${attempt.attempt}:failed`,
            error instanceof ControlPlaneError
              ? error.message
              : "Deployment stage failed",
            error.code || "WORKER_FAILED",
          );
        await this.store.finishAttempt(
          deploymentId,
          attempt.attempt,
          "failed",
          error.code || "WORKER_FAILED",
        );
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
      this.controllers.delete(deploymentId);
      if (workspace) await this.cleanupImpl(workspace);
    }
  }
  async executeRollback(d, { workerId, controller }) {
    await revalidateDeployment(this.repository, d);
    if (!this.deploymentProvider || !this.healthVerifier)
      throw new ControlPlaneError(
        503,
        "ROLLBACK_PROVIDER_UNAVAILABLE",
        "Rollback provider is unavailable",
      );
    const attempt = await this.store.addAttempt(d.id, workerId),
      snapshot = d.configurationSnapshot,
      reference = `${snapshot.registryRepository}@${d.imageDigest}`,
      log = (stage, text) =>
        this.store.appendLog(d.id, d.organizationId, stage, text, [], {
          attempt: attempt.attempt,
          source: "rollback-worker",
        });
    try {
      d = await this._transition(
        d,
        "rolling_back",
        `${attempt.attempt}:rolling-back`,
        "Rollback rollout started",
      );
      let pullSecret;
      if (this.registryProvider) {
        await this.registryProvider.authenticate();
        pullSecret = await this.registryProvider.kubernetesPullSecret?.();
      }
      const input = this._deploymentInput(
          d,
          reference,
          controller.signal,
          () => {},
          pullSecret,
        ),
        release = await this._stage(d, "rollback-apply", attempt, () =>
          this.deploymentProvider.apply(input),
        );
      await this._stage(d, "rollback-rollout", attempt, () =>
        this.deploymentProvider.waitForRollout({
          ...release,
          signal: controller.signal,
          onOutput: (x) => log("rollback-rollout", x),
        }),
      );
      d = await this._current(d.id);
      d = await this._transition(
        d,
        "verifying",
        `${attempt.attempt}:rollback-verifying`,
        "Rollback runtime verification started",
      );
      await this._stage(d, "rollback-verification", attempt, async () => {
        const observed = await this.deploymentProvider.inspectObservedState({
          ...release,
          expectedDigest: d.imageDigest,
          signal: controller.signal,
        });
        if (!observed?.controllerConfirmed || observed.digest !== d.imageDigest)
          throw new ControlPlaneError(
            502,
            "ROLLBACK_DIGEST_MISMATCH",
            "Kubernetes did not confirm the expected rollback digest",
          );
        await this.healthVerifier.verify({
          endpoint: release.endpoint,
          readinessPath: snapshot.readinessPath || "/ready",
          healthPath: snapshot.healthPath || "/health",
          signal: controller.signal,
        });
        if (this.routeVerifier)
          await this.routeVerifier.verifyExpectedService({
            endpoint: release.endpoint,
            deploymentId: d.id,
            expectedDigest: d.imageDigest,
            signal: controller.signal,
          });
      });
      await this.store.setEndpoint(d.id, release.endpoint);
      await this.store.recordEvent(
        d.id,
        "rollback.runtime_verified",
        "verifying",
        "Expected digest, readiness, health, route and controller state verified",
        { digest: d.imageDigest, endpoint: release.endpoint },
      );
      d = await this._current(d.id);
      await this._transition(
        d,
        "rolled_back",
        `${attempt.attempt}:rolled-back`,
        "Rollback health verification passed",
      );
      await this.store.finishAttempt(d.id, attempt.attempt, "completed");
      await this.store.releaseOperationLock?.(d.id);
      return release;
    } catch (error) {
      const current = await this._current(d.id);
      if (current.currentState !== "failed")
        await this._transition(
          current,
          "failed",
          `${attempt.attempt}:rollback-failed`,
          error instanceof ControlPlaneError
            ? error.message
            : "Rollback failed",
          error.code || "ROLLBACK_FAILED",
        );
      await this.store.finishAttempt(
        d.id,
        attempt.attempt,
        "failed",
        error.code || "ROLLBACK_FAILED",
      );
      await this.store.recordEvent(
        d.id,
        "rollback.remediation_required",
        "failed",
        "Rollback failed; inspect the failed stage and keep the current runtime under observation",
        {
          failureCode: error.code || "ROLLBACK_FAILED",
          targetDeploymentId: d.rollbackTargetId,
        },
      );
      await this.alertSink?.emit?.({
        type: "rollback.failed",
        deploymentId: d.id,
        organizationId: d.organizationId,
        failureCode: error.code || "ROLLBACK_FAILED",
      });
      await this.store.releaseOperationLock?.(d.id);
      throw error;
    }
  }
  _deploymentInput(d, imageReference, signal, onOutput, pullSecret) {
    const s = d.configurationSnapshot,
      c = d._contract || {};
    return {
      deploymentId: d.id,
      organizationSlug: s.organizationSlug,
      projectSlug: s.projectSlug,
      serviceSlug: s.serviceSlug,
      imageReference,
      port: c.port || s.port || 3000,
      startupPath: c.health?.startup || s.startupPath || "/health",
      readinessPath: c.health?.readiness || s.readinessPath || "/ready",
      healthPath: c.health?.liveness || s.healthPath || "/health",
      resources: c.resources ||
        s.resources || {
          requests: { cpu: "100m", memory: "128Mi" },
          limits: { cpu: "500m", memory: "512Mi" },
        },
      readOnlyRootFilesystem: s.readOnlyRootFilesystem !== false,
      replicas: s.replicas || 1,
      localKind: Boolean(s.localKind) && !s.preview,
      nodePort: s.nodePort,
      pullSecret,
      preview: s.preview || null,
      deploymentTargetId: s.deploymentTargetId || null,
      targetNamespace: s.targetNamespace || null,
      targetClusterFingerprint: s.targetClusterFingerprint || null,
      targetCredentialVersion: s.targetCredentialVersion || null,
      signal,
      onOutput,
    };
  }
  async _advance(d, state, attempt, work) {
    if (await this.store.isCancellationRequested(d.id))
      throw new ControlPlaneError(
        499,
        "BUILD_CANCELLED",
        "Deployment cancelled",
      );
    let current = await this._current(d.id);
    await this._transition(current, state, `${attempt.attempt}:${state}`);
    await this._stage(d, state, attempt, work);
  }
  async _stage(d, name, attempt, work) {
    const started = process.hrtime.bigint();
    const environmentClass = this._environmentClass(d);
    if (name === "build")
      this.observability?.metrics.inc("builds", {
        state: "active",
        environment_class: environmentClass,
      });
    await this.store.stage(d.id, name, "running", attempt.attempt);
    await this.store.recordEvent(
      d.id,
      "stage.started",
      null,
      `${name} started`,
      {},
      { stage: name, attempt: attempt.attempt, source: "worker" },
    );
    try {
      const result = this.observability
        ? await this.observability.traces.segment(
            `deployment.stage.${name}`,
            {
              workflowId: d.id,
              attempt: attempt.attempt,
              attributes: {
                "deployment.stage": name,
                "environment.class": environmentClass,
              },
            },
            work,
          )
        : await work();
      await this.store.stage(d.id, name, "passed", attempt.attempt);
      await this.store.recordEvent(
        d.id,
        "stage.passed",
        null,
        `${name} passed`,
        {},
        { stage: name, attempt: attempt.attempt, source: "worker" },
      );
      this.observability?.metrics.observe(
        "deployment_stage_duration_seconds",
        { stage: name, result: "success", environment_class: environmentClass },
        Number(process.hrtime.bigint() - started) / 1e9,
      );
      return result;
    } catch (error) {
      await this.store.stage(
        d.id,
        name,
        "failed",
        attempt.attempt,
        error.message,
      );
      await this.store.recordEvent(
        d.id,
        "stage.failed",
        null,
        error instanceof ControlPlaneError ? error.message : `${name} failed`,
        { failureCode: error.code || "WORKER_FAILED" },
        {
          stage: name,
          attempt: attempt.attempt,
          source: "worker",
          level: "error",
        },
      );
      this.observability?.metrics.observe(
        "deployment_stage_duration_seconds",
        { stage: name, result: "failure", environment_class: environmentClass },
        Number(process.hrtime.bigint() - started) / 1e9,
      );
      throw error;
    } finally {
      if (name === "build")
        this.observability?.metrics.inc(
          "builds",
          { state: "active", environment_class: environmentClass },
          -1,
        );
    }
  }
  async _commands(d, name, log, signal) {
    for (const args of d.commands?.[name] ||
      d._contract.commands?.[name] ||
      []) {
      if (await this.store.isCancellationRequested(d.id))
        throw new ControlPlaneError(
          499,
          "BUILD_CANCELLED",
          "Deployment cancelled",
        );
      await this.runImpl(args[0], args.slice(1), {
        cwd: d._repo,
        env: {},
        timeoutMs: 300000,
        onOutput: (x) => log(name, x),
        signal,
      });
    }
  }
  async _provider(providerType, operation, work) {
    const started = process.hrtime.bigint();
    let result = "success";
    try {
      return this.observability
        ? await this.observability.traces.segment(
            `provider.${providerType}.${operation}`,
            {
              attributes: {
                "provider.type": providerType,
                "provider.operation": operation,
              },
            },
            work,
          )
        : await work();
    } catch (error) {
      result = "failure";
      if (error.code === "RATE_LIMITED" || error.status === 429)
        this.observability?.metrics.inc("provider_rate_limits_total", {
          provider_type: providerType,
          operation,
        });
      throw error;
    } finally {
      this.observability?.metrics.observe(
        "provider_operation_duration_seconds",
        { provider_type: providerType, operation, result },
        Number(process.hrtime.bigint() - started) / 1e9,
      );
    }
  }
  async _transition(d, to, commandId, safeMessage, failureCode = null) {
    let result = "success";
    try {
      return await this.store.transition(d.id, to, {
        expectedVersion: d.stateVersion,
        commandId,
        safeMessage,
        failureCode,
      });
    } catch (error) {
      result = "failure";
      throw error;
    } finally {
      this.observability?.metrics.inc("deployment_transitions_total", {
        stage: to,
        result,
        environment_class: this._environmentClass(d),
      });
    }
  }
  _environmentClass(deployment) {
    const environment =
      deployment.environment ||
      deployment.configurationSnapshot?.environment ||
      deployment.configurationSnapshot?.environmentClass;
    return environment === "production" ? "production" : "non_production";
  }
  async _current(id) {
    return this.store.deployments?.get(id) || this._get(id);
  }
  async _get(id) {
    const result = await this.store.pool.query(
      'SELECT id,organization_id AS "organizationId",project_id AS "projectId",service_id AS "serviceId",triggering_user_id AS "triggeringUserId",trigger_source AS "triggerSource",environment,rollback_actor_id AS "rollbackActorId",repository_id AS "repositoryId",commit_sha AS "commitSha",configuration_snapshot AS "configurationSnapshot",image_tag AS "imageTag",image_digest AS "imageDigest",current_state AS "currentState",state_version AS "stateVersion" FROM deployments WHERE id=$1',
      [id],
    );
    if (!result.rowCount)
      throw new ControlPlaneError(
        404,
        "DEPLOYMENT_NOT_FOUND",
        "Deployment not found",
      );
    return result.rows[0];
  }
  cancel(id) {
    this.controllers.get(id)?.abort();
  }
}
module.exports = { DeploymentPipeline, STAGES: BUILD_STAGES, BUILD_STAGES };
