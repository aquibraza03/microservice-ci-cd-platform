const crypto = require("crypto");
const { withTransaction } = require("../database/transaction");
const { ControlPlaneError } = require("../errors");
const { PERMISSIONS } = require("../auth/rbac");
const { assertTransition, TERMINAL } = require("./state-machine");
const { redact } = require("./redaction");
const { hash } = require("./store");
const { eventContract } = require("./event-contract");
const {
  DEFAULT_POLICY,
  compatibility,
  assertDigest,
  diffObjects,
} = require("./rollback-policy");
const cols = `id,organization_id AS "organizationId",project_id AS "projectId",service_id AS "serviceId",repository_id AS "repositoryId",branch,commit_sha AS "commitSha",trigger_source AS "triggerSource",triggering_user_id AS "triggeringUserId",environment,provider,current_state AS "currentState",state_version AS "stateVersion",configuration_snapshot AS "configurationSnapshot",image_tag AS "imageTag",image_digest AS "imageDigest",endpoint,attempt_count AS "attemptCount",failure_code AS "failureCode",failure_message AS "failureMessage",started_at AS "startedAt",completed_at AS "completedAt",previous_successful_deployment_id AS "previousSuccessfulDeploymentId",rollback_target_id AS "rollbackTargetId",rollback_reason AS "rollbackReason",rollback_approval_id AS "rollbackApprovalId",rollback_actor_id AS "rollbackActorId",rollback_requested_at AS "rollbackRequestedAt",rollback_metadata AS "rollbackMetadata",created_at AS "createdAt",updated_at AS "updatedAt"`;
class PostgresDeploymentStore {
  constructor(
    repository,
    pool,
    { retentionDays = 7, maxLogBytes = 5242880 } = {},
  ) {
    this.repository = repository;
    this.pool = pool;
    this.retentionDays = retentionDays;
    this.maxLogBytes = maxLogBytes;
  }
  async create(userId, organizationId, input, key) {
    await this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.DEPLOYMENT_CREATE,
    );
    if (input.environment === "production")
      await this.repository.requireAccess(
        userId,
        organizationId,
        PERMISSIONS.DEPLOYMENT_PRODUCTION,
      );
    await this.repository.getProject(userId, organizationId, input.projectId);
    const service = await this.repository.getService(
      userId,
      organizationId,
      input.serviceId,
    );
    const repo = await this.repository.getProviderRepository(
      userId,
      organizationId,
      input.repositoryId,
    );
    if (
      repo.projectId !== input.projectId ||
      service.projectId !== input.projectId ||
      service.repositoryId !== repo.id
    )
      throw new ControlPlaneError(
        404,
        "DEPLOYMENT_RESOURCE_NOT_FOUND",
        "Deployment resources not found",
      );
    const idem = hash(`${organizationId}:${key}`);
    return withTransaction(this.pool, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`deployment:${organizationId}:${key}`]);
      const existing = await c.query(
        `SELECT ${cols} FROM deployments WHERE organization_id=$1 AND idempotency_key_hash=$2`,
        [organizationId, idem],
      );
      if (existing.rowCount)
        return { deployment: existing.rows[0], created: false };
      const id = crypto.randomUUID();
      const result = await c.query(
        `INSERT INTO deployments(id,organization_id,project_id,service_id,repository_id,branch,commit_sha,trigger_source,triggering_user_id,environment,provider,configuration_snapshot,image_tag,idempotency_key_hash,current_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING ${cols}`,
        [
          id,
          organizationId,
          input.projectId,
          input.serviceId,
          input.repositoryId,
          input.branch,
          input.commitSha,
          input.triggerSource || "manual",
          userId,
          input.environment,
          repo.provider,
          input.configurationSnapshot || {},
          input.imageTag || null,
          idem,
          input.initialState || "queued",
        ],
      );
      await this._event(
        c,
        result.rows[0],
        "deployment.created",
        result.rows[0].currentState,
        result.rows[0].currentState === "waiting_for_approval"
          ? "Deployment is waiting for approval"
          : "Deployment queued",
        { triggerSource: input.triggerSource || "manual" },
      );
      return { deployment: result.rows[0], created: true };
    });
  }
  async assertOperationAvailable(organizationId, serviceId, environment, key) {
    const idem = hash(`${organizationId}:${key}`),
      duplicate = await this.pool.query(
        "SELECT 1 FROM deployments WHERE organization_id=$1 AND idempotency_key_hash=$2",
        [organizationId, idem],
      );
    if (duplicate.rowCount) return;
    const conflict = await this.pool.query(
      "SELECT 1 FROM deployments WHERE organization_id=$1 AND service_id=$2 AND environment=$3 AND current_state=ANY($4::varchar[]) LIMIT 1",
      [
        organizationId,
        serviceId,
        environment,
        [
          "waiting_for_approval",
          "queued",
          "validating",
          "testing",
          "scanning",
          "building",
          "pushing",
          "deploying",
          "rollback_queued",
          "rolling_back",
          "verifying",
        ],
      ],
    );
    if (conflict.rowCount)
      throw new ControlPlaneError(
        409,
        "DEPLOYMENT_OPERATION_CONFLICT",
        "Another deployment operation is active",
      );
  }
  async access(userId, organizationId, id, permission = PERMISSIONS.OBSERVE) {
    await this.repository.requireAccess(userId, organizationId, permission);
    const r = await this.pool.query(
      `SELECT ${cols} FROM deployments WHERE id=$1 AND organization_id=$2`,
      [id, organizationId],
    );
    if (!r.rowCount)
      throw new ControlPlaneError(
        404,
        "DEPLOYMENT_NOT_FOUND",
        "Deployment not found",
      );
    return r.rows[0];
  }
  async getInternal(id, organizationId) {
    const r = await this.pool.query(`SELECT ${cols} FROM deployments WHERE id=$1 AND organization_id=$2`, [id, organizationId]);
    if (!r.rowCount) throw new ControlPlaneError(404, 'DEPLOYMENT_NOT_FOUND', 'Deployment not found');
    return r.rows[0];
  }
  async list(userId, organizationId, filters = {}) {
    await this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.OBSERVE,
    );
    const v = [organizationId],
      w = ["organization_id=$1"];
    if (filters.state) {
      v.push(filters.state);
      w.push(`current_state=$${v.length}`);
    }
    if (filters.projectId) {
      v.push(filters.projectId);
      w.push(`project_id=$${v.length}`);
    }
    return (
      await this.pool.query(
        `SELECT ${cols} FROM deployments WHERE ${w.join(" AND ")} ORDER BY created_at DESC`,
        v,
      )
    ).rows;
  }
  async transition(
    id,
    to,
    { expectedVersion, commandId, safeMessage = null, failureCode = null } = {},
  ) {
    return withTransaction(this.pool, async (c) => {
      const found = await c.query(
        `SELECT ${cols} FROM deployments WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!found.rowCount)
        throw new ControlPlaneError(
          404,
          "DEPLOYMENT_NOT_FOUND",
          "Deployment not found",
        );
      const d = found.rows[0];
      if (commandId) {
        const duplicate = await c.query(
          "SELECT 1 FROM deployment_events WHERE deployment_id=$1 AND metadata->>'commandId'=$2",
          [id, commandId],
        );
        if (duplicate.rowCount) return d;
      }
      if (Number(d.stateVersion) !== Number(expectedVersion))
        throw new ControlPlaneError(
          409,
          "DEPLOYMENT_VERSION_CONFLICT",
          "Deployment state changed concurrently",
        );
      assertTransition(d.currentState, to);
      const result = await c.query(
        `UPDATE deployments SET current_state=$1::varchar,state_version=state_version+1,updated_at=NOW(),started_at=CASE WHEN $1='validating' THEN COALESCE(started_at,NOW()) ELSE started_at END,completed_at=CASE WHEN $2 THEN NOW() ELSE NULL END,failure_code=CASE WHEN $1='failed' THEN $3 ELSE NULL END,failure_message=CASE WHEN $1='failed' THEN $4 ELSE NULL END WHERE id=$5 AND state_version=$6 RETURNING ${cols}`,
        [
          to,
          TERMINAL.has(to),
          failureCode,
          redact(safeMessage || ""),
          id,
          expectedVersion,
        ],
      );
      if (!result.rowCount)
        throw new ControlPlaneError(
          409,
          "DEPLOYMENT_VERSION_CONFLICT",
          "Deployment state changed concurrently",
        );
      await this._event(c, result.rows[0], "state.changed", to, safeMessage, {
        from: d.currentState,
        commandId,
      });
      return result.rows[0];
    });
  }
  async _event(c, d, type, state, message, metadata, details = {}) {
    await c.query("SELECT id FROM deployments WHERE id=$1 FOR UPDATE", [d.id]);
    if (['queued', 'rollback_queued'].includes(state)) {
      await c.query('INSERT INTO deployment_outbox(deployment_id,organization_id,state_version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [d.id, d.organizationId, d.stateVersion]);
      if (this.repository.quotaManager && d.triggerSource !== 'rollback') {
        const plan = await this.repository.entitlements.effective(d.organizationId);
        const limit = plan?.entitlements.concurrent_builds ?? require('../billing/plans').PLANS.foundation.entitlements.concurrent_builds;
        await this.repository.quotaManager.setLimit(d.organizationId, 'concurrent_builds', limit);
        const reservation = await this.repository.quotaManager.reserveInTransaction(c, { organizationId: d.organizationId, resourceType: 'concurrent_builds', ownerOperation: d.id, idempotencyKey: `deployment:${d.id}:${d.stateVersion}` });
        await this.repository.quotaManager.consume(reservation.reservationId, d.organizationId);
      }
    }
    if (TERMINAL.has(state)) await c.query("UPDATE quota_reservations SET status='released',released_at=NOW(),version=version+1 WHERE organization_id=$1 AND owner_operation=$2 AND status IN ('active','consumed')", [d.organizationId, d.id]);
    if (type === 'deployment.created' && this.repository.usageLedger)
      await this.repository.usageLedger.appendInTransaction(c, { organizationId: d.organizationId, meterId: 'deployment_count', quantity: 1, sourceResourceType: 'deployment', sourceResourceId: d.id, idempotencyKey: d.id });
    const seq = await c.query(
      "SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM deployment_events WHERE deployment_id=$1",
      [d.id],
    );
    const e = eventContract(
      d,
      {
        eventType: type,
        state,
        safeMessage: message,
        metadata,
        stateVersion: details.stateVersion ?? d.stateVersion,
        stage: details.stage,
        level: details.level,
        source: details.source,
        attempt: details.attempt,
        secrets: details.secrets,
      },
      seq.rows[0].sequence,
    );
    if (this.repository.auditService?.appendInTransaction)
      await this.repository.auditService.appendInTransaction(c, { organizationId: d.organizationId, actorId: d.triggeringUserId, action: type, resourceType: 'deployment', resourceId: d.id, result: state === 'failed' ? 'failure' : 'success', sourceCategory: 'deployment', idempotencyKey: `deployment-event:${d.id}:${e.sequence}`, metadata: { state } });
    return (
      await c.query(
        "INSERT INTO deployment_events(deployment_id,organization_id,sequence,event_type,state,safe_message,metadata,schema_version,stage,state_version,level,source,attempt,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id",
        [
          d.id,
          d.organizationId,
          e.sequence,
          type,
          state,
          e.safeMessage,
          e.metadata,
          e.schemaVersion,
          e.stage,
          e.stateVersion,
          e.level,
          e.source,
          e.attempt,
          e.timestamp,
        ],
      )
    ).rows[0];
  }
  async recordEvent(
    id,
    eventType,
    state,
    safeMessage,
    metadata = {},
    details = {},
  ) {
    return withTransaction(this.pool, async (c) => {
      const result = await c.query(
        `SELECT ${cols} FROM deployments WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!result.rowCount)
        throw new ControlPlaneError(
          404,
          "DEPLOYMENT_NOT_FOUND",
          "Deployment not found",
        );
      return this._event(
        c,
        result.rows[0],
        eventType,
        state,
        safeMessage,
        metadata,
        details,
      );
    });
  }
  async history(userId, organizationId, id, query = 0) {
    await this.access(userId, organizationId, id);
    const q = typeof query === "number" ? { after: query } : query,
      v = [id, organizationId, Number(q.after || 0)],
      w = ["deployment_id=$1", "organization_id=$2", "sequence>$3"];
    for (const [key, col] of [
      ["stage", "stage"],
      ["level", "level"],
    ])
      if (q[key]) {
        v.push(q[key]);
        w.push(`${col}=$${v.length}`);
      }
    if (q.from) {
      v.push(q.from);
      w.push(`created_at>=$${v.length}`);
    }
    if (q.to) {
      v.push(q.to);
      w.push(`created_at<=$${v.length}`);
    }
    if (q.search) {
      v.push(`%${q.search}%`);
      w.push(`safe_message ILIKE $${v.length}`);
    }
    v.push(Math.min(Number(q.limit || 100), 500));
    return (
      await this.pool.query(
        `SELECT id,schema_version AS "schemaVersion",deployment_id AS "deploymentId",organization_id AS "organizationId",sequence,event_type AS "eventType",state,stage,state_version AS "stateVersion",level,source,attempt,safe_message AS "safeMessage",metadata,created_at AS "timestamp",created_at AS "createdAt" FROM deployment_events WHERE ${w.join(" AND ")} ORDER BY sequence LIMIT $${v.length}`,
        v,
      )
    ).rows;
  }
  async listStages(userId, organizationId, id) {
    await this.access(userId, organizationId, id);
    return (
      await this.pool.query(
        'SELECT id,deployment_id AS "deploymentId",name,state,attempt,started_at AS "startedAt",completed_at AS "completedAt",duration_ms AS "durationMs",safe_message AS "safeMessage" FROM deployment_stages WHERE deployment_id=$1 ORDER BY attempt,started_at',
        [id],
      )
    ).rows;
  }
  async stage(id, name, state, attempt, message) {
    const result = await this.pool.query(
      "INSERT INTO deployment_stages(deployment_id,name,state,attempt,started_at,safe_message) VALUES($1,$2,$3,$4,NOW(),$5) ON CONFLICT(deployment_id,name,attempt) DO UPDATE SET state=EXCLUDED.state,safe_message=EXCLUDED.safe_message,completed_at=CASE WHEN EXCLUDED.state IN ('passed','failed','skipped','cancelled') THEN NOW() END,duration_ms=CASE WHEN EXCLUDED.state IN ('passed','failed','skipped','cancelled') THEN EXTRACT(EPOCH FROM (NOW()-deployment_stages.started_at))*1000 END RETURNING *",
      [id, name, state, attempt, redact(message || "")],
    );
    return result.rows[0];
  }
  async appendLog(
    id,
    organizationId,
    stage,
    content,
    secrets = [],
    details = {},
  ) {
    return withTransaction(this.pool, async (c) => {
      const found = await c.query(
        `SELECT ${cols} FROM deployments WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [id, organizationId],
      );
      if (!found.rowCount)
        throw new ControlPlaneError(
          404,
          "DEPLOYMENT_NOT_FOUND",
          "Deployment not found",
        );
      const clean = redact(String(content).slice(0, 65536), secrets),
        bytes = Buffer.byteLength(clean),
        total = await c.query(
          "SELECT COALESCE(SUM(byte_size),0) total,BOOL_OR(content='Deployment log storage limit reached') truncated FROM deployment_log_chunks WHERE deployment_id=$1",
          [id],
        );
      if (Number(total.rows[0].total) + bytes > this.maxLogBytes) {
        if (!total.rows[0].truncated) {
          const e = await this._event(
            c,
            found.rows[0],
            "log.truncated",
            found.rows[0].currentState,
            "Deployment log storage limit reached",
            { maxBytes: this.maxLogBytes },
            {
              stage,
              level: "warn",
              source: "worker",
              attempt: details.attempt,
            },
          );
          await c.query(
            `INSERT INTO deployment_log_chunks(deployment_id,organization_id,sequence,stage,content,byte_size,expires_at) SELECT $1,$2,sequence,$3,$4,$5,NOW()+($6||' days')::interval FROM deployment_events WHERE id=$7`,
            [
              id,
              organizationId,
              stage,
              "Deployment log storage limit reached",
              36,
              this.retentionDays,
              e.id,
            ],
          );
        }
        return null;
      }
      const e = await this._event(
        c,
        found.rows[0],
        "log",
        found.rows[0].currentState,
        clean,
        details.metadata || {},
        {
          stage,
          level: details.level || "info",
          source: details.source || "worker",
          attempt: details.attempt,
          secrets,
        },
      );
      return (
        await c.query(
          `INSERT INTO deployment_log_chunks(deployment_id,organization_id,sequence,stage,content,byte_size,expires_at) SELECT $1,$2,sequence,$3,$4,$5,NOW()+($6||' days')::interval FROM deployment_events WHERE id=$7 RETURNING *`,
          [id, organizationId, stage, clean, bytes, this.retentionDays, e.id],
        )
      ).rows[0];
    });
  }
  async listLogs(userId, organizationId, id) {
    await this.access(userId, organizationId, id);
    return (
      await this.pool.query(
        'SELECT sequence,stage,content,created_at AS "createdAt" FROM deployment_log_chunks WHERE deployment_id=$1 AND organization_id=$2 AND expires_at>NOW() ORDER BY sequence',
        [id, organizationId],
      )
    ).rows;
  }
  async retention(userId, organizationId, id) {
    await this.access(userId, organizationId, id);
    const r = await this.pool.query(
      "SELECT COALESCE(SUM(byte_size),0) AS used,MAX(expires_at) AS expires,BOOL_OR(content='Deployment log storage limit reached') AS truncated FROM deployment_log_chunks WHERE deployment_id=$1 AND organization_id=$2",
      [id, organizationId],
    );
    return {
      retentionDays: this.retentionDays,
      maxDeploymentBytes: this.maxLogBytes,
      usedBytes: Number(r.rows[0].used),
      truncated: Boolean(r.rows[0].truncated),
      expiresAt: r.rows[0].expires,
    };
  }
  async saveImage(id, image) {
    return (
      await this.pool.query(
        "INSERT INTO deployment_images(deployment_id,local_reference,image_tag,digest,platform,byte_size) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(deployment_id) DO UPDATE SET local_reference=EXCLUDED.local_reference,image_tag=EXCLUDED.image_tag,digest=EXCLUDED.digest,platform=EXCLUDED.platform,byte_size=EXCLUDED.byte_size RETURNING id",
        [
          id,
          "ephemeral://discarded-after-metadata-capture",
          image.imageTag,
          image.digest || null,
          image.platform || null,
          image.byteSize || null,
        ],
      )
    ).rows[0];
  }
  async savePublishedImage(id, image, verification) {
    return withTransaction(this.pool, async (c) => {
      const result = await c.query(
        "UPDATE deployment_images SET registry=$1,repository=$2,tags=$3,digest=$4,published=TRUE,scan_status=$5,scan_summary=$6,sbom_reference=$7,provenance_reference=$8,signature_status=$9,verified_at=NOW() WHERE deployment_id=$10 RETURNING *",
        [
          image.registry,
          image.repository,
          image.tags,
          image.digest,
          verification.scan.status,
          verification.scan,
          verification.sbomPath,
          verification.provenancePath,
          verification.signature.status,
          id,
        ],
      );
      if (!result.rowCount)
        throw new ControlPlaneError(
          404,
          "IMAGE_METADATA_NOT_FOUND",
          "Image metadata not found",
        );
      await c.query(
        "UPDATE deployments SET image_digest=$1,image_tag=$2,updated_at=NOW() WHERE id=$3",
        [image.digest, image.tags[0], id],
      );
      return result.rows[0];
    });
  }
  async setEndpoint(id, endpoint) {
    await this.pool.query(
      "UPDATE deployments SET endpoint=$1,updated_at=NOW() WHERE id=$2",
      [endpoint, id],
    );
  }
  async setDeliverySnapshot(id, value) {
    await this.pool.query(
      "UPDATE deployments SET configuration_snapshot=configuration_snapshot || $1::jsonb,updated_at=NOW() WHERE id=$2",
      [value, id],
    );
  }
  async rollbackPolicy(organizationId, environment) {
    const r = await this.pool.query(
      `SELECT enabled,approval_required AS "approvalRequired",database_compatibility_mode AS "databaseCompatibilityMode",lock_timeout_seconds AS "lockTimeoutSeconds" FROM rollback_policies WHERE organization_id=$1 AND environment=$2`,
      [organizationId, environment],
    );
    return (
      r.rows[0] || {
        ...DEFAULT_POLICY,
        enabled: true,
        approvalRequired: environment === "production",
      }
    );
  }
  async setRollbackPolicy(userId, organizationId, environment, input) {
    await this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.ENVIRONMENT_MANAGE,
    );
    const r = await this.pool.query(
      `INSERT INTO rollback_policies(organization_id,environment,enabled,approval_required,database_compatibility_mode,lock_timeout_seconds,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,environment) DO UPDATE SET enabled=EXCLUDED.enabled,approval_required=EXCLUDED.approval_required,database_compatibility_mode=EXCLUDED.database_compatibility_mode,lock_timeout_seconds=EXCLUDED.lock_timeout_seconds,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,
      [
        organizationId,
        environment,
        input.enabled !== false,
        Boolean(input.approvalRequired),
        input.databaseCompatibilityMode || "warn",
        input.lockTimeoutSeconds || 900,
        userId,
      ],
    );
    return r.rows[0];
  }
  async listRollbackTargets(userId, organizationId, currentId) {
    const current = await this.access(
        userId,
        organizationId,
        currentId,
        PERMISSIONS.ROLLBACK,
      ),
      r = await this.pool.query(
        `SELECT ${cols} FROM deployments WHERE organization_id=$1 AND service_id=$2 AND environment=$3 AND id<>$4 AND current_state='ready' AND image_digest IS NOT NULL AND configuration_snapshot<>'{}'::jsonb ORDER BY completed_at DESC`,
        [organizationId, current.serviceId, current.environment, current.id],
      );
    return r.rows;
  }
  async rollbackComparison(userId, organizationId, currentId, targetId) {
    const current = await this.access(
        userId,
        organizationId,
        currentId,
        PERMISSIONS.ROLLBACK,
      ),
      target = await this.access(userId, organizationId, targetId),
      policy = await this.rollbackPolicy(organizationId, current.environment);
    if (
      current.serviceId !== target.serviceId ||
      current.environment !== target.environment
    )
      throw new ControlPlaneError(
        409,
        "ROLLBACK_TARGET_MISMATCH",
        "Rollback target does not match the service and environment",
      );
    const normalized = {
      ...DEFAULT_POLICY,
      ...policy,
      approvalRequiredEnvironments: policy.approvalRequired
        ? [current.environment]
        : [],
    };
    return {
      current,
      target,
      configurationChanges: diffObjects(
        current.configurationSnapshot,
        target.configurationSnapshot,
      ),
      resourceChanges: diffObjects(
        current.configurationSnapshot?.resources,
        target.configurationSnapshot?.resources,
      ),
      environmentVariableNames: {
        current: Object.keys(
          current.configurationSnapshot?.environmentVariables || {},
        ).sort(),
        target: Object.keys(
          target.configurationSnapshot?.environmentVariables || {},
        ).sort(),
      },
      compatibility: compatibility(current, target, normalized),
      approvalRequired: Boolean(policy.approvalRequired),
      policy,
    };
  }
  async approveRollback(
    userId,
    organizationId,
    currentId,
    targetId,
    justification,
  ) {
    await this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.ROLLBACK,
    );
    await this.rollbackComparison(userId, organizationId, currentId, targetId);
    if (!justification || justification.trim().length < 8)
      throw new ControlPlaneError(
        400,
        "ROLLBACK_APPROVAL_JUSTIFICATION_REQUIRED",
        "Approval justification is required",
      );
    const r = await this.pool.query(
      `INSERT INTO rollback_approvals(organization_id,source_deployment_id,target_deployment_id,status,approved_by,justification) VALUES($1,$2,$3,'approved',$4,$5) RETURNING id,organization_id AS "organizationId",source_deployment_id AS "currentDeploymentId",target_deployment_id AS "targetDeploymentId",status,approved_by AS "approvedBy",justification,created_at AS "createdAt"`,
      [organizationId, currentId, targetId, userId, redact(justification)],
    );
    return r.rows[0];
  }
  async releaseOperationLock(id) {
    await this.pool.query(
      "DELETE FROM deployment_operation_locks WHERE deployment_id=$1",
      [id],
    );
  }
  async recoverStaleOperationLocks() {
    const r = await this.pool.query(
      "DELETE FROM deployment_operation_locks WHERE expires_at<=NOW() RETURNING deployment_id",
    );
    return r.rowCount;
  }
  async createRollback(userId, organizationId, targetId, reasonOrInput, key) {
    const input =
        typeof reasonOrInput === "string"
          ? { reason: reasonOrInput }
          : reasonOrInput || {},
      reason = input.reason;
    if (!reason || reason.trim().length < 8)
      throw new ControlPlaneError(
        400,
        "ROLLBACK_REASON_REQUIRED",
        "A rollback reason of at least 8 characters is required",
      );
    const target = await this.access(
      userId,
      organizationId,
      targetId,
      PERMISSIONS.ROLLBACK,
    );
    if (target.currentState !== "ready" || !target.imageDigest)
      throw new ControlPlaneError(
        409,
        "ROLLBACK_TARGET_INVALID",
        "Rollback target must be a healthy verified deployment",
      );
    const previous = await this.pool.query(
      `SELECT ${cols} FROM deployments WHERE organization_id=$1 AND service_id=$2 AND environment=$3 AND current_state='ready' AND id<>$4 AND image_digest IS NOT NULL ${input.targetDeploymentId ? "AND id=$5" : ""} ORDER BY completed_at DESC LIMIT 1`,
      input.targetDeploymentId
        ? [
            organizationId,
            target.serviceId,
            target.environment,
            target.id,
            input.targetDeploymentId,
          ]
        : [organizationId, target.serviceId, target.environment, target.id],
    );
    if (!previous.rowCount)
      throw new ControlPlaneError(
        409,
        "ROLLBACK_TARGET_MISSING",
        "No previous healthy deployment is available",
      );
    const p = previous.rows[0];
    assertDigest(p.imageDigest);
    if (
      !p.configurationSnapshot ||
      !Object.keys(p.configurationSnapshot).length
    )
      throw new ControlPlaneError(
        409,
        "ROLLBACK_CONFIGURATION_MISSING",
        "Rollback target configuration snapshot is missing",
      );
    const image = await this.pool.query(
      "SELECT published,scan_status,signature_status FROM deployment_images WHERE deployment_id=$1",
      [p.id],
    );
    if (
      !image.rowCount ||
      !image.rows[0].published ||
      !["verified", "signed"].includes(image.rows[0].signature_status) ||
      !["passed", "verified"].includes(image.rows[0].scan_status)
    )
      throw new ControlPlaneError(
        409,
        "ROLLBACK_SUPPLY_CHAIN_INVALID",
        "Rollback target no longer passes signature and policy validation",
      );
    const policy = await this.rollbackPolicy(
        organizationId,
        target.environment,
      ),
      normalized = {
        ...DEFAULT_POLICY,
        ...policy,
        enabledEnvironments:
          policy.enabled === false ? [] : [target.environment],
        approvalRequiredEnvironments: policy.approvalRequired
          ? [target.environment]
          : [],
      },
      db = compatibility(target, p, normalized);
    if (policy.enabled === false)
      throw new ControlPlaneError(
        409,
        "ROLLBACK_ENVIRONMENT_BLOCKED",
        "Rollback is disabled for this environment",
      );
    if (
      input.expectedStateVersion != null &&
      Number(input.expectedStateVersion) !== Number(target.stateVersion)
    )
      throw new ControlPlaneError(
        409,
        "DEPLOYMENT_VERSION_CONFLICT",
        "Deployment state changed concurrently",
      );
    if (db.blocked && !input.emergencyOverride)
      throw new ControlPlaneError(
        409,
        "ROLLBACK_DATABASE_INCOMPATIBLE",
        db.warning,
      );
    if (input.emergencyOverride) {
      await this.repository.requireAccess(
        userId,
        organizationId,
        PERMISSIONS.EMERGENCY_ROLLBACK,
      );
      if (
        !input.overrideJustification ||
        input.overrideJustification.trim().length < 12
      )
        throw new ControlPlaneError(
          400,
          "EMERGENCY_JUSTIFICATION_REQUIRED",
          "Emergency override justification is required",
        );
    }
    let approval = null;
    if (input.approvalId)
      approval =
        (
          await this.pool.query(
            "SELECT * FROM rollback_approvals WHERE id=$1 AND organization_id=$2 AND source_deployment_id=$3 AND target_deployment_id=$4 AND status='approved'",
            [input.approvalId, organizationId, target.id, p.id],
          )
        ).rows[0] || null;
    if (policy.approvalRequired && !approval)
      throw new ControlPlaneError(
        409,
        "ROLLBACK_APPROVAL_REQUIRED",
        "An approval for this exact rollback is required",
      );
    const created = await this.create(
      userId,
      organizationId,
      {
        projectId: target.projectId,
        serviceId: target.serviceId,
        repositoryId: target.repositoryId,
        branch: target.branch,
        commitSha: p.commitSha,
        triggerSource: "rollback",
        environment: target.environment,
        configurationSnapshot: p.configurationSnapshot,
        imageTag: p.imageTag,
        rollbackTargetId: p.id,
      },
      key,
    );
    if (!created.created) return created;
    return withTransaction(this.pool, async (c) => {
      const conflict = await c.query(
        "SELECT deployment_id FROM deployment_operation_locks WHERE organization_id=$1 AND service_id=$2 AND environment=$3 AND expires_at>NOW() FOR UPDATE",
        [organizationId, target.serviceId, target.environment],
      );
      if (
        conflict.rowCount &&
        conflict.rows[0].deployment_id !== created.deployment.id
      )
        throw new ControlPlaneError(
          409,
          "DEPLOYMENT_OPERATION_CONFLICT",
          "Another deployment operation is active",
        );
      await c.query(
        "DELETE FROM deployment_operation_locks WHERE organization_id=$1 AND service_id=$2 AND environment=$3 AND expires_at<=NOW()",
        [organizationId, target.serviceId, target.environment],
      );
      await c.query(
        "INSERT INTO deployment_operation_locks(organization_id,service_id,environment,deployment_id,operation,idempotency_key_hash,expires_at) VALUES($1,$2,$3,$4,'rollback',$5,NOW()+($6||' seconds')::interval) ON CONFLICT(organization_id,service_id,environment) DO NOTHING",
        [
          organizationId,
          target.serviceId,
          target.environment,
          created.deployment.id,
          hash(`${organizationId}:${key}`),
          policy.lockTimeoutSeconds || 900,
        ],
      );
      const result = await c.query(
        `UPDATE deployments SET current_state='rollback_queued',state_version=state_version+1,image_digest=$1,rollback_target_id=$2,previous_successful_deployment_id=$3,rollback_reason=$4,rollback_approval_id=$5,rollback_actor_id=$6,rollback_requested_at=NOW(),rollback_metadata=$7 WHERE id=$8 RETURNING ${cols}`,
        [
          p.imageDigest,
          p.id,
          target.id,
          redact(reason),
          approval?.id || null,
          userId,
          {
            databaseCompatibility: db,
            emergencyOverride: Boolean(input.emergencyOverride),
            overrideJustification: input.emergencyOverride
              ? redact(input.overrideJustification)
              : null,
          },
          created.deployment.id,
        ],
      );
      await this._event(
        c,
        result.rows[0],
        "rollback.queued",
        "rollback_queued",
        "Rollback queued; database compatibility must be reviewed",
        {
          targetDeploymentId: p.id,
          sourceDeploymentId: target.id,
          reason: redact(reason),
          approvalId: approval?.id || null,
          databaseCompatibility: db,
        },
      );
      await c.query(
        "INSERT INTO rollback_audit_events(organization_id,rollback_deployment_id,source_deployment_id,target_deployment_id,actor_user_id,action,reason,approval_id,metadata) VALUES($1,$2,$3,$4,$5,'rollback.queued',$6,$7,$8)",
        [
          organizationId,
          result.rows[0].id,
          target.id,
          p.id,
          userId,
          redact(reason),
          approval?.id || null,
          {
            databaseCompatibility: db,
            emergencyOverride: Boolean(input.emergencyOverride),
          },
        ],
      );
      return { deployment: result.rows[0], created: created.created };
    });
  }
  async requestCancellation(userId, organizationId, id, reason) {
    const d = await this.access(
      userId,
      organizationId,
      id,
      PERMISSIONS.DEPLOYMENT_CREATE,
    );
    await this.pool.query(
      "INSERT INTO deployment_cancellation_requests(deployment_id,requested_by,reason) VALUES($1,$2,$3)",
      [id, userId, redact(reason || "")],
    );
    return this.transition(id, "cancel_requested", {
      expectedVersion: d.stateVersion,
      commandId: `cancel:${id}`,
      safeMessage: "Cancellation requested",
    });
  }
  async isCancellationRequested(id) {
    return (
      (
        await this.pool.query(
          "SELECT 1 FROM deployments WHERE id=$1 AND current_state='cancel_requested'",
          [id],
        )
      ).rowCount === 1
    );
  }
  async addAttempt(id, workerId) {
    const r = await this.pool.query(
      "UPDATE deployments SET attempt_count=attempt_count+1 WHERE id=$1 RETURNING attempt_count",
      [id],
    );
    return (
      await this.pool.query(
        "INSERT INTO deployment_job_attempts(deployment_id,attempt,worker_id,status,heartbeat_at) VALUES($1,$2,$3,'active',NOW()) RETURNING deployment_id AS \"deploymentId\",attempt",
        [id, r.rows[0].attempt_count, workerId],
      )
    ).rows[0];
  }
  async heartbeat(id, attempt) {
    await this.pool.query(
      "UPDATE deployment_job_attempts SET heartbeat_at=NOW() WHERE deployment_id=$1 AND attempt=$2",
      [id, attempt],
    );
  }
  async finishAttempt(id, attempt, status, failureCode = null) {
    await this.pool.query(
      "UPDATE deployment_job_attempts SET status=$1,failure_code=$2,completed_at=NOW() WHERE deployment_id=$3 AND attempt=$4",
      [status, failureCode, id, attempt],
    );
  }
}
module.exports = { PostgresDeploymentStore };
