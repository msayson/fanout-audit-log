import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { RemovalPolicy } from 'aws-cdk-lib/core';
import { AuditLogQueryStack, auditWorkgroupName, QUERY_RESULTS_RETENTION_DAYS } from '../stacks/audit-log-query-stack';
import { auditQueryOutputBucketName } from '../utils/bucket-names';

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
