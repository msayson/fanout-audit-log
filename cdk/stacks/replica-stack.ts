import * as cdk from 'aws-cdk-lib/core';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ReplicaStackProps } from '../interfaces/stack-props.js';

/**
 * Disaster-recovery bucket in the secondary region. A separate stack is required because CDK stacks
 * are single-region; this must be deployed first so its ARN and KMS key ARN can be passed into AuditLogStack.
 */
export class ReplicaStack extends cdk.Stack {
  public readonly bucketArn: string;
  public readonly kmsKeyArn: string;

  constructor(scope: Construct, id: string, props: cdk.StackProps & ReplicaStackProps) {
    super(scope, id, props);

    const key = new kms.Key(this, 'ReplicaKey', {
      description: `audit-log replica encryption key (${props.stage})`,
      enableKeyRotation: true,
      removalPolicy: props.removalPolicy,
    });

    const bucket = new s3.Bucket(this, 'ReplicaBucket', {
      bucketName: `audit-log-replica-${props.stage}-${this.account}-${this.region}`,
      encryptionKey: key,
      bucketKeyEnabled: true,
      versioned: true,
      objectLockEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.removalPolicy,
    });

    this.bucketArn = bucket.bucketArn;
    this.kmsKeyArn = key.keyArn;

    new cdk.CfnOutput(this, 'BucketArn', { value: bucket.bucketArn });
    new cdk.CfnOutput(this, 'KmsKeyArn', { value: key.keyArn });
  }
}
