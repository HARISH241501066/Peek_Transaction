"""Unit tests for the rules and the engine. No network, database or AWS involved."""
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import engine
from rules.amount import UnusualAmountRule
from rules.location import ImpossibleLocationRule, haversine_km
from rules.velocity import VelocityRule

T0 = datetime(2026, 1, 1, 10, 0, 0)
CHENNAI = dict(city="Chennai", lat=13.08, lon=80.27)
LONDON = dict(city="London", lat=51.50, lon=-0.12)


def txn(minutes=0, amount=100.0, place=CHENNAI):
    """Build a fake transaction `minutes` after T0."""
    return SimpleNamespace(timestamp=T0 + timedelta(minutes=minutes), amount=amount, **place)


# ---------- velocity ----------

def test_velocity_fires_on_sixth_transaction_in_five_minutes():
    history = [txn(i * 0.5) for i in range(5)]  # 5 earlier, within 2 minutes
    score, reason = VelocityRule().evaluate(txn(2.5), history)
    assert score == 40
    assert reason == "Velocity: 6 transactions in 5 minutes"


def test_velocity_quiet_at_exactly_five():
    history = [txn(i * 0.5) for i in range(4)]  # 4 earlier + this one = 5, not "more than 5"
    assert VelocityRule().evaluate(txn(2), history) == (0, None)


def test_velocity_ignores_old_transactions():
    history = [txn(i) for i in range(5)]  # minutes 0-4
    assert VelocityRule().evaluate(txn(60), history) == (0, None)


# ---------- unusual amount ----------

def test_amount_fires_above_five_times_average():
    history = [txn(amount=1000) for _ in range(4)]
    score, reason = UnusualAmountRule().evaluate(txn(amount=150000), history)
    assert score == 50
    assert "150000.00" in reason and "1000.00" in reason


def test_amount_needs_three_prior_transactions():
    history = [txn(amount=1000), txn(amount=1000)]
    assert UnusualAmountRule().evaluate(txn(amount=150000), history) == (0, None)


def test_amount_quiet_at_exactly_five_times():
    history = [txn(amount=1000) for _ in range(3)]
    assert UnusualAmountRule().evaluate(txn(amount=5000), history) == (0, None)


# ---------- impossible location ----------

def test_haversine_chennai_london():
    km = haversine_km(13.08, 80.27, 51.50, -0.12)
    assert 8100 < km < 8300


def test_location_fires_chennai_to_london_in_15_minutes():
    score, reason = ImpossibleLocationRule().evaluate(txn(15, place=LONDON), [txn(0)])
    assert score == 90
    assert reason.startswith("Impossible travel:")
    assert "15 minutes" in reason and "Chennai" in reason and "London" in reason


def test_location_quiet_when_travel_is_plausible():
    # Chennai -> London over 12 hours is about 680 km/h, under the 900 km/h limit
    assert ImpossibleLocationRule().evaluate(txn(12 * 60, place=LONDON), [txn(0)]) == (0, None)


def test_location_no_history():
    assert ImpossibleLocationRule().evaluate(txn(0), []) == (0, None)


def test_location_zero_time_gap_does_not_crash():
    score, _ = ImpossibleLocationRule().evaluate(txn(0, place=LONDON), [txn(0)])
    assert score == 90  # same instant, 8000+ km apart
    assert ImpossibleLocationRule().evaluate(txn(0), [txn(0)]) == (0, None)  # same place


# ---------- engine ----------

def test_engine_loads_all_three_rules():
    names = sorted(rule.name for rule in engine.load_rules())
    assert names == ["impossible_location", "unusual_amount", "velocity"]


def test_engine_normal_transaction_scores_zero():
    assert engine.score(txn(60), [txn(0)]) == (0, [])


def test_engine_sums_scores_and_collects_reasons():
    history = [txn(-90, amount=1000), txn(-60, amount=1000), txn(-30, amount=1000), txn(0, amount=1000)]
    total, reasons = engine.score(txn(15, amount=150000, place=LONDON), history)
    assert total == 140  # 90 (location) + 50 (amount)
    assert len(reasons) == 2


def test_engine_picks_up_new_rule_file_without_changes():
    """R3: dropping a file into rules/ adds a rule; engine.py is not touched."""
    path = Path(__file__).parent / "rules" / "_tmp_test_rule.py"
    path.write_text(
        "from .base import Rule\n"
        "class TmpRule(Rule):\n"
        "    name = 'tmp'\n"
        "    def evaluate(self, txn, history):\n"
        "        return 7, 'tmp reason'\n"
    )
    try:
        assert "tmp" in [r.name for r in engine.load_rules()]
        assert engine.score(txn(0), []) == (7, ["tmp reason"])
    finally:
        path.unlink()
    assert "tmp" not in [r.name for r in engine.load_rules()]


# ---------- account takeover (demo_rules/) ----------

from demo_rules.account_takeover import AccountTakeoverRule  # noqa: E402


def dev(device, minutes=0, amount=1000.0, place=CHENNAI, hour=None):
    """Transaction with a device_id. `hour` sets the time of day (on the same date as T0)."""
    t = txn(minutes, amount, place)
    t.device_id = device
    if hour is not None:
        t.timestamp = T0.replace(hour=hour, minute=0)
    return t


def phone_history():
    """4 normal transactions on 'old-phone': Chennai, Rs.1000, between 10:00 and 15:00."""
    return [dev("old-phone", hour=h) for h in (10, 11, 13, 15)]


def test_ato_skips_without_device_id():
    assert AccountTakeoverRule().evaluate(txn(0), phone_history()) == (0, None)


def test_ato_skips_with_too_little_device_history():
    history = phone_history()[:2]
    assert AccountTakeoverRule().evaluate(dev("new", amount=9000, place=LONDON, hour=12), history) == (0, None)


def test_ato_known_device_is_fine():
    assert AccountTakeoverRule().evaluate(dev("old-phone", amount=9000, place=LONDON, hour=12), phone_history()) == (0, None)


def test_ato_new_device_alone_is_fine():
    # someone bought a new phone: same city, normal amount, normal hour
    assert AccountTakeoverRule().evaluate(dev("new-phone", hour=12), phone_history()) == (0, None)


def test_ato_new_device_plus_one_anomaly_is_60():
    score, reason = AccountTakeoverRule().evaluate(dev("new-phone", place=LONDON, hour=12), phone_history())
    assert score == 60
    assert "new city (London)" in reason and "new-phone" in reason


def test_ato_new_device_plus_two_anomalies_is_90():
    score, reason = AccountTakeoverRule().evaluate(
        dev("new-phone", amount=4500, place=LONDON, hour=12), phone_history()
    )
    assert score == 90
    assert "new city" in reason and "high amount" in reason


def test_ato_unusual_hour_counts_as_anomaly():
    score, reason = AccountTakeoverRule().evaluate(dev("new-phone", hour=3), phone_history())
    assert score == 60 and "unusual hour (03:00)" in reason


def test_ato_high_amount_needs_more_than_three_times_average():
    assert AccountTakeoverRule().evaluate(dev("new-phone", amount=3000, hour=12), phone_history()) == (0, None)
