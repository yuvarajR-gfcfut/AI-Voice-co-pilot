"""
Orchestration pipeline. Runs every transcript in data/transcripts.json through
the full agent chain:

  customer turn -> intent -> retrieve -> suggest -> guardrail -> self-check
  -> log -> (end of call) -> CRM update -> follow-up if drop-off

YOU should own this file — it's the piece most likely to come up if you get
the interview. Everything below is a working skeleton; fill in the TODOs.
"""

import json
from pathlib import Path

from agents import retrieval, intent_agent, action_agent, guardrail, selfcheck_agent, crm_agent, followup_agent

TRANSCRIPTS_PATH = Path(__file__).resolve().parent / "data" / "transcripts.json"
DASHBOARD_FEED_PATH = Path(__file__).resolve().parent / "dashboard" / "live_feed.json"


def run_transcript(transcript_obj: dict):
    customer_id = transcript_obj["customer_id"]
    turns = transcript_obj["turns"]
    outcome = transcript_obj.get("label", "unknown")  # "won" / "drop-off" from your synthetic data

    seen_turns = []
    last_intent = None

    for turn in turns:
        seen_turns.append(turn)
        if turn["speaker"] != "customer":
            continue

        # 1. Intent
        last_intent = intent_agent.classify_intent(turn["text"])

        # 2. Retrieval (RAG)
        kb_fact = retrieval.retrieve(turn["text"])

        # 3. Next-best-action
        suggestion = action_agent.suggest_action(seen_turns, last_intent, kb_fact)

        # 4. Guardrail (rule-based)
        passed_guardrail, safe_suggestion = guardrail.check(suggestion)

        # 5. Self-check (only bother if guardrail already passed)
        if passed_guardrail:
            passed_selfcheck, reason = selfcheck_agent.review(safe_suggestion, kb_fact)
            final_suggestion = safe_suggestion if passed_selfcheck else guardrail.SAFE_FALLBACK
        else:
            final_suggestion = safe_suggestion

        # TODO: append {intent, kb_fact, suggestion} to a list and write to
        # DASHBOARD_FEED_PATH as JSON so dashboard/index.html can show it live.
        print(f"[{customer_id}] intent={last_intent} -> suggestion: {final_suggestion}")

    # 6. CRM update at end of call
    crm_agent.update_crm(customer_id, outcome, notes=f"last_intent={last_intent}")

    # 7. Follow-up if drop-off
    if outcome == "drop-off":
        followup_text = followup_agent.draft_followup(seen_turns, reason=last_intent or "unknown")
        print(f"[{customer_id}] follow-up drafted: {followup_text}")


def main():
    # TODO: call retrieval.build_index() once here before the loop.
    transcripts = json.loads(TRANSCRIPTS_PATH.read_text())
    for t in transcripts:
        run_transcript(t)


if __name__ == "__main__":
    main()
