# AI Voice Co-Pilot — Pay-in-3 Zero-Cost EMI (Agent-Assist)

## Problem
<!-- 2-3 lines from the brief, in your own words -->

## Solution
Agent-assist AI co-pilot: listens to (simulated) live transcript turns, detects
intent, retrieves grounded KYC/product facts via RAG, suggests a next-best-action
to the human sales agent, checks it against compliance rules and a self-review
pass, then updates CRM and drafts follow-ups on drop-off. The human agent always
makes the final call — the AI only suggests.

## Architecture

<!-- PASTE DIAGRAM HERE (ask Claude or Gemini to generate an SVG/mermaid diagram) -->

```
Transcript turn
   -> Intent Agent (Gemini Flash)
   -> Retrieval (Chroma RAG over kb.md)
   -> Next-Best-Action Agent (Gemini Pro)
   -> Guardrail (rule-based, no LLM)
   -> Self-Check Agent (Gemini Flash)
   -> Dashboard display
   -> CRM Agent (writes outputs/crm.csv)
   -> Follow-up Agent (Gemini Flash, only on drop-off)
```

## Agent breakdown

| Agent | Model / Tier | Why |
|---|---|---|
| Intent Agent | Gemini Flash | routine classification, cheap |
| Retrieval | Chroma (no LLM) | grounds all facts, prevents hallucination |
| Next-Best-Action | Gemini Pro | high-stakes reasoning step |
| Guardrail | rule-based Python | compliance-critical, must be deterministic |
| Self-Check | Gemini Flash | cheap second pass before output is shown |
| CRM Agent | rule-based Python | deterministic write, no LLM needed |
| Follow-up | Gemini Flash | low-stakes drafting task |

## Guardrails implemented
- **Consent**: first turn of every transcript is a recorded/AI-assisted disclosure line
- **Data Privacy**: `guardrail.mask_pii()` regex-masks phone/PAN/account numbers before CRM write
- **Human Oversight**: AI never outputs approval/final terms — guardrail blocks that language; agent decides
- **Accuracy**: Next-Best-Action agent is only given RAG-retrieved facts, instructed not to invent terms

## Cost tracking
See `outputs/cost_log.csv`, generated automatically by every agent call.
Rough cost-per-call: <!-- fill in after a test run -->

## Setup
```bash
pip install -r requirements.txt
cp .env.example .env   # add your GEMINI_API_KEY
python pipeline.py
```

## What we cut, and why
<!-- e.g. real phone integration (Twilio), TTS voice output, cloud deployment -->

## Roadmap
<!-- real call integration, larger transcript dataset, fine-tuned intent classifier -->
