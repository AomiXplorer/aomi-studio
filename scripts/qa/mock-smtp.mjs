#!/usr/bin/env node
/**
 * A tiny SMTP sink for the local QA run.
 *
 * It speaks just enough ESMTP for nodemailer (`EHLO`, `AUTH LOGIN/PLAIN`, `MAIL`, `RCPT`,
 * `DATA`, `QUIT`) and keeps every message in memory, exposed over HTTP at `/messages` so the
 * test script can read the credentials that were actually delivered.
 *
 * Usage: node scripts/qa/mock-smtp.mjs [smtpPort] [httpPort]
 */
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";

const SMTP_PORT = Number(process.argv[2] || 2525);
const HTTP_PORT = Number(process.argv[3] || 6394);

const messages = [];

const smtp = createTcpServer((socket) => {
  let inData = false;
  let buffer = "";
  let envelope = { from: "", to: [] };
  let data = "";
  let authStage = null;

  socket.write("220 mock-smtp ESMTP ready\r\n");

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");

    if (inData) {
      data += buffer;
      buffer = "";
      const end = data.indexOf("\r\n.\r\n");
      if (end === -1) return;
      const body = data.slice(0, end);
      data = "";
      inData = false;
      // Unfold continuation lines first: a long subject is split across lines and the
      // encoded words only decode once they are joined again.
      const headerBlock = body.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, " ");
      const subject = headerBlock.match(/^Subject:\s*(.*)$/m);
      messages.push({
        from: envelope.from,
        to: envelope.to,
        subject: subject ? subject[1].trim() : "",
        raw: body,
        receivedAt: new Date().toISOString(),
      });
      socket.write("250 2.0.0 queued as mock\r\n");
      return;
    }

    let index = buffer.indexOf("\r\n");
    while (index !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      handleLine(line);
      index = buffer.indexOf("\r\n");
    }
  });

  function handleLine(line) {
    if (authStage === "user") {
      authStage = "pass";
      socket.write("334 UGFzc3dvcmQ6\r\n");
      return;
    }
    if (authStage === "pass") {
      authStage = null;
      socket.write("235 2.7.0 authenticated\r\n");
      return;
    }
    const upper = line.toUpperCase();
    if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
      socket.write("250-mock-smtp\r\n250-AUTH LOGIN PLAIN\r\n250-SIZE 10485760\r\n250 OK\r\n");
      return;
    }
    if (upper.startsWith("AUTH LOGIN")) {
      authStage = "user";
      socket.write("334 VXNlcm5hbWU6\r\n");
      return;
    }
    if (upper.startsWith("AUTH PLAIN")) {
      socket.write("235 2.7.0 authenticated\r\n");
      return;
    }
    if (upper.startsWith("MAIL FROM")) {
      envelope = { from: line.slice(line.indexOf(":") + 1).trim(), to: [] };
      socket.write("250 2.1.0 OK\r\n");
      return;
    }
    if (upper.startsWith("RCPT TO")) {
      envelope.to.push(line.slice(line.indexOf(":") + 1).trim());
      socket.write("250 2.1.5 OK\r\n");
      return;
    }
    if (upper === "DATA") {
      inData = true;
      socket.write("354 end with .\r\n");
      return;
    }
    if (upper === "QUIT") {
      socket.write("221 bye\r\n");
      socket.end();
      return;
    }
    socket.write("250 OK\r\n");
  }

  socket.on("error", () => undefined);
});

smtp.listen(SMTP_PORT, "127.0.0.1", () => {
  console.log(`mock smtp on 127.0.0.1:${SMTP_PORT}`);
});

createHttpServer((request, response) => {
  if (request.url?.startsWith("/messages")) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(messages));
    return;
  }
  if (request.url?.startsWith("/reset")) {
    messages.length = 0;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(404);
  response.end();
}).listen(HTTP_PORT, "127.0.0.1", () => {
  console.log(`mock smtp inbox on http://127.0.0.1:${HTTP_PORT}/messages`);
});
