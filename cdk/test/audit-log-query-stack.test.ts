import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { RemovalPolicy } from 'aws-cdk-lib/core';
import { AuditLogQueryStack, auditWorkgroupName, QUERY_RESULTS_RETENTION_DAYS } from '../stacks/audit-log-query-stack';
import { auditQueryOutputBucketName } from '../utils/bucket-names';
import { auditDatabaseName, AUDIT_TABLE_NAME } from '../stacks/audit-log-catalog-stack';

const account = '123456789012';
const stage = 'dev';

const baseProps = {
  stage,
  appQualifier: 'fanout-dev',
  removalPolicy: RemovalPolicy.DESTROY,
  athenaBytesScannedCutoffGb: 100,
  env: { account, region: 'us-east-2' },
};

function makeStack(useCmk: boolean) {
  const app = new cdk.App();
  const stack = new AuditLogQueryStack(app, 'TestQueryStack', { ...baseProps, useCmk });
  return { stack, template: Template.fromStack(stack) };
}

// ── bucket name helper ────────────────────────────────────────────────────────

test('auditQueryOutputBucketName returns correct name', () => {
  expect(auditQueryOutputBucketName(account, stage)).toBe('123456789012-dev-audit-log-query-output');
});

// ── stack exports ─────────────────────────────────────────────────────────────

test('stack exports workgroupName and outputBucketName', () => {
  const { stack } = makeStack(false);
  expect(stack.workgroupName).toBe(auditWorkgroupName('fanout-dev'));
  expect(stack.outputBucketName).toBe(auditQueryOutputBucketName(account, stage));
});

// ── query output bucket (useCmk: false) ──────────────────────────────────────

test('useCmk: false — bucket uses SSE-S3', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: '123456789012-dev-audit-log-query-output',
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
      ],
    },
  });
});

// ── query output bucket (useCmk: true) ───────────────────────────────────────

test('useCmk: true — bucket uses SSE-KMS', () => {
  const { template } = makeStack(true);
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: '123456789012-dev-audit-log-query-output',
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        { ServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms' } },
      ],
    },
  });
});

// ── lifecycle rule ────────────────────────────────────────────────────────────

test('bucket has lifecycle expiry', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::S3::Bucket', {
    LifecycleConfiguration: {
      Rules: [Match.objectLike({ ExpirationInDays: QUERY_RESULTS_RETENTION_DAYS, Status: 'Enabled' })],
    },
  });
});

// ── Athena workgroup ──────────────────────────────────────────────────────────

test('workgroup has correct name and is enabled', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::Athena::WorkGroup', {
    Name: 'fanout-dev-auditlog',
    State: 'ENABLED',
  });
});

test('workgroup enforces configuration', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::Athena::WorkGroup', {
    WorkGroupConfiguration: Match.objectLike({
      EnforceWorkGroupConfiguration: true,
    }),
  });
});

test('workgroup output location points to query output bucket', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::Athena::WorkGroup', {
    WorkGroupConfiguration: Match.objectLike({
      ResultConfiguration: Match.objectLike({
        OutputLocation: 's3://123456789012-dev-audit-log-query-output/',
      }),
    }),
  });
});

test('workgroup bytes scanned cutoff matches athenaBytesScannedCutoffGb in bytes', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::Athena::WorkGroup', {
    WorkGroupConfiguration: Match.objectLike({
      BytesScannedCutoffPerQuery: 100 * 1024 * 1024 * 1024,
    }),
  });
});

test('useCmk: false — workgroup result encryption is SSE_S3', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::Athena::WorkGroup', {
    WorkGroupConfiguration: Match.objectLike({
      ResultConfiguration: Match.objectLike({
        EncryptionConfiguration: { EncryptionOption: 'SSE_S3' },
      }),
    }),
  });
});

test('useCmk: true — workgroup result encryption is SSE_KMS', () => {
  const { template } = makeStack(true);
  template.hasResourceProperties('AWS::Athena::WorkGroup', {
    WorkGroupConfiguration: Match.objectLike({
      ResultConfiguration: Match.objectLike({
        EncryptionConfiguration: { EncryptionOption: 'SSE_KMS' },
      }),
    }),
  });
});

// ── named queries (P0-07) ─────────────────────────────────────────────────────

test('creates exactly five named queries', () => {
  const { template } = makeStack(false);
  template.resourceCountIs('AWS::Athena::NamedQuery', 5);
});

test('all named queries target the correct workgroup and database', () => {
  const { template } = makeStack(false);
  const queries = Object.values(template.findResources('AWS::Athena::NamedQuery'));
  const db = auditDatabaseName('fanout-dev');
  const wg = auditWorkgroupName('fanout-dev');
  for (const q of queries) {
    expect(q.Properties.Database).toBe(db);
    expect(q.Properties.WorkGroup).toBe(wg);
  }
});

test('all named queries reference the audit_events table', () => {
  const { template } = makeStack(false);
  const queries = Object.values(template.findResources('AWS::Athena::NamedQuery'));
  for (const q of queries) {
    expect(q.Properties.QueryString).toContain(AUDIT_TABLE_NAME);
  }
});

test('all named queries deduplicate on event_id via ROW_NUMBER', () => {
  const { template } = makeStack(false);
  const queries = Object.values(template.findResources('AWS::Athena::NamedQuery'));
  for (const q of queries) {
    expect(q.Properties.QueryString).toMatch(/ROW_NUMBER\(\).*PARTITION BY event_id/s);
  }
});

test('all named queries prune on dt with lookback window', () => {
  const { template } = makeStack(false);
  const queries = Object.values(template.findResources('AWS::Athena::NamedQuery'));
  for (const q of queries) {
    expect(q.Properties.QueryString).toContain('dt >=');
    expect(q.Properties.QueryString).toContain('dt <=');
  }
});

test('named queries filter on batch_id, item_id, tenant_id, and status respectively', () => {
  const { template } = makeStack(false);
  const strings: string[] = Object.values(template.findResources('AWS::Athena::NamedQuery'))
    .map((q: any) => q.Properties.QueryString as string);

  expect(strings.some(s => s.includes('batch_id'))).toBe(true);
  expect(strings.some(s => s.includes('item_id'))).toBe(true);
  expect(strings.some(s => s.includes('tenant_id'))).toBe(true);
  expect(strings.some(s => s.includes('status'))).toBe(true);
});
