const url = process.argv[2];

try {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/(?:health|healthz)$/.test(url ?? '')) throw new Error();
  const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
  process.exitCode = response.ok ? 0 : 1;
} catch {
  process.exitCode = 1;
}
