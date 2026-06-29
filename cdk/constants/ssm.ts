/** SSM parameter names written by AuditLogStorageStack and read by downstream stacks. */
export const SSM = {
  auditKmsKeyArn: (account: string, stage: string) => `/${account}/${stage}/audit-log/kms-key-arn`,
};
