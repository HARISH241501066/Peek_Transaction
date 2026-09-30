from rules.base import Rule

MIN_DEVICE_HISTORY = 3   # need a few past transactions with a device before we trust the pattern
AMOUNT_MULTIPLIER = 3    # "high amount" = more than 3x the user's average


class AccountTakeoverRule(Rule):
    """Flags a NEW device only when it ALSO behaves differently from the user's usual pattern.

    A new device on its own is normal (people buy new phones), so it scores 0.
    A new device plus one anomaly scores 60; plus two or more anomalies scores 90.
    """

    name = "account_takeover"

    def evaluate(self, txn, history):
        # Step 1: skip if we can't judge. Older transactions may have no device_id.
        device = getattr(txn, "device_id", None)
        known = [h for h in history if getattr(h, "device_id", None)]
        if not device or len(known) < MIN_DEVICE_HISTORY:
            return 0, None

        # Step 2: is this a new device? If the user has used it before, nothing to check.
        if device in {h.device_id for h in known}:
            return 0, None

        # Step 3: look for behaviour that differs from this user's history.
        anomalies = []

        # a) New city: the user has never transacted here before
        if txn.city not in {h.city for h in history}:
            anomalies.append(f"new city ({txn.city})")

        # b) High amount: more than 3x the user's average amount
        average = sum(h.amount for h in history) / len(history)
        if txn.amount > AMOUNT_MULTIPLIER * average:
            anomalies.append(f"high amount ({txn.amount:.2f} vs average {average:.2f})")

        # c) Odd hour: outside the range of hours the user usually transacts,
        #    with one hour of slack on each side
        hours = [h.timestamp.hour for h in history]
        if not (min(hours) - 1 <= txn.timestamp.hour <= max(hours) + 1):
            anomalies.append(f"unusual hour ({txn.timestamp.hour:02d}:00)")

        # Step 4: score. New device alone = a new phone = fine.
        if not anomalies:
            return 0, None
        score = 60 if len(anomalies) == 1 else 90
        return score, f"Possible account takeover: new device '{device}' with [{', '.join(anomalies)}]"
