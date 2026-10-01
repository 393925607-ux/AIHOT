#!/usr/bin/env bash
# Credentials are resolved into this process only. Never use bash -x here.
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
exec python3 scripts/insights-runtime.py "$@"
