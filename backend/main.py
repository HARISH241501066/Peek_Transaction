import json
from datetime import datetime
from typing import List, Literal, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

load_dotenv()  # loads backend/.env (AWS settings etc.) into environment variables

import engine as rule_engine  # noqa: E402  (the rule engine, not the DB engine)
from database import Base, engine, get_db  # noqa: E402
import notifier  # noqa: E402
from models import STATUSES, Transaction  # noqa: E402

app = FastAPI(title="Fraud Rule Engine")

# Allow the React dev server to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_tables():
    Base.metadata.create_all(bind=engine)


class TransactionIn(BaseModel):
    user_id: str
    amount: float
    city: str
    lat: float
    lon: float
    timestamp: Optional[datetime] = None  # ISO string; defaults to now (seed script overrides it)
    device_id: Optional[str] = None  # optional; the account-takeover rule uses it


class TransactionOut(BaseModel):
    id: int
    user_id: str
    amount: float
    city: str
    lat: float
    lon: float
    timestamp: datetime
    risk_score: int
    reasons: List[str]
    is_flagged: bool
    status: str
    device_id: Optional[str] = None

    @field_validator("reasons", mode="before")
    @classmethod
    def parse_reasons(cls, v):
        # reasons is stored as a JSON string in the DB; expose it as a list
        return json.loads(v) if isinstance(v, str) else v

    model_config = {"from_attributes": True}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/rules")
def list_rules():
    return [rule.name for rule in rule_engine.load_rules()]


@app.post("/transactions", response_model=TransactionOut)
def create_transaction(
    payload: TransactionIn, background: BackgroundTasks, db: Session = Depends(get_db)
):
    txn = Transaction(
        user_id=payload.user_id,
        amount=payload.amount,
        city=payload.city,
        lat=payload.lat,
        lon=payload.lon,
        timestamp=payload.timestamp or datetime.utcnow(),
        device_id=payload.device_id,
    )

    # Previous transactions for this user, oldest to newest
    history = (
        db.query(Transaction)
        .filter(Transaction.user_id == txn.user_id, Transaction.timestamp <= txn.timestamp)
        .order_by(Transaction.timestamp.asc(), Transaction.id.asc())
        .all()
    )

    # Run all rules and store the result on the row
    total, reasons = rule_engine.score(txn, history)
    txn.risk_score = total
    txn.reasons = json.dumps(reasons)
    txn.is_flagged = total > 0

    db.add(txn)
    db.commit()
    db.refresh(txn)

    # High risk: send the SNS alert after the response goes out (doesn't slow the request)
    if txn.risk_score > notifier.get_threshold():
        background.add_task(notifier.send_alert, txn, txn.risk_score, reasons)

    return txn


class StatusUpdate(BaseModel):
    status: Literal["reviewed", "cleared"]  # anything else -> 422


@app.get("/flagged", response_model=List[TransactionOut])
def get_flagged(status: Optional[Literal["pending", "reviewed", "cleared"]] = None,
                db: Session = Depends(get_db)):
    query = db.query(Transaction).filter(Transaction.is_flagged.is_(True))
    if status:
        query = query.filter(Transaction.status == status)
    return query.order_by(Transaction.timestamp.desc(), Transaction.id.desc()).all()


@app.patch("/transactions/{txn_id}", response_model=TransactionOut)
def update_status(txn_id: int, body: StatusUpdate, db: Session = Depends(get_db)):
    txn = db.get(Transaction, txn_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn.status = body.status
    db.commit()
    db.refresh(txn)
    return txn


@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    flagged = db.query(Transaction).filter(Transaction.is_flagged.is_(True))
    return {
        "total": db.query(Transaction).count(),
        "flagged": flagged.count(),
        # counts per status among flagged transactions (the review queue)
        "by_status": {s: flagged.filter(Transaction.status == s).count() for s in STATUSES},
    }
