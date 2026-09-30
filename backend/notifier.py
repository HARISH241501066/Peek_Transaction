import os

import boto3
from dotenv import load_dotenv

load_dotenv()  # reads backend/.env; real secrets never live in the code


def get_threshold():
    """Score above which an alert is sent (default 80)."""
    try:
        return int(os.getenv("RISK_THRESHOLD", "80"))
    except ValueError:
        return 80


def build_message(txn, score, reasons):
    lines = [
        f"Transaction ID: {txn.id}",
        f"User: {txn.user_id}",
        f"Amount: {txn.amount:.2f}",
        f"City: {txn.city}",
        f"Risk score: {score}",
        "Reasons:",
    ]
    lines += [f"  - {r}" for r in reasons]
    return "\n".join(lines)


def send_alert(txn, score, reasons):
    """Publish a high-risk alert to AWS SNS. Never raises, so it can't break a request."""
    message = build_message(txn, score, reasons)

    key = os.getenv("AWS_ACCESS_KEY_ID")
    secret = os.getenv("AWS_SECRET_ACCESS_KEY")
    region = os.getenv("AWS_REGION")
    topic = os.getenv("SNS_TOPIC_ARN")

    # Missing config: log the alert locally instead of calling AWS
    if not (key and secret and region and topic):
        print(f"[ALERT - SNS not configured] {message}")
        return

    try:
        sns = boto3.client(
            "sns",
            region_name=region,
            aws_access_key_id=key,
            aws_secret_access_key=secret,
        )
        sns.publish(TopicArn=topic, Subject="High-Risk Transaction Alert", Message=message)
        print(f"[ALERT SENT] transaction {txn.id}, score {score}")
    except Exception as e:  # network, auth, bad topic... never crash the request
        print(f"[ALERT FAILED] {e}")
