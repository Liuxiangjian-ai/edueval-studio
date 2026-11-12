#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${DSH_PROFILE:-desktop}"

TGZ="$(find "$SCRIPT_DIR" -maxdepth 1 -type f -name 'dsh-plugin-edueval-*.tgz' | sort | tail -n 1)"
if [[ -z "${TGZ}" ]]; then
  echo "dsh-plugin-edueval-*.tgz was not found next to this script." >&2
  exit 1
fi

DSH_BIN="${DSH_BIN:-}"
if [[ -z "${DSH_BIN}" ]]; then
  DSH_BIN="$(command -v dsh || true)"
fi
if [[ -z "${DSH_BIN}" ]]; then
  for candidate in \
    "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
    "$HOME/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
    "/opt/DeepSeek Harness/resources/runtime/cli/bin/dsh"
  do
    if [[ -x "${candidate}" ]]; then
      DSH_BIN="${candidate}"
      break
    fi
  done
fi
if [[ -z "${DSH_BIN}" ]]; then
  echo "Could not find the DSH CLI. Set DSH_BIN to the dsh executable." >&2
  exit 1
fi

echo "EduEval Studio installer"
echo "Profile: ${PROFILE}"
echo "Package: ${TGZ}"
echo "DSH CLI: ${DSH_BIN}"
echo

"${DSH_BIN}" plugin --profile "${PROFILE}" add "${TGZ}"
"${DSH_BIN}" plugin --profile "${PROFILE}" list dsh-plugin-edueval

echo
echo "Installed. Restart DeepSeek Harness, then open EduEval Studio from the sidebar."
echo "Each user must enter their own API keys; no keys are included."
