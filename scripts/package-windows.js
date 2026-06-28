const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const launcherSourceDir = path.join(distDir, 'hris-launcher-src');
const port = process.env.HRIS_PORT || '3001';
const networkName = process.env.HRIS_NETWORK_NAME || 'HRIS';
const skipBuild = process.argv.includes('--skip-build');
const freshInstall = process.argv.includes('--fresh-install');
const fullCopy = process.argv.includes('--full-copy');
const noExe = process.argv.includes('--no-exe');
const noNode = process.argv.includes('--no-node');
const updatePackage = process.argv.includes('--update-package');
const packageDir = path.join(distDir, updatePackage ? 'HRIS-Windows-Update' : 'HRIS-Windows');

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((address) => address && address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

function run(command, args, options = {}) {
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: options.stdio || 'inherit',
    shell: needsShell,
    windowsHide: true,
    env: { ...process.env, ...options.env },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return result;
}

function tryRun(command, args, options = {}) {
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: options.stdio || 'pipe',
    shell: needsShell,
    windowsHide: true,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
  return result;
}

function assertInside(parent, child) {
  const parentResolved = path.resolve(parent);
  const childResolved = path.resolve(child);
  const relative = path.relative(parentResolved, childResolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside ${parentResolved}: ${childResolved}`);
  }
}

function resetDirectory(targetDir) {
  assertInside(distDir, targetDir);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function shouldCopy(sourcePath) {
  const rel = path.relative(rootDir, sourcePath).replace(/\\/g, '/');
  if (!rel) return true;

  if (rel === '.next/cache' || rel.startsWith('.next/cache/')) return false;
  if (rel === '.next/dev' || rel.startsWith('.next/dev/')) return false;
  if (rel === '.next/node_modules' || rel.startsWith('.next/node_modules/')) return false;
  if (rel === 'node_modules/.cache' || rel.startsWith('node_modules/.cache/')) return false;
  if (rel.endsWith('.tsbuildinfo')) return false;

  return true;
}

function copyPath(source, destination) {
  if (!fs.existsSync(source)) return false;
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: shouldCopy,
  });
  return true;
}

function copyDirectoryResolvingLinks(source, destination) {
  if (!fs.existsSync(source)) return false;

  if (process.platform === 'win32') {
    fs.mkdirSync(destination, { recursive: true });
    const result = spawnSync('robocopy', [
      source,
      destination,
      '/E',
      '/NFL',
      '/NDL',
      '/NJH',
      '/NJS',
      '/NP',
      '/R:2',
      '/W:1',
      '/XD',
      '.cache',
    ], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status > 7) {
      throw new Error(`robocopy failed with exit code ${result.status}`);
    }
    return true;
  }

  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false,
    dereference: true,
    filter: shouldCopy,
  });
  return true;
}

function checkpointDatabase() {
  const dbFile = path.join(rootDir, 'database', 'hris_dev.sqlite');
  if (!fs.existsSync(dbFile)) return;

  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbFile);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    console.log('[package] SQLite WAL checkpoint completed.');
  } catch (error) {
    console.warn('[package] Could not checkpoint SQLite. Database files will still be copied as-is.');
    console.warn(`[package] ${error.message}`);
  }
}

function copyProjectFiles() {
  const entries = [
    '.next',
    'app',
    'components',
    'database',
    'hooks',
    'lib',
    'public',
    'scripts',
    'styles',
    'components.json',
    'next-env.d.ts',
    'next.config.mjs',
    'package-lock.json',
    'package.json',
    'postcss.config.mjs',
    'tsconfig.json',
  ];

  for (const entry of entries) {
    const source = path.join(rootDir, entry);
    const destination = path.join(packageDir, entry);
    if (copyPath(source, destination)) {
      console.log(`[package] Copied ${entry}`);
    }
  }
}

function copyStandaloneFiles() {
  const standaloneDir = path.join(rootDir, '.next', 'standalone');
  const standaloneServer = path.join(standaloneDir, 'server.js');
  if (!fs.existsSync(standaloneServer)) {
    throw new Error('Standalone build was not found. Run npm run package:windows without --skip-build first.');
  }

  copyDirectoryResolvingLinks(standaloneDir, packageDir);
  console.log('[package] Copied standalone server');

  copyPath(path.join(rootDir, '.next', 'static'), path.join(packageDir, '.next', 'static'));
  console.log('[package] Copied static assets');

  copyPath(path.join(rootDir, 'public'), path.join(packageDir, 'public'));
  console.log('[package] Copied public assets');

  copyPath(path.join(rootDir, 'database'), path.join(packageDir, 'database'));
  console.log('[package] Copied database');

  copyPath(path.join(rootDir, 'scripts', 'start-with-ai.js'), path.join(packageDir, 'scripts', 'start-with-ai.js'));
  console.log('[package] Copied launcher script');
}

function copyUpdateFiles() {
  const standaloneDir = path.join(rootDir, '.next', 'standalone');
  const standaloneServer = path.join(standaloneDir, 'server.js');
  if (!fs.existsSync(standaloneServer)) {
    throw new Error('Standalone build was not found. Run npm run package:windows -- --update-package without --skip-build first.');
  }

  copyDirectoryResolvingLinks(standaloneDir, packageDir);
  console.log('[package] Copied standalone server');

  copyPath(path.join(rootDir, '.next', 'static'), path.join(packageDir, '.next', 'static'));
  console.log('[package] Copied static assets');

  copyPath(path.join(rootDir, 'public'), path.join(packageDir, 'public'));
  console.log('[package] Copied public assets');

  copyPath(path.join(rootDir, 'scripts', 'start-with-ai.js'), path.join(packageDir, 'scripts', 'start-with-ai.js'));
  console.log('[package] Copied launcher script');

  for (const protectedEntry of ['database', 'certificates', 'runtime']) {
    const protectedPath = path.join(packageDir, protectedEntry);
    assertInside(packageDir, protectedPath);
    fs.rmSync(protectedPath, { recursive: true, force: true });
  }
}

function installProductionDependencies() {
  console.log('[package] Installing production dependencies in portable folder...');
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'ci',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
  ], { cwd: packageDir });
}

function copyInstalledDependencies() {
  const source = path.join(rootDir, 'node_modules');
  const destination = path.join(packageDir, 'node_modules');

  if (!fs.existsSync(source)) {
    console.warn('[package] Source node_modules was not found. Falling back to npm ci.');
    installProductionDependencies();
    return;
  }

  console.log('[package] Copying installed dependencies...');
  fs.rmSync(destination, { recursive: true, force: true });

  if (process.platform === 'win32') {
    fs.mkdirSync(destination, { recursive: true });
    const result = spawnSync('robocopy', [
      source,
      destination,
      '/E',
      '/NFL',
      '/NDL',
      '/NJH',
      '/NJS',
      '/NP',
      '/R:2',
      '/W:1',
      '/XD',
      '.cache',
    ], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status > 7) {
      throw new Error(`robocopy failed with exit code ${result.status}`);
    }
    return;
  }

  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false,
    dereference: true,
    filter: shouldCopy,
  });
}

function prepareDependencies() {
  if (freshInstall) {
    installProductionDependencies();
    return;
  }

  copyInstalledDependencies();
}

function copyNodeRuntime() {
  if (noNode) return;

  const runtimeDir = path.join(packageDir, 'runtime', 'node');
  fs.mkdirSync(runtimeDir, { recursive: true });

  const nodeDir = path.dirname(process.execPath);
  const files = fs.readdirSync(nodeDir);
  for (const file of files) {
    const source = path.join(nodeDir, file);
    const stats = fs.statSync(source);
    const lower = file.toLowerCase();
    if (!stats.isFile()) continue;
    if (lower === 'node.exe' || lower.endsWith('.dll')) {
      fs.copyFileSync(source, path.join(runtimeDir, file));
    }
  }

  console.log('[package] Bundled Node runtime.');
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.replace(/\n/g, os.EOL), 'utf8');
}

function generateHttpsCertificate() {
  if (process.platform !== 'win32') {
    console.warn('[package] HTTPS certificate generation is currently Windows-only.');
    return;
  }

  const certDir = path.join(packageDir, 'certificates');
  const pfxPath = path.join(certDir, 'hris-server.pfx');
  const cerPath = path.join(certDir, 'hris-camera-certificate.cer');
  const passphrase = crypto.randomBytes(24).toString('hex');
  const dnsNames = Array.from(new Set([networkName, 'localhost', os.hostname()].filter(Boolean)));
  const ipAddresses = Array.from(new Set(['127.0.0.1', ...getLanAddresses()]));
  const san = [
    ...dnsNames.map((name) => `DNS=${name}`),
    ...ipAddresses.map((address) => `IPAddress=${address}`),
  ].join('&');

  fs.mkdirSync(certDir, { recursive: true });
  writeText(path.join(certDir, 'passphrase.txt'), passphrase);
  writeText(path.join(certDir, 'README-CAMERA-CERTIFICATE.txt'), `HRIS Camera Certificate

The iPhone camera scanner needs HTTPS.

Install hris-camera-certificate.cer on the iPhone/iPad, then enable full trust:
Settings > General > About > Certificate Trust Settings.

This certificate was generated for:
- DNS names: ${dnsNames.join(', ')}
- IP addresses: ${ipAddresses.join(', ')}

After trusting it, open:
https://${networkName}:${port}
`);

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

  try {
    run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      env: {
        HRIS_CERT_DIR: certDir,
        HRIS_CERT_PFX: pfxPath,
        HRIS_CERT_CER: cerPath,
        HRIS_CERT_PASSWORD: passphrase,
        HRIS_CERT_SAN: san,
        HRIS_CERT_NAME: networkName,
      },
    });
    console.log('[package] Generated HTTPS camera certificate.');
  } catch (error) {
    console.warn('[package] Could not generate HTTPS camera certificate.');
    console.warn(`[package] ${error.message}`);
  }
}

function writeLaunchers() {
  const certPort = Number.parseInt(port, 10) > 1000 ? String(Number.parseInt(port, 10) - 1) : String(Number.parseInt(port, 10) + 1);
  const cmd = `@echo off
setlocal
title HRIS Server
cd /d "%~dp0"

set "PORT=${port}"
set "HRIS_PORT=${port}"
set "HRIS_NETWORK_NAME=${networkName}"
set "HRIS_BIND_ALL=1"
set "HRIS_PUBLIC_SCHEME=https"
set "HRIS_CERT_PORT=${certPort}"
set "APP_BASE_URL=https://${networkName}:%PORT%"
set "NEXT_PUBLIC_APP_BASE_URL=https://${networkName}:%PORT%"
set "OLLAMA_MODEL=qwen2.5:3b"

echo Starting HRIS...
echo.
echo Camera-safe HTTPS URL for phones/tablets:
echo   https://${networkName}:%PORT%
echo.
echo Certificate helper, if iPhone says the certificate is not trusted:
echo   http://SERVER-IP:${certPort}
echo.

set "NODE_EXE=%~dp0runtime\\node\\node.exe"
  if exist "%NODE_EXE%" (
  "%NODE_EXE%" "scripts\\start-with-ai.js" secure-standalone -H 0.0.0.0 -p %PORT%
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js was not found and the bundled Node runtime is missing.
    echo Please copy the full HRIS-Windows folder again.
    pause
    exit /b 1
  )
  node "scripts\\start-with-ai.js" secure-standalone -H 0.0.0.0 -p %PORT%
)

echo.
echo HRIS stopped.
pause
`;

  const shortcut = `@echo off
setlocal
set "TARGET=%~dp0HRIS Server.exe"
if not exist "%TARGET%" set "TARGET=%~dp0HRIS Server.cmd"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop'); $shortcut=Join-Path $desktop 'HRIS Server.lnk'; $shell=New-Object -ComObject WScript.Shell; $link=$shell.CreateShortcut($shortcut); $link.TargetPath=$env:TARGET; $link.WorkingDirectory='%~dp0'; $link.IconLocation=$env:TARGET; $link.Save(); Write-Host 'Created desktop shortcut:' $shortcut"
pause
`;

  const trustWindowsCertificate = `@echo off
setlocal
title Trust HRIS Certificate
cd /d "%~dp0"

set "CERT=%~dp0certificates\\hris-camera-certificate.cer"
if not exist "%CERT%" (
  echo HRIS certificate was not found.
  echo Start HRIS Server.exe once first so the certificate can be generated.
  pause
  exit /b 1
)

echo This will add the HRIS camera certificate to this Windows user's trusted root certificates.
echo Use this only on computers that should trust this HRIS server.
echo.
certutil -user -addstore Root "%CERT%"
if errorlevel 1 (
  echo.
  echo Certificate install failed.
  pause
  exit /b 1
)

echo.
echo Done. Close and reopen your browser, then use:
echo   https://${networkName}:${port}
echo.
pause
`;

  const localUrl = `[InternetShortcut]
URL=https://localhost:${port}
`;

  const networkUrl = `[InternetShortcut]
URL=https://${networkName}:${port}
`;

  const certUrl = `[InternetShortcut]
URL=http://localhost:${certPort}
`;

  writeText(path.join(packageDir, 'HRIS Server.cmd'), cmd);
  writeText(path.join(packageDir, 'Create Desktop Shortcut.cmd'), shortcut);
  writeText(path.join(packageDir, 'Trust HRIS Certificate on this Windows PC.cmd'), trustWindowsCertificate);
  writeText(path.join(packageDir, 'Open HRIS on this computer.url'), localUrl);
  writeText(path.join(packageDir, 'Open HRIS network URL.url'), networkUrl);
  writeText(path.join(packageDir, 'Open HRIS certificate helper.url'), certUrl);
}

function writeReadme() {
  const secret = crypto.randomBytes(32).toString('hex');
  const certPort = Number.parseInt(port, 10) > 1000 ? String(Number.parseInt(port, 10) - 1) : String(Number.parseInt(port, 10) + 1);
  const readme = `HRIS Windows Portable Package

How to run
1. Copy this whole HRIS-Windows folder to the server computer.
2. Double-click HRIS Server.exe. If the exe is not present, double-click HRIS Server.cmd.
3. Keep that window open while people are using HRIS.

URLs
- On the server computer: https://localhost:${port}
- Camera-safe friendly network URL: https://${networkName}:${port}
- Use the IP printed in the launcher window to confirm network access or download the certificate helper.
- For iPhone camera scanning, prefer https://${networkName}:${port} because the certificate is issued for ${networkName}.

Windows/Chrome certificate setup
- If Chrome or Edge says "Not secure", close the browser tab.
- In this folder, run "Trust HRIS Certificate on this Windows PC.cmd".
- Reopen the browser and use https://${networkName}:${port}.
- If the IP printed by the launcher changes, restart HRIS Server.exe so the certificate can regenerate for the new IP.

iPhone/iPad camera setup
- iPhone blocks camera access on ordinary http pages.
- The launcher prepares an HRIS HTTPS certificate for the current server computer.
- Use HTTPS for QR scanning: https://${networkName}:${port}
- If iPhone says the HRIS certificate is not trusted, open the certificate helper printed in the launcher window, for example http://192.168.1.10:${certPort}
- Download hris-camera-certificate.cer.
- Install the downloaded profile in Settings.
- Then open Settings > General > About > Certificate Trust Settings and enable full trust for the HRIS certificate.
- Reopen HRIS with HTTPS and allow camera access.

Important network notes
- Phones, tablets, and other computers must be on the same Wi-Fi or LAN.
- Allow Node.js/HRIS through Windows Firewall if Windows asks.
- The friendly name https://${networkName}:${port} works when the network can resolve ${networkName}. For the most reliable setup, rename the server computer to ${networkName} or add ${networkName} to your router/DNS.

Data
- The HRIS data lives in database\\hris_dev.sqlite inside this folder.
- Back up the database folder regularly.

AI assistant
- If Ollama and qwen2.5:3b are installed on the server computer, HRIS will start/use Ollama automatically.
- Without Ollama, the assistant still answers built-in HRIS data questions, but full local AI chat needs Ollama and the model installed once before offline use.

Generated package secret
- Suggested JWT_SECRET for this deployment:
  ${secret}
`;

  writeText(path.join(packageDir, 'README-FIRST.txt'), readme);
}

function writeUpdatePackageFiles() {
  const updateCmd = `@echo off
setlocal EnableExtensions
title Update Existing HRIS
cd /d "%~dp0"

set "DEFAULT_TARGET=%~dp0..\\HRIS-Windows"
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=%DEFAULT_TARGET%"

if not exist "%TARGET%" (
  echo Target HRIS folder was not found:
  echo   %TARGET%
  echo.
  echo Drag this update folder next to HRIS-Windows or run:
  echo   Update Existing HRIS.cmd "C:\\Path\\To\\HRIS-Windows"
  pause
  exit /b 1
)

if not exist "%TARGET%\\database" (
  echo Target does not look like an HRIS deployment because database\\ was not found:
  echo   %TARGET%
  pause
  exit /b 1
)

for /f "tokens=1-4 delims=/ " %%a in ("%date%") do set "DATEPART=%%d%%b%%c"
for /f "tokens=1-3 delims=:." %%a in ("%time%") do set "TIMEPART=%%a%%b%%c"
set "TIMEPART=%TIMEPART: =0%"
set "BACKUP=%TARGET%\\database-backups\\before-update-%DATEPART%-%TIMEPART%"

echo Backing up database to:
echo   %BACKUP%
robocopy "%TARGET%\\database" "%BACKUP%\\database" /E /R:2 /W:1 >nul
if errorlevel 8 (
  echo Database backup failed. Update stopped.
  pause
  exit /b 1
)

echo Updating app files...
if exist ".next" robocopy ".next" "%TARGET%\\.next" /MIR /R:2 /W:1
if errorlevel 8 goto copy_failed
if exist "public" robocopy "public" "%TARGET%\\public" /MIR /R:2 /W:1
if errorlevel 8 goto copy_failed
if exist "scripts" robocopy "scripts" "%TARGET%\\scripts" /MIR /R:2 /W:1
if errorlevel 8 goto copy_failed
if exist "node_modules" robocopy "node_modules" "%TARGET%\\node_modules" /MIR /R:2 /W:1
if errorlevel 8 goto copy_failed

for %%f in (server.js package.json package-lock.json next.config.mjs) do (
  if exist "%%f" copy /Y "%%f" "%TARGET%\\%%f" >nul
)

echo.
echo Update complete.
echo Preserved target database, certificates, runtime, and launcher files.
pause
exit /b 0

:copy_failed
echo.
echo File copy failed. Your database backup remains at:
echo   %BACKUP%
pause
exit /b 1
`;

  const readme = `HRIS Windows Update Package

Use this package to update an existing HRIS-Windows deployment without replacing live data.

What it updates
- App build files
- Static assets
- Startup script
- Bundled production node_modules from the standalone build

What it preserves
- database\\hris_dev.sqlite and all database sidecar files
- certificates\\
- runtime\\
- existing launcher files and local machine settings

How to apply
1. Stop HRIS on the deployed computer.
2. Copy this HRIS-Windows-Update folder next to the existing HRIS-Windows folder.
3. Double-click "Update Existing HRIS.cmd".
4. Start HRIS again.

The updater backs up the target database folder before copying app files.
`;

  writeText(path.join(packageDir, 'Update Existing HRIS.cmd'), updateCmd);
  writeText(path.join(packageDir, 'README-UPDATE.txt'), readme);
}

function getDotnetMajor() {
  const result = tryRun('dotnet', ['--version']);
  if (result.status !== 0 || !result.stdout) return null;
  const major = Number.parseInt(result.stdout.trim().split('.')[0], 10);
  return Number.isFinite(major) ? major : null;
}

function writeLauncherSource(targetFramework) {
  resetDirectory(launcherSourceDir);
  const project = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>${targetFramework}</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>HRIS Server</AssemblyName>
    <PublishSingleFile>true</PublishSingleFile>
    <SelfContained>true</SelfContained>
  </PropertyGroup>
</Project>
`;

  const program = `using System;
using System.Diagnostics;
using System.IO;

Console.Title = "HRIS Server";

var baseDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
var port = Environment.GetEnvironmentVariable("HRIS_PORT");
if (string.IsNullOrWhiteSpace(port)) port = "${port}";

var networkName = Environment.GetEnvironmentVariable("HRIS_NETWORK_NAME");
if (string.IsNullOrWhiteSpace(networkName)) networkName = "${networkName}";

var nodePath = Path.Combine(baseDir, "runtime", "node", "node.exe");
if (!File.Exists(nodePath)) nodePath = "node";

var scriptPath = Path.Combine(baseDir, "scripts", "start-with-ai.js");
if (!File.Exists(scriptPath))
{
    Console.Error.WriteLine("Missing startup script: " + scriptPath);
    Console.Error.WriteLine("Copy the full HRIS-Windows folder again.");
    Console.ReadKey(true);
    return 1;
}

Console.WriteLine("Starting HRIS...");
Console.WriteLine();
Console.WriteLine("Server computer: https://localhost:" + port);
Console.WriteLine("Phone/tablet camera URL: https://" + networkName + ":" + port);
Console.WriteLine("If iPhone says the certificate is not trusted, use the certificate helper printed below.");
Console.WriteLine();

var startInfo = new ProcessStartInfo
{
    FileName = nodePath,
    Arguments = "\\\"" + scriptPath + "\\\" secure-standalone -H 0.0.0.0 -p " + port,
    WorkingDirectory = baseDir,
    UseShellExecute = false,
};

startInfo.Environment["PORT"] = port;
startInfo.Environment["HRIS_PORT"] = port;
startInfo.Environment["HRIS_NETWORK_NAME"] = networkName;
startInfo.Environment["HRIS_BIND_ALL"] = "1";
startInfo.Environment["HRIS_PUBLIC_SCHEME"] = "https";
startInfo.Environment["APP_BASE_URL"] = "https://" + networkName + ":" + port;
startInfo.Environment["NEXT_PUBLIC_APP_BASE_URL"] = "https://" + networkName + ":" + port;
startInfo.Environment["OLLAMA_MODEL"] = "qwen2.5:3b";

try
{
    using var process = Process.Start(startInfo);
    if (process == null)
    {
        Console.Error.WriteLine("Could not start HRIS.");
        Console.ReadKey(true);
        return 1;
    }

    process.WaitForExit();
    Console.WriteLine();
    Console.WriteLine("HRIS stopped. Press any key to close.");
    Console.ReadKey(true);
    return process.ExitCode;
}
catch (Exception error)
{
    Console.Error.WriteLine("Could not start HRIS:");
    Console.Error.WriteLine(error.Message);
    Console.ReadKey(true);
    return 1;
}
`;

  writeText(path.join(launcherSourceDir, 'HRISLauncher.csproj'), project);
  writeText(path.join(launcherSourceDir, 'Program.cs'), program);
}

function buildExeLauncher() {
  if (noExe) return;

  const major = getDotnetMajor();
  if (!major) {
    console.warn('[package] .NET SDK was not found. Skipping HRIS Server.exe.');
    return;
  }

  const targetFramework = `net${major}.0`;
  writeLauncherSource(targetFramework);

  try {
    run('dotnet', [
      'publish',
      launcherSourceDir,
      '-c',
      'Release',
      '-r',
      'win-x64',
      '--self-contained',
      'true',
      '-p:PublishSingleFile=true',
      '-p:EnableCompressionInSingleFile=true',
      '-o',
      packageDir,
    ]);
    console.log('[package] Built HRIS Server.exe');
  } catch (error) {
    console.warn('[package] Could not build HRIS Server.exe. The .cmd launcher is still ready.');
    console.warn(`[package] ${error.message}`);
  }
}

function main() {
  fs.mkdirSync(distDir, { recursive: true });

  if (!skipBuild) {
    console.log('[package] Building standalone production app...');
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      env: { HRIS_STANDALONE: '1' },
    });
  }

  checkpointDatabase();
  resetDirectory(packageDir);
  if (updatePackage) {
    copyUpdateFiles();
    writeUpdatePackageFiles();
  } else if (fullCopy) {
    copyProjectFiles();
    prepareDependencies();
  } else {
    copyStandaloneFiles();
  }

  if (updatePackage) {
    console.log('');
    console.log('[package] Done.');
    console.log(`[package] Update folder: ${packageDir}`);
    return;
  }
  copyNodeRuntime();
  generateHttpsCertificate();
  writeLaunchers();
  writeReadme();
  buildExeLauncher();

  console.log('');
  console.log('[package] Done.');
  console.log(`[package] Portable folder: ${packageDir}`);
  console.log(`[package] Start URL: https://${networkName}:${port}`);
}

main();
