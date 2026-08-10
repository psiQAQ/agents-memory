FROM node:22-bookworm-slim

WORKDIR /lab
COPY package.json /lab/package.json
COPY tools /lab/tools
COPY config /lab/config
COPY clients /lab/clients
COPY claude/settings.template.json /lab/claude/settings.template.json

RUN mkdir -p /project
ENTRYPOINT ["node"]
