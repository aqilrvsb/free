#!/usr/bin/env sh
set -eu
ENV_FILES=""
[ -f app.build.env ] && ENV_FILES="$ENV_FILES app.build.env"
[ -f portal.build.env ] && ENV_FILES="$ENV_FILES portal.build.env"
[ -f freeswitch.build.env ] && ENV_FILES="$ENV_FILES freeswitch.build.env"

if [ -z "$ENV_FILES" ]; then
  exit 0
fi

cat $ENV_FILES > build.env
