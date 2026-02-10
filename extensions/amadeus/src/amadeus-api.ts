const AMADEUS_HOSTS: Record<string, string> = {
  test: "https://test.api.amadeus.com",
  production: "https://api.amadeus.com",
};

function getEnv(): { clientId: string; clientSecret: string; baseUrl: string } {
  const clientId =
    process.env.NANOBOTS_AMADEUS_API_KEY?.trim() || process.env.AMADEUS_API_KEY?.trim() || "";
  const clientSecret =
    process.env.NANOBOTS_AMADEUS_API_SECRET?.trim() || process.env.AMADEUS_API_SECRET?.trim() || "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Amadeus API 未配置。请设置 NANOBOTS_AMADEUS_API_KEY 和 NANOBOTS_AMADEUS_API_SECRET 环境变量。",
    );
  }
  const env = (
    process.env.NANOBOTS_AMADEUS_ENV?.trim() ||
    process.env.AMADEUS_ENV?.trim() ||
    "test"
  ).toLowerCase();
  const baseUrl = AMADEUS_HOSTS[env] ?? AMADEUS_HOSTS.test;
  return { clientId, clientSecret, baseUrl };
}

// ── Token cache ─────────────────────────────────────────────

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.accessToken;
  }

  const { clientId, clientSecret, baseUrl } = getEnv();
  const response = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amadeus 认证失败 ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

// ── API fetch ───────────────────────────────────────────────

/**
 * Make an authenticated GET request to the Amadeus API.
 */
export async function amadeusFetch(
  path: string,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { baseUrl } = getEnv();
  const token = await getAccessToken();

  let url = `${baseUrl}${path}`;
  if (params) {
    const qs = new URLSearchParams(params);
    url += `?${qs}`;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amadeus API 错误 ${response.status}: ${text}`);
  }

  return (await response.json()) as Record<string, unknown>;
}
