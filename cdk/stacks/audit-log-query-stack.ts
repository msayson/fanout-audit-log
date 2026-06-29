import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { AuditLogBaseProps } from '../interfaces/stack-props';

export interface AuditLogQueryStackProps extends AuditLogBaseProps {
  readonly athenaBytesScannedCutoffGb: number;
}

/** Athena workgroup, results bucket, and named queries. Not yet implemented. */
export class AuditLogQueryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogQueryStackProps) {
    super(scope, id, props);
  }
}
