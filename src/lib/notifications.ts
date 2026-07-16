import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { connect as netConnect, type Socket } from "node:net";

const DEFAULT_ADMIN_EMAIL = "depotpharmaima@gmail.com";

type Notification = {
  subject: string;
  text: string;
};

type SmtpSocket = Socket | TLSSocket;

function encodeSubject(subject: string) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function readSmtpReply(socket: SmtpSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onData = (chunk: string | Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      for (const line of lines) {
        if (/^\d{3} /.test(line)) {
          cleanup();
          resolve(buffer);
          return;
        }
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function expectCode(socket: SmtpSocket, code: number) {
  const response = await readSmtpReply(socket);
  if (!response.includes(`${code} `) && !response.startsWith(String(code))) {
    throw new Error(`SMTP expected ${code}, got: ${response.trim()}`);
  }
  return response;
}

function connectPlain(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port }, () => resolve(socket));
    socket.setTimeout(20000, () => {
      socket.destroy(new Error(`SMTP connection timed out on ${host}:${port}`));
    });
    socket.on("error", reject);
  });
}

function upgradeToTls(socket: Socket): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tlsConnect(
      {
        socket,
        host: "smtp.gmail.com",
        servername: "smtp.gmail.com",
      },
      () => resolve(tlsSocket)
    );
    tlsSocket.on("error", reject);
  });
}

async function sendViaGmailSmtp({
  user,
  pass,
  from,
  to,
  subject,
  text,
}: {
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  // Prefer STARTTLS on 587; many hosts block implicit TLS on 465.
  let socket: SmtpSocket = await connectPlain("smtp.gmail.com", 587);
  socket.setEncoding("utf8");

  try {
    await expectCode(socket, 220);
    socket.write("EHLO kasuwa.local\r\n");
    await expectCode(socket, 250);

    socket.write("STARTTLS\r\n");
    await expectCode(socket, 220);
    socket = await upgradeToTls(socket as Socket);
    socket.setEncoding("utf8");

    socket.write("EHLO kasuwa.local\r\n");
    await expectCode(socket, 250);

    socket.write("AUTH LOGIN\r\n");
    await expectCode(socket, 334);
    socket.write(`${Buffer.from(user, "utf8").toString("base64")}\r\n`);
    await expectCode(socket, 334);
    socket.write(`${Buffer.from(pass, "utf8").toString("base64")}\r\n`);
    await expectCode(socket, 235);

    socket.write(`MAIL FROM:<${user}>\r\n`);
    await expectCode(socket, 250);
    socket.write(`RCPT TO:<${to}>\r\n`);
    await expectCode(socket, 250);

    socket.write("DATA\r\n");
    await expectCode(socket, 354);

    const body = text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encodeSubject(subject)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
      ".",
      "",
    ].join("\r\n");

    socket.write(message);
    await expectCode(socket, 250);
    socket.write("QUIT\r\n");
  } finally {
    socket.end();
  }
}

export async function sendAdminNotification({
  subject,
  text,
}: Notification): Promise<boolean> {
  const user = process.env.GMAIL_USER || DEFAULT_ADMIN_EMAIL;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!pass) {
    console.warn("Email notification skipped: GMAIL_APP_PASSWORD is not configured");
    return false;
  }

  const to = process.env.ADMIN_NOTIFICATION_EMAIL || DEFAULT_ADMIN_EMAIL;
  const from = process.env.EMAIL_FROM || `Kasuwa <${user}>`;

  try {
    await sendViaGmailSmtp({ user, pass, from, to, subject, text });
    return true;
  } catch (error) {
    console.error("Email notification failed:", error);
    return false;
  }
}
