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
  readonly replicaKmsKeyArn?: string;
}

/**
 * P0 storage foundation: audit S3 bucket (WORM/versioning), lifecycle rule,
 * and cross-region replication to the pre-deployed AuditLogReplicaStack bucket.
 * When useCmk is true, SSE-KMS with CMKs is used; otherwise SSE-S3 (no key cost).
 */
export class AuditLogStorageStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogStorageStackProps) {
    super(scope, id, props);

    const key = props.useCmk
      ? new kms.Key(this, 'AuditLogKey', {
          description: `${props.appQualifier} audit-log CMK`,
          enableKeyRotation: true,
          removalPolicy: props.removalPolicy,
        })
      : undefined;

    const bucket = new s3.Bucket(this, 'AuditLogBucket', {
      bucketName: auditBucketName(this.account, props.stage),
      ...(key
        ? { encryptionKey: key, bucketKeyEnabled: true }
        : { encryption: s3.BucketEncryption.S3_MANAGED }),
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

    // Cross-region replication to the pre-deployed AuditLogReplicaStack bucket
    const replicaBucketArn = `arn:aws:s3:::${auditReplicaBucketName(props.replicaAccount, props.stage)}`;
    const replicaBucket = s3.Bucket.fromBucketArn(this, 'ReplicaBucket', replicaBucketArn);
    const replicaKey = props.useCmk && props.replicaKmsKeyArn
      ? kms.Key.fromKeyArn(this, 'ReplicaKey', props.replicaKmsKeyArn)
      : undefined;

    const replicationRole = new iam.Role(this, 'ReplicationRole', {
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
    });
    bucket.grantRead(replicationRole);
    replicaBucket.grantWrite(replicationRole);
    key?.grantDecrypt(replicationRole);
    replicaKey?.grantEncrypt(replicationRole);

    const cfnBucket = bucket.node.defaultChild as s3.CfnBucket;
    cfnBucket.replicationConfiguration = {
      role: replicationRole.roleArn,
      rules: [{
        id: 'replicate-all',
        priority: 1,
        status: 'Enabled',
        destination: {
          bucket: replicaBucket.bucketArn,
          ...(replicaKey && { encryptionConfiguration: { replicaKmsKeyId: replicaKey.keyArn } }),
          replicationTime: { status: 'Enabled', time: { minutes: 15 } },
          metrics: { status: 'Enabled', eventThreshold: { minutes: 15 } },
        },
        ...(key && { sourceSelectionCriteria: { sseKmsEncryptedObjects: { status: 'Enabled' } } }),
        deleteMarkerReplication: { status: 'Disabled' },
        filter: { prefix: '' },
      }],
    };

    // Publish CMK ARN to SSM — KMS key ARNs are not inferrable
    if (key) {
      new ssm.StringParameter(this, 'KmsKeyArnParam', {
        parameterName: SSM.auditKmsKeyArn(this.account, props.stage),
        stringValue: key.keyArn,
      });
    }
  }
}
