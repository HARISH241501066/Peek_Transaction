from math import asin, cos, radians, sin, sqrt

from .base import Rule

MAX_SPEED_KMH = 900  # roughly a commercial jet; faster than this is impossible


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance between two points on Earth, in km."""
    lat1, lon1, lat2, lon2 = map(radians, (lat1, lon1, lat2, lon2))
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


class ImpossibleLocationRule(Rule):
    """Flags travel between two transactions faster than 900 km/h."""

    name = "impossible_location"

    def evaluate(self, txn, history):
        if not history:
            return 0, None
        prev = history[-1]  # most recent previous transaction
        km = haversine_km(prev.lat, prev.lon, txn.lat, txn.lon)
        minutes = (txn.timestamp - prev.timestamp).total_seconds() / 60
        hours = minutes / 60

        if hours <= 0:
            # zero (or negative) time gap: any real distance is impossible,
            # but tiny distances are just GPS noise, so ignore under 1 km
            impossible = km > 1
        else:
            impossible = km / hours > MAX_SPEED_KMH

        if impossible:
            return 90, (
                f"Impossible travel: {km:.0f} km in {max(minutes, 0):.0f} minutes "
                f"from {prev.city} to {txn.city}"
            )
        return 0, None
