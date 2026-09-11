#!/usr/bin/env bash
#
# Generates a self-signed ECDSA P-256 signing certificate for local development.
#
# Output goes to ./certs/, which is gitignored. These files must never be
# committed — publishing a signing key would allow anyone to forge manifests
# that appear to originate from your service.
#
set -euo pipefail

CERT_DIR="${CERT_DIR:-./certs}"
DAYS="${DAYS:-365}"
CN="${CN:-CBN-CA-001 (Mock)}"
ORG="${ORG:-Central Bank of Nigeria (Mock)}"
COUNTRY="${COUNTRY:-NG}"

mkdir -p "$CERT_DIR"

if [[ -f "$CERT_DIR/signing.key" ]]; then
  echo "certificate already exists at $CERT_DIR — remove it first to regenerate." >&2
  exit 1
fi

echo "generating ECDSA P-256 private key…"
openssl ecparam -name prime256v1 -genkey -noout -out "$CERT_DIR/signing.key"

echo "generating self-signed certificate (CN=$CN, $DAYS days)…"
openssl req -new -x509 \
  -key "$CERT_DIR/signing.key" \
  -out "$CERT_DIR/signing.crt" \
  -days "$DAYS" \
  -sha256 \
  -subj "/CN=$CN/O=$ORG/C=$COUNTRY"

chmod 600 "$CERT_DIR/signing.key"

echo
echo "done:"
echo "  $CERT_DIR/signing.crt"
echo "  $CERT_DIR/signing.key   (mode 600, gitignored)"
echo
echo "Verification will report this certificate as a valid signature from an"
echo "unrecognised issuer, since it is not on the C2PA Trust List. That is the"
echo "expected result for a research deployment."
