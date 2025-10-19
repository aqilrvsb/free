#!/usr/bin/env bash
set -euo pipefail

: "${F2B_SOCKET_PATH:=/var/run/fail2ban}"
: "${F2B_PERSIST_DIR:=/data/security-agent/config}"

mkdir -p "$F2B_SOCKET_PATH"
mkdir -p "$F2B_PERSIST_DIR/jail.d" "$F2B_PERSIST_DIR/filter.d"

default_jail=/app/config/fail2ban/jail.local
persist_jail="$F2B_PERSIST_DIR/jail.d/portal.local"
target_jail=/etc/fail2ban/jail.d/portal.local

if [ -f "$persist_jail" ]; then
  cp -f "$persist_jail" "$target_jail"
elif [ -f "$default_jail" ]; then
  cp -f "$default_jail" "$target_jail"
  cp -f "$default_jail" "$persist_jail"
fi

default_filter=/app/config/fail2ban/filter.d/freeswitch-sip.conf
persist_filter="$F2B_PERSIST_DIR/filter.d/freeswitch-sip.conf"
target_filter=/etc/fail2ban/filter.d/freeswitch-sip.conf

if [ -f "$persist_filter" ]; then
  cp -f "$persist_filter" "$target_filter"
elif [ -f "$default_filter" ]; then
  cp -f "$default_filter" "$target_filter"
  cp -f "$default_filter" "$persist_filter"
fi

persist_lib="$F2B_PERSIST_DIR/lib"
target_lib=/var/lib/fail2ban

if [ ! -L "$target_lib" ]; then
  mkdir -p "$persist_lib"
  if [ -d "$target_lib" ] && [ "$(ls -A "$target_lib" 2>/dev/null)" ]; then
    cp -af "$target_lib/." "$persist_lib/"
  fi
  rm -rf "$target_lib"
  ln -s "$persist_lib" "$target_lib"
fi

fail2ban-client -x start || true

exec node /app/src/server.js
