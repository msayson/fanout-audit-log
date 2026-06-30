import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { RemovalPolicy } from 'aws-cdk-lib/core';
import {
  AuditLogCatalogStack,
  auditDatabaseName,
  AUDIT_TABLE_NAME,
} from '../stacks/audit-log-catalog-stack';
import { AUDIT_EVENT_FIELDS } from '../schema/audit-event';

const baseProps = {
  stage: 'dev',
  appQualifier: 'fanout-dev',
  removalPolicy: RemovalPolicy.DESTROY,
  useCmk: false,
  env: { account: '123456789012', region: 'us-east-2' },
};

let template: Template;
let stack: AuditLogCatalogStack;

beforeAll(() => {
  const app = new cdk.App();
  stack = new AuditLogCatalogStack(app, 'TestCatalogStack', baseProps);
  template = Template.fromStack(stack);
});

test('stack exports databaseName and tableName', () => {
  expect(stack.databaseName).toBe(auditDatabaseName('fanout-dev'));
  expect(stack.tableName).toBe(AUDIT_TABLE_NAME);
});

test('creates Glue database with correct name', () => {
  template.hasResourceProperties('AWS::Glue::Database', {
    CatalogId: '123456789012',
    DatabaseInput: { Name: 'fanout-dev-auditlog' },
  });
});

test('creates Glue table with correct name and type', () => {
  template.hasResourceProperties('AWS::Glue::Table', {
    TableInput: Match.objectLike({
      Name: AUDIT_TABLE_NAME,
      TableType: 'EXTERNAL_TABLE',
    }),
  });
});

test('table columns match AUDIT_EVENT_FIELDS exactly', () => {
  template.hasResourceProperties('AWS::Glue::Table', {
    TableInput: {
      StorageDescriptor: Match.objectLike({
        Columns: AUDIT_EVENT_FIELDS.map(f => ({ Name: f.name, Type: f.glueType })),
      }),
    },
  });
});

test('dt is the sole partition key and is not in the column list', () => {
  template.hasResourceProperties('AWS::Glue::Table', {
    TableInput: Match.objectLike({
      PartitionKeys: [{ Name: 'dt', Type: 'string' }],
    }),
  });

  // dt must not appear in the data columns
  const resources = template.findResources('AWS::Glue::Table');
  const table = Object.values(resources)[0] as any;
  const columnNames: string[] = table.Properties.TableInput.StorageDescriptor.Columns
    .map((c: any) => c.Name);
  expect(columnNames).not.toContain('dt');
});

test('uses Parquet SerDe and formats', () => {
  template.hasResourceProperties('AWS::Glue::Table', {
    TableInput: {
      StorageDescriptor: Match.objectLike({
        InputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat',
        OutputFormat: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat',
        SerdeInfo: {
          SerializationLibrary: 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe',
        },
      }),
    },
  });
});

test('partition projection is enabled for dt with correct date format', () => {
  template.hasResourceProperties('AWS::Glue::Table', {
    TableInput: Match.objectLike({
      Parameters: Match.objectLike({
        'classification': 'parquet',
        'projection.enabled': 'true',
        'projection.dt.type': 'date',
        'projection.dt.format': 'yyyy/MM/dd',
        'projection.dt.interval': '1',
        'projection.dt.interval.unit': 'DAYS',
      }),
    }),
  });
});

test('storage location and template point to the audit bucket', () => {
  template.hasResourceProperties('AWS::Glue::Table', {
    TableInput: Match.objectLike({
      StorageDescriptor: Match.objectLike({
        Location: 's3://123456789012-dev-audit-log/',
      }),
      Parameters: Match.objectLike({
        'storage.location.template': 's3://123456789012-dev-audit-log/dt=${dt}/',
      }),
    }),
  });
});
