import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";

describe("apple auth helper", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    const { __resetAppleJwkCacheForTests } = await import("./appleAuth.js");
    __resetAppleJwkCacheForTests();
    delete process.env.APPLE_SIGN_IN_CLIENT_IDS;
  });

  it("verifies a signed Apple identity token against Apple's JWKS", async () => {
    process.env.APPLE_SIGN_IN_CLIENT_IDS = "app.stratacrm.mobile";
    const { verifyAppleIdentityToken } = await import("./appleAuth.js");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            keys: [
              {
                ...publicJwk,
                alg: "RS256",
                kid: "apple-key-1",
                use: "sig",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "cache-control": "max-age=60",
              "content-type": "application/json",
            },
          }
        )
      )
    );

    const identityToken = jwt.sign(
      {
        iss: "https://appleid.apple.com",
        aud: "app.stratacrm.mobile",
        sub: "apple-user-123",
        email: "owner@privaterelay.appleid.com",
        email_verified: "true",
        is_private_email: "true",
      },
      privateKey,
      {
        algorithm: "RS256",
        expiresIn: "5m",
        keyid: "apple-key-1",
      }
    );

    await expect(verifyAppleIdentityToken(identityToken)).resolves.toMatchObject({
      subject: "apple-user-123",
      email: "owner@privaterelay.appleid.com",
      emailVerified: true,
      isPrivateEmail: true,
    });
  });

  it("rejects Apple tokens signed for a different audience", async () => {
    process.env.APPLE_SIGN_IN_CLIENT_IDS = "app.stratacrm.mobile";
    const { verifyAppleIdentityToken } = await import("./appleAuth.js");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            keys: [
              {
                ...publicJwk,
                alg: "RS256",
                kid: "apple-key-2",
                use: "sig",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "cache-control": "max-age=60",
              "content-type": "application/json",
            },
          }
        )
      )
    );

    const identityToken = jwt.sign(
      {
        iss: "https://appleid.apple.com",
        aud: "wrong.bundle.id",
        sub: "apple-user-999",
      },
      privateKey,
      {
        algorithm: "RS256",
        expiresIn: "5m",
        keyid: "apple-key-2",
      }
    );

    await expect(verifyAppleIdentityToken(identityToken)).rejects.toThrowError(
      "Apple sign-in could not be verified. Please try again."
    );
  });
});

