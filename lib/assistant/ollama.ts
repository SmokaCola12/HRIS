import { spawn, type ChildProcess } from 'child_process';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5:3b';

let ollamaProcess: ChildProcess | null = null;
let lastStartAttempt = 0;

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL;
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || DEFAULT_MODEL;

function ollamaUrl(path: string) {
  return `${OLLAMA_BASE_URL.replace(/\/$/, '')}${path}`;
}

export async function isOllamaRunning(timeoutMs = 1500) {
  try {
    const response = await fetch(ollamaUrl('/api/tags'), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function listOllamaModels(timeoutMs = 2500): Promise<string[]> {
  try {
    const response = await fetch(ollamaUrl('/api/tags'), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return [];
    const data = await response.json() as { models?: Array<{ name?: string }> };
    return (data.models || [])
      .map((model) => model.name)
      .filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

export async function ensureOllamaRunning() {
  if (await isOllamaRunning()) {
    return { running: true, started: false, reason: null as string | null };
  }

  const now = Date.now();
  if (now - lastStartAttempt < 5000) {
    return { running: false, started: false, reason: 'Ollama is still starting.' };
  }

  lastStartAttempt = now;

  try {
    ollamaProcess = spawn('ollama', ['serve'], {
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    });

    ollamaProcess.on('exit', () => {
      ollamaProcess = null;
    });

    ollamaProcess.unref();
  } catch (error) {
    return {
      running: false,
      started: false,
      reason: error instanceof Error ? error.message : 'Unable to start Ollama.',
    };
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await isOllamaRunning()) {
      return { running: true, started: true, reason: null as string | null };
    }
  }

  return {
    running: false,
    started: true,
    reason: 'Ollama was started, but it is not ready yet.',
  };
}

export async function getOllamaStatus() {
  const service = await ensureOllamaRunning();
  const models = service.running ? await listOllamaModels() : [];
  const hasModel = models.some((model) => model === OLLAMA_MODEL || model.startsWith(`${OLLAMA_MODEL}:`));

  return {
    provider: 'ollama' as const,
    baseUrl: OLLAMA_BASE_URL,
    model: OLLAMA_MODEL,
    running: service.running,
    started: service.started,
    hasModel,
    models,
    reason: service.reason,
  };
}
