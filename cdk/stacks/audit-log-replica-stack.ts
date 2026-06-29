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
  public readonly kmsKeyArn?: string;

  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogReplicaStackProps) {
    super(scope, id, props);

    let key: kms.Key | undefined;
    if (props.useCmk) {
      key = new kms.Key(this, 'ReplicaKey', {
        description: `${props.appQualifier} audit-log replica CMK`,
        enableKeyRotation: true,
        removalPolicy: props.removalPolicy,
      });
      this.kmsKeyArn = key.keyArn;
      new cdk.CfnOutput(this, 'KmsKeyArn', { value: key.keyArn });
    }

    new s3.Bucket(this, 'ReplicaBucket', {
      bucketName: auditReplicaBucketName(this.account, props.stage),
      ...(key
        ? { encryptionKey: key, bucketKeyEnabled: true }
        : { encryption: s3.BucketEncryption.S3_MANAGED }),
      versioned: true,
      objectLockEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.removalPolicy,
    });
  }
}
