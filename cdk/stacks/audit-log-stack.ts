import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { AuditLogStackProps } from '../interfaces/stack-props.js';

/**
 * Append-only audit log stored in S3 (WORM, SSE-KMS), ingested via Firehose and queried by Athena.
 * Replicates to a pre-deployed ReplicaStack bucket in the secondary region for disaster recovery.
 */
export class AuditLogStack extends cdk.Stack {
  /** Exported for use by ProjectionStack */
  public readonly auditBucket: s3.Bucket;
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogStackProps) {
    super(scope, id, props);

    const retentionDays = props.retentionYears * 365;

    // Customer-managed KMS key with rotation
    this.encryptionKey = new kms.Key(this, 'AuditLogKey', {
      description: `audit-log encryption key (${props.stage})`,
      enableKeyRotation: true,
      removalPolicy: props.removalPolicy,
    });

    // Audit bucket — Object Lock, SSE-KMS, Bucket Keys, versioning
    this.auditBucket = new s3.Bucket(this, 'AuditLogBucket', {
      bucketName: `audit-log-raw-${props.stage}-${this.account}-${this.region}`,
      encryptionKey: this.encryptionKey,
      bucketKeyEnabled: true,      // collapses per-object KMS calls (cost lever)
      versioned: true,             // required for Object Lock
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.governance(
        cdk.Duration.days(retentionDays),
      ),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.removalPolicy,
    });

    // Lifecycle expiry >= Object Lock duration
    this.auditBucket.addLifecycleRule({
      id: 'expire-after-retention',
      expiration: cdk.Duration.days(retentionDays + 1),
      noncurrentVersionExpiration: cdk.Duration.days(retentionDays + 1),
    });

    // Cross-region replication to the pre-deployed replica bucket
    const replicaBucket = s3.Bucket.fromBucketArn(this, 'ReplicaBucket', props.replicaBucketArn);
    const replicaKey = kms.Key.fromKeyArn(this, 'ReplicaKey', props.replicaKmsKeyArn);

    const replicationRole = new iam.Role(this, 'ReplicationRole', {
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
    });

    this.auditBucket.grantRead(replicationRole);
    replicaBucket.grantWrite(replicationRole);
    this.encryptionKey.grantDecrypt(replicationRole);
    replicaKey.grantEncrypt(replicationRole);

    const cfnBucket = this.auditBucket.node.defaultChild as s3.CfnBucket;
    cfnBucket.replicationConfiguration = {
      role: replicationRole.roleArn,
      rules: [
        {
          id: 'replicate-all',
          status: 'Enabled',
          destination: {
            bucket: replicaBucket.bucketArn,
            encryptionConfiguration: { replicaKmsKeyId: replicaKey.keyArn },
            replicationTime: { status: 'Enabled', time: { minutes: 15 } },
            metrics: { status: 'Enabled', eventThreshold: { minutes: 15 } },
          },
          sourceSelectionCriteria: {
            sseKmsEncryptedObjects: { status: 'Enabled' },
          },
          deleteMarkerReplication: { status: 'Disabled' },
          filter: { prefix: '' },
        },
      ],
    };

    new cdk.CfnOutput(this, 'AuditBucketName', { value: this.auditBucket.bucketName });
    new cdk.CfnOutput(this, 'AuditKmsKeyArn', { value: this.encryptionKey.keyArn });
  }
}
