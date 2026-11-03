"""Utilidades locales del corte; integrar con shared cuando se estabilice S1."""

import json
from rest_framework.exceptions import APIException


class ApiError(APIException):
    def __init__(self, code, message, status_code, **extra):
        self.status_code = status_code
        super().__init__({"code": code, "message": message, **extra})


def read_map(value):
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}
