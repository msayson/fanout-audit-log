import { RemovalPolicy } from 'aws-cdk-lib/core';

/** Shared base props for all audit-log stacks. */
export interface AuditLogBaseProps {
  readonly stage: string;
  readonly appQualifier: string;
  readonly removalPolicy: RemovalPolicy;
  /** true = CMK ($1/month/key); false = SSE-S3 (free, for dev cost savings) */
  readonly useCmk: boolean;
}
