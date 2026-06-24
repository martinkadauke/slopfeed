#!/bin/bash
# Install a SECOND GitHub Actions runner on vds-1 — scoped to the slopfeed repo.
# (Runners are repo-scoped; the existing VDS runner cannot serve this repo.)
#
# Get a registration token first, then run:
#   gh api -X POST repos/martinkadauke/slopfeed/actions/runners/registration-token -q .token
#   RUNNER_TOKEN=<token> bash install-runner.sh
set -euo pipefail
RUNNER_TOKEN="${RUNNER_TOKEN:?RUNNER_TOKEN setzen}"
REPO_URL="${REPO_URL:-https://github.com/martinkadauke/slopfeed}"
RUNNER_VERSION="${RUNNER_VERSION:-2.321.0}"

mkdir -p ~/actions-runner-slopfeed && cd ~/actions-runner-slopfeed
if [ ! -f config.sh ]; then
  curl -sL -o runner.tar.gz \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  tar xzf runner.tar.gz && rm runner.tar.gz
fi
./config.sh --unattended --url "$REPO_URL" --token "$RUNNER_TOKEN" \
  --name "slopfeed-1-runner" --labels swarm --replace
sudo ./svc.sh install "$USER"
sudo ./svc.sh start
echo "slopfeed runner installed + started on $(hostname)"
