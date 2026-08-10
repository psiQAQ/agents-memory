#!/bin/sh
set -eu

service="${1:-}"

case "$service" in
  proxy)
    exec /usr/bin/tini -- node --import tsx/esm src/index.ts --config /runtime-config/proxy/config.yaml
    ;;
  core|hub)
    ;;
  *)
    echo "runtime service invalid" >&2
    exit 1
    ;;
esac

secret_file="${DEEPSEEK_SECRET_FILE:-/run/secrets/deepseek_key}"

if [ ! -f "$secret_file" ]; then
  echo "runtime secret unavailable" >&2
  exit 1
fi

model_key="$(cat "$secret_file")"
newline='
'
carriage_return="$(printf '\r')"
case "$model_key" in
  ""|*"$newline"*|*"$carriage_return"*)
    echo "runtime secret invalid" >&2
    exit 1
    ;;
esac

case "$service" in
  core)
    export TDAI_LLM_API_KEY="$model_key"
    exec /usr/bin/tini -- node --import tsx src/gateway/server.ts
    ;;
  hub)
    export LLM_API_KEY="$model_key"
    exec /usr/local/bin/start-combined.sh
    ;;
esac
