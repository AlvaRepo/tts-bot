FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates chromium chromium-sandbox \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir --break-system-packages edge-tts

RUN printf '#!/bin/sh\nexec /usr/bin/chromium --no-sandbox --disable-setuid-sandbox "$@"\n' > /usr/local/bin/chromium-wrapper \
  && chmod +x /usr/local/bin/chromium-wrapper

ENV PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium-wrapper \
    HOME=/home/node

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN chown -R node:node /app

USER node

EXPOSE 49152 49153

CMD ["npm", "start"]
