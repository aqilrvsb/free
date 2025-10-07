#!/usr/bin/env bash
set -euo pipefail

: "${F2B_SOCKET_PATH:=/var/run/fail2ban}"
mkdir -p "$F2B_SOCKET_PATH"

if [ -f /app/config/fail2ban/jail.local ] && [ ! -f /etc/fail2ban/jail.d/portal.local ]; then
  cp -f /app/config/fail2ban/jail.local /etc/fail2ban/jail.d/portal.local
fi

if [ -f /app/config/fail2ban/filter.d/freeswitch-sip.conf ] && [ ! -f /etc/fail2ban/filter.d/freeswitch-sip.conf ]; then
  cp -f /app/config/fail2ban/filter.d/freeswitch-sip.conf /etc/fail2ban/filter.d/freeswitch-sip.conf
fi

fail2ban-client -x start || true

exec node /app/src/server.js
