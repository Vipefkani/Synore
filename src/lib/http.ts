export async function fetchJson<T = unknown>(
  url: string,
  options: RequestInit = {},
  retries = 2
): Promise<T> {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    lastStatus = res.status;
    const rawText = await res.text();

    let parsed: Record<string, unknown> | null = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    // Retry on transient proxy/gateway responses (e.g. non-JSON "The page c..." or 502/503/504)
    const isTransientGateway =
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504 ||
      (parsed === null && rawText.trim().length > 0 && !res.ok);

    if (isTransientGateway && attempt < retries) {
      await new Promise((r) => setTimeout(r, 700));
      continue;
    }

    if (!res.ok) {
      const msg =
        parsed && typeof parsed.error === 'string'
          ? parsed.error
          : `Request failed (${res.status}). Please try again.`;
      throw new Error(msg);
    }

    if (parsed === null) {
      throw new Error(
        `Unexpected non-JSON server response (${res.status}). Please retry in a moment.`
      );
    }

    return parsed as T;
  }

  throw new Error(`Server unavailable (${lastStatus}). Please try again.`);
}
