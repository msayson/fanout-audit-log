import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { AuditLogBaseProps } from '../interfaces/stack-props';

export interface AuditLogObservabilityStackProps extends AuditLogBaseProps {}

/** CloudWatch alarms and CloudTrail for CMK decrypts. Not yet implemented. */
export class AuditLogObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogObservabilityStackProps) {
    super(scope, id, props);
  }
}
