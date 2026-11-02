from enum import Enum

class Intensity(str, Enum):
    LOW="LOW"
    MEDIUM="MEDIUM"
    HIGH="HIGH"

class ResponseClass(str, Enum):
    RECOMMENDED="RECOMMENDED"
    ACCEPTABLE="ACCEPTABLE"
    RISKY="RISKY"
    CONTRAINDICATED="CONTRAINDICATED"
