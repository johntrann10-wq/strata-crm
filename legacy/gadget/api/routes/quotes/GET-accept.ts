import { RouteHandler } from "gadget-server";

const route: RouteHandler<{ Querystring: { token?: string } }> = async ({ request, reply, api }) => {
  const { token } = request.query;

  if (!token) {
    await reply
      .code(400)
      .header("Content-Type", "text/html")
      .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invalid Link</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;">
  <div style="background:#fff;border-radius:12px;padding:48px 40px;max-width:420px;width:100%;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
    <div style="font-size:64px;line-height:1;margin-bottom:16px;">&#10060;</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;">Invalid Link</h1>
    <p style="margin:0;font-size:16px;color:#6b7280;">No token was provided.</p>
  </div>
</body>
</html>`);
    return;
  }

  try {
    const result = await (api as any).acceptQuote({ token });

    const bodyText = result?.alreadyAccepted
      ? "This quote was already accepted. We will be in touch shortly."
      : "Thank you! Your quote has been accepted. We will be in touch shortly to schedule your appointment.";

    await reply
      .code(200)
      .header("Content-Type", "text/html")
      .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quote Accepted!</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;">
  <div style="background:#fff;border-radius:12px;padding:48px 40px;max-width:420px;width:100%;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
    <div style="font-size:72px;line-height:1;margin-bottom:16px;">&#10003;</div>
    <div style="display:inline-block;background:#d1fae5;border-radius:50%;width:80px;height:80px;line-height:80px;font-size:48px;color:#059669;margin-bottom:20px;">&#10003;</div>
    <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#111827;">Quote Accepted!</h1>
    <p style="margin:0;font-size:16px;color:#6b7280;line-height:1.6;">${bodyText}</p>
  </div>
</body>
</html>`);
  } catch (error: any) {
    const message = error?.message ?? "An unexpected error occurred. Please try again or contact support.";

    await reply
      .code(400)
      .header("Content-Type", "text/html")
      .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Error</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;">
  <div style="background:#fff;border-radius:12px;padding:48px 40px;max-width:420px;width:100%;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
    <div style="display:inline-block;background:#fee2e2;border-radius:50%;width:80px;height:80px;line-height:80px;font-size:48px;color:#dc2626;margin-bottom:20px;">&#10060;</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;">Something went wrong</h1>
    <p style="margin:0;font-size:16px;color:#6b7280;line-height:1.6;">${message}</p>
  </div>
</body>
</html>`);
  }
};

route.options = {
  cors: {
    origin: true,
  },
};

export default route;