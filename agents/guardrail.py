"""
Compliance/Guardrail Agent — plain Python, NO LLM call.
This is your explicit "classical solver instead of an LLM call" proof point.
Blocks suggestions that overstep into making a final credit/loan decision.
"""

import re

BLOCKED_PATTERNS = [
    r"\bapproved\b",
    r"\bguaranteed\b",
    r"\byour loan is\b",
    r"\byou will get\b",
    r"\byou('| a)re eligible for exactly\b",
]

SAFE_FALLBACK = (
    "I can share the general terms, but final approval and exact numbers "
    "need to be confirmed through the official KYC/credit process."
)


def check(suggestion: str) -> tuple[bool, str]:
    """Returns (passed, text_to_show). If blocked, text_to_show is the safe fallback."""
    lowered = suggestion.lower()
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, lowered):
            return False, SAFE_FALLBACK
    return True, suggestion


def mask_pii(text: str) -> str:
    """Basic regex PII masking for transcripts/CRM logs (phone, PAN-like, account numbers)."""
    text = re.sub(r"\b\d{10}\b", "[PHONE]", text)  # 10-digit phone
    text = re.sub(r"\b[A-Z]{5}\d{4}[A-Z]\b", "[PAN]", text)  # PAN format
    text = re.sub(r"\b\d{9,18}\b", "[ACCOUNT]", text)  # generic long account numbers
    return text
