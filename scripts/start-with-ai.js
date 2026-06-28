const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');

const mode = process.argv[2] || 'dev';
const extraArgs = process.argv.slice(3);
const nextCli = path.join(
  process.cwd(),
  'node_modules',
  'next',
  'dist',
  'bin',
  'next'
);
const networkName = process.env.HRIS_NETWORK_NAME || 'HRIS';
const defaultPort = process.env.PORT || '3000';

function requestJson(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

function getArgValue(args, names, fallback) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    for (const name of names) {
      if (arg === name && args[index + 1]) return args[index + 1];
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    }
  }
  return fallback;
}

function hasArg(args, names) {
  return args.some((arg) => names.some((name) => arg === name || arg.startsWith(`${name}=`)));
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((address) => address && address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

function printAccessUrls(nextArgs) {
  const port = getArgValue(nextArgs, ['-p', '--port'], defaultPort);
  const host = getArgValue(nextArgs, ['-H', '--hostname', '--host'], 'localhost');
  const protocol = process.env.HRIS_PUBLIC_SCHEME || 'http';
  const hostName = os.hostname();
  const lanAddresses = getLanAddresses();

  console.log('');
  console.log(`[HRIS] This computer: ${protocol}://localhost:${port}`);
  console.log(`[HRIS] Friendly network URL: ${protocol}://${networkName}:${port}`);
  if (hostName && hostName.toLowerCase() !== networkName.toLowerCase()) {
    console.log(`[HRIS] Computer-name URL: ${protocol}://${hostName}:${port}`);
  }
  for (const address of lanAddresses) {
    const label = protocol === 'https'
      ? 'IP fallback for network testing'
      : 'IP fallback';
    console.log(`[HRIS] ${label}: ${protocol}://${address}:${port}`);
  }
  if (!['0.0.0.0', '::', '*'].includes(host)) {
    console.log(`[HRIS] Tip: use -H 0.0.0.0 to let phones and tablets connect on the same network.`);
  }
  console.log('');
}

function getPortValue(args, fallback) {
  const parsed = Number.parseInt(getArgValue(args, ['-p', '--port'], fallback), 10);
  return Number.isFinite(parsed) ? parsed : Number.parseInt(fallback, 10);
}

async function startOllama() {
  const isRunning = await requestJson('http://localhost:11434/api/tags');
  if (isRunning) {
    console.log('[HRIS-AI] Ollama is already running');
    return;
  }

  try {
    const ollama = spawn('ollama', ['serve'], {
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    });

    ollama.on('error', () => {
      console.warn('[HRIS-AI] Ollama is not installed or not on PATH. The assistant will use offline fallback until Ollama is available.');
    });
    ollama.unref();

    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (await requestJson('http://localhost:11434/api/tags')) {
        console.log('[HRIS-AI] Ollama started automatically');
        return;
      }
    }

    console.warn('[HRIS-AI] Ollama start was requested, but it is not ready yet.');
  } catch {
    console.warn('[HRIS-AI] Ollama could not be started. The assistant will use offline fallback.');
  }
}

function startNext() {
  const nextArgs = mode === 'start'
    ? ['start', ...extraArgs]
    : ['dev', '--turbopack', ...extraArgs];

  if (!hasArg(nextArgs, ['-H', '--hostname', '--host']) && process.env.HRIS_BIND_ALL === '1') {
    nextArgs.push('-H', '0.0.0.0');
  }
  if (!hasArg(nextArgs, ['-p', '--port']) && process.env.PORT) {
    nextArgs.push('-p', process.env.PORT);
  }

  printAccessUrls(nextArgs);

  const child = spawn(process.execPath, [nextCli, ...nextArgs], {
    stdio: 'inherit',
    windowsHide: false,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function startStandalone() {
  const serverPath = path.join(process.cwd(), 'server.js');
  if (!fs.existsSync(serverPath)) {
    console.error(`[HRIS] Standalone server was not found: ${serverPath}`);
    console.error('[HRIS] Rebuild the package with npm run package:windows.');
    process.exit(1);
  }

  const port = getArgValue(extraArgs, ['-p', '--port'], process.env.PORT || defaultPort);
  const hostFallback = process.env.HRIS_BIND_ALL === '1'
    ? '0.0.0.0'
    : (process.env.HOSTNAME || 'localhost');
  const host = getArgValue(extraArgs, ['-H', '--hostname', '--host'], hostFallback);
  const displayArgs = [...extraArgs];
  if (!hasArg(displayArgs, ['-p', '--port'])) displayArgs.push('-p', port);
  if (!hasArg(displayArgs, ['-H', '--hostname', '--host'])) displayArgs.push('-H', host);

  printAccessUrls(displayArgs);

  const child = spawn(process.execPath, [serverPath], {
    stdio: 'inherit',
    windowsHide: false,
    env: {
      ...process.env,
      PORT: port,
      HOSTNAME: host,
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function getCertificateOptions() {
  const certDir = path.join(process.cwd(), 'certificates');
  const pfxPath = process.env.HRIS_HTTPS_PFX || path.join(certDir, 'hris-server.pfx');
  const passphrasePath = process.env.HRIS_HTTPS_PASSPHRASE_FILE || path.join(certDir, 'passphrase.txt');
  const passphrase = process.env.HRIS_HTTPS_PASSPHRASE
    || (fs.existsSync(passphrasePath) ? fs.readFileSync(passphrasePath, 'utf8').trim() : '');

  if (!fs.existsSync(pfxPath)) {
    throw new Error(`HTTPS certificate was not found: ${pfxPath}`);
  }

  return {
    pfx: fs.readFileSync(pfxPath),
    passphrase,
  };
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function certificateMetadataMatches(metadataPath, dnsNames, ipAddresses) {
  if (!fs.existsSync(metadataPath)) return false;

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return dnsNames.every((name) => metadata.dnsNames?.includes(name))
      && ipAddresses.every((address) => metadata.ipAddresses?.includes(address));
  } catch {
    return false;
  }
}

function ensureHttpsCertificate() {
  if (process.platform !== 'win32') return;

  const certDir = path.join(process.cwd(), 'certificates');
  const pfxPath = process.env.HRIS_HTTPS_PFX || path.join(certDir, 'hris-server.pfx');
  const cerPath = path.join(certDir, 'hris-camera-certificate.cer');
  const passphrasePath = process.env.HRIS_HTTPS_PASSPHRASE_FILE || path.join(certDir, 'passphrase.txt');
  const metadataPath = path.join(certDir, 'generated-for.json');
  const dnsNames = Array.from(new Set([networkName, 'localhost', os.hostname()].filter(Boolean)));
  const ipAddresses = Array.from(new Set(['127.0.0.1', ...getLanAddresses()]));

  if (
    fs.existsSync(pfxPath)
    && fs.existsSync(cerPath)
    && fs.existsSync(passphrasePath)
    && certificateMetadataMatches(metadataPath, dnsNames, ipAddresses)
  ) {
    return;
  }

  const passphrase = crypto.randomBytes(24).toString('hex');
  const san = [
    ...dnsNames.map((name) => `DNS=${name}`),
    ...ipAddresses.map((address) => `IPAddress=${address}`),
  ].join('&');
  const script = `
$ErrorActionPreference = 'Stop'
$certDir = $env:HRIS_CERT_DIR
$pfxPath = $env:HRIS_CERT_PFX
$cerPath = $env:HRIS_CERT_CER
$pass = ConvertTo-SecureString -String $env:HRIS_CERT_PASSWORD -Force -AsPlainText
$san = '2.5.29.17={text}' + $env:HRIS_CERT_SAN
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
$cert = New-SelfSignedCertificate -Subject ('CN=' + $env:HRIS_CERT_NAME) -TextExtension @($san) -CertStoreLocation 'Cert:\\CurrentUser\\My' -KeyExportPolicy Exportable -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(5) -FriendlyName 'HRIS Camera HTTPS'
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pass | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Remove-Item -Path ('Cert:\\CurrentUser\\My\\' + $cert.Thumbprint) -Force
`;

  console.log('[HRIS] Preparing HTTPS camera certificate for this computer...');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      HRIS_CERT_DIR: certDir,
      HRIS_CERT_PFX: pfxPath,
      HRIS_CERT_CER: cerPath,
      HRIS_CERT_PASSWORD: passphrase,
      HRIS_CERT_SAN: san,
      HRIS_CERT_NAME: networkName,
    },
  });

  if (result.error || result.status !== 0) {
    throw new Error('Could not generate the HRIS HTTPS certificate.');
  }

  writeText(passphrasePath, passphrase);
  writeText(metadataPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    dnsNames,
    ipAddresses,
  }, null, 2));
  writeText(path.join(certDir, 'README-CAMERA-CERTIFICATE.txt'), `HRIS Camera Certificate

Install hris-camera-certificate.cer on the iPhone/iPad, then enable full trust:
Settings > General > About > Certificate Trust Settings.

This certificate was generated for:
- DNS names: ${dnsNames.join(', ')}
- IP addresses: ${ipAddresses.join(', ')}
`);
}

function startCertificateDownloadServer(certPort, publicPort) {
  const certPath = path.join(process.cwd(), 'certificates', 'hris-camera-certificate.cer');
  if (!fs.existsSync(certPath)) return;

  const lanAddresses = getLanAddresses();
  const certFileName = 'hris-camera-certificate.cer';
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (requestUrl.pathname === `/${certFileName}` || requestUrl.pathname === '/certificate') {
      response.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': `attachment; filename="${certFileName}"`,
      });
      fs.createReadStream(certPath).pipe(response);
      return;
    }

    const certLinks = lanAddresses
      .map((address) => `<li><a href="http://${address}:${certPort}/${certFileName}">http://${address}:${certPort}/${certFileName}</a></li>`)
      .join('');
    const appLinks = lanAddresses
      .map((address) => `<li>https://${address}:${publicPort}</li>`)
      .join('');

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html>
  <head><meta name="viewport" content="width=device-width, initial-scale=1"><title>HRIS Camera Certificate</title></head>
  <body style="font-family: system-ui, sans-serif; line-height: 1.45; padding: 24px; max-width: 760px;">
    <h1>HRIS Camera Certificate</h1>
    <p>Install and fully trust this certificate on iPhone/iPad so Safari can use the camera on HRIS HTTPS.</p>
    <p><a href="/${certFileName}" style="font-size: 18px;">Download HRIS camera certificate</a></p>
    <ol>
      <li>Download the certificate.</li>
      <li>Open Settings, then install the downloaded profile.</li>
      <li>Open Settings &gt; General &gt; About &gt; Certificate Trust Settings.</li>
      <li>Enable full trust for the HRIS certificate.</li>
      <li>Open HRIS with HTTPS.</li>
    </ol>
    <h2>Certificate download URLs</h2>
    <ul>${certLinks}</ul>
    <h2>HRIS HTTPS URLs</h2>
    <ul><li>https://${networkName}:${publicPort}</li>${appLinks}</ul>
  </body>
</html>`);
  });

  server.on('error', (error) => {
    console.warn(`[HRIS] Certificate helper could not start on port ${certPort}: ${error.message}`);
  });
  server.listen(certPort, '0.0.0.0', () => {
    console.log(`[HRIS] Certificate helper: http://localhost:${certPort}`);
    for (const address of lanAddresses) {
      console.log(`[HRIS] Certificate helper: http://${address}:${certPort}`);
    }
    console.log('');
  });
}

function startHttpsProxy(publicPort, internalPort) {
  const certificateOptions = getCertificateOptions();
  const server = https.createServer(certificateOptions, (clientRequest, clientResponse) => {
    const upstreamRequest = http.request({
      hostname: '127.0.0.1',
      port: internalPort,
      method: clientRequest.method,
      path: clientRequest.url,
      headers: {
        ...clientRequest.headers,
        host: clientRequest.headers.host,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': clientRequest.headers.host || `${networkName}:${publicPort}`,
      },
    }, (upstreamResponse) => {
      clientResponse.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(clientResponse);
    });

    upstreamRequest.on('error', () => {
      clientResponse.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      clientResponse.end('HRIS is still starting. Refresh in a moment.');
    });

    clientRequest.pipe(upstreamRequest);
  });

  server.on('error', (error) => {
    console.error(`[HRIS] HTTPS server could not start on port ${publicPort}: ${error.message}`);
    process.exit(1);
  });

  server.listen(publicPort, '0.0.0.0', () => {
    console.log(`[HRIS] HTTPS camera-safe server is ready on port ${publicPort}.`);
  });
}

function startSecureStandalone() {
  const serverPath = path.join(process.cwd(), 'server.js');
  if (!fs.existsSync(serverPath)) {
    console.error(`[HRIS] Standalone server was not found: ${serverPath}`);
    console.error('[HRIS] Rebuild the package with npm run package:windows.');
    process.exit(1);
  }

  const publicPort = getPortValue(extraArgs, process.env.PORT || defaultPort);
  const internalPort = Number.parseInt(process.env.HRIS_INTERNAL_PORT || String(publicPort + 1), 10);
  const certPort = Number.parseInt(process.env.HRIS_CERT_PORT || String(publicPort > 1000 ? publicPort - 1 : publicPort + 1), 10);
  const displayArgs = [...extraArgs];
  if (!hasArg(displayArgs, ['-p', '--port'])) displayArgs.push('-p', String(publicPort));
  if (!hasArg(displayArgs, ['-H', '--hostname', '--host'])) displayArgs.push('-H', '0.0.0.0');

  process.env.HRIS_PUBLIC_SCHEME = 'https';
  printAccessUrls(displayArgs);

  console.log(`[HRIS] Camera certificate download helper will use http://<server-ip>:${certPort}`);
  console.log('[HRIS] On iPhone: install the certificate, enable full trust, then open the HTTPS HRIS URL.');
  console.log('');

  ensureHttpsCertificate();

  const child = spawn(process.execPath, [serverPath], {
    stdio: 'inherit',
    windowsHide: false,
    env: {
      ...process.env,
      PORT: String(internalPort),
      HOSTNAME: '127.0.0.1',
      APP_BASE_URL: `https://${networkName}:${publicPort}`,
      NEXT_PUBLIC_APP_BASE_URL: `https://${networkName}:${publicPort}`,
      HRIS_PUBLIC_SCHEME: 'https',
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  startCertificateDownloadServer(certPort, publicPort);
  startHttpsProxy(publicPort, internalPort);
}

function startServer() {
  if (mode === 'secure-standalone') {
    startSecureStandalone();
    return;
  }

  if (mode === 'standalone') {
    startStandalone();
    return;
  }

  startNext();
}

startOllama().finally(startServer);
