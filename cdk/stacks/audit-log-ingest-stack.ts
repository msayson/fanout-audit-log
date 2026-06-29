import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { AuditLogBaseProps } from '../interfaces/stack-props';

export interface AuditLogIngestStackProps extends AuditLogBaseProps {
  readonly firehoseBufferSizeMb: number;
  readonly firehoseBufferIntervalSec: number;
}

/** Firehose delivery stream and worker ingest helper. Not yet implemented. */
export class AuditLogIngestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogIngestStackProps) {
    super(scope, id, props);
  }
}
