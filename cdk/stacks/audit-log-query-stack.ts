import * as cdk from 'aws-cdk-lib/core';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { AuditLogBaseProps } from '../interfaces/stack-props';
import { auditQueryOutputBucketName } from '../utils/bucket-names';

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

    new athena.CfnWorkGroup(this, 'AuditWorkgroup', {
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
  }
}
