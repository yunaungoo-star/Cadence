import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import v8 from 'node:v8';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CoreCpuSample {
  core: number;
  model: string;
  speedMHz: number;
  usagePercent: number;
  userPercent: number;
  sysPercent: number;
  idlePercent: number;
}

interface CpuTickSnapshot {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
  total: number;
}

interface NetworkInterfaceSummary {
  name: string;
  address: string;
  family: string;
  internal: boolean;
}

interface DiskSummary {
  mount: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}

interface SystemHistoryPoint {
  timestamp: number;
  cpuPercent: number;
  memPercent: number;
  load1m: number;
  eventLoopMeanMs: number;
  heapUsedMB: number;
}

interface SystemSnapshot {
  timestamp: number;
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  nodeVersion: string;
  pid: number;
  uptimeSeconds: number;
  processUptimeSeconds: number;
  cpu: {
    model: string;
    coreCount: number;
    usagePercent: number;
    userPercent: number;
    sysPercent: number;
    loadAvg: [number, number, number];
    cores: CoreCpuSample[];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    availableBytes: number;
    cachedBytes: number;
    usedPercent: number;
    cgroupLimitBytes: number | null;
    cgroupUsedBytes: number | null;
    process: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      heapLimitBytes: number;
      externalBytes: number;
      arrayBuffersBytes: number;
    };
  };
  runtime: {
    eventLoopMeanMs: number;
    eventLoopP99Ms: number;
    eventLoopMaxMs: number;
    voluntaryContextSwitches: number;
    involuntaryContextSwitches: number;
  };
  disk: DiskSummary | null;
  networkInterfaces: NetworkInterfaceSummary[];
  activeTelemetryClients: number;
}

const HISTORY_LIMIT = 300; // 5 minutes at 1s interval
const history: SystemHistoryPoint[] = [];
const sseClients = new Set<express.Response>();

const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
eventLoopHistogram.enable();

let prevCpuTicks: CpuTickSnapshot[] = readCpuTicks();
let prevProcCpu = process.cpuUsage();
let prevProcTime = process.hrtime.bigint();

function readCpuTicks(): CpuTickSnapshot[] {
  return os.cpus().map((cpu) => {
    const t = cpu.times;
    const total = t.user + t.nice + t.sys + t.idle + t.irq;
    return {
      user: t.user + t.nice,
      nice: t.nice,
      sys: t.sys + t.irq,
      idle: t.idle,
      irq: t.irq,
      total,
    };
  });
}

function readLinuxMemInfo(): { availableBytes: number; cachedBytes: number } | null {
  try {
    if (os.platform() !== 'linux') return null;
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    let memAvailableKb = 0;
    let cachedKb = 0;
    let buffersKb = 0;
    for (const line of raw.split('\n')) {
      if (line.startsWith('MemAvailable:')) {
        memAvailableKb = parseInt(line.replace(/\D+/g, ''), 10) || 0;
      } else if (line.startsWith('Cached:')) {
        cachedKb = parseInt(line.replace(/\D+/g, ''), 10) || 0;
      } else if (line.startsWith('Buffers:')) {
        buffersKb = parseInt(line.replace(/\D+/g, ''), 10) || 0;
      }
    }
    if (memAvailableKb > 0) {
      return {
        availableBytes: memAvailableKb * 1024,
        cachedBytes: (cachedKb + buffersKb) * 1024,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function readCgroupMemory(): { limitBytes: number | null; usedBytes: number | null } {
  try {
    if (os.platform() !== 'linux') return { limitBytes: null, usedBytes: null };
    const maxPath = '/sys/fs/cgroup/memory.max';
    const curPath = '/sys/fs/cgroup/memory.current';
    if (fs.existsSync(maxPath) && fs.existsSync(curPath)) {
      const maxRaw = fs.readFileSync(maxPath, 'utf8').trim();
      const curRaw = fs.readFileSync(curPath, 'utf8').trim();
      const totalHost = os.totalmem();
      const limit = maxRaw === 'max' ? null : Number(maxRaw);
      const used = Number(curRaw);
      if (limit && Number.isFinite(limit) && limit < totalHost * 1.5 && Number.isFinite(used)) {
        return { limitBytes: limit, usedBytes: used };
      }
    }
  } catch {
    // Ignore restricted cgroup reads
  }
  return { limitBytes: null, usedBytes: null };
}

function readRootDisk(): DiskSummary | null {
  try {
    const stat = fs.statfsSync('/');
    const bsize = Number(stat.bsize);
    const totalBytes = Number(stat.blocks) * bsize;
    const freeBytes = Number(stat.bavail) * bsize;
    const usedBytes = Math.max(0, totalBytes - Number(stat.bfree) * bsize);
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
    const usedPercent = Number(((usedBytes / totalBytes) * 100).toFixed(1));
    return {
      mount: '/',
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent,
    };
  } catch {
    return null;
  }
}

function readNetworkInterfaces(): NetworkInterfaceSummary[] {
  const raw = os.networkInterfaces();
  const list: NetworkInterfaceSummary[] = [];
  for (const [name, entries] of Object.entries(raw)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' || !entry.internal) {
        list.push({
          name,
          address: entry.address,
          family: entry.family,
          internal: entry.internal,
        });
      }
    }
  }
  return list.slice(0, 8);
}

function sampleSystem(): SystemSnapshot {
  const cpus = os.cpus();
  const currTicks = readCpuTicks();

  let totalDelta = 0;
  let idleDelta = 0;
  const cores: CoreCpuSample[] = cpus.map((cpu, idx) => {
    const prev = prevCpuTicks[idx] ?? { user: 0, nice: 0, sys: 0, idle: 0, irq: 0, total: 0 };
    const curr = currTicks[idx] ?? { user: 0, nice: 0, sys: 0, idle: 0, irq: 0, total: 0 };
    const dTotal = Math.max(0, curr.total - prev.total);
    const dIdle = Math.max(0, curr.idle - prev.idle);
    const dUser = Math.max(0, curr.user - prev.user);
    const dSys = Math.max(0, curr.sys - prev.sys);
    totalDelta += dTotal;
    idleDelta += dIdle;
    const usage = dTotal > 0 ? Math.min(100, Math.max(0, ((dTotal - dIdle) / dTotal) * 100)) : 0;
    const userPctCore = dTotal > 0 ? Math.min(100, Math.max(0, (dUser / dTotal) * 100)) : 0;
    const sysPctCore = dTotal > 0 ? Math.min(100, Math.max(0, (dSys / dTotal) * 100)) : 0;
    const idlePctCore = Math.max(0, 100 - usage);
    return {
      core: idx,
      model: cpu.model.trim(),
      speedMHz: cpu.speed,
      usagePercent: Number(usage.toFixed(1)),
      userPercent: Number(userPctCore.toFixed(1)),
      sysPercent: Number(sysPctCore.toFixed(1)),
      idlePercent: Number(idlePctCore.toFixed(1)),
    };
  });

  prevCpuTicks = currTicks;

  const overallCpuPercent =
    totalDelta > 0 ? Math.min(100, Math.max(0, ((totalDelta - idleDelta) / totalDelta) * 100)) : 0;

  const nowHr = process.hrtime.bigint();
  const elapsedUs = Number(nowHr - prevProcTime) / 1000;
  const procDelta = process.cpuUsage(prevProcCpu);
  prevProcCpu = process.cpuUsage();
  prevProcTime = nowHr;

  const coreCount = Math.max(1, cpus.length);
  const userPct = elapsedUs > 0 ? Math.min(100, (procDelta.user / (elapsedUs * coreCount)) * 100) : 0;
  const sysPct = elapsedUs > 0 ? Math.min(100, (procDelta.system / (elapsedUs * coreCount)) * 100) : 0;

  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const linuxMem = readLinuxMemInfo();
  const availableBytes = linuxMem ? Math.min(totalBytes, linuxMem.availableBytes) : freeBytes;
  const cachedBytes = linuxMem ? linuxMem.cachedBytes : 0;
  const usedBytes = Math.max(0, totalBytes - availableBytes);
  const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  const cgroup = readCgroupMemory();
  const procMem = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();
  const resUsage = process.resourceUsage();
  const load = os.loadavg();

  const elMeanMs = Number((eventLoopHistogram.mean / 1e6).toFixed(2));
  const elP99Ms = Number((eventLoopHistogram.percentile(99) / 1e6).toFixed(2));
  const elMaxMs = Number((eventLoopHistogram.max / 1e6).toFixed(2));
  eventLoopHistogram.reset();

  const snapshot: SystemSnapshot = {
    timestamp: Date.now(),
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    nodeVersion: process.version,
    pid: process.pid,
    uptimeSeconds: Math.floor(os.uptime()),
    processUptimeSeconds: Math.floor(process.uptime()),
    cpu: {
      model: cpus[0]?.model.trim() || 'Unknown CPU',
      coreCount: cpus.length,
      usagePercent: Number(overallCpuPercent.toFixed(1)),
      userPercent: Number(userPct.toFixed(1)),
      sysPercent: Number(sysPct.toFixed(1)),
      loadAvg: [
        Number((load[0] ?? 0).toFixed(2)),
        Number((load[1] ?? 0).toFixed(2)),
        Number((load[2] ?? 0).toFixed(2)),
      ],
      cores,
    },
    memory: {
      totalBytes,
      usedBytes,
      freeBytes,
      availableBytes,
      cachedBytes,
      usedPercent: Number(usedPercent.toFixed(1)),
      cgroupLimitBytes: cgroup.limitBytes,
      cgroupUsedBytes: cgroup.usedBytes,
      process: {
        rssBytes: procMem.rss,
        heapUsedBytes: procMem.heapUsed,
        heapTotalBytes: procMem.heapTotal,
        heapLimitBytes: heapStats.heap_size_limit,
        externalBytes: procMem.external,
        arrayBuffersBytes: procMem.arrayBuffers,
      },
    },
    runtime: {
      eventLoopMeanMs: Number.isFinite(elMeanMs) ? elMeanMs : 0,
      eventLoopP99Ms: Number.isFinite(elP99Ms) ? elP99Ms : 0,
      eventLoopMaxMs: Number.isFinite(elMaxMs) ? elMaxMs : 0,
      voluntaryContextSwitches: resUsage.voluntaryContextSwitches,
      involuntaryContextSwitches: resUsage.involuntaryContextSwitches,
    },
    disk: readRootDisk(),
    networkInterfaces: readNetworkInterfaces(),
    activeTelemetryClients: sseClients.size,
  };

  history.push({
    timestamp: snapshot.timestamp,
    cpuPercent: snapshot.cpu.usagePercent,
    memPercent: snapshot.memory.usedPercent,
    load1m: snapshot.cpu.loadAvg[0],
    eventLoopMeanMs: snapshot.runtime.eventLoopMeanMs,
    heapUsedMB: Number((snapshot.memory.process.heapUsedBytes / (1024 * 1024)).toFixed(1)),
  });
  if (history.length > HISTORY_LIMIT) {
    history.shift();
  }

  return snapshot;
}

let latestSnapshot = sampleSystem();

setInterval(() => {
  latestSnapshot = sampleSystem();
  if (sseClients.size > 0) {
    const payload = `data: ${JSON.stringify(latestSnapshot)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  }
}, 1000);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get('/api/system/stats', (_req, res) => {
    res.json({
      snapshot: latestSnapshot,
      history,
    });
  });

  app.get('/api/system/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    sseClients.add(res);
    const initial = { ...latestSnapshot, activeTelemetryClients: sseClients.size };
    res.write(`data: ${JSON.stringify(initial)}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.get('/api/system/security-scan', (_req, res) => {
    const snap = sampleSystem();
    latestSnapshot = snap;
    const checks: Array<{
      id: string;
      scope: 'host';
      category: string;
      title: string;
      status: 'passed' | 'warning' | 'critical';
      detail: string;
    }> = [];

    // 1. Node.js runtime & OpenSSL cryptography support
    const opensslVer = process.versions.openssl || 'unknown';
    checks.push({
      id: 'host-runtime-crypto',
      scope: 'host',
      category: 'Runtime Cryptography',
      title: 'Node.js & OpenSSL Runtime',
      status: opensslVer !== 'unknown' ? 'passed' : 'warning',
      detail: `Node ${snap.nodeVersion} with OpenSSL ${opensslVer} (${snap.arch})`,
    });

    // 2. Process privilege check (non-root vs root)
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    checks.push({
      id: 'host-process-privilege',
      scope: 'host',
      category: 'Process Isolation',
      title: 'Server Process Privilege',
      status: uid === 0 ? 'warning' : 'passed',
      detail:
        uid === null
          ? `Running as PID ${snap.pid} on ${snap.platform}`
          : uid === 0
            ? `Process PID ${snap.pid} is running with UID 0 (root)`
            : `Process PID ${snap.pid} running unprivileged (UID ${uid})`,
    });

    // 3. Memory & V8 heap headroom
    const heapPct =
      snap.memory.process.heapLimitBytes > 0
        ? (snap.memory.process.heapUsedBytes / snap.memory.process.heapLimitBytes) * 100
        : 0;
    const memMaxPct = Math.max(snap.memory.usedPercent, heapPct);
    checks.push({
      id: 'host-memory-headroom',
      scope: 'host',
      category: 'Resource Exhaustion Guard',
      title: 'Host RAM & V8 Heap Headroom',
      status: memMaxPct >= 92 ? 'critical' : memMaxPct >= 80 ? 'warning' : 'passed',
      detail: `Host RAM ${snap.memory.usedPercent.toFixed(1)}% used · V8 heap ${heapPct.toFixed(1)}% of limit`,
    });

    // 4. Event loop responsiveness
    const p99 = snap.runtime.eventLoopP99Ms;
    checks.push({
      id: 'host-event-loop',
      scope: 'host',
      category: 'Availability & DoS Guard',
      title: 'Event Loop Responsiveness',
      status: p99 >= 120 ? 'critical' : p99 >= 45 ? 'warning' : 'passed',
      detail: `Event loop p99 delay ${p99.toFixed(2)} ms (mean ${snap.runtime.eventLoopMeanMs.toFixed(2)} ms)`,
    });

    // 5. Root filesystem headroom
    if (snap.disk) {
      checks.push({
        id: 'host-disk-headroom',
        scope: 'host',
        category: 'Storage Integrity',
        title: 'Root Filesystem Capacity',
        status: snap.disk.usedPercent >= 90 ? 'critical' : snap.disk.usedPercent >= 78 ? 'warning' : 'passed',
        detail: `${snap.disk.mount} at ${snap.disk.usedPercent.toFixed(1)}% capacity`,
      });
    }

    // 6. Build & environment file exposure hygiene
    const distDir = path.resolve(__dirname, 'dist');
    const leakedEnvInDist =
      fs.existsSync(path.join(distDir, '.env')) ||
      fs.existsSync(path.join(distDir, '.env.local'));
    const serverSecretIsolated = !leakedEnvInDist;
    checks.push({
      id: 'host-env-hygiene',
      scope: 'host',
      category: 'Credential Hygiene',
      title: 'Environment & Build Bundle Isolation',
      status: serverSecretIsolated ? 'passed' : 'critical',
      detail: serverSecretIsolated
        ? 'No .env files detected inside static dist output'
        : 'Detected .env artifact inside dist output directory',
    });

    // 7. Network binding & active telemetry listeners
    const externalIfaces = snap.networkInterfaces.filter((i) => !i.internal);
    const loopbackIfaces = snap.networkInterfaces.filter((i) => i.internal);
    checks.push({
      id: 'host-network-surface',
      scope: 'host',
      category: 'Network Surface',
      title: 'Host Interface & Telemetry Listeners',
      status: 'passed',
      detail: `${externalIfaces.length} non-loopback, ${loopbackIfaces.length} loopback interfaces · ${snap.activeTelemetryClients} SSE ${snap.activeTelemetryClients === 1 ? 'stream' : 'streams'}`,
    });

    res.json({
      scannedAt: Date.now(),
      hostname: snap.hostname,
      platform: snap.platform,
      arch: snap.arch,
      nodeVersion: snap.nodeVersion,
      opensslVersion: opensslVer,
      checks,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cadence server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
