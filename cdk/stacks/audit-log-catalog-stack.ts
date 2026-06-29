import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { AuditLogBaseProps } from '../interfaces/stack-props';

export interface AuditLogCatalogStackProps extends AuditLogBaseProps {}

/** Glue database and audit-event table with partition projection. Not yet implemented. */
export class AuditLogCatalogStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogCatalogStackProps) {
    super(scope, id, props);
  }
}
