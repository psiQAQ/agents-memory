FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436

RUN test "$(npm view --registry=https://registry.npmjs.org opencode-ai@1.18.16 dist.integrity)" = "sha512-l4nUfoucuw8u5WYU9my9Yz7lYpBI649i/ppgL0BGTjp/HC3p2jN50i331YpcGbKfGTEv9VG6mxU1+QZyaR5hxA==" \
 && test "$(npm view --registry=https://registry.npmjs.org opencode-linux-x64@1.18.16 dist.integrity)" = "sha512-eArnlUAhE3bqhaMXsypn14x49GsafuPS9oI6eH+rWZ2vrUCrKfKk/F7WOe/sFgp09gQU8yzFbGsZjDpWBFSCBg==" \
 && npm install --registry=https://registry.npmjs.org --global opencode-ai@1.18.16 \
 && opencode --version

RUN groupadd --gid 10001 agent \
 && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash agent \
 && mkdir -p /workspace /opt/memory-client /client-evidence \
 && chown -R 10001:10001 /workspace /home/agent /client-evidence

COPY --from=integration tools/launch-client.mjs /opt/memory-client/launch-client.mjs
COPY --from=integration tools/render-settings.mjs /opt/memory-client/render-settings.mjs
COPY --from=integration tools/runtime-lib.mjs /opt/memory-client/runtime-lib.mjs
COPY --from=integration tools/task5-contract.mjs /opt/memory-client/task5-contract.mjs
COPY --from=integration tools/task5-headless-client.mjs /opt/memory-client/task5-headless-client.mjs

ENV HOME=/home/agent
WORKDIR /workspace
USER agent
ENTRYPOINT ["node", "/opt/memory-client/launch-client.mjs", "--client", "opencode", "--home-dir", "/home/agent", "--bundle-file", "/home/agent/.memory/agent-bundle.json", "--"]
CMD ["--version"]
