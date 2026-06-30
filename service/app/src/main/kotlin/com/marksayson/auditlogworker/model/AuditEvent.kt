package com.marksayson.auditlogworker.model

enum class Status {
    PENDING, SUCCEEDED, FAILED, SKIPPED;

    companion object {
        fun fromString(value: String): Status =
            entries.find { it.name == value }
                ?: throw IllegalArgumentException(
                    "Unknown status: '$value'; must be one of ${entries.map { it.name }}"
                )
    }
}

data class AuditEvent(
    val eventId: String,
    val eventTime: String,       // ISO 8601
    val enqueuedAt: String,      // ISO 8601
    val tenantId: String,
    val batchId: String,
    val workType: String,
    val itemId: String,
    val itemType: String,
    val status: Status,
    val skipReason: String? = null,
    val errorCode: String? = null,
    val errorReason: String? = null,
)
