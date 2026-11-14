// Mock of Brevo's transactional endpoint: enough to prove the HTTPS mail path works.
import http from "node:http";

const port = Number(process.argv[2] || 6393);
const key = process.argv[3] || "xkeysib-test";
const inbox = [];

http
  .server = undefined;
http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.method === "GET" && req.url === "/inbox") return send(200, { messages: inbox });

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    if (req.headers["api-key"] !== key) return send(401, { code: "unauthorized", message: "Key not found" });
    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      console.log(`BAD_JSON len=${raw.length} head=${JSON.stringify(raw.slice(0, 160))}`);
      return send(400, { code: "bad_json" });
    }
    const to = body?.to?.[0]?.email;
    if (!to) return send(400, { code: "missing_to", message: "to is required" });
    console.log(`SEND to=${to} subject=${JSON.stringify(String(body.subject).slice(0, 40))}`);
    // raw mirrors what a real mailbox holds, so the same assertions read both transports
    const raws = [body.textContent || "", body.htmlContent || ""].join("\n");
    inbox.push({ to, from: body.sender, subject: body.subject, text: body.textContent, html: body.htmlContent, raw: raws });
    return send(201, { messageId: `<mock-${inbox.length}@brevo>` });
  });
}).listen(port, () => console.log("brevo mock on", port));
