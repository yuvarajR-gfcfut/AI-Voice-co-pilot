"""
Follow-up Agent — only triggered on drop-off outcome.
Drafts a short follow-up message so no lead is silently lost.
"""

from .gemini_client import call_gemini, log_decision

PROMPT_TEMPLATE = """A sales call about a 'pay-in-3, zero-cost EMI' product ended in
drop-off. Reason/last customer concern: "{reason}".

Draft a 2-line friendly follow-up message (SMS/WhatsApp style) addressing that
concern and inviting them to continue. Do not promise approval or specific terms.
"""


def draft_followup(transcript: list[dict], reason: str) -> str:
    prompt = PROMPT_TEMPLATE.format(reason=reason)
    result = call_gemini(prompt, model_tier="gemini-flash")
    log_decision("followup_agent", "gemini-flash", approx_tokens=len(prompt.split()) + 15)
    return result.strip()
