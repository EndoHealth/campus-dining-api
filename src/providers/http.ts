const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_ATTEMPTS = 3;

export async function fetchJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const text = await fetchText(url, timeoutMs);

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Invalid JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DEFAULT_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'user-agent':
            'campus-dining-api/0.1 (+https://github.com/endo-ai/campus-dining-api)',
        },
      });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} fetching ${url}`);
        if (!isRetryableStatus(response.status) || attempt === DEFAULT_ATTEMPTS) {
          throw error;
        }

        lastError = error;
        await delay(backoffMs(attempt));
        continue;
      }

      return response.text();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === DEFAULT_ATTEMPTS) {
        throw error;
      }

      await delay(backoffMs(attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('aborted') ||
    message.includes('fetch failed') ||
    message.includes('socket') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('etimedout')
  );
}

function backoffMs(attempt: number) {
  return 750 * attempt;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
