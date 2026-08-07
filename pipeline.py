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
    # Dynamically adapt new transcripts JSON format to internal pipeline structure
    customer_id = transcript_obj["call_id"]
    turns_raw = transcript_obj["transcript"]
    outcome = "drop-off" if transcript_obj.get("outcome") == "drop_off" else "won"
    
    turns = []
    for t in turns_raw:
        turns.append({
            "speaker": "customer" if t["speaker"] == "prospect" else t["speaker"],
            "text": t["message"]
        })

    seen_turns = []
    last_intent = None
    transcript_feed = []  # List to collect turn dictionaries during this transcript iteration

    for turn in turns:
        seen_turns.append(turn)
        
        # Log agent turns in dashboard too
        if turn["speaker"] != "customer":
            transcript_feed.append({
                "customer_id": customer_id,
                "type": "turn",
                "speaker": turn["speaker"],
                "text": turn["text"],
                "intent": None,
                "kb_fact": None,
                "suggestion": None,
                "passed_guardrail": None,
                "passed_selfcheck": None,
                "selfcheck_reason": None,
                "final_suggestion": None
            })
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
        passed_selfcheck = False
        reason = ""
        if passed_guardrail:
            passed_selfcheck, reason = selfcheck_agent.review(safe_suggestion, kb_fact)
            final_suggestion = safe_suggestion if passed_selfcheck else guardrail.SAFE_FALLBACK
        else:
            final_suggestion = safe_suggestion

        # Log customer turn details to live feed list
        transcript_feed.append({
            "customer_id": customer_id,
            "type": "turn",
            "speaker": turn["speaker"],
            "text": turn["text"],
            "intent": last_intent,
            "kb_fact": kb_fact,
            "suggestion": suggestion,
            "passed_guardrail": passed_guardrail,
            "passed_selfcheck": passed_selfcheck if passed_guardrail else False,
            "selfcheck_reason": reason,
            "final_suggestion": final_suggestion
        })
        print(f"[{customer_id}] intent={last_intent} -> suggestion: {final_suggestion}")

    # 6. CRM update at end of call
    crm_agent.update_crm(customer_id, outcome, notes=f"last_intent={last_intent}")
    crm_data = {
        "customer_id": customer_id,
        "type": "crm",
        "outcome": outcome,
        "notes": f"last_intent={last_intent}"
    }

    # 7. Follow-up if drop-off
    followup_data = None
    if outcome == "drop-off":
        followup_text = followup_agent.draft_followup(seen_turns, reason=last_intent or "unknown")
        print(f"[{customer_id}] follow-up drafted: {followup_text}")
        followup_data = {
            "customer_id": customer_id,
            "type": "followup",
            "text": followup_text
        }

    # Overwrite live_feed.json with updated accumulated list on transcript completion
    DASHBOARD_FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    feed = []
    if DASHBOARD_FEED_PATH.exists():
        try:
            feed = json.loads(DASHBOARD_FEED_PATH.read_text())
        except Exception:
            feed = []
            
    feed.extend(transcript_feed)
    feed.append(crm_data)
    if followup_data:
        feed.append(followup_data)
        
    DASHBOARD_FEED_PATH.write_text(json.dumps(feed, indent=2))


def main():
    # Call retrieval.build_index() once here before the loop.
    retrieval.build_index()
    
    # Initialize live feed file as empty array
    DASHBOARD_FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    DASHBOARD_FEED_PATH.write_text("[]")
    
    transcripts = json.loads(TRANSCRIPTS_PATH.read_text())["calls"]
    for t in transcripts:
        run_transcript(t)


if __name__ == "__main__":
    main()
