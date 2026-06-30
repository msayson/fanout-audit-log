package com.marksayson.auditlogworker

import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test

class HandlerTest {
    @Test
    fun `handleRequest returns non-null response`() {
        val result = Handler().handleRequest(emptyMap(), null)
        assertNotNull(result)
    }
}
