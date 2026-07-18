#!/usr/bin/env bash
set -Eeuo pipefail

if command -v oci >/dev/null 2>&1; then
  oci --version
  exit 0
fi

if [ ! -r /etc/os-release ]; then
  echo "Cannot install the OCI CLI: /etc/os-release is unavailable." >&2
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    command -v sudo >/dev/null 2>&1 || {
      echo "Cannot install the OCI CLI: sudo is unavailable." >&2
      exit 1
    }
    sudo "$@"
  fi
}

case "${ID:-}:${VERSION_ID:-}" in
  ol:8*)
    run_privileged dnf -y install oraclelinux-developer-release-el8
    run_privileged dnf -y install python36-oci-cli
    ;;
  ol:9*)
    run_privileged dnf -y install oraclelinux-developer-release-el9
    run_privileged dnf -y install python39-oci-cli
    ;;
  *)
    echo "Automatic OCI CLI installation supports Oracle Linux 8 and 9 only." >&2
    echo "Install the OCI CLI using Oracle's documented package for this host." >&2
    exit 1
    ;;
esac

command -v oci >/dev/null 2>&1 || {
  echo "The OCI CLI package completed without installing the oci command." >&2
  exit 1
}
oci --version
