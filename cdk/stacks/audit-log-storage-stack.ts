import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { AuditLogBaseProps } from '../interfaces/stack-props';
import { SSM } from '../constants/ssm';
import { auditBucketName, auditReplicaBucketName } from '../utils/bucket-names';

export interface AuditLogStorageStackProps extends AuditLogBaseProps {
  readonly objectLockDurationDays: number;
  readonly retentionDays: number;
  readonly replicaAccount: string;
  readonly replicaRegion: string;
  readonly replicaKmsKeyArn: string;
}

/** Root prefix Firehose uses for delivery failures; shared with AuditLogIngestStack. */
export const FIREHOSE_ERROR_PREFIX = 'errors/';

/**
 * P0 storage foundation: audit S3 bucket (WORM/versioning), lifecycle rule,
 * and cross-region replication to the pre-deployed AuditLogReplicaStack bucket.
 * When useCmk is true, SSE-KMS with a CMK is used; otherwise BucketEncryption.KMS_MANAGED
 * is used so S3 selects the aws/s3 managed key automatically.
 */
export class AuditLogStorageStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogStorageStackProps) {
    super(scope, id, props);

    // useCmk: true  → create a CMK
    // useCmk: false → BucketEncryption.KMS_MANAGED; S3 selects aws/s3 automatically
    let key: kms.IKey | undefined;
    if (props.useCmk) {
      key = new kms.Key(this, 'AuditLogKey', {
        description: `${props.appQualifier} audit-log CMK`,
        enableKeyRotation: true,
        removalPolicy: props.removalPolicy,
      });
    }

    const bucket = new s3.Bucket(this, 'AuditLogBucket', {
      bucketName: auditBucketName(this.account, props.stage),
      ...(key ? { encryptionKey: key } : { encryption: s3.BucketEncryption.KMS_MANAGED }),
      bucketKeyEnabled: true,
      versioned: true,
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.governance(
        cdk.Duration.days(props.objectLockDurationDays),
      ),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.removalPolicy,
    });

    // Expiry must be >= Object Lock duration so WORM never blocks the lifecycle delete
    bucket.addLifecycleRule({
      id: 'expire-after-retention',
      expiration: cdk.Duration.days(props.retentionDays),
      noncurrentVersionExpiration: cdk.Duration.days(props.retentionDays),
    });

    bucket.addMetric({ id: 'error-prefix', prefix: FIREHOSE_ERROR_PREFIX });

    // Cross-region replication to the pre-deployed AuditLogReplicaStack bucket
    const replicaBucketArn = `arn:aws:s3:::${auditReplicaBucketName(props.replicaAccount, props.stage)}`;
    const replicaBucket = s3.Bucket.fromBucketArn(this, 'ReplicaBucket', replicaBucketArn);

    const replicationRole = new iam.Role(this, 'ReplicationRole', {
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
    });
    bucket.grantRead(replicationRole);
    replicaBucket.grantWrite(replicationRole);

    replicationRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['s3:GetReplicationConfiguration'],
      resources: [bucket.bucketArn],
    }));
    // grantWrite does not include CRR-specific actions; S3 rejects replication without them
    replicationRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['s3:ReplicateObject', 's3:ReplicateDelete', 's3:ReplicateTags'],
      resources: [`${replicaBucketArn}/*`],
    }));

    if (props.useCmk && key) {
      // CMK: concrete ARNs are known at synth time; CDK grants cover Decrypt + Encrypt/GenerateDataKey*/ReEncrypt*
      const replicaKey = kms.Key.fromKeyArn(this, 'ReplicaKey', props.replicaKmsKeyArn);
      key.grantDecrypt(replicationRole);
      replicaKey.grantEncrypt(replicationRole);
    } else {
      // AWS-managed aws/s3: key ARN is unavailable at synth time; scope by ViaService+ResourceAliases
      // so permissions are constrained to only the aws/s3 key in each region
      replicationRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:DescribeKey'],
        resources: ['*'],
        conditions: {
          StringEquals: { 'kms:ViaService': `s3.${this.region}.amazonaws.com` },
          'ForAnyValue:StringEquals': { 'kms:ResourceAliases': 'alias/aws/s3' },
        },
      }));
      replicationRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['kms:Encrypt', 'kms:GenerateDataKey*', 'kms:ReEncrypt*'],
        resources: ['*'],
        conditions: {
          StringEquals: { 'kms:ViaService': `s3.${props.replicaRegion}.amazonaws.com` },
          'ForAnyValue:StringEquals': { 'kms:ResourceAliases': 'alias/aws/s3' },
        },
      }));
    }

    const cfnBucket = bucket.node.defaultChild as s3.CfnBucket;
    cfnBucket.replicationConfiguration = {
      role: replicationRole.roleArn,
      rules: [{
        id: 'replicate-all',
        priority: 1,
        status: 'Enabled',
        destination: {
          bucket: replicaBucket.bucketArn,
          encryptionConfiguration: { replicaKmsKeyId: props.replicaKmsKeyArn },
          replicationTime: { status: 'Enabled', time: { minutes: 15 } },
          metrics: { status: 'Enabled', eventThreshold: { minutes: 15 } },
        },
        // SSE-KMS objects (both CMK and AWS-managed) are never replicated unless explicitly enabled
        sourceSelectionCriteria: { sseKmsEncryptedObjects: { status: 'Enabled' } },
        deleteMarkerReplication: { status: 'Disabled' },
        filter: { prefix: '' },
      }],
    };

    // Publish CMK ARN to SSM — KMS key ARNs are not inferrable
    if (props.useCmk && key) {
      new ssm.StringParameter(this, 'KmsKeyArnParam', {
        parameterName: SSM.auditKmsKeyArn(this.account, props.stage),
        stringValue: key.keyArn,
      });
    }
  }
}
