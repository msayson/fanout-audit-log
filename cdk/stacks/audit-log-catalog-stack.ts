import * as cdk from 'aws-cdk-lib/core';
import * as glue from 'aws-cdk-lib/aws-glue';
import { Construct } from 'constructs';
import { AuditLogBaseProps } from '../interfaces/stack-props';
import { AUDIT_EVENT_FIELDS } from '../schema/audit-event';
import { auditBucketName } from '../utils/bucket-names';

export interface AuditLogCatalogStackProps extends AuditLogBaseProps {}

export const AUDIT_TABLE_NAME = 'audit_events';
export const auditDatabaseName = (appQualifier: string) => `${appQualifier}-auditlog`;

/**
 * Glue database and audit-event table with partition projection on `dt`.
 *
 * Watermark contract: `dt` reflects Firehose *delivery* time, not `event_time`.
 * Delivery can lag `event_time` by up to the buffer interval (default 5 min) and
 * can cross day boundaries. Consumers querying by event_time must apply a lookback
 * window of at least (buffer interval + clock skew) to avoid missing late-arriving
 * objects. Named queries enforce this contract.
 */
export class AuditLogCatalogStack extends cdk.Stack {
  public readonly databaseName: string;
  public readonly tableName: string;

  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogCatalogStackProps) {
    super(scope, id, props);

    this.databaseName = auditDatabaseName(props.appQualifier);
    this.tableName = AUDIT_TABLE_NAME;

    const database = new glue.CfnDatabase(this, 'AuditLogDatabase', {
      catalogId: this.account,
      databaseInput: { name: this.databaseName },
    });

    const bucketName = auditBucketName(this.account, props.stage);

    new glue.CfnTable(this, 'AuditEventTable', {
      catalogId: this.account,
      databaseName: database.ref,
      tableInput: {
        name: this.tableName,
        tableType: 'EXTERNAL_TABLE',
        // dt is the Firehose delivery-date partition; excluded from AUDIT_EVENT_FIELDS
        // because it is not part of the event record written by the worker.
        partitionKeys: [{ name: 'dt', type: 'string' }],
        storageDescriptor: {
          columns: AUDIT_EVENT_FIELDS.map(f => ({ name: f.name, type: f.glueType })),
          location: `s3://${bucketName}/`,
          inputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat',
          serdeInfo: {
            serializationLibrary: 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe',
          },
          compressed: false,
          storedAsSubDirectories: false,
        },
        parameters: {
          'classification': 'parquet',
          // Partition projection over dt=yyyy/MM/dd — matches the Firehose prefix
          // dt=!{timestamp:yyyy/MM/dd}. No crawler or MSCK REPAIR TABLE needed.
          'projection.enabled': 'true',
          'projection.dt.type': 'date',
          'projection.dt.format': 'yyyy/MM/dd',
          'projection.dt.range': '2026/01/01,NOW',
          'projection.dt.interval': '1',
          'projection.dt.interval.unit': 'DAYS',
          'storage.location.template': `s3://${bucketName}/dt=\${dt}/`,
        },
      },
    });
  }
}
