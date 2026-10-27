const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const { PERMISSIONS } = require("../auth/rbac");
const { canonical, validateInput } = require("./schema");

const ZERO = "0".repeat(64);

class MemoryAuditService {
  constructor(repository, options = {}) {
    this.repository = repository;
    this.clock = options.clock || (() => new Date());
    this.integrityKeys = options.integrityKeys || { 1: Buffer.alloc(32, 9) };
    this.activeKeyVersion = options.activeKeyVersion || 1;
    this.minRetentionDays = options.minRetentionDays || 30;
    this.maxRetentionDays = options.maxRetentionDays || 2555;
    this.maxExportDays = options.maxExportDays || 366;
    this.exportTtlMs = options.exportTtlMs || 300000;
    this.events = new Map();
    this.idempotency = new Map();
    this.exports = new Map();
    this.downloadTokens = new Map();
    this.retention = new Map();
  }

  _key(version) {
    const key = this.integrityKeys[version];
    if (!key)
      throw new ControlPlaneError(
        500,
        "AUDIT_INTEGRITY_KEY_UNAVAILABLE",
        "Audit integrity key is unavailable",
      );
    return Buffer.isBuffer(key) ? key : Buffer.from(key, "base64");
  }

  _hash(payload, previousHash, keyVersion) {
    return crypto
      .createHmac("sha256", this._key(keyVersion))
      .update(`${previousHash}\n${canonical(payload)}`)
      .digest("hex");
  }

  append(input) {
    const safe = validateInput(input);
    const idem = `${safe.organizationId}:${safe.idempotencyKey}`;
    if (this.idempotency.has(idem)) return this.idempotency.get(idem);
    const rows = this.events.get(safe.organizationId) || [];
    const previous = rows.at(-1);
    const sequence = (previous?.sequence || 0) + 1;
    const base = {
      id: crypto.randomUUID(),
      ...safe,
      timestamp: this.clock().toISOString(),
      sequence,
    };
    const event = {
      ...base,
      integrity: {
        algorithm: "HMAC-SHA256",
        keyVersion: this.activeKeyVersion,
        previousHash: previous?.integrity.hash || ZERO,
        hash: null,
      },
    };
    event.integrity.hash = this._hash(
      base,
      event.integrity.previousHash,
      event.integrity.keyVersion,
    );
    rows.push(Object.freeze(event));
    this.events.set(safe.organizationId, rows);
    this.idempotency.set(idem, event);
    return event;
  }

  _authorize(actorId, organizationId, permission = PERMISSIONS.AUDIT_READ) {
    this.repository.requireAccess(actorId, organizationId, permission);
  }

  search(actorId, organizationId, query = {}) {
    this._authorize(actorId, organizationId);
    const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);
    const after = Number(query.after || 0);
    const from = query.from ? new Date(query.from).getTime() : null;
    const to = query.to ? new Date(query.to).getTime() : null;
    let items = (this.events.get(organizationId) || []).filter(
      (event) =>
        event.sequence > after &&
        (!from || new Date(event.timestamp).getTime() >= from) &&
        (!to || new Date(event.timestamp).getTime() <= to) &&
        (!query.actorId || event.actorId === query.actorId) &&
        (!query.action || event.action === query.action) &&
        (!query.resourceType || event.resourceType === query.resourceType) &&
        (!query.resourceId || event.resourceId === query.resourceId) &&
        (!query.result || event.result === query.result) &&
        (!query.requestId || event.requestId === query.requestId) &&
        (!query.correlationId || event.correlationId === query.correlationId),
    );
    items = items.sort((left, right) => left.sequence - right.sequence);
    const page = items.slice(0, limit);
    return {
      items: page,
      pagination: {
        after,
        nextAfter: items.length > limit ? page.at(-1).sequence : null,
        hasMore: items.length > limit,
      },
    };
  }

  get(actorId, organizationId, id) {
    this._authorize(actorId, organizationId);
    const event = (this.events.get(organizationId) || []).find(
      (item) => item.id === id,
    );
    if (!event)
      throw new ControlPlaneError(
        404,
        "AUDIT_EVENT_NOT_FOUND",
        "Audit event not found",
      );
    return event;
  }

  verify(actorId, organizationId, range = {}) {
    this._authorize(actorId, organizationId, PERMISSIONS.AUDIT_VERIFY);
    const fromSequence = Number(range.fromSequence || 1);
    const toSequence = Number(range.toSequence || Number.MAX_SAFE_INTEGER);
    const all = this.events.get(organizationId) || [];
    const rows = all.filter(
      (event) => event.sequence >= fromSequence && event.sequence <= toSequence,
    );
    let previous =
      range.checkpointHash ||
      (fromSequence === 1
        ? ZERO
        : all.find((event) => event.sequence === fromSequence - 1)?.integrity
            .hash);
    const failures = [];
    for (const event of rows) {
      const { integrity, ...base } = event;
      if (!previous || integrity.previousHash !== previous)
        failures.push({
          sequence: event.sequence,
          code: "CHAIN_CONTINUITY_BROKEN",
        });
      const expected = this._hash(
        base,
        integrity.previousHash,
        integrity.keyVersion,
      );
      const actual = String(integrity.hash || "");
      if (
        expected.length !== actual.length ||
        !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
      )
        failures.push({
          sequence: event.sequence,
          code: "EVENT_HASH_MISMATCH",
        });
      previous = integrity.hash;
    }
    for (let index = 1; index < rows.length; index += 1)
      if (rows[index].sequence !== rows[index - 1].sequence + 1)
        failures.push({
          sequence: rows[index].sequence,
          code: "SEQUENCE_GAP_OR_REORDER",
        });
    return {
      organizationId,
      fromSequence,
      toSequence: rows.at(-1)?.sequence || null,
      verifiedAt: this.clock().toISOString(),
      valid: failures.length === 0,
      checkedEvents: rows.length,
      checkpointHash: previous || range.checkpointHash || ZERO,
      failures,
    };
  }

  requestExport(
    actorId,
    organizationId,
    query = {},
    idempotencyKey = crypto.randomUUID(),
  ) {
    this._authorize(actorId, organizationId, PERMISSIONS.AUDIT_EXPORT);
    if (
      query.from &&
      query.to &&
      (new Date(query.to) - new Date(query.from)) / 86400000 >
        this.maxExportDays
    )
      throw new ControlPlaneError(
        400,
        "AUDIT_EXPORT_RANGE_TOO_LARGE",
        "Audit export range is too large",
      );
    const idem = `${organizationId}:${idempotencyKey}`;
    const existing = this.exports.get(idem);
    if (existing) return this.safeExport(existing);
    this.append({
      organizationId,
      actorId,
      action: "audit.export.requested",
      resourceType: "audit_export",
      resourceId: idempotencyKey,
      result: "success",
      sourceCategory: "audit",
      idempotencyKey: `export-request:${idempotencyKey}`,
      metadata: { format: "audit-jsonl-v1" },
    });
    const first = this.search(actorId, organizationId, {
      ...query,
      limit: 200,
    });
    const items = [...first.items];
    let cursor = first.pagination.nextAfter;
    while (cursor) {
      const next = this.search(actorId, organizationId, {
        ...query,
        after: cursor,
        limit: 200,
      });
      items.push(...next.items);
      cursor = next.pagination.nextAfter;
    }
    const body = `${items.map((event) => JSON.stringify(event)).join("\n")}${items.length ? "\n" : ""}`;
    const created = this.clock();
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const value = {
      id: crypto.randomUUID(),
      organizationId,
      requesterId: actorId,
      state: "completed",
      format: "audit-jsonl-v1",
      eventCount: items.length,
      sha256: crypto.createHash("sha256").update(body).digest("hex"),
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + this.exportTtlMs).toISOString(),
      downloadToken: token,
      body,
    };
    this.exports.set(idem, value);
    this.downloadTokens.set(tokenHash, value.id);
    this.append({
      organizationId,
      actorId,
      action: "audit.export.completed",
      resourceType: "audit_export",
      resourceId: value.id,
      result: "success",
      sourceCategory: "audit",
      idempotencyKey: `export-complete:${value.id}`,
      metadata: {
        format: value.format,
        eventCount: value.eventCount,
        sha256: value.sha256,
      },
    });
    return this.safeExport(value);
  }

  safeExport(value) {
    const safe = { ...value };
    delete safe.body;
    delete safe.requesterId;
    return safe;
  }

  download(actorId, organizationId, id, token) {
    this._authorize(actorId, organizationId, PERMISSIONS.AUDIT_EXPORT);
    const hash = crypto
      .createHash("sha256")
      .update(String(token || ""))
      .digest("hex");
    const value = [...this.exports.values()].find(
      (item) => item.id === id && item.organizationId === organizationId,
    );
    if (!value || this.downloadTokens.get(hash) !== id)
      throw new ControlPlaneError(
        404,
        "AUDIT_EXPORT_NOT_FOUND",
        "Audit export not found",
      );
    if (this.clock().getTime() >= new Date(value.expiresAt).getTime())
      throw new ControlPlaneError(
        410,
        "AUDIT_EXPORT_EXPIRED",
        "Audit export expired",
      );
    this.downloadTokens.delete(hash);
    this.append({
      organizationId,
      actorId,
      action: "audit.export.downloaded",
      resourceType: "audit_export",
      resourceId: id,
      result: "success",
      sourceCategory: "audit",
      idempotencyKey: `export-download:${id}:${hash}`,
      metadata: { format: value.format, sha256: value.sha256 },
    });
    return {
      contentType: "application/x-ndjson",
      body: value.body,
      sha256: value.sha256,
    };
  }

  retentionDetails(actorId, organizationId) {
    this._authorize(actorId, organizationId);
    return (
      this.retention.get(organizationId) || {
        applicationRetentionDays: 365,
        minRetentionDays: this.minRetentionDays,
        maxRetentionDays: this.maxRetentionDays,
        legalHoldSupported: false,
        externalImmutableStorageRequiredForWorm: true,
      }
    );
  }

  setRetention(actorId, organizationId, days) {
    this._authorize(
      actorId,
      organizationId,
      PERMISSIONS.AUDIT_RETENTION_MANAGE,
    );
    if (
      !Number.isInteger(days) ||
      days < this.minRetentionDays ||
      days > this.maxRetentionDays
    )
      throw new ControlPlaneError(
        400,
        "AUDIT_RETENTION_INVALID",
        "Audit retention is outside supported limits",
      );
    const value = {
      ...this.retentionDetails(actorId, organizationId),
      applicationRetentionDays: days,
    };
    this.retention.set(organizationId, value);
    this.append({
      organizationId,
      actorId,
      action: "audit.retention.changed",
      resourceType: "audit_policy",
      resourceId: organizationId,
      result: "success",
      sourceCategory: "audit",
      idempotencyKey: `retention:${organizationId}:${days}`,
      metadata: { days },
    });
    return value;
  }
}

module.exports = { MemoryAuditService, ZERO };
