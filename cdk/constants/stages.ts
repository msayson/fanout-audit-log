import { RemovalPolicy } from 'aws-cdk-lib/core';

export enum Region {
  PRIMARY = 'us-east-2',
  REPLICA = 'us-west-2',
}

export interface StageConfig {
  readonly appQualifier: string;
  readonly primaryRegion: string;
  readonly replicaRegion: string;
  readonly removalPolicy: RemovalPolicy;
  readonly useCmk: boolean;
  readonly objectLockDurationDays: number;
  readonly retentionDays: number;
  readonly firehoseBufferSizeMb: number;
  readonly firehoseBufferIntervalSec: number;
  readonly athenaBytesScannedCutoffGb: number;
}

export const STAGE_CONFIGS: Record<string, StageConfig> = {
  dev: {
    appQualifier: 'fanout-dev',
    primaryRegion: Region.PRIMARY,
    replicaRegion: Region.REPLICA,
    removalPolicy: RemovalPolicy.DESTROY,
    useCmk: false,
    objectLockDurationDays: 365,
    retentionDays: 366,
    firehoseBufferSizeMb: 128,
    firehoseBufferIntervalSec: 300,
    athenaBytesScannedCutoffGb: 100,
  },
  prod: {
    appQualifier: 'fanout-prod',
    primaryRegion: Region.PRIMARY,
    replicaRegion: Region.REPLICA,
    removalPolicy: RemovalPolicy.RETAIN,
    useCmk: true,
    objectLockDurationDays: 3 * 365,
    retentionDays: 3 * 365 + 1,
    firehoseBufferSizeMb: 128,
    firehoseBufferIntervalSec: 300,
    athenaBytesScannedCutoffGb: 1000,
  },
};
