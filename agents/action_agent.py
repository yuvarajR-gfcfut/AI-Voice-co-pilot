"""
Next-Best-Action Agent — expensive/high-stakes model (Gemini Pro).
Given the transcript so far, the detected intent, and the RAG-retrieved KB fact,
suggest ONE line/action for the human sales agent. Must never invent facts.
"""

from .gemini_client import call_gemini, log_decision

PROMPT_TEMPLATE = """You are assisting a human sales agent on a live call about a
'pay-in-3, zero-cost EMI' fintech product. You may ONLY use the fact below —
never invent numbers, terms, or promises not present in it.

Detected customer intent: {intent}
Source-of-truth fact: "{kb_fact}"
Conversation so far:
{transcript}

Suggest ONE short line the human agent could say next. Do not make any final
credit/loan decision — only suggest, the human decides.
"""


def suggest_action(transcript_so_far: list[dict], intent: str, kb_fact: str) -> str:
    transcript_text = "\n".join(f"{t['speaker']}: {t['text']}" for t in transcript_so_far)
    prompt = PROMPT_TEMPLATE.format(intent=intent, kb_fact=kb_fact, transcript=transcript_text)
    # Call central Gemini client and unpack response and fallback flag
    result, used_fallback = call_gemini(prompt, model_tier="gemini-pro")
    # Log the decision including the fallback flag for cost reporting
    log_decision("action_agent", "gemini-pro", approx_tokens=len(prompt.split()) + 30, used_fallback=used_fallback)
    return result.strip()
