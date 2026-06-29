export const auditBucketName = (account: string, stage: string) => `${account}-${stage}-audit-log`;
export const auditReplicaBucketName = (account: string, stage: string) => `${account}-${stage}-audit-log-replica`;
