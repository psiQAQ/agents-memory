# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY} \
    CLAUDE_CONFIG_DIR=/home/claude/.claude \
    DISABLE_AUTOUPDATER=1 \
    DISABLE_TELEMETRY=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

RUN npm install --global --no-audit --no-fund @anthropic-ai/claude-code@2.1.207 \
 && groupadd --gid 10001 claude \
 && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash claude \
 && mkdir -p /workspace /home/claude/.claude \
 && chown -R 10001:10001 /workspace /home/claude

COPY --from=integration tools/render-settings.mjs tools/runtime-lib.mjs /opt/memory-lab/tools/
COPY --from=integration claude/settings.template.json /opt/memory-lab/settings.template.json
COPY entrypoint.sh /usr/local/bin/memory-lab-claude
RUN chmod 0555 /usr/local/bin/memory-lab-claude \
 && chmod -R a=rX /opt/memory-lab

USER claude
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/memory-lab-claude"]
CMD ["--version"]
