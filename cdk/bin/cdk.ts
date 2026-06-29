#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { AuditLogStack } from '../stacks/audit-log-stack.js';
import { ReplicaStack } from '../stacks/replica-stack.js';
import { STAGE_CONFIGS } from '../constants/stages.js';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') ?? 'dev';
const config = STAGE_CONFIGS[stage];
if (!config) throw new Error(`Unknown stage: ${stage}. Valid values: ${Object.keys(STAGE_CONFIGS).join(', ')}`);

// ReplicaStack must be deployed first (secondary region).
// Pass its outputs back as context: cdk deploy -c replicaBucketArn=... -c replicaKmsKeyArn=...
const replicaBucketArn = app.node.tryGetContext('replicaBucketArn');
const replicaKmsKeyArn = app.node.tryGetContext('replicaKmsKeyArn');

new ReplicaStack(app, `AuditLogReplica-${stage}`, {
  stage,
  removalPolicy: config.removalPolicy,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.replicaRegion },
});

if (replicaBucketArn && replicaKmsKeyArn) {
  new AuditLogStack(app, `AuditLog-${stage}`, {
    stage,
    retentionYears: config.retentionYears,
    removalPolicy: config.removalPolicy,
    replicaBucketArn,
    replicaKmsKeyArn,
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.primaryRegion },
  });
}
