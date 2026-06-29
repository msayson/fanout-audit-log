import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { RemovalPolicy } from 'aws-cdk-lib/core';
import { AuditLogStorageStack } from '../stacks/audit-log-storage-stack';

const baseProps = {
  stage: 'dev',
  appQualifier: 'fanout-dev',
  removalPolicy: RemovalPolicy.DESTROY,
  objectLockDurationDays: 365,
  retentionDays: 366,
  replicaAccount: '123456789012',
  replicaRegion: 'us-west-2',
  env: { account: '123456789012', region: 'us-east-2' },
};

test('audit bucket configuration — useCmk: false (SSE-S3)', () => {
  const app = new cdk.App();
  const stack = new AuditLogStorageStack(app, 'TestStorageStack', {
    ...baseProps,
    useCmk: false,
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::S3::Bucket', {
    ObjectLockEnabled: true,
    VersioningConfiguration: { Status: 'Enabled' },
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
      ],
    },
    LifecycleConfiguration: {
      Rules: [{ Status: 'Enabled' }],
    },
  });

  template.resourceCountIs('AWS::KMS::Key', 0);
  template.resourceCountIs('AWS::SSM::Parameter', 0);
  template.resourceCountIs('AWS::IAM::Role', 1);
});

test('audit bucket configuration — useCmk: true (SSE-KMS CMK)', () => {
  const app = new cdk.App();
  const stack = new AuditLogStorageStack(app, 'TestStorageStack', {
    ...baseProps,
    useCmk: true,
    replicaKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/replica-key-id',
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::S3::Bucket', {
    ObjectLockEnabled: true,
    VersioningConfiguration: { Status: 'Enabled' },
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        { BucketKeyEnabled: true, ServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms' } },
      ],
    },
    LifecycleConfiguration: {
      Rules: [{ Status: 'Enabled' }],
    },
  });

  template.hasResourceProperties('AWS::KMS::Key', { EnableKeyRotation: true });
  template.resourceCountIs('AWS::SSM::Parameter', 1);
  template.resourceCountIs('AWS::IAM::Role', 1);
});
