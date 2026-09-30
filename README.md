# Peek-Transaction

A transaction risk engine. Each transaction is scored by a set of independent rules, saved with its
flags, and shown to human reviewers in a React console. High-risk transactions trigger an AWS SNS email.

**Stack:** Python 3.11+, FastAPI, SQLAlchemy (PostgreSQL or SQLite), React (Vite), boto3 (SNS).

## How it works
- `backend/engine.py` discovers every `Rule` subclass in `backend/rules/` and sums their scores.
  It contains no rule-specific logic, so a new rule is just a new file.
- Built-in rules: **velocity**, **unusual amount**, **impossible location**.
- `demo_rules/account_takeover.py` is a fourth rule kept outside `rules/` so it can be added live.
- Score above `RISK_THRESHOLD` (default 80) sends an SNS email.

## Setup
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # then fill in .env yourself (never commit it)
```
`.env` holds the AWS values and, optionally, `DATABASE_URL` for PostgreSQL
(`postgresql://USER:PASSWORD@localhost:5432/DBNAME`). Leave it empty to use SQLite.

## Run
```powershell
# terminal 1 - API
cd backend
uvicorn main:app --reload

# terminal 2 - console
cd frontend
npm install
npm run dev                 # http://localhost:5173
```
Tests: `cd backend && pytest`

## Demo script
1. **Start** the API and the console (above). The console is empty.
2. **Seed** with `python seed.py --reset` (in `backend/`). Flagged transactions appear live:
   velocity (40), unusual amount (50), impossible travel (90) and combined (140). The last two send an email.
3. **Review**: click *Mark Reviewed* or *Clear* on a row; the status and the stat cards update.
4. **Account takeover, added live:**
   - Run the ato scenario: `python seed.py --scenario ato --suffix 1` -> score 0. The attack slips
     through the 3 rules.
   - Copy the rule in: `copy demo_rules\account_takeover.py rules\` -> the *Active Rules* panel shows 4.
   - Rerun ato with a fresh user: `python seed.py --scenario ato --suffix 2` -> +90, flagged, email sent.
   - Run newphone: `python seed.py --scenario newphone --suffix 2` -> not flagged (no false alarm).
   - Show that `engine.py` was never edited.
   - To repeat the demo, remove the rule: `del rules\account_takeover.py`.
