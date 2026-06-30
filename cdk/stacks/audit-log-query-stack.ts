import * as cdk from 'aws-cdk-lib/core';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { AuditLogBaseProps } from '../interfaces/stack-props';
import { auditQueryOutputBucketName } from '../utils/bucket-names';
import { auditDatabaseName, AUDIT_TABLE_NAME } from './audit-log-catalog-stack';

export interface AuditLogQueryStackProps extends AuditLogBaseProps {
  readonly athenaBytesScannedCutoffGb: number;
}

export const QUERY_RESULTS_RETENTION_DAYS = 14;

export const auditWorkgroupName = (appQualifier: string) => `${appQualifier}-auditlog`;

/**
 * Athena workgroup and ephemeral query-results bucket for ad-hoc audit queries.
 *
 * Output bucket: `${accountId}-${stage}-audit-log-query-output` — SSE-KMS when
 * `useCmk: true`, SSE-S3 when false. Results expire after 14 days.
 *
 * The workgroup enforces the output location and a per-query bytes-scanned cap
 * (`athenaBytesScannedCutoffGb`) so runaway queries are rejected rather than
 * silently scanning the full audit bucket.
 *
 * To query: open the Athena console, switch to this workgroup, and query the
 * `audit_events` table in the `${appQualifier}-auditlog` Glue database.
 * See README for sample queries and workgroup-selection steps.
 */
export class AuditLogQueryStack extends cdk.Stack {
  public readonly workgroupName: string;
  public readonly outputBucketName: string;

  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogQueryStackProps) {
    super(scope, id, props);

    this.workgroupName = auditWorkgroupName(props.appQualifier);
    this.outputBucketName = auditQueryOutputBucketName(this.account, props.stage);

    const outputBucket = new s3.Bucket(this, 'QueryOutputBucket', {
      bucketName: this.outputBucketName,
      // useCmk: true → customer-managed KMS key (slightly higher infra costs, ability to rotate keys)
      // useCmk: false → SSE-S3 (AWS-managed encryption key, no infra costs, no key rotation)
      encryption: props.useCmk
        ? s3.BucketEncryption.KMS_MANAGED
        : s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.removalPolicy,
      autoDeleteObjects: props.removalPolicy === cdk.RemovalPolicy.DESTROY,
    });

    outputBucket.addLifecycleRule({
      id: 'expire-query-results',
      expiration: cdk.Duration.days(QUERY_RESULTS_RETENTION_DAYS),
    });

    const workgroup = new athena.CfnWorkGroup(this, 'AuditWorkgroup', {
      name: this.workgroupName,
      state: 'ENABLED',
      workGroupConfiguration: {
        enforceWorkGroupConfiguration: true,
        bytesScannedCutoffPerQuery: props.athenaBytesScannedCutoffGb * 1024 * 1024 * 1024,
        resultConfiguration: {
          outputLocation: `s3://${this.outputBucketName}/`,
          encryptionConfiguration: {
            encryptionOption: props.useCmk ? 'SSE_KMS' : 'SSE_S3',
          },
        },
      },
    });

    const db = auditDatabaseName(props.appQualifier);

    // dt range is 1 day wider than the event_time range to cover Firehose delivery lag
    // (events near a day boundary may be delivered into the following day's dt partition).
    const namedQuerySql = (filterField: string, placeholder: string) => `\
-- Replace '${placeholder}' with the target ${filterField} before running.
-- Adjust the interval to change the lookback window.
WITH deduped AS (
    SELECT
        event_id, event_time, enqueued_at,
        tenant_id, batch_id, work_type,
        item_id, item_type, status,
        skip_reason, error_code, error_reason,
        ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY event_time) AS rn
    FROM "${db}"."${AUDIT_TABLE_NAME}"
    WHERE ${filterField} = '${placeholder}'
      AND event_time >= current_timestamp - interval '7' day
      AND dt >= date_format(current_date - interval '8' day, '%Y/%m/%d')
      AND dt <= date_format(current_date, '%Y/%m/%d')
)
SELECT
    event_id, event_time, enqueued_at,
    tenant_id, batch_id, work_type,
    item_id, item_type, status,
    skip_reason, error_code, error_reason
FROM deduped
WHERE rn = 1
ORDER BY event_time`;

    const namedQueriesWithPlaceholderValue: Array<[string, string, string, string]> = [
      ['QueryByBatchId', 'audit-events-by-batch-id', 'Events for a batch_id, last 7 days, deduplicated on event_id', 'batch_id'],
      ['QueryByItemId', 'audit-events-by-item-id', 'Events for an item_id, last 7 days, deduplicated on event_id', 'item_id'],
      ['QueryByTenantId', 'audit-events-by-tenant-id', 'Events for a tenant_id, last 7 days, deduplicated on event_id', 'tenant_id'],
    ];
    const namedQueriesWithFixedFilterValue: Array<[string, string, string, string, string]> = [
      ['QueryFailedIngestions', 'failed-ingestion-audit-events', 'Events for failed ingestions, last 7 days, deduplicated on event_id', 'status', 'FAILED'],
      ['QuerySkippedIngestions', 'skipped-ingestion-audit-events', 'Events for skipped ingestions, last 7 days, deduplicated on event_id', 'status', 'SKIPPED'],
    ];

    for (const [id, name, description, filterField] of namedQueriesWithPlaceholderValue) {
      const placeholder = `YOUR_${filterField.toUpperCase()}`;
      const q = new athena.CfnNamedQuery(this, id, {
        name,
        description,
        database: db,
        workGroup: this.workgroupName,
        queryString: namedQuerySql(filterField, placeholder),
      });
      q.addDependency(workgroup);
    }
    for (const [id, name, description, filterField, filterValue] of namedQueriesWithFixedFilterValue) {
      const q = new athena.CfnNamedQuery(this, id, {
        name,
        description,
        database: db,
        workGroup: this.workgroupName,
        queryString: namedQuerySql(filterField, filterValue),
      });
      q.addDependency(workgroup);
    }
  }
}
