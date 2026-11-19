"""Retired youth roster entry point; retained to fail safely for old automation."""
import sys

def main() -> int:
    print("Youth roster scraping and synchronization have been retired.", file=sys.stderr)
    return 2

if __name__ == "__main__":
    raise SystemExit(main())
