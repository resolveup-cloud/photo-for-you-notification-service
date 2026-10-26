#!/usr/bin/env bash
set -euo pipefail
stage() { node ops/cloud-ci/stage.cjs "$@"; }
export PATH="/opt/resolveup-ci-node20/node_modules/node/bin:$PATH"
[[ $(node -p 'process.versions.node.split(".")[0]') == 20 ]]
stage dependencies bash ops/cloud-ci/dependencies.sh
stage prisma-client pnpm prisma:generate
stage lint pnpm lint
stage unit-tests pnpm test
stage production-build pnpm build
