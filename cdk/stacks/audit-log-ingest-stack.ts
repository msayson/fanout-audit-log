import * as cdk from 'aws-cdk-lib/core';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { AuditLogBaseProps } from '../interfaces/stack-props';
import { auditBucketName } from '../utils/bucket-names';
import { auditDatabaseName, AUDIT_TABLE_NAME } from './audit-log-catalog-stack';
import { FIREHOSE_ERROR_PREFIX } from './audit-log-storage-stack';
import { SSM } from '../constants/ssm';

export interface AuditLogIngestStackProps extends AuditLogBaseProps {
  readonly firehoseBufferSizeMb: number;
  readonly firehoseBufferIntervalSec: number;
}

export const firehoseStreamName = (appQualifier: string) => `${appQualifier}-auditlog-delivery`;

/**
 * Firehose delivery stream (direct put) with JSON → Parquet format conversion,
 * writing to the audit S3 bucket partitioned by Firehose delivery date.
 *
 * Data path: PutRecord (JSON) → Firehose buffer → Parquet convert → S3
 * Success prefix: dt=!{timestamp:yyyy/MM/dd}/
 * Error prefix:   errors/!{firehose:error-output-type}/dt=!{timestamp:yyyy/MM/dd}/
 *
 * The delivery role's identity policy carries all permissions. No bucket-policy
 * or CMK key-policy entry references this role (avoids a Storage→Ingest cycle).
 */
export class AuditLogIngestStack extends cdk.Stack {
  public readonly deliveryStreamName: string;
  public readonly deliveryStreamArn: string;

  constructor(scope: Construct, id: string, props: cdk.StackProps & AuditLogIngestStackProps) {
    super(scope, id, props);

    this.deliveryStreamName = firehoseStreamName(props.appQualifier);

    const bucketName = auditBucketName(this.account, props.stage);
    const bucketArn = `arn:aws:s3:::${bucketName}`;
    const databaseName = auditDatabaseName(props.appQualifier);

    const cmkArn = props.useCmk
      ? ssm.StringParameter.valueForStringParameter(this, SSM.auditKmsKeyArn(this.account, props.stage))
      : undefined;

    const deliveryRole = new iam.Role(this, 'FirehoseDeliveryRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': this.account } },
      }),
    });

    // S3: write to data and error prefixes.
    // Capture policyDependable — the IAM policy is a separate CFN resource from the role,
    // so the Firehose stream must explicitly depend on it; otherwise CFN can create the
    // stream before the policy is attached and Firehose fails permission validation.
    const { policyDependable } = deliveryRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: [
        's3:AbortMultipartUpload',
        's3:GetBucketLocation',
        's3:GetObject',
        's3:ListBucket',
        's3:ListBucketMultipartUploads',
        's3:PutObject',
      ],
      resources: [bucketArn, `${bucketArn}/*`],
    }));

    // Glue: read table schema for Parquet format conversion
    deliveryRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['glue:GetTable', 'glue:GetTableVersion', 'glue:GetTableVersions'],
      resources: [
        `arn:aws:glue:${this.region}:${this.account}:catalog`,
        `arn:aws:glue:${this.region}:${this.account}:database/${databaseName}`,
        `arn:aws:glue:${this.region}:${this.account}:table/${databaseName}/${AUDIT_TABLE_NAME}`,
      ],
    }));

    // KMS: encrypt/decrypt when writing with a CMK
    if (props.useCmk && cmkArn) {
      deliveryRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: [cmkArn],
        conditions: {
          StringEquals: { 'kms:ViaService': `s3.${this.region}.amazonaws.com` },
        },
      }));
    }

    const cfnStream = new firehose.CfnDeliveryStream(this, 'FirehoseDeliveryStream', {
      deliveryStreamName: this.deliveryStreamName,
      deliveryStreamType: 'DirectPut',
      ...(props.useCmk && cmkArn
        ? {
            deliveryStreamEncryptionConfigurationInput: {
              keyType: 'CUSTOMER_MANAGED_CMK',
              keyArn: cmkArn,
            },
          }
        : {}),
      extendedS3DestinationConfiguration: {
        bucketArn,
        roleArn: deliveryRole.roleArn,
        prefix: 'dt=!{timestamp:yyyy/MM/dd}/',
        errorOutputPrefix: `${FIREHOSE_ERROR_PREFIX}!{firehose:error-output-type}/dt=!{timestamp:yyyy/MM/dd}/`,
        bufferingHints: {
          sizeInMBs: props.firehoseBufferSizeMb,
          intervalInSeconds: props.firehoseBufferIntervalSec,
        },
        // UNCOMPRESSED required at the S3 level when format conversion is enabled;
        // Parquet compression is configured in parquetSerDe below.
        compressionFormat: 'UNCOMPRESSED',
        dataFormatConversionConfiguration: {
          enabled: true,
          inputFormatConfiguration: {
            deserializer: { openXJsonSerDe: {} },
          },
          outputFormatConfiguration: {
            serializer: { parquetSerDe: { compression: 'SNAPPY' } },
          },
          schemaConfiguration: {
            catalogId: this.account,
            databaseName,
            tableName: AUDIT_TABLE_NAME,
            region: this.region,
            roleArn: deliveryRole.roleArn,
            versionId: 'LATEST',
          },
        },
      },
    });

    // Policy must be attached before Firehose validates permissions at stream creation
    cfnStream.node.addDependency(policyDependable!);

    this.deliveryStreamArn = cfnStream.attrArn;
  }
}
