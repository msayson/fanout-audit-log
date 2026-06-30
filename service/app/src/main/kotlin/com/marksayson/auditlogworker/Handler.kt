package com.marksayson.auditlogworker

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.KotlinModule
import com.marksayson.auditlogworker.infra.FirehoseWriter
import com.marksayson.auditlogworker.model.AuditEvent
import com.marksayson.auditlogworker.model.AuditEventValidator
import kotlinx.coroutines.runBlocking
import org.apache.logging.log4j.LogManager

class Handler : RequestHandler<Map<String, Any>, String> {

    private val log = LogManager.getLogger(Handler::class.java)

    private val writer: FirehoseWriter

    // Zero-arg constructor used by Lambda runtime via reflection
    constructor() : this(
        FirehoseWriter(
            System.getenv("FIREHOSE_STREAM_NAME")
                ?: error("FIREHOSE_STREAM_NAME env var not set")
        )
    )

    // Inject a writer for unit tests
    internal constructor(writer: FirehoseWriter) {
        this.writer = writer
    }

    companion object {
        private val mapper = ObjectMapper()
            .registerModule(KotlinModule.Builder().build())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    }

    override fun handleRequest(event: Map<String, Any>?, context: Context?): String {
        if (event == null) return "INVALID: event must not be null"
        val auditEvent = try {
            mapper.convertValue(event, AuditEvent::class.java)
        } catch (e: Exception) {
            log.warn("Deserialization failed: ${e.message}")
            return "INVALID: ${e.message}"
        }
        try {
            AuditEventValidator.validate(auditEvent)
        } catch (e: IllegalArgumentException) {
            log.warn("Validation failed: ${e.message}")
            return "INVALID: ${e.message}"
        }
        log.info("Putting event to Firehose: stream=${writer.streamName} status=${auditEvent.status}")
        runBlocking { writer.putAuditEvent(auditEvent) }
        log.info("Firehose write succeeded: stream=${writer.streamName} status=${auditEvent.status}")
        return "OK"
    }
}
