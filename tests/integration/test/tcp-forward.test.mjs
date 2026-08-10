import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ensureFetchSafeServer } from './helpers.mjs';
import { createTcpForwardServer, listenTcpForwarder } from '../tools/tcp-forward.mjs';

const tool = fileURLToPath(new URL('../tools/tcp-forward.mjs', import.meta.url));
const configuration = {
  FORWARD_LISTEN_HOST: '0.0.0.0',
  FORWARD_LISTEN_PORT: '23561',
  FORWARD_TARGET_HOST: 'memory-proxy',
  FORWARD_TARGET_PORT: '8096',
};

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function waitForClose(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timed out waiting for socket close')), 1000);
    socket.once('close', () => { clearTimeout(timeout); resolve(); });
  });
}

function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function connectedSocket(port) {
  const socket = net.connect({ host: '127.0.0.1', port });
  await once(socket, 'connect');
  return socket;
}

function run(environment) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tool], { env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function startCli(environment) {
  const child = spawn(process.execPath, [tool], { env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  return { child, output: () => ({ stdout, stderr }) };
}

test('listenTcpForwarder accepts only the fixed topology and decimal port range without echoing rejected values', async () => {
  const server = await listenTcpForwarder({ ...configuration, FORWARD_LISTEN_PORT: String(await unusedPort()) });
  await closeServer(server);

  const sentinel = 'FORWARD_SENTINEL_7f5d';
  for (const changed of [
    { FORWARD_LISTEN_HOST: '' },
    { FORWARD_LISTEN_HOST: `0.0.0.0\n${sentinel}` },
    { FORWARD_LISTEN_HOST: ' 0.0.0.0' },
    { FORWARD_LISTEN_HOST: '127.0.0.1' },
    { FORWARD_TARGET_HOST: '' },
    { FORWARD_TARGET_HOST: `memory-proxy\r${sentinel}` },
    { FORWARD_TARGET_HOST: 'memory-proxy ' },
    { FORWARD_TARGET_HOST: 'other-target' },
    { FORWARD_LISTEN_PORT: '0' },
    { FORWARD_LISTEN_PORT: '' },
    { FORWARD_LISTEN_PORT: ' 80' },
    { FORWARD_LISTEN_PORT: '65536' },
    { FORWARD_LISTEN_PORT: '08' },
    { FORWARD_TARGET_PORT: '1.5' },
    { FORWARD_TARGET_PORT: '65536' },
    { FORWARD_TARGET_PORT: `8096${sentinel}` },
  ]) {
    await assert.rejects(listenTcpForwarder({ ...configuration, ...changed }), (error) => {
      assert.doesNotMatch(error.message, new RegExp(sentinel));
      assert.doesNotMatch(error.message, /0\.0\.0\.0|memory-proxy|other-target|65536|1\.5/);
      return true;
    });
  }
});

test('listenTcpForwarder rejects the legacy TCP_FORWARD environment names', async () => {
  const legacy = {
    TCP_FORWARD_LISTEN_HOST: '0.0.0.0',
    TCP_FORWARD_LISTEN_PORT: String(await unusedPort()),
    TCP_FORWARD_TARGET_HOST: 'memory-proxy',
    TCP_FORWARD_TARGET_PORT: '8096',
  };
  const result = await listenTcpForwarder(legacy).then((server) => ({ server }), (error) => ({ error }));
  try {
    assert.equal(result.error?.message, 'invalid configuration');
  } finally {
    if (result.server) await closeServer(result.server);
  }
});

test('forwarder relays binary data in both directions and closes the upstream after client disconnect', async () => {
  let upstreamSocket;
  const upstream = net.createServer((socket) => {
    upstreamSocket = socket;
    socket.on('data', (chunk) => socket.write(Buffer.concat([Buffer.from([0]), chunk, Buffer.from([255])] )));
  });
  await ensureFetchSafeServer(upstream);
  const gateway = createTcpForwardServer({ targetHost: '127.0.0.1', targetPort: upstream.address().port });
  await ensureFetchSafeServer(gateway);
  const client = await connectedSocket(gateway.address().port);
  try {
    const received = once(client, 'data');
    client.write(Buffer.from([0, 255, 1, 2, 3]));
    assert.deepEqual((await received)[0], Buffer.from([0, 0, 255, 1, 2, 3, 255]));
    const upstreamClosed = waitForClose(upstreamSocket);
    client.end();
    await upstreamClosed;
  } finally {
    client.destroy();
    await closeServer(gateway);
    await closeServer(upstream);
  }
});

test('forwarder closes the client when a connected upstream closes or errors', async () => {
  for (const action of [
    (socket) => socket.end(),
    (socket) => socket.destroy(new Error('upstream failure')),
  ]) {
    let upstreamSocket;
    const upstream = net.createServer((socket) => { upstreamSocket = socket; });
    await ensureFetchSafeServer(upstream);
    const gateway = createTcpForwardServer({ targetHost: '127.0.0.1', targetPort: upstream.address().port });
    await ensureFetchSafeServer(gateway);
    const upstreamConnected = once(upstream, 'connection');
    const client = await connectedSocket(gateway.address().port);
    try {
      await upstreamConnected;
      const clientClosed = waitForClose(client);
      upstreamSocket.once('error', () => {});
      action(upstreamSocket);
      await clientClosed;
    } finally {
      client.destroy();
      await closeServer(gateway);
      await closeServer(upstream);
    }
  }
});

test('forwarder closes the client when the fixed upstream is unavailable', async () => {
  const gateway = createTcpForwardServer({ targetHost: '127.0.0.1', targetPort: await unusedPort() });
  await ensureFetchSafeServer(gateway);
  const client = await connectedSocket(gateway.address().port);
  try {
    await waitForClose(client);
  } finally {
    client.destroy();
    await closeServer(gateway);
  }
});

test('CLI emits only fixed ready and failure categories without configuration or error leakage', async () => {
  const occupied = net.createServer();
  await ensureFetchSafeServer(occupied, '0.0.0.0');
  const occupiedPort = occupied.address().port;
  const sentinel = 'FORWARD_SENTINEL_3f8c';
  try {
    for (const changed of [
      { FORWARD_TARGET_HOST: sentinel },
      { FORWARD_LISTEN_HOST: `0.0.0.0 ${sentinel}` },
      { FORWARD_TARGET_PORT: `65536${sentinel}` },
    ]) {
      const invalid = await run({ ...configuration, ...changed });
      assert.equal(invalid.status, 1);
      assert.equal(invalid.stdout, '');
      assert.equal(invalid.stderr, 'invalid configuration\n');
    }

    const busy = await run({ ...configuration, FORWARD_LISTEN_PORT: String(occupiedPort) });
    assert.equal(busy.status, 1);
    assert.equal(busy.stdout, '');
    assert.equal(busy.stderr, 'listen failed\n');

    const readyPort = await unusedPort();
    const ready = startCli({ ...configuration, FORWARD_LISTEN_PORT: String(readyPort) });
    await once(ready.child.stdout, 'data');
    assert.equal(ready.output().stdout, '{"status":"ready"}\n');
    assert.equal(ready.output().stderr, '');
    ready.child.kill();
    await once(ready.child, 'close');
  } finally { await closeServer(occupied); }
});
