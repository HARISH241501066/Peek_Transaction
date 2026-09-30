from datetime import timedelta

from .base import Rule

WINDOW = timedelta(minutes=5)
MAX_TXNS = 5


class VelocityRule(Rule):
    """Flags a burst of transactions: more than 5 in the last 5 minutes."""

    name = "velocity"

    def evaluate(self, txn, history):
        window_start = txn.timestamp - WINDOW
        # count earlier transactions inside the window, plus this one
        recent = [h for h in history if window_start <= h.timestamp <= txn.timestamp]
        count = len(recent) + 1
        if count > MAX_TXNS:
            return 40, f"Velocity: {count} transactions in 5 minutes"
        return 0, None
