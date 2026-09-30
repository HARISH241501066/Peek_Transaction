class Rule:
    """Base class for all fraud rules.

    To add a new rule: create a file in rules/ with a subclass of Rule.
    The engine discovers it automatically - no engine changes needed.
    """

    name = "base"

    def evaluate(self, txn, history):
        """Return (score, reason).

        txn     - the incoming transaction
        history - that user's PREVIOUS transactions, oldest to newest
        Return (0, None) when the rule does not fire.
        """
        raise NotImplementedError
