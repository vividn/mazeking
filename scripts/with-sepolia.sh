#!/usr/bin/env bash
# Load Sepolia deploy secrets from a single out-of-tree env file and exec the
# given command. Single load-bearing point so individual recipes never have to
# know where the secrets live — they just consume PRIVATE_KEY / SEPOLIA_RPC_URL
# from the environment.
#
# Usage:
#   ./scripts/with-sepolia.sh just upgrade-renderer-sepolia
#   ./scripts/with-sepolia.sh just deploy-sepolia
#
# See DEPLOY.md for the secrets-file format and required keys.

set -e
ENV_FILE="${HOME}/.config/gt-mazeking/sepolia.env"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE — see DEPLOY.md" >&2; exit 1; }
set -a; source "$ENV_FILE"; set +a
: "${SEPOLIA_DEPLOYER_KEY:?SEPOLIA_DEPLOYER_KEY not set in $ENV_FILE}"
: "${ALCHEMY_API_KEY:?ALCHEMY_API_KEY not set in $ENV_FILE}"
export SEPOLIA_RPC_URL="${SEPOLIA_RPC_URL:-https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}}"
export PRIVATE_KEY="$SEPOLIA_DEPLOYER_KEY"
exec "$@"
