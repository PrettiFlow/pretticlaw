#!/bin/sh
set -e

CONFIG_DIR="/root/.pretticlaw"
CONFIG_FILE="$CONFIG_DIR/config.json"

mkdir -p $CONFIG_DIR/workspace

PROVIDER=${PROVIDER:-openai}
MODEL=${MODEL:-gpt-4.1-mini}
API_KEY=${API_KEY}
API_BASE=${API_BASE:-null}
TEMPERATURE=${TEMPERATURE:-0.1}
MAX_TOKENS=${MAX_TOKENS:-8192}

if [ -z "$API_KEY" ]; then
  echo "ERROR: API_KEY is required"
  exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Generating config for provider: $PROVIDER"

  cat <<EOF > $CONFIG_FILE
{
  "agents": {
    "defaults": {
      "workspace": "/root/.pretticlaw/workspace",
      "model": "$MODEL",
      "provider": "$PROVIDER",
      "maxTokens": $MAX_TOKENS,
      "temperature": $TEMPERATURE
    }
  },
  "providers": {
    "$PROVIDER": {
      "apiKey": "$API_KEY",
      "apiBase": $API_BASE
    }
  },
  "gateway": {
    "host": "0.0.0.0",
    "port": 18790
  }
}
EOF
fi

echo "Starting Pretticlaw Gateway..."
pretticlaw gateway