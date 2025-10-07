FROM node:20-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       fail2ban \
       nftables \
       iproute2 \
       conntrack \
       ca-certificates \
       tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY security-agent/package*.json ./
RUN npm install --omit=dev

COPY security-agent/src ./src
COPY security-agent/config ./config
COPY security-agent/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV AGENT_PORT=9000 \
    STATE_FILE=/data/state.json \
    LOG_LEVEL=info

VOLUME ["/data"]
EXPOSE 9000

ENTRYPOINT ["/entrypoint.sh"]
