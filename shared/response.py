"""Response envelope identical to Spring's ``ApiResponse``.

Spring shape (``@JsonInclude(NON_NULL)``):
    {"success": bool, "message": <omitted if null>, "data": <omitted if null>}

So:
    ApiResponse.ok(data)            -> {"success": true, "data": ...}
    ApiResponse.ok(message, data)   -> {"success": true, "message": ..., "data": ...}
    ApiResponse.ok(message)         -> {"success": true, "message": ...}
    ApiResponse.error(message)      -> {"success": false, "message": ...}
"""
from rest_framework import status
from rest_framework.response import Response


def envelope(success, message=None, data=None):
    body = {"success": success}
    if message is not None:
        body["message"] = message
    if data is not None:
        body["data"] = data
    return body


def api_ok(data=None, message=None, http_status=status.HTTP_200_OK):
    return Response(envelope(True, message, data), status=http_status)


def api_created(data=None, message=None):
    return api_ok(data, message, status.HTTP_201_CREATED)


def api_error(message=None, http_status=status.HTTP_400_BAD_REQUEST):
    return Response(envelope(False, message, None), status=http_status)
