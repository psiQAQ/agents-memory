import net from 'node:net';
import { isMain } from './runtime-lib.mjs';

function configuration(environment) {
  const { TCP_FORWARD_LISTEN_HOST, TCP_FORWARD_LISTEN_PORT, TCP_FORWARD_TARGET_HOST, TCP_FORWARD_TARGET_PORT } = environment;
  const port = (value) => (/^[1-9]\d*$/.test(value ?? '') && Number(value) <= 65535 ? Number(value) : null);
  const listenPort = port(TCP_FORWARD_LISTEN_PORT);
  const targetPort = port(TCP_FORWARD_TARGET_PORT);
  if (TCP_FORWARD_LISTEN_HOST !== '0.0.0.0' || TCP_FORWARD_TARGET_HOST !== 'memory-proxy' || !listenPort || !targetPort) throw new Error('invalid configuration');
  return { listenPort, targetPort };
}

export function createTcpForwardServer({ targetHost, targetPort }) {
  return net.createServer((client) => {
    const upstream = net.createConnection({ host: targetHost, port: targetPort });
    const closeBoth = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', closeBoth).on('close', () => upstream.destroy());
    upstream.on('error', closeBoth).on('close', () => client.destroy());
    client.pipe(upstream).pipe(client);
  });
}

export async function listenTcpForwarder(environment = process.env) {
  const { listenPort, targetPort } = configuration(environment);
  const server = createTcpForwardServer({ targetHost: 'memory-proxy', targetPort });
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error('listen failed')));
    server.listen(listenPort, '0.0.0.0', () => {
      server.removeAllListeners('error');
      resolve();
    });
  });
  return server;
}

if (isMain(import.meta)) {
  try {
    await listenTcpForwarder();
    process.stdout.write('{"status":"ready"}\n');
  } catch (error) {
    process.stderr.write(`${error.message === 'listen failed' ? 'listen failed' : 'invalid configuration'}\n`);
    process.exitCode = 1;
  }
}
