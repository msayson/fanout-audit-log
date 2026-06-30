package com.marksayson.auditlogworker

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler

class Handler : RequestHandler<Map<String, Any>, String> {
    override fun handleRequest(event: Map<String, Any>?, context: Context?): String = "OK"
}
