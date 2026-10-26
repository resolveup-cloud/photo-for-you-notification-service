#!/usr/bin/env bash
set -euo pipefail
stage() { node ops/cloud-ci/stage.cjs "$@"; }
export PATH="/opt/resolveup-ci-node20/node_modules/node/bin:$PATH"
[[ $(node -p 'process.versions.node.split(".")[0]') == 20 ]]
stage dependencies pnpm install --frozen-lockfile --network-concurrency=4
stage lint pnpm lint
stage unit-tests pnpm test
stage production-build pnpm build
