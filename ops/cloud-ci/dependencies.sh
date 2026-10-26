#!/usr/bin/env bash
set -euo pipefail
store=/tmp/resolveup-console-pnpm-store
# Separate the bounded network phase from installation and lifecycle scripts.
# Retrying fetch preserves the lockfile and already verified content.
fetched=false
for attempt in 1 2; do
  echo "Fetch do lockfile: tentativa $attempt de 2"
  if timeout --signal=TERM --kill-after=10s 180s pnpm fetch --store-dir="$store" --network-concurrency=4 --fetch-retries=1 --fetch-timeout=30000; then
    fetched=true
    break
  fi
done
[[ $fetched == true ]] || { echo 'Não foi possível obter todas as dependências fixadas.' >&2; exit 1; }
timeout --signal=TERM --kill-after=10s 180s pnpm install --offline --frozen-lockfile --store-dir="$store"
