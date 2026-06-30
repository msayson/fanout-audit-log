package com.marksayson.auditlogworker.infra

import aws.sdk.kotlin.services.firehose.FirehoseClient as AwsFirehoseClient
import aws.sdk.kotlin.services.firehose.model.FirehoseException
import aws.sdk.kotlin.services.firehose.model.PutRecordRequest
import aws.sdk.kotlin.services.firehose.model.Record
import aws.sdk.kotlin.services.firehose.model.ServiceUnavailableException
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.KotlinModule
import com.marksayson.auditlogworker.model.AuditEvent
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlin.math.min
import kotlin.random.Random
import org.apache.logging.log4j.LogManager

private const val BASE_DELAY_MS = 100L
private const val CAP_DELAY_MS = 30_000L
private const val MAX_ATTEMPTS = 5

class FirehoseWriter internal constructor(
    internal val streamName: String,
    private val put: suspend (ByteArray) -> Unit,
    private val delayFn: suspend (Long) -> Unit = ::delay,
    private val rng: Random = Random.Default,
) {
    companion object {
        private val log = LogManager.getLogger(FirehoseWriter::class.java)
        private val mapper = ObjectMapper()
            .registerModule(KotlinModule.Builder().build())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)

        operator fun invoke(streamName: String): FirehoseWriter {
            val client = runBlocking { AwsFirehoseClient.fromEnvironment() }
            return FirehoseWriter(
                streamName = streamName,
                put = { bytes ->
                    client.putRecord(
                        PutRecordRequest {
                            deliveryStreamName = streamName
                            record = Record { data = bytes }
                        }
                    )
                },
            )
        }
    }

    suspend fun putAuditEvent(event: AuditEvent) {
        val data = mapper.writeValueAsBytes(event)
        var lastRetryable: Exception? = null
        for (attempt in 0 until MAX_ATTEMPTS) {
            try {
                put(data)
                return
            } catch (e: ServiceUnavailableException) {
                lastRetryable = e
            } catch (e: FirehoseException) {
                if (e.sdkErrorMetadata.errorCode != "ProvisionedThroughputExceededException") throw e
                lastRetryable = e
            }
            val delayMs = jitter(attempt)
            log.warn("Firehose throttled: stream=$streamName attempt=${attempt + 1}/$MAX_ATTEMPTS retryingInMs=$delayMs")
            if (attempt < MAX_ATTEMPTS - 1) delayFn(delayMs)
        }
        throw lastRetryable!!
    }

    private fun jitter(attempt: Int): Long {
        val ceiling = min(CAP_DELAY_MS, BASE_DELAY_MS * (1L shl attempt))
        return rng.nextLong(0, ceiling + 1)
    }
}
