from enum import Enum


class Intensity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ResponseClass(str, Enum):
    RECOMMENDED = "RECOMMENDED"
    ACCEPTABLE = "ACCEPTABLE"
    RISKY = "RISKY"
    CONTRAINDICATED = "CONTRAINDICATED"


from django.db import models


class RiskLevel(str, Enum):
    VARIABLE = "VARIABLE"
    MODERATE = "MODERATE"
    SEVERE = "SEVERE"
    EXTREME = "EXTREME"


class FormativeLevel(models.TextChoices):
    EN_INICIO = "EN_INICIO"
    EN_PROCESO = "EN_PROCESO"
    LOGRADO = "LOGRADO"
    DESTACADO = "DESTACADO"
