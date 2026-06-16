#!/usr/bin/env bash
set -e
ENV_FILE="${HOME}/.config/gt-mazeking/polygon-zkevm.env"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE — see DEPLOY.md" >&2; exit 1; }
set -a; source "$ENV_FILE"; set +a
: "${DEPLOYER_KEY:?DEPLOYER_KEY not set in $ENV_FILE}"
export POLYGON_ZKEVM_RPC_URL="${RPC_URL:-https://zkevm-rpc.com}"
export PRIVATE_KEY="$DEPLOYER_KEY"
exec "$@"
