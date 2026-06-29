import { RemovalPolicy } from 'aws-cdk-lib/core';

export interface AuditLogStackProps {
  readonly stage: string;
  readonly retentionYears: number;
  readonly removalPolicy: RemovalPolicy;
  /** ARN of the replica bucket (deployed via ReplicaStack in the secondary region) */
  readonly replicaBucketArn: string;
  /** ARN of the KMS key in the replica region */
  readonly replicaKmsKeyArn: string;
}

export interface ReplicaStackProps {
  readonly stage: string;
  readonly removalPolicy: RemovalPolicy;
}
