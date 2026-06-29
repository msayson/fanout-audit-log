import * as cdk from 'aws-cdk-lib/core';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { AuditLogBaseProps } from '../interfaces/stack-props';
import { auditReplicaBucketName } from '../utils/bucket-names';

export interface AuditLogReplicaStackProps extends AuditLogBaseProps {}

/**
 * Disaster-recovery bucket in the secondary region. A separate stack is required because CDK stacks
 * are single-region; this must be deployed first so its KMS key ARN can be passed into AuditLogStorageStack.
 * Bucket name is deterministic; only the KMS key ARN needs to be passed back as context.
 */
export class AuditLogReplicaStack extends cdk.Stack {
  /** CMK ARN when useCmk: true; alias ARN (arn:aws:kms:REGION:ACCOUNT:alias/aws/s3) when false. */
  public readonly kmsKeyArn: string;

  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogReplicaStackProps) {
    super(scope, id, props);

    // useCmk: true  → create a CMK
    // useCmk: false → no key object; bucket uses KMS_MANAGED (aws/s3); alias ARN is deterministic
    let key: kms.IKey | undefined;
    if (props.useCmk) {
      key = new kms.Key(this, 'ReplicaKey', {
        description: `${props.appQualifier} audit-log replica CMK`,
        enableKeyRotation: true,
        removalPolicy: props.removalPolicy,
      });
      new cdk.CfnOutput(this, 'KmsKeyArn', { value: key.keyArn });
    }

    this.kmsKeyArn = key?.keyArn ?? `arn:aws:kms:${this.region}:${this.account}:alias/aws/s3`;

    new s3.Bucket(this, 'ReplicaBucket', {
      bucketName: auditReplicaBucketName(this.account, props.stage),
      ...(key ? { encryptionKey: key } : { encryption: s3.BucketEncryption.KMS_MANAGED }),
      bucketKeyEnabled: true,
      versioned: true,
      objectLockEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.removalPolicy,
    });
  }
}
