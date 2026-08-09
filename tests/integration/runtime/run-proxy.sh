#!/bin/sh
set -eu

proxy_config="${MEMORY_PROXY_CONFIG:-config.yaml}"
case "$proxy_config" in
  config.yaml|config.redis.yaml) ;;
  *)
    echo "proxy config selection invalid" >&2
    exit 1
    ;;
esac

exec /usr/bin/tini -- node --import tsx/esm src/index.ts --config "/runtime-config/proxy/$proxy_config"
