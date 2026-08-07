"""
CRM Agent — writes call outcome to a local CSV (stands in for a real CRM).
Closes the loop the problem statement asks for: "CRM updates after the call."
"""

import csv
import time
from pathlib import Path

from .guardrail import mask_pii

CRM_PATH = Path(__file__).resolve().parent.parent / "outputs" / "crm.csv"


def _ensure_header():
    if not CRM_PATH.exists():
        with open(CRM_PATH, "w", newline="") as f:
            csv.writer(f).writerow(["timestamp", "customer_id", "outcome", "notes"])


def update_crm(customer_id: str, outcome: str, notes: str):
    _ensure_header()
    with open(CRM_PATH, "a", newline="") as f:
        csv.writer(f).writerow([time.time(), customer_id, outcome, mask_pii(notes)])
