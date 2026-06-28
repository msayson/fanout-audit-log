# fanout-audit-log

Reference implementation of an append-only audit log for fan-out workflows on AWS.

Implements immutable event storage, rebuildable current-state projections, and analytical dashboards using Firehose, S3, Iceberg, Athena, QuickSight, and AWS CDK.
