import http2 from "node:http2";
import jwt from "jsonwebtoken";

type ApnsAlertPayload = {
  title: string;
  body: string;
  badge?: number | null;
  data?: Record<string, unknown>;
  topic?: string | null;
};

type ApnsResponse = {
  statusCode: number;
  body: string;
};

const DEFAULT_BUNDLE_ID = "app.stratacrm.mobile";
const TOKEN_TTL_MS = 45 * 60 * 1000;

let cachedProviderToken: { token: string; createdAt: number } | null = null;

function readApnsPrivateKey(): string {
  const inlineKey = process.env.APNS_PRIVATE_KEY?.trim();
  if (!inlineKey) return "";
  return inlineKey.replace(/\\n/g, "\n");
}

function getApnsConfig() {
  const keyId = process.env.APNS_KEY_ID?.trim() ?? "";
  const teamId = process.env.APNS_TEAM_ID?.trim() ?? "";
  const privateKey = readApnsPrivateKey();
  const topic = process.env.APNS_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID;
  const environment = (process.env.APNS_ENVIRONMENT?.trim().toLowerCase() || process.env.APNS_ENV?.trim().toLowerCase()) === "production"
    ? "production"
    : "sandbox";

  return {
    keyId,
    teamId,
    privateKey,
    topic,
    host: environment === "production" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com",
  };
}

export function isApnsConfigured(): boolean {
  const config = getApnsConfig();
  return Boolean(config.keyId && config.teamId && config.privateKey && config.topic);
}

function getProviderToken(): string {
  const config = getApnsConfig();
  if (!config.keyId || !config.teamId || !config.privateKey) {
    throw new Error("APNs credentials are not configured.");
  }

  if (cachedProviderToken && Date.now() - cachedProviderToken.createdAt < TOKEN_TTL_MS) {
    return cachedProviderToken.token;
  }

  const token = jwt.sign({}, config.privateKey, {
    algorithm: "ES256",
    issuer: config.teamId,
    header: {
      alg: "ES256",
      kid: config.keyId,
    },
    expiresIn: "50m",
  });

  cachedProviderToken = {
    token,
    createdAt: Date.now(),
  };
  return token;
}

export async function sendApnsAlert(deviceToken: string, payload: ApnsAlertPayload): Promise<ApnsResponse> {
  const config = getApnsConfig();
  const providerToken = getProviderToken();
  const topic = payload.topic?.trim() || config.topic;

  return await new Promise((resolve, reject) => {
    const client = http2.connect(config.host);
    const body = JSON.stringify({
      aps: {
        alert: {
          title: payload.title,
          body: payload.body,
        },
        sound: "default",
        ...(typeof payload.badge === "number" ? { badge: Math.max(0, Math.floor(payload.badge)) } : {}),
      },
      ...(payload.data ?? {}),
    });

    client.on("error", reject);

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
    });

    let responseBody = "";
    let statusCode = 0;

    request.setEncoding("utf8");
    request.on("response", (headers) => {
      statusCode = Number(headers[":status"] ?? 0);
    });
    request.on("data", (chunk) => {
      responseBody += chunk;
    });
    request.on("end", () => {
      client.close();
      resolve({
        statusCode,
        body: responseBody,
      });
    });
    request.on("error", (error) => {
      client.close();
      reject(error);
    });
    request.end(body);
  });
}
