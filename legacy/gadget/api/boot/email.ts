import { emails } from "gadget-server";

if (process.env.SMTP_HOST) {
  emails.setTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    defaults: {
      from: `Strata Detailing <${process.env.SMTP_USER}>`,
    },
  } as any);
}