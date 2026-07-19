function liveKitHealthUrl(value) {
  const url = new URL(value || 'ws://127.0.0.1:7880');
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.href;
}

async function readText(url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return { ok: response.ok, status: response.status, body: (await response.text()).trim(), latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, status: 0, body: error?.name || 'connection-error', latencyMs: Date.now() - startedAt };
  }
}

const livekit = await readText(process.env.REALM_SFU_HEALTH_URL || liveKitHealthUrl(process.env.REALM_SFU_URL));
const gateway = await readText(process.env.REALM_GATEWAY_HEALTH_URL || 'http://127.0.0.1:3301/health');
let gatewayBody = null;
try { gatewayBody = JSON.parse(gateway.body); } catch {}

const result = {
  ok: livekit.ok && livekit.body.toUpperCase() === 'OK'
    && gateway.ok && gatewayBody?.mediaTopology === 'sfu-livekit' && gatewayBody?.mediaServer?.status === 'up',
  livekit: { reachable: livekit.ok && livekit.body.toUpperCase() === 'OK', status: livekit.status, latencyMs: livekit.latencyMs },
  gateway: {
    reachable: gateway.ok,
    status: gateway.status,
    topology: gatewayBody?.mediaTopology || 'unknown',
    mediaServer: gatewayBody?.mediaServer?.status || 'unknown',
    clients: gatewayBody?.clients ?? 0,
    parties: gatewayBody?.parties ?? 0,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
