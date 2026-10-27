BEGIN;
-- Enterprise audit includes the existing platform/system partition for login
-- events before an organization exists. Outbox scope must match its parent event,
-- rather than requiring a synthetic organization to be created.
CREATE UNIQUE INDEX IF NOT EXISTS enterprise_audit_event_scope_idx ON enterprise_audit_events(id,organization_id);
ALTER TABLE audit_outbox DROP CONSTRAINT IF EXISTS audit_outbox_organization_id_fkey;
ALTER TABLE audit_outbox ADD CONSTRAINT audit_outbox_event_scope_fk
  FOREIGN KEY(audit_event_id,organization_id) REFERENCES enterprise_audit_events(id,organization_id) ON DELETE RESTRICT;
COMMIT;
