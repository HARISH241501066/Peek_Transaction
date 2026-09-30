import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()  # so seed.py and tests also see backend/.env

# DATABASE_URL in .env selects PostgreSQL, e.g.
#   postgresql://user:password@localhost:5432/fraud
# If it is not set, fall back to a local SQLite file: backend/fraud.db
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if DATABASE_URL:
    # Normalise to the psycopg (v3) driver that requirements.txt installs
    for prefix in ("postgres://", "postgresql://"):
        if DATABASE_URL.startswith(prefix):
            DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len(prefix):]
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    DB_PATH = Path(__file__).parent / "fraud.db"
    # check_same_thread=False is needed because FastAPI uses multiple threads
    engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    """FastAPI dependency: one DB session per request, always closed after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
