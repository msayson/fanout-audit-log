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

/**
 * P0 storage foundation: CMK, audit S3 bucket (WORM/SSE-KMS/versioning), lifecycle rule,
 * and cross-region replication to the pre-deployed AuditLogReplicaStack bucket.
 * Both bucket names are deterministic; only the replica CMK ARN is passed as a prop.
 */
export class AuditLogStorageStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogStorageStackProps) {
    super(scope, id, props);

    const key = new kms.Key(this, 'AuditLogKey', {
      description: `${props.appQualifier} audit-log CMK`,
      enableKeyRotation: true,
      removalPolicy: props.removalPolicy,
    });

    const bucket = new s3.Bucket(this, 'AuditLogBucket', {
      bucketName: auditBucketName(this.account, props.stage),
      encryptionKey: key,
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

    // Cross-region replication to the pre-deployed AuditLogReplicaStack bucket
    const replicaBucketArn = `arn:aws:s3:::${auditReplicaBucketName(props.replicaAccount, props.stage)}`;
    const replicaBucket = s3.Bucket.fromBucketArn(this, 'ReplicaBucket', replicaBucketArn);
    const replicaKey = kms.Key.fromKeyArn(this, 'ReplicaKey', props.replicaKmsKeyArn);

    const replicationRole = new iam.Role(this, 'ReplicationRole', {
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
    });
    bucket.grantRead(replicationRole);
    replicaBucket.grantWrite(replicationRole);
    key.grantDecrypt(replicationRole);
    replicaKey.grantEncrypt(replicationRole);

    const cfnBucket = bucket.node.defaultChild as s3.CfnBucket;
    cfnBucket.replicationConfiguration = {
      role: replicationRole.roleArn,
      rules: [{
        id: 'replicate-all',
        status: 'Enabled',
        destination: {
          bucket: replicaBucket.bucketArn,
          encryptionConfiguration: { replicaKmsKeyId: replicaKey.keyArn },
          replicationTime: { status: 'Enabled', time: { minutes: 15 } },
          metrics: { status: 'Enabled', eventThreshold: { minutes: 15 } },
        },
        sourceSelectionCriteria: { sseKmsEncryptedObjects: { status: 'Enabled' } },
        deleteMarkerReplication: { status: 'Disabled' },
        filter: { prefix: '' },
      }],
    };

    // Publish CMK ARN to SSM — KMS key ARNs are not inferrable
    new ssm.StringParameter(this, 'KmsKeyArnParam', {
      parameterName: SSM.auditKmsKeyArn(this.account, props.stage),
      stringValue: key.keyArn,
    });
  }
}
