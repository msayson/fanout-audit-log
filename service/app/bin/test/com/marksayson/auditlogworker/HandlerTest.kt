package com.marksayson.auditlogworker

import com.marksayson.auditlogworker.infra.FirehoseWriter
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HandlerTest {

    private fun noOpWriter() = FirehoseWriter("test-stream", put = { })

    private fun validEventMap(): MutableMap<String, Any> = mutableMapOf(
        "event_id"    to "evt-001",
        "event_time"  to "2026-06-30T00:00:00Z",
        "enqueued_at" to "2026-06-30T00:00:00Z",
        "tenant_id"   to "tenant-demo",
        "batch_id"    to "batch-001",
        "work_type"   to "fanout-job",
        "item_id"     to "item-001",
        "item_type"   to "order",
        "status"      to "SUCCEEDED",
    )

    @Test
    fun `valid event returns OK`() {
        assertEquals("OK", Handler(noOpWriter()).handleRequest(validEventMap(), null))
    }

    @Test
    fun `blank required field returns INVALID`() {
        val event = validEventMap().also { it["event_id"] = "" }
        assertTrue(Handler(noOpWriter()).handleRequest(event, null).startsWith("INVALID:"))
    }

    @Test
    fun `unknown status value returns INVALID`() {
        val event = validEventMap().also { it["status"] = "BOGUS" }
        assertTrue(Handler(noOpWriter()).handleRequest(event, null).startsWith("INVALID:"))
    }

    @Test
    fun `missing required field returns INVALID`() {
        val event = validEventMap().also { it.remove("tenant_id") }
        assertTrue(Handler(noOpWriter()).handleRequest(event, null).startsWith("INVALID:"))
    }

    @Test
    fun `null event returns INVALID`() {
        assertTrue(Handler(noOpWriter()).handleRequest(null, null).startsWith("INVALID:"))
    }
}
