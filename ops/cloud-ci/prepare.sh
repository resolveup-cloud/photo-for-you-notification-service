#!/usr/bin/env bash
set -euo pipefail
[[ $(uname -s) == Linux && $(id -u) == 0 && -f /.dockerenv ]]
[[ ! -S /var/run/docker.sock && ! -S /run/docker.sock && -z ${DOCKER_HOST:-} && -z ${SSH_AUTH_SOCK:-} ]]
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends git ca-certificates
npm install --prefix /opt/resolveup-ci-node20 --no-package-lock --no-save node@20
export PATH="/opt/resolveup-ci-node20/node_modules/node/bin:$PATH"
[[ $(node -p 'process.versions.node.split(".")[0]') == 20 ]]
corepack enable
corepack prepare pnpm@10.24.0 --activate
node ops/cloud-ci/source.cjs index .
