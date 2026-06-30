package com.marksayson.auditlogworker.infra

import aws.sdk.kotlin.services.firehose.model.InvalidArgumentException
import aws.sdk.kotlin.services.firehose.model.ServiceUnavailableException
import aws.smithy.kotlin.runtime.ServiceErrorMetadata
import aws.smithy.kotlin.runtime.InternalApi
import com.fasterxml.jackson.databind.ObjectMapper
import com.marksayson.auditlogworker.model.AuditEvent
import com.marksayson.auditlogworker.model.Status
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
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

private fun captureJson(block: suspend FirehoseWriter.() -> Unit): Map<String, Any?> {
    val captured = mutableListOf<ByteArray>()
    val writer = FirehoseWriter("stream", put = { captured.add(it) })
    runBlocking { writer.block() }
    @Suppress("UNCHECKED_CAST")
    return ObjectMapper().readValue(captured.single(), Map::class.java) as Map<String, Any?>
}

// SDK does not expose a public API to set error codes on manually constructed exceptions;
// @InternalApi is the opt-in mechanism smithy-kotlin provides for exactly this kind of usage.
@OptIn(InternalApi::class)
private fun firehoseExceptionWithErrorCode(errorCode: String): InvalidArgumentException =
    InvalidArgumentException { message = errorCode }.also {
        it.sdkErrorMetadata.attributes[ServiceErrorMetadata.ErrorCode] = errorCode
    }

class FirehoseWriterTest {

    // ── happy path ────────────────────────────────────────────────────────────

    @Test
    fun `happy path — single call, JSON contains all required fields`() {
        val json = captureJson { putAuditEvent(validEvent()) }
        assertNotNull(json["event_id"])
        assertNotNull(json["event_time"])
        assertNotNull(json["enqueued_at"])
        assertNotNull(json["tenant_id"])
        assertNotNull(json["batch_id"])
        assertNotNull(json["work_type"])
        assertNotNull(json["item_id"])
        assertNotNull(json["item_type"])
        assertNotNull(json["status"])
    }

    // ── optional JSON fields ──────────────────────────────────────────────────

    @Test
    fun `null optional fields included in JSON as null`() {
        val json = captureJson { putAuditEvent(validEvent()) }
        assertTrue("skip_reason" in json)
        assertNull(json["skip_reason"])
        assertTrue("error_code" in json)
        assertNull(json["error_code"])
        assertTrue("error_reason" in json)
        assertNull(json["error_reason"])
    }

    @Test
    fun `non-null optional fields serialized with correct snake_case keys and values`() {
        val json = captureJson {
            putAuditEvent(
                validEvent().copy(skipReason = "duplicate", errorCode = "E001", errorReason = "already seen")
            )
        }
        assertEquals("duplicate", json["skip_reason"])
        assertEquals("E001", json["error_code"])
        assertEquals("already seen", json["error_reason"])
    }

    // ── retryable exceptions ──────────────────────────────────────────────────

    @Test
    fun `ServiceUnavailableException — throttle twice then succeed — 3 calls, 2 delays within backoff ceiling`() = runBlocking<Unit> {
        var callCount = 0
        val delays = mutableListOf<Long>()
        val throttle = ServiceUnavailableException { message = "throttled" }

        val writer = FirehoseWriter(
            streamName = "stream",
            put = { if (callCount++ < 2) throw throttle },
            delayFn = { ms -> delays.add(ms) },
        )

        writer.putAuditEvent(validEvent())

        assertEquals(3, callCount)
        assertEquals(2, delays.size)
        assertTrue(delays[0] in 0..100L)
        assertTrue(delays[1] in 0..200L)
    }

    @Test
    fun `FirehoseException with ProvisionedThroughputExceededException error code is retried`() = runBlocking<Unit> {
        var callCount = 0
        val delays = mutableListOf<Long>()
        val throttle = firehoseExceptionWithErrorCode("ProvisionedThroughputExceededException")

        val writer = FirehoseWriter(
            streamName = "stream",
            put = { if (callCount++ < 2) throw throttle },
            delayFn = { ms -> delays.add(ms) },
        )

        writer.putAuditEvent(validEvent())

        assertEquals(3, callCount)
        assertEquals(2, delays.size)
    }

    // ── terminal exceptions ───────────────────────────────────────────────────

    @Test
    fun `non-Firehose exception — single call, rethrown immediately`() = runBlocking<Unit> {
        var callCount = 0
        val terminal = RuntimeException("unexpected network error")

        val writer = FirehoseWriter(
            streamName = "stream",
            put = { callCount++; throw terminal },
        )

        assertThrows<RuntimeException> { writer.putAuditEvent(validEvent()) }
        assertEquals(1, callCount)
    }

    @Test
    fun `FirehoseException with non-throttle error code — single call, rethrown immediately`() = runBlocking<Unit> {
        var callCount = 0
        val terminal = InvalidArgumentException { message = "bad field" }

        val writer = FirehoseWriter(
            streamName = "stream",
            put = { callCount++; throw terminal },
        )

        assertThrows<InvalidArgumentException> { writer.putAuditEvent(validEvent()) }
        assertEquals(1, callCount)
    }

    // ── retry exhaustion ─────────────────────────────────────────────────────

    @Test
    fun `all 5 attempts throttled — 5 calls, 4 delays, exception rethrown`() = runBlocking<Unit> {
        var callCount = 0
        val delays = mutableListOf<Long>()
        val throttle = ServiceUnavailableException { message = "throttled" }

        val writer = FirehoseWriter(
            streamName = "stream",
            put = { callCount++; throw throttle },
            delayFn = { ms -> delays.add(ms) },
        )

        assertThrows<ServiceUnavailableException> { writer.putAuditEvent(validEvent()) }
        assertEquals(5, callCount)
        assertEquals(4, delays.size)
    }
}
