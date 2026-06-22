# AFAX Cloud — the web control panel + autonomous company, deployable anywhere
# that runs a container (Railway, Fly, Render, a plain VPS). Zero runtime deps,
# so the image is tiny and there is nothing to compile.
# Node 22 ships the built-in node:sqlite AFAX prefers (it falls back to a JSON
# store on older Node, but 22 gets the faster, indexed SQLite backend).
FROM node:22-alpine

WORKDIR /app

# Source only — no install step (the standard library is the only dependency).
COPY package.json ./
COPY bin ./bin
COPY src ./src

ENV NODE_ENV=production
# Persist all company data (config, JSON collections, memory) under /data.
# Mount a persistent volume there. On Railway use a Railway Volume mounted at
# /data — Railway rejects the Docker `VOLUME` instruction, so it's intentionally
# omitted here (the directory is created at runtime regardless).
ENV AFAX_HOME=/data

# The platform injects PORT; web.js binds 0.0.0.0 automatically when PORT is set.
EXPOSE 8788

# Set AFAX_WEB_TOKEN (a long random secret) and your provider key as env vars.
# `cloud` = the always-on company: web panel + inbound webhooks + autonomy heartbeat.
CMD ["node", "bin/afax.js", "cloud"]
