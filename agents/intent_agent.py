"""
Intent Agent — cheap/fast model, classifies a customer utterance into a fixed intent.
This is your "cheap model for routine decisions" proof point for the scoring rubric.
"""

from .gemini_client import call_gemini, log_decision

INTENTS = [
    "pricing_question",
    "credit_score_concern",
    "missed_payment_concern",
    "ready_to_kyc",
    "general_objection",
    "other",
]

PROMPT_TEMPLATE = """Classify this customer statement into exactly one label from: {intents}.
Reply with ONLY the label, nothing else.

Customer statement: "{text}"
"""


def classify_intent(customer_text: str) -> str:
    prompt = PROMPT_TEMPLATE.format(intents=", ".join(INTENTS), text=customer_text)
    result = call_gemini(prompt, model_tier="gemini-flash")
    log_decision("intent_agent", "gemini-flash", approx_tokens=len(prompt.split()) + 5)
    label = result.strip().lower()
    return label if label in INTENTS else "other"
