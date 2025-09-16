FROM debian:bookworm-slim

ARG FS_TOKEN
ENV DEBIAN_FRONTEND=noninteractive

# Install FreeSWITCH via fsget (SignalWire repos) — release channel
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl bash gosu; \
    rm -rf /var/lib/apt/lists/*; \
    test -n "${FS_TOKEN:-}" || (echo "FS_TOKEN is required" >&2; exit 1); \
    curl -sSL https://freeswitch.org/fsget | bash -s ${FS_TOKEN} release install; \
    apt-get update; \
    # ensure required modules present (fsget sets repo and installs core)
    apt-get install -y --no-install-recommends \
        freeswitch-mod-sofia \
        freeswitch-mod-xml-curl \
        freeswitch-mod-lua \
        freeswitch-mod-opus; \
    rm -rf /var/lib/apt/lists/* /etc/apt/auth.conf /etc/apt/auth.conf.d || true

# Allow fs_cli inside container without TTY tricks
ENV FS_DEFAULT_PASSWORD=ClueCon

# Ensure directories exist
RUN mkdir -p /recordings /var/lib/freeswitch /var/log/freeswitch && \
    chown -R freeswitch:freeswitch /var/lib/freeswitch /var/log/freeswitch /recordings || true

# Runtime entrypoint: fix perms for bind mounts, then drop to freeswitch user
ADD <<'EOF' /usr/local/bin/fs-entrypoint.sh
#!/usr/bin/env bash
set -euo pipefail

fix_perms() {
  local p="$1"
  mkdir -p "$p"
  # chown may fail on some Docker Desktop mounts; ignore errors
  chown -R freeswitch:freeswitch "$p" || true
}

fix_perms /var/log/freeswitch
fix_perms /var/lib/freeswitch
fix_perms /recordings

if [ -f /etc/freeswitch/vars_local.xml ]; then
  tmp=$(mktemp)
  cp /etc/freeswitch/vars_local.xml "$tmp"
  if [ -n "${EXT_SIP_IP:-}" ]; then
    sed -i "s/__EXT_SIP_IP__/${EXT_SIP_IP}/g" "$tmp"
  fi
  if [ -n "${EXT_RTP_IP:-}" ]; then
    sed -i "s/__EXT_RTP_IP__/${EXT_RTP_IP}/g" "$tmp"
  fi
  cat "$tmp" > /etc/freeswitch/vars_local.xml
  rm -f "$tmp"
fi

if [ -f /etc/freeswitch/vars.xml ]; then
  if [ -n "${EXT_SIP_IP:-}" ]; then
    sed -i "s#<X-PRE-PROCESS cmd=\"stun-set\" data=\"external_sip_ip=stun:stun.freeswitch.org\"/>#<X-PRE-PROCESS cmd=\"set\" data=\"external_sip_ip=${EXT_SIP_IP}\"/>#" /etc/freeswitch/vars.xml
  fi
  if [ -n "${EXT_RTP_IP:-}" ]; then
    sed -i "s#<X-PRE-PROCESS cmd=\"stun-set\" data=\"external_rtp_ip=stun:stun.freeswitch.org\"/>#<X-PRE-PROCESS cmd=\"set\" data=\"external_rtp_ip=${EXT_RTP_IP}\"/>#" /etc/freeswitch/vars.xml
  fi
fi

exec gosu freeswitch:freeswitch /usr/bin/freeswitch -nonat -nf
EOF
RUN chmod +x /usr/local/bin/fs-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/fs-entrypoint.sh"]
