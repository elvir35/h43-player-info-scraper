"""Validate the reviewed environment and origin before a workflow exposes ingestion secrets."""
import os
import re
from urllib.parse import urlsplit


def validate_environment(environment: str, origin: str, subdomain: str, production_approved: bool = False) -> None:
    if environment not in {"staging", "production"}:
        raise ValueError("Select staging or production")
    if environment == "production" and not production_approved:
        raise ValueError("Production synchronization has not been approved")
    if not re.fullmatch(r"[a-z0-9-]+", subdomain):
        raise ValueError("Reviewed Workers subdomain required")
    target = urlsplit(origin)
    expected = f"h43-youth-api-{environment}.{subdomain}.workers.dev"
    if target.scheme != "https" or target.netloc != expected or target.path not in {"", "/"} or target.query or target.fragment:
        raise ValueError("API origin does not match the reviewed environment")


def main() -> int:
    try:
        validate_environment(os.environ.get("SYNC_ENVIRONMENT", ""), os.environ.get("H43_API_URL", ""), os.environ.get("H43_WORKERS_SUBDOMAIN", ""), os.environ.get("YOUTH_ROSTER_PRODUCTION_APPROVED") == "true")
    except ValueError as error:
        print(f"Synchronization configuration rejected: {error}")
        return 1
    print("PASS reviewed synchronization environment/origin; no credentials used")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
