/**
 * Single source of truth for the audit-event schema.
 * Used for Glue table columns, worker validation, and example test events.
 */

export const Status = {
  PENDING:   'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED:    'FAILED',
  SKIPPED:   'SKIPPED',
} as const;

export type Status = typeof Status[keyof typeof Status];

const VALID_STATUSES = new Set<string>(Object.values(Status));

/** Column descriptor used to build Glue table columns. */
export interface FieldDescriptor {
  readonly name: string;
  readonly glueType: string;
  readonly required: boolean;
}

/**
 * Ordered field list. The partition column `dt` is NOT included here — it is added
 * by the Glue table definition as a partition key derived from Firehose delivery time.
 */
export const AUDIT_EVENT_FIELDS: readonly FieldDescriptor[] = [
  { name: 'event_id',     glueType: 'string',    required: true  },
  { name: 'event_time',   glueType: 'timestamp', required: true  },
  { name: 'enqueued_at',  glueType: 'timestamp', required: true  },
  { name: 'tenant_id',    glueType: 'string',    required: true  },
  { name: 'batch_id',     glueType: 'string',    required: true  },
  { name: 'work_type',    glueType: 'string',    required: true  },
  { name: 'item_id',      glueType: 'string',    required: true  },
  { name: 'item_type',    glueType: 'string',    required: true  },
  { name: 'status',       glueType: 'string',    required: true  },
  { name: 'skip_reason',  glueType: 'string',    required: false },
  { name: 'error_code',   glueType: 'string',    required: false },
  { name: 'error_reason', glueType: 'string',    required: false },
];

export interface AuditEvent {
  event_id: string;
  event_time: string;     // ISO 8601
  enqueued_at: string;    // ISO 8601
  tenant_id: string;
  batch_id: string;
  work_type: string;
  item_id: string;
  item_type: string;
  status: Status;
  skip_reason?: string;
  error_code?: string;
  error_reason?: string;
}

const REQUIRED_FIELDS = AUDIT_EVENT_FIELDS.filter(f => f.required).map(f => f.name);

/**
 * Asserts that `event` is a valid AuditEvent.
 * Throws a descriptive Error on the first violation found.
 */
export function validateAuditEvent(event: unknown): asserts event is AuditEvent {
  if (typeof event !== 'object' || event === null) {
    throw new Error('audit event must be a non-null object');
  }
  const rec = event as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (rec[field] == null) {
      throw new Error(`missing required field: ${field}`);
    }
  }

  if (!VALID_STATUSES.has(rec['status'] as string)) {
    throw new Error(
      `invalid status: "${rec['status']}"; must be one of ${[...VALID_STATUSES].join(', ')}`,
    );
  }
}
