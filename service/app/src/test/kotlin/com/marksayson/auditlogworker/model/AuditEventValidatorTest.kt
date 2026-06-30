package com.marksayson.auditlogworker.model

import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

private fun validEvent() = AuditEvent(
    eventId    = "evt-001",
    eventTime  = "2026-06-30T00:00:00Z",
    enqueuedAt = "2026-06-30T00:00:00Z",
    tenantId   = "tenant-demo",
    batchId    = "batch-001",
    workType   = "fanout-job",
    itemId     = "item-001",
    itemType   = "order",
    status     = Status.SUCCEEDED,
)

class AuditEventValidatorTest {

    // ── valid events ──────────────────────────────────────────────────────────

    @Test
    fun `fully populated valid event passes`() =
        assertDoesNotThrow { AuditEventValidator.validate(validEvent()) }

    @Test
    fun `valid event with all optional fields null passes`() =
        assertDoesNotThrow {
            AuditEventValidator.validate(
                validEvent().copy(skipReason = null, errorCode = null, errorReason = null)
            )
        }

    @Test
    fun `valid event with all optional fields populated passes`() =
        assertDoesNotThrow {
            AuditEventValidator.validate(
                validEvent().copy(skipReason = "duplicate", errorCode = "E001", errorReason = "already seen")
            )
        }

    // ── blank required fields ─────────────────────────────────────────────────

    @Test fun `blank eventId throws`() {
        assertThrows<IllegalArgumentException> { AuditEventValidator.validate(validEvent().copy(eventId = "")) }
    }

    @Test fun `blank eventTime throws`() {
        assertThrows<IllegalArgumentException> { AuditEventValidator.validate(validEvent().copy(eventTime = "")) }
    }

    @Test fun `blank enqueuedAt throws`() {
        assertThrows<IllegalArgumentException> { AuditEventValidator.validate(validEvent().copy(enqueuedAt = "")) }
    }

    @Test fun `blank tenantId throws`() {
        assertThrows<IllegalArgumentException> { AuditEventValidator.validate(validEvent().copy(tenantId = "")) }
    }

    @Test fun `blank batchId throws`() {
        assertThrows<IllegalArgumentException> { AuditEventValidator.validate(validEvent().copy(batchId = "")) }
    }

    @Test fun `blank workType throws`() {
        assertThrows<IllegalArgumentException> { AuditEventValidator.validate(validEvent().copy(workType = "")) }
    }

    @Test fun `blank itemId throws`() {
        assertThrows<IllegalArgumentException> { AuditEventValidator.validate(validEvent().copy(itemId = "")) }
    }

    @Test fun `blank itemType throws`() {
        assertThrows<IllegalArgumentException> { AuditEventValidator.validate(validEvent().copy(itemType = "")) }
    }

    // ── status parsing ────────────────────────────────────────────────────────

    @Test fun `unknown status string throws`() {
        assertThrows<IllegalArgumentException> { Status.fromString("INVALID") }
    }

    @Test fun `all valid status values parse correctly`() =
        Status.entries.forEach { status -> assertDoesNotThrow { Status.fromString(status.name) } }
}
