import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { RemovalPolicy } from 'aws-cdk-lib/core';
import { AuditLogIngestStack, firehoseStreamName } from '../stacks/audit-log-ingest-stack';
import { auditBucketName } from '../utils/bucket-names';
import { auditDatabaseName, AUDIT_TABLE_NAME } from '../stacks/audit-log-catalog-stack';
import { FIREHOSE_ERROR_PREFIX } from '../stacks/audit-log-storage-stack';

const account = '123456789012';
const stage = 'dev';
const region = 'us-east-2';

const baseProps = {
  stage,
  appQualifier: 'fanout-dev',
  removalPolicy: RemovalPolicy.DESTROY,
  firehoseBufferSizeMb: 128,
  firehoseBufferIntervalSec: 300,
  lambdaCodePath: path.join(__dirname, 'fixtures'),
  env: { account, region },
};

function makeStack(useCmk: boolean) {
  const app = new cdk.App();
  const stack = new AuditLogIngestStack(app, 'TestIngestStack', { ...baseProps, useCmk });
  return { stack, template: Template.fromStack(stack) };
}

// Order-independent IAM policy statement assertion
const hasStatement = (template: Template, stmt: object) =>
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: { Statement: Match.arrayWith([Match.objectLike(stmt)]) },
  });

// ── stream name helper ────────────────────────────────────────────────────────

test('firehoseStreamName returns correct name', () => {
  expect(firehoseStreamName('fanout-dev')).toBe('fanout-dev-auditlog-delivery');
});

// ── stack exports ─────────────────────────────────────────────────────────────

test('stack exports deliveryStreamName', () => {
  const { stack } = makeStack(false);
  expect(stack.deliveryStreamName).toBe(firehoseStreamName('fanout-dev'));
});

// ── delivery stream ───────────────────────────────────────────────────────────

test('useCmk: false — delivery stream has expected config', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
    DeliveryStreamEncryptionConfigurationInput: Match.absent(),
    DeliveryStreamName: 'fanout-dev-auditlog-delivery',
    DeliveryStreamType: 'DirectPut',
  });
});

test('useCmk: true — delivery stream has expected config with customer-managed key', () => {
  const { template } = makeStack(true);
  template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
    DeliveryStreamEncryptionConfigurationInput: Match.objectLike({
      KeyType: 'CUSTOMER_MANAGED_CMK',
    }),
    DeliveryStreamName: 'fanout-dev-auditlog-delivery',
    DeliveryStreamType: 'DirectPut',
  });
});

// ── S3 destination ────────────────────────────────────────────────────────────

test('Firehose stream S3 destination has expected config', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
    ExtendedS3DestinationConfiguration: Match.objectLike({
      BucketARN: `arn:aws:s3:::${auditBucketName(account, stage)}`,
      BufferingHints: { SizeInMBs: 128, IntervalInSeconds: 300 },
      DataFormatConversionConfiguration: Match.objectLike({
        Enabled: true,
        OutputFormatConfiguration: {
          Serializer: { ParquetSerDe: { Compression: 'SNAPPY' } },
        },
        SchemaConfiguration: Match.objectLike({
          CatalogId: account,
          DatabaseName: auditDatabaseName('fanout-dev'),
          TableName: AUDIT_TABLE_NAME,
          Region: region,
          VersionId: 'LATEST',
        }),
      }),
      ErrorOutputPrefix: `${FIREHOSE_ERROR_PREFIX}!{firehose:error-output-type}/dt=!{timestamp:yyyy/MM/dd}/`,
      Prefix: 'dt=!{timestamp:yyyy/MM/dd}/',
    }),
  });
});

// ── delivery role ─────────────────────────────────────────────────────────────

test('delivery role trusts firehose.amazonaws.com', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Principal: { Service: 'firehose.amazonaws.com' },
          Action: 'sts:AssumeRole',
        }),
      ]),
    },
  });
});

test('delivery role has S3 write permissions on audit bucket', () => {
  const { template } = makeStack(false);
  const bucketArn = `arn:aws:s3:::${auditBucketName(account, stage)}`;
  hasStatement(template, {
    Action: Match.arrayWith(['s3:AbortMultipartUpload', 's3:PutObject']),
    Resource: Match.arrayWith([bucketArn, `${bucketArn}/*`]),
  });
});

test('delivery role has Glue read permissions on audit table', () => {
  const { template } = makeStack(false);
  const db = auditDatabaseName('fanout-dev');
  hasStatement(template, {
    Action: Match.arrayWith(['glue:GetTable', 'glue:GetTableVersion', 'glue:GetTableVersions']),
    Resource: Match.arrayWith([
      `arn:aws:glue:${region}:${account}:table/${db}/${AUDIT_TABLE_NAME}`,
    ]),
  });
});

test('useCmk: false — delivery role has no KMS permissions', () => {
  const { template } = makeStack(false);
  const policies = Object.values(template.findResources('AWS::IAM::Policy'));
  const allActions = policies.flatMap((p: any) =>
    p.Properties.PolicyDocument.Statement.flatMap((s: any) =>
      Array.isArray(s.Action) ? s.Action : [s.Action],
    ),
  );
  expect(allActions.some((a: string) => a.startsWith('kms:'))).toBe(false);
});

test('useCmk: true — delivery role has kms:GenerateDataKey and kms:Decrypt', () => {
  const { template } = makeStack(true);
  hasStatement(template, {
    Action: Match.arrayWith(['kms:GenerateDataKey', 'kms:Decrypt']),
  });
});

// ── Lambda function ───────────────────────────────────────────────────────────

test('Lambda function has expected properties', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::Lambda::Function', {
    Architectures: ['arm64'],
    Environment: {
      Variables: Match.objectLike({
        FIREHOSE_STREAM_NAME: firehoseStreamName('fanout-dev'),
      }),
    },
    FunctionName: 'fanout-dev-Ingest-Worker',
    Handler: 'com.marksayson.auditlogworker.Handler::handleRequest',
    LoggingConfig: { LogFormat: 'JSON' },
    MemorySize: 1024,
    Runtime: 'java21',
    SnapStart: { ApplyOn: 'PublishedVersions' },
    Timeout: 60,
  });

  hasStatement(template, {
    Action: 'firehose:PutRecord',
    Effect: 'Allow',
  });
});

test('Lambda log group has deterministic name', () => {
  const { template } = makeStack(false);
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/lambda/fanout-dev-Ingest-Worker',
  });
});
