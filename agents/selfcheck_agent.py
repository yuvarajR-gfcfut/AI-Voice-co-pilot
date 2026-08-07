"""
Self-Check Agent — cheap/fast model, second pass reviewing the suggestion
against a short rubric before it's shown to the human agent.
"""

from .gemini_client import call_gemini, log_decision

PROMPT_TEMPLATE = """Review this suggested sales-agent line against 3 rules:
1. Does it ONLY reference this fact: "{kb_fact}" (no invented terms)?
2. Does it avoid making a final credit/loan decision?
3. Is the tone professional and non-pushy?

Suggestion: "{suggestion}"

Reply with exactly "PASS" or "FAIL: <one-line reason>".
"""


def review(suggestion: str, kb_fact: str) -> tuple[bool, str]:
    prompt = PROMPT_TEMPLATE.format(kb_fact=kb_fact, suggestion=suggestion)
    result = call_gemini(prompt, model_tier="gemini-flash")
    log_decision("selfcheck_agent", "gemini-flash", approx_tokens=len(prompt.split()) + 10)
    result = result.strip()
    if result.upper().startswith("PASS"):
        return True, ""
    return False, result
