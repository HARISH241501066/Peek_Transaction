from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text

from database import Base

# Allowed values for Transaction.status
STATUSES = ("pending", "reviewed", "cleared")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    amount = Column(Float, nullable=False)
    city = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    risk_score = Column(Integer, default=0, nullable=False)
    reasons = Column(Text, default="[]", nullable=False)  # JSON-encoded list of strings
    is_flagged = Column(Boolean, default=False, nullable=False)
    status = Column(String, default="pending", nullable=False)  # pending | reviewed | cleared
    device_id = Column(String, nullable=True, default=None)  # optional; used by the account-takeover rule
