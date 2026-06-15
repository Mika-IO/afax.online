# AFAX Cloud — the web control panel + autonomous company, deployable anywhere
# that runs a container (Railway, Fly, Render, a plain VPS). Zero runtime deps,
# so the image is tiny and there is nothing to compile.
FROM node:20-alpine

WORKDIR /app

# Source only — no install step (the standard library is the only dependency).
COPY package.json ./
COPY bin ./bin
COPY src ./src

ENV NODE_ENV=production
# Persist all company data (config, JSON collections, memory) on a mounted volume.
ENV AFAX_HOME=/data
VOLUME ["/data"]

# The platform injects PORT; web.js binds 0.0.0.0 automatically when PORT is set.
EXPOSE 8788

# Set AFAX_WEB_TOKEN (a long random secret) and your provider key as env vars.
CMD ["node", "bin/afax.js", "web"]
