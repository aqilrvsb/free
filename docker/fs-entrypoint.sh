#!/usr/bin/env bash
set -euo pipefail

fix_perms() {
  local p="$1"
  mkdir -p "$p"
  chown -R freeswitch:freeswitch "$p" || true
}

fix_perms /var/log/freeswitch
fix_perms /var/lib/freeswitch
fix_perms /recordings

if [ -f /etc/freeswitch/vars_local.xml ]; then
  tmp=$(mktemp)
  cp /etc/freeswitch/vars_local.xml "$tmp"
  if [ -n "${EXT_SIP_IP:-}" ]; then
    sed -i "s#__EXT_SIP_IP__#${EXT_SIP_IP}#g" "$tmp"
  fi
  if [ -n "${EXT_RTP_IP:-}" ]; then
    sed -i "s#__EXT_RTP_IP__#${EXT_RTP_IP}#g" "$tmp"
  fi
  cat "$tmp" > /etc/freeswitch/vars_local.xml
  rm -f "$tmp"
fi

if [ -f /etc/freeswitch/autoload_configs/xml_cdr.conf.xml ]; then
  tmp=$(mktemp)
  cp /etc/freeswitch/autoload_configs/xml_cdr.conf.xml "$tmp"
  if [ -n "${CDR_HTTP_HEADERS:-}" ]; then
    escaped=$(printf '%s' "$CDR_HTTP_HEADERS" | sed -e 's/[\/&]/\\&/g')
    sed -i "s/__CDR_HTTP_HEADERS__/${escaped}/g" "$tmp"
  else
    sed -i '/__CDR_HTTP_HEADERS__/d' "$tmp"
  fi
  cat "$tmp" > /etc/freeswitch/autoload_configs/xml_cdr.conf.xml
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

exec gosu freeswitch:freeswitch /usr/bin/freeswitch -nf
