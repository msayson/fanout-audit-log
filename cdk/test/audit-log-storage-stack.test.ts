import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { RemovalPolicy, Resource } from 'aws-cdk-lib/core';
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

  // AWS-managed key: no concrete ARN at synth time; permissions scoped by ViaService+ResourceAliases
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: { Statement: Match.arrayWith([
      Match.objectLike({ Action: Match.arrayWith(['kms:Decrypt']) }),
      Match.objectLike({
        Action: Match.arrayWith(['kms:Encrypt']),
        Resource: 'arn:aws:kms:us-west-2:123456789012:key/replica-key-id'
      }),
      Match.objectLike({ Action: 's3:GetReplicationConfiguration',
                         Resource: { "Fn::GetAtt": [ "AuditLogBucketCB3C9E27", "Arn" ] } }),
      Match.objectLike({ Action: Match.arrayWith(['s3:ReplicateObject', 's3:ReplicateDelete', 's3:ReplicateTags']) }),
    ])},
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

  // CMK: use CDK grants — verify specific ARNs rather than wildcards
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: { Statement: Match.arrayWith([
      Match.objectLike({ Action: Match.arrayWith(['kms:Decrypt']) }),
      Match.objectLike({ Action: Match.arrayWith(['kms:Encrypt']),
                         Resource: 'arn:aws:kms:us-west-2:123456789012:key/replica-key-id' }),
      Match.objectLike({ Action: 's3:GetReplicationConfiguration',
                         Resource: { "Fn::GetAtt": [ "AuditLogBucketCB3C9E27", "Arn" ] } }),
      Match.objectLike({ Action: Match.arrayWith(['s3:ReplicateObject', 's3:ReplicateDelete', 's3:ReplicateTags']) }),
    ])},
  });

  template.hasResourceProperties('AWS::KMS::Key', { EnableKeyRotation: true });
  template.resourceCountIs('AWS::SSM::Parameter', 1);
  template.resourceCountIs('AWS::IAM::Role', 1);
});
