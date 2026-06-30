package com.marksayson.auditlogworker.model

object AuditEventValidator {
    fun validate(event: AuditEvent) {
        require(event.eventId.isNotBlank())    { "eventId must not be blank" }
        require(event.eventTime.isNotBlank())  { "eventTime must not be blank" }
        require(event.enqueuedAt.isNotBlank()) { "enqueuedAt must not be blank" }
        require(event.tenantId.isNotBlank())   { "tenantId must not be blank" }
        require(event.batchId.isNotBlank())    { "batchId must not be blank" }
        require(event.workType.isNotBlank())   { "workType must not be blank" }
        require(event.itemId.isNotBlank())     { "itemId must not be blank" }
        require(event.itemType.isNotBlank())   { "itemType must not be blank" }
        // status is a Kotlin enum — invalid values are rejected at construction/deserialization time
    }
}
