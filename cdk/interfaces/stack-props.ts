import { RemovalPolicy } from 'aws-cdk-lib/core';

/** Shared base props for all audit-log stacks. */
export interface AuditLogBaseProps {
  readonly stage: string;
  readonly appQualifier: string;
  readonly removalPolicy: RemovalPolicy;
}
