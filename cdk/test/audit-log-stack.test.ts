import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { RemovalPolicy } from 'aws-cdk-lib/core';
import { AuditLogStack } from '../stacks/audit-log-stack.js';

const app = new cdk.App();
const stack = new AuditLogStack(app, 'TestAuditLogStack', {
  stage: 'dev',
  retentionYears: 1,
  removalPolicy: RemovalPolicy.DESTROY,
  replicaBucketArn: 'arn:aws:s3:::audit-log-replica-dev-123456789012-us-west-2',
  replicaKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/replica-key-id',
  env: { account: '123456789012', region: 'us-east-1' },
});
const template = Template.fromStack(stack);

test('audit bucket configuration', () => {
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
});

test('KMS key has rotation enabled', () => {
  template.hasResourceProperties('AWS::KMS::Key', { EnableKeyRotation: true });
});

test('replication role is created', () => {
  template.resourceCountIs('AWS::IAM::Role', 1);
});
