"""Demo data generator. Posts transactions to the running API with explicit timestamps.

Usage:
    python seed.py --reset                        # drop + recreate tables, then run every scenario
    python seed.py --scenario location            # run just one scenario
    python seed.py --scenario ato --suffix 2      # same scenario, fresh user (divya2)
"""
import argparse
from datetime import date, datetime, time, timedelta

import requests

API = "http://localhost:8000"
DAY = date.today()
SUFFIX = ""  # appended to user ids so a scenario can be replayed with a fresh user

CHENNAI = ("Chennai", 13.08, 80.27)
LONDON = ("London", 51.50, -0.12)
MUMBAI = ("Mumbai", 19.07, 72.87)


def at(hour, minute=0, second=0, days_ago=0):
    """Timestamp on today's date (or days_ago earlier) at the given time, as an ISO string."""
    start = datetime.combine(DAY - timedelta(days=days_ago), time(hour, minute))
    return (start + timedelta(seconds=second)).isoformat()  # seconds may exceed 59


def post(user, amount, place, timestamp, device):
    city, lat, lon = place
    res = requests.post(
        f"{API}/transactions",
        json={
            "user_id": user + SUFFIX,
            "amount": amount,
            "city": city,
            "lat": lat,
            "lon": lon,
            "timestamp": timestamp,
            "device_id": device,
        },
        timeout=10,
    )
    res.raise_for_status()
    return res.json()


def show(result):
    device = result.get("device_id") or "-"
    print(f"  #{result['id']:<3} Rs.{result['amount']:>10,.2f}  {result['city']:<8} {device:<20} "
          f"score={result['risk_score']:<3} {result['reasons']}")


# Each scenario posts its transactions and returns the LAST result
# (that's the one the scenario is designed to score).

def normal():
    """5 ordinary purchases across a day -> not flagged."""
    result = None
    for hour, amount in [(9, 500), (11, 1200), (13, 800), (16, 2000), (20, 1500)]:
        result = post("ravi", amount, CHENNAI, at(hour), "ravi-phone")
        show(result)
    return result


def velocity():
    """8 transactions within 3 minutes -> velocity rule (40)."""
    result = None
    for i in range(8):
        result = post("arun", 300, CHENNAI, at(12, 0, i * 25), "arun-phone")  # 25s apart = 3 min total
        show(result)
    return result


def amount():
    """4 purchases around Rs.1000, then Rs.150000 -> unusual amount (50)."""
    result = None
    for hour, amt in [(9, 950), (11, 1050), (13, 1000), (15, 1000), (17, 150000)]:
        result = post("meena", amt, CHENNAI, at(hour), "meena-phone")
        show(result)
    return result


def location():
    """Chennai at 10:00, London at 10:15 -> impossible travel (90), email sent."""
    show(post("priya", 2500, CHENNAI, at(10, 0), "priya-phone"))
    result = post("priya", 2500, LONDON, at(10, 15), "priya-phone")
    show(result)
    return result


def combined():
    """Normal history, then Rs.150000 from London 15 min after Chennai -> 140, email sent."""
    for hour, amt in [(8, 900), (9, 1100)]:
        show(post("karthik", amt, CHENNAI, at(hour), "karthik-phone"))
    show(post("karthik", 1000, CHENNAI, at(10, 0), "karthik-phone"))
    result = post("karthik", 150000, LONDON, at(10, 15), "karthik-phone")
    show(result)
    return result


def ato():
    """Account takeover: new device + new city + high amount.
    0 with the 3 built-in rules (the attack slips through), 90 once account_takeover is loaded."""
    # Divya's normal life: her iPhone, Chennai, Rs.800-1200 (average 1000), 10:00-18:00, over 2 days
    for days_ago, hour, amt in [(1, 10, 800), (1, 16, 1200), (0, 11, 900), (0, 14, 1100)]:
        show(post("divya", amt, CHENNAI, at(hour, days_ago=days_ago), "iphone-divya"))
    # The attacker: unknown Android phone in Mumbai, Rs.4500 (4.5x her average), 3 hours later.
    # 3 hours is plenty to travel ~1030 km, so impossible-location stays quiet, and
    # 4.5x is under the 5x unusual-amount limit, so that rule stays quiet too.
    result = post("divya", 4500, MUMBAI, at(17), "android-x9-unknown")
    show(result)
    return result


def newphone():
    """Genuine new phone: same city, normal amount, normal hour -> 0 even with account_takeover."""
    for days_ago, hour, amt in [(1, 10, 1000), (1, 14, 1050), (0, 11, 950), (0, 15, 1000)]:
        show(post("sanjay", amt, CHENNAI, at(hour, days_ago=days_ago), "pixel-old"))
    result = post("sanjay", 1000, CHENNAI, at(15, 30), "pixel-new")
    show(result)
    return result


# name -> (function, expected score of the last transaction)
SCENARIOS = {
    "normal": (normal, 0),
    "velocity": (velocity, 40),
    "amount": (amount, 50),
    "location": (location, 90),
    "combined": (combined, 140),
    "ato": (ato, None),  # depends on whether the account_takeover rule is loaded
    "newphone": (newphone, 0),
}


def reset_database():
    """Drop and recreate the tables (so schema changes like a new column take effect)."""
    from database import Base, engine
    import models  # noqa: F401  (registers the Transaction table on Base)

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("Database reset (tables dropped and recreated).")


def main():
    global SUFFIX
    parser = argparse.ArgumentParser(description="Seed the fraud engine with demo data.")
    parser.add_argument("--reset", action="store_true", help="drop and recreate the tables first")
    parser.add_argument("--scenario", choices=SCENARIOS, help="run only one scenario")
    parser.add_argument("--suffix", default="", help="append to user ids, e.g. 2 -> divya2")
    args = parser.parse_args()
    SUFFIX = args.suffix

    try:
        requests.get(f"{API}/health", timeout=5).raise_for_status()
    except requests.RequestException:
        raise SystemExit(f"API not reachable at {API}. Start it with: uvicorn main:app --reload")

    if args.reset:
        reset_database()

    active_rules = requests.get(f"{API}/rules", timeout=5).json()
    print(f"Active rules: {', '.join(active_rules)}")

    names = [args.scenario] if args.scenario else list(SCENARIOS)
    summary = []
    for name in names:
        run, expected = SCENARIOS[name]
        if name == "ato":
            expected = 90 if "account_takeover" in active_rules else 0
        print(f"\n[{name}] {run.__doc__}")
        result = run()
        summary.append((name, expected, result["risk_score"], result["risk_score"] == expected))

    print("\nSummary")
    for name, expected, got, ok in summary:
        print(f"  {'PASS' if ok else 'FAIL'}  {name:<9} expected {expected:<3} got {got}")


if __name__ == "__main__":
    main()
