#!/bin/sh
set -e

if [ "$GENERATE_SELF_SIGNED_CERT" = "true" ]; then
  CERT_DIR=/app/certs
  DOMAIN="${CERT_DOMAIN:-localhost}"

  # Only generate if certs don't already exist (survives container restarts with a volume).
  if [ ! -f "${CERT_DIR}/fullchain.pem" ] || [ ! -f "${CERT_DIR}/privkey.pem" ]; then
    mkdir -p "$CERT_DIR"
    echo "Generating self-signed TLS certificate for '${DOMAIN}'..."
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "${CERT_DIR}/privkey.pem" \
      -out    "${CERT_DIR}/fullchain.pem" \
      -days   365 \
      -subj   "/CN=${DOMAIN}" \
      -addext "subjectAltName=DNS:${DOMAIN},IP:127.0.0.1" \
      2>/dev/null
    echo "Certificate written to ${CERT_DIR}"
  else
    echo "Existing certificate found in ${CERT_DIR}, skipping generation."
  fi

  export TLS_CERT="${CERT_DIR}/fullchain.pem"
  export TLS_KEY="${CERT_DIR}/privkey.pem"
fi

if [ "$USE_LETSENCRYPT" = "true" ]; then
  DOMAIN="${CERT_DOMAIN:?ERROR: CERT_DOMAIN must be set when USE_LETSENCRYPT=true}"
  CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  KEY_PATH="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

  echo "Waiting for Let's Encrypt certificate for '${DOMAIN}'..."
  WAITED=0
  until [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; do
    if [ "$WAITED" -ge 120 ]; then
      echo "ERROR: Certificate not found after 120s. Ensure the certbot service has run successfully for '${DOMAIN}'."
      exit 1
    fi
    sleep 5
    WAITED=$((WAITED + 5))
  done

  export TLS_CERT="$CERT_PATH"
  export TLS_KEY="$KEY_PATH"
fi

exec tsx server.ts
