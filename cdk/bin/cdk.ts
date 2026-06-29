#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { Tags } from 'aws-cdk-lib/core';
import { AuditLogStorageStack } from '../stacks/audit-log-storage-stack.js';
import { AuditLogCatalogStack } from '../stacks/audit-log-catalog-stack.js';
import { AuditLogIngestStack } from '../stacks/audit-log-ingest-stack.js';
import { AuditLogQueryStack } from '../stacks/audit-log-query-stack.js';
import { AuditLogObservabilityStack } from '../stacks/audit-log-observability-stack.js';
import { AuditLogReplicaStack } from '../stacks/audit-log-replica-stack.js';
import { STAGE_CONFIGS } from '../constants/stages.js';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') ?? 'dev';
const c = STAGE_CONFIGS[stage];
if (!c) throw new Error(`Unknown stage: ${stage}. Valid: ${Object.keys(STAGE_CONFIGS).join(', ')}`);

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: c.primaryRegion };
const base = { stage, appQualifier: c.appQualifier, removalPolicy: c.removalPolicy };

Tags.of(app).add('app', c.appQualifier);
Tags.of(app).add('env', stage);

// AuditLogReplicaStack must be deployed first; pass its KMS key ARN back via context.
// The replica bucket ARN is inferred from the deterministic bucket name.
const replicaKmsKeyArn = app.node.tryGetContext('replicaKmsKeyArn');
const replicaAccount = process.env.CDK_DEFAULT_ACCOUNT!;

new AuditLogReplicaStack(app, `${c.appQualifier}-Replica`, {
  ...base,
  env: { account: replicaAccount, region: c.replicaRegion },
});

if (!replicaKmsKeyArn) {
  console.log('Skipping Storage and downstream stacks: replicaKmsKeyArn context value required.');
  console.log('Deploy the Replica stack first, then re-run with: -c replicaKmsKeyArn=...');
} else {
  const storage = new AuditLogStorageStack(app, `${c.appQualifier}-Storage`, {
    ...base,
    objectLockDurationDays: c.objectLockDurationDays,
    retentionDays: c.retentionDays,
    replicaAccount,
    replicaRegion: c.replicaRegion,
    replicaKmsKeyArn,
    env,
  });

  const catalog = new AuditLogCatalogStack(app, `${c.appQualifier}-Catalog`, { ...base, env });
  catalog.addDependency(storage);

  const ingest = new AuditLogIngestStack(app, `${c.appQualifier}-Ingest`, {
    ...base,
    firehoseBufferSizeMb: c.firehoseBufferSizeMb,
    firehoseBufferIntervalSec: c.firehoseBufferIntervalSec,
    env,
  });
  ingest.addDependency(catalog);

  const query = new AuditLogQueryStack(app, `${c.appQualifier}-Query`, {
    ...base,
    athenaBytesScannedCutoffGb: c.athenaBytesScannedCutoffGb,
    env,
  });
  query.addDependency(catalog);

  const observability = new AuditLogObservabilityStack(app, `${c.appQualifier}-Observability`, { ...base, env });
  observability.addDependency(ingest);
  observability.addDependency(query);
}
