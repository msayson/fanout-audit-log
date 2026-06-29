import { RemovalPolicy } from 'aws-cdk-lib/core';

export enum Region {
  US_EAST_2 = 'us-east-2',
  US_WEST_2 = 'us-west-2',
}

export interface StageConfig {
  readonly retentionYears: number;
  readonly removalPolicy: RemovalPolicy;
  readonly primaryRegion: string;
  readonly replicaRegion: string;
}

export const STAGE_CONFIGS: Record<string, StageConfig> = {
  dev: {
    retentionYears: 1,
    removalPolicy: RemovalPolicy.DESTROY,
    primaryRegion: Region.US_EAST_2,
    replicaRegion: Region.US_WEST_2,
  },
  prod: {
    retentionYears: 3,
    removalPolicy: RemovalPolicy.RETAIN,
    primaryRegion: Region.US_EAST_2,
    replicaRegion: Region.US_WEST_2,
  },
};
