import { validateAuditEvent, Status, AUDIT_EVENT_FIELDS } from '../schema/audit-event';

const validEvent = {
  event_id:    'evt-001',
  event_time:  '2026-06-29T12:00:00Z',
  enqueued_at: '2026-06-29T11:59:00Z',
  tenant_id:   'tenant-1',
  batch_id:    'batch-001',
  work_type:   'export',
  item_id:     'item-001',
  item_type:   'record',
  status:      Status.SUCCEEDED,
};

test('accepts a valid event', () => {
  expect(() => validateAuditEvent(validEvent)).not.toThrow();
});

test('accepts each valid status value', () => {
  for (const status of Object.values(Status)) {
    expect(() => validateAuditEvent({ ...validEvent, status })).not.toThrow();
  }
});

test('accepts optional fields alongside required fields', () => {
  expect(() => validateAuditEvent({
    ...validEvent,
    status:       Status.FAILED,
    error_code:   'TIMEOUT',
    error_reason: 'upstream did not respond within SLA',
  })).not.toThrow();

  expect(() => validateAuditEvent({
    ...validEvent,
    status:      Status.SKIPPED,
    skip_reason: 'item already processed',
  })).not.toThrow();
});

test('rejects an unknown status', () => {
  expect(() => validateAuditEvent({ ...validEvent, status: 'UNKNOWN' }))
    .toThrow(/invalid status/);
});

test('rejects each missing required field', () => {
  const requiredFields = AUDIT_EVENT_FIELDS.filter(f => f.required).map(f => f.name);
  for (const field of requiredFields) {
    const { [field]: _omitted, ...without } = validEvent as Record<string, unknown>;
    expect(() => validateAuditEvent(without)).toThrow(field);
  }
});

test('rejects a non-object event', () => {
  expect(() => validateAuditEvent(null)).toThrow();
  expect(() => validateAuditEvent('string')).toThrow();
  expect(() => validateAuditEvent(42)).toThrow();
});
