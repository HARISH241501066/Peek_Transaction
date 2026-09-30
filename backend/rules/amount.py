from .base import Rule

MIN_HISTORY = 3  # need a few past transactions before "unusual" means anything
MULTIPLIER = 5


class UnusualAmountRule(Rule):
    """Flags an amount more than 5x the user's average past amount."""

    name = "unusual_amount"

    def evaluate(self, txn, history):
        if len(history) < MIN_HISTORY:
            return 0, None
        average = sum(h.amount for h in history) / len(history)
        if txn.amount > MULTIPLIER * average:
            return 50, f"Unusual amount: {txn.amount:.2f} is over {MULTIPLIER}x the average of {average:.2f}"
        return 0, None
