"""
Central wrapper around the Gemini API.
Every agent calls through here so we get ONE place that logs cost/model-tier
per decision -> outputs/cost_log.csv (this is your Scalability/Cost scoring point).

TODO: fill in with real google-generativeai calls once you have GEMINI_API_KEY.
"""

import os
import csv
import time
from pathlib import Path

# Rough public per-1M-token pricing (INR) — update with real numbers before your pitch slide.
COST_PER_1M_TOKENS_INR = {
    "gemini-flash": 15,   # cheap/fast tier
    "gemini-pro": 150,    # expensive/high-stakes tier
    "rule-based": 0,      # no LLM call at all
}

COST_LOG_PATH = Path(__file__).resolve().parent.parent / "outputs" / "cost_log.csv"


def _ensure_log_header():
    if not COST_LOG_PATH.exists():
        with open(COST_LOG_PATH, "w", newline="") as f:
            csv.writer(f).writerow(
                ["timestamp", "agent", "model_tier", "approx_tokens", "approx_cost_inr"]
            )


def log_decision(agent_name: str, model_tier: str, approx_tokens: int):
    """Call this after every agent decision, including rule-based ones (approx_tokens=0)."""
    _ensure_log_header()
    cost = (approx_tokens / 1_000_000) * COST_PER_1M_TOKENS_INR.get(model_tier, 0)
    with open(COST_LOG_PATH, "a", newline="") as f:
        csv.writer(f).writerow([time.time(), agent_name, model_tier, approx_tokens, round(cost, 4)])


def call_gemini(prompt: str, model_tier: str = "gemini-flash") -> str:
    """
    TODO: replace the stub below with a real call, e.g.:

        import google.generativeai as genai
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model_name = "gemini-1.5-flash" if model_tier == "gemini-flash" else "gemini-1.5-pro"
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(prompt)
        text = response.text

    Keep the log_decision() call so cost tracking stays automatic.
    """
    raise NotImplementedError("Wire up google-generativeai here, then remove this line.")
