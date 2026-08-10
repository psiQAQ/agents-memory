FROM node:22-bookworm-slim

RUN node -e "const fs=require('node:fs');fetch(process.argv[1]).then(r=>{if(!r.ok)throw new Error('download failed');return r.arrayBuffer()}).then(b=>fs.writeFileSync('/tmp/pi-linux-x64.tar.gz',Buffer.from(b)))" https://github.com/earendil-works/pi/releases/download/v0.84.1/pi-linux-x64.tar.gz \
 && echo "5634d7ebd18274b63af3371e942f342d74bea012389575c1d1ff15ce6ca80c2f  /tmp/pi-linux-x64.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/pi-linux-x64.tar.gz -C /opt \
 && ln -s /opt/pi/pi /usr/local/bin/pi \
 && rm /tmp/pi-linux-x64.tar.gz \
 && pi --version

RUN groupadd --gid 10001 agent \
 && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash agent \
 && mkdir -p /workspace /opt/memory-client \
 && chown -R 10001:10001 /workspace /home/agent

COPY --from=integration tools/launch-client.mjs /opt/memory-client/launch-client.mjs
COPY --from=integration tools/render-settings.mjs /opt/memory-client/render-settings.mjs
COPY --from=integration tools/runtime-lib.mjs /opt/memory-client/runtime-lib.mjs

ENV HOME=/home/agent
WORKDIR /workspace
USER agent
ENTRYPOINT ["node", "/opt/memory-client/launch-client.mjs", "--client", "pi", "--home-dir", "/home/agent", "--bundle-file", "/home/agent/.memory/agent-bundle.json", "--"]
CMD ["--version"]
