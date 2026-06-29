import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
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
  replicaKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/replica-key-id',
  env: { account: '123456789012', region: 'us-east-2' },
};

test('audit bucket configuration — useCmk: false (aws/s3 managed key)', () => {
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
        { BucketKeyEnabled: true, ServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms' } },
      ],
    },
    LifecycleConfiguration: {
      Rules: [{ Status: 'Enabled' }],
    },
    MetricsConfigurations: [{ Id: 'error-prefix', Prefix: 'errors/' }],
    ReplicationConfiguration: {
      Rules: [{ SourceSelectionCriteria: { SseKmsEncryptedObjects: { Status: 'Enabled' } },
                Destination: { EncryptionConfiguration: { ReplicaKmsKeyID: 'arn:aws:kms:us-west-2:123456789012:key/replica-key-id' } } }],
    },
  });

  // Check each IAM statement independently — Match.arrayWith is order-sensitive so grouping
  // multiple patterns together would require knowing CDK's internal statement ordering.
  const hasStatement = (stmt: object) =>
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike(stmt)]) },
    });

  // CRR-specific S3 actions
  hasStatement({ Action: 's3:GetReplicationConfiguration' });
  hasStatement({ Action: Match.arrayWith(['s3:ReplicateObject', 's3:ReplicateDelete', 's3:ReplicateTags']) });

  // AWS-managed aws/s3: no concrete key ARN at synth time; scoped by ViaService+ResourceAliases
  hasStatement({
    Action: Match.arrayWith(['kms:Decrypt']),
    Resource: '*',
    Condition: {
      StringEquals: { 'kms:ViaService': 's3.us-east-2.amazonaws.com' },
      'ForAnyValue:StringEquals': { 'kms:ResourceAliases': 'alias/aws/s3' },
    },
  });
  hasStatement({
    Action: Match.arrayWith(['kms:Encrypt']),
    Resource: '*',
    Condition: {
      StringEquals: { 'kms:ViaService': 's3.us-west-2.amazonaws.com' },
      'ForAnyValue:StringEquals': { 'kms:ResourceAliases': 'alias/aws/s3' },
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
    MetricsConfigurations: [{ Id: 'error-prefix', Prefix: 'errors/' }],
    ReplicationConfiguration: {
      Rules: [{ SourceSelectionCriteria: { SseKmsEncryptedObjects: { Status: 'Enabled' } } }],
    },
  });

  const hasStatement = (stmt: object) =>
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike(stmt)]) },
    });

  // CRR-specific S3 actions
  hasStatement({ Action: 's3:GetReplicationConfiguration' });
  hasStatement({ Action: Match.arrayWith(['s3:ReplicateObject', 's3:ReplicateDelete', 's3:ReplicateTags']) });

  // CMK: CDK grants produce concrete key ARNs; grantEncrypt covers Encrypt + GenerateDataKey* + ReEncrypt*
  hasStatement({ Action: Match.arrayWith(['kms:Decrypt']) });
  hasStatement({ Action: Match.arrayWith(['kms:Encrypt']),
                 Resource: 'arn:aws:kms:us-west-2:123456789012:key/replica-key-id' });

  template.hasResourceProperties('AWS::KMS::Key', { EnableKeyRotation: true });
  template.resourceCountIs('AWS::SSM::Parameter', 1);
  template.resourceCountIs('AWS::IAM::Role', 1);
});
