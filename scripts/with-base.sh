#!/usr/bin/env bash
set -e
ENV_FILE="${HOME}/.config/gt-mazeking/base.env"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE — see DEPLOY.md" >&2; exit 1; }
set -a; source "$ENV_FILE"; set +a
: "${DEPLOYER_KEY:?DEPLOYER_KEY not set in $ENV_FILE}"
export BASE_RPC_URL="${RPC_URL:-https://mainnet.base.org}"
export PRIVATE_KEY="$DEPLOYER_KEY"
exec "$@"
