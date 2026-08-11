FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436

RUN groupadd --gid 10001 agent \
 && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash agent

WORKDIR /lab
COPY package.json /lab/package.json
COPY tools /lab/tools
COPY config /lab/config
COPY clients /lab/clients
COPY claude/settings.template.json /lab/claude/settings.template.json

RUN mkdir -p /project
ENTRYPOINT ["node"]
