FROM node:22-bookworm-slim

RUN test "$(npm view --registry=https://registry.npmjs.org @anthropic-ai/claude-code@2.1.226 dist.integrity)" = "sha512-mUkA81SbzATHFsHNz/rPy3Itw0D0S9kQMsIUJ3qPGwpNJMqPePyDP6xnWHI0jfFlspVjs8r/GfolMUyiy8P1FQ==" \
 && test "$(npm view --registry=https://registry.npmjs.org @anthropic-ai/claude-code-linux-x64@2.1.226 dist.integrity)" = "sha512-zDdtV2tzCfngxKXJLj5/UYHtCVa/yA/L0vF5dBx3w1dx5tcA8+AlyRp3qcsd/gYU7hbI/gS5OoA7C8XqJR9YtA==" \
 && npm install --registry=https://registry.npmjs.org --global @anthropic-ai/claude-code@2.1.226 \
 && claude --version

RUN groupadd --gid 10001 agent \
 && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash agent \
 && mkdir -p /workspace /opt/memory-client \
 && chown -R 10001:10001 /workspace /home/agent

COPY --from=integration tools/launch-client.mjs /opt/memory-client/launch-client.mjs
COPY --from=integration tools/render-settings.mjs /opt/memory-client/render-settings.mjs
COPY --from=integration tools/runtime-lib.mjs /opt/memory-client/runtime-lib.mjs
COPY --from=integration claude/settings.template.json /opt/memory-client/settings.template.json

ENV HOME=/home/agent
WORKDIR /workspace
USER agent
ENTRYPOINT ["node", "/opt/memory-client/launch-client.mjs", "--client", "claude", "--home-dir", "/home/agent", "--bundle-file", "/home/agent/.memory/agent-bundle.json", "--template", "/opt/memory-client/settings.template.json", "--"]
CMD ["--version"]
