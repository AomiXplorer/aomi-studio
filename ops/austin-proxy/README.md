# AustinPay relay (one fixed IP)

AustinPay only answers whitelisted source addresses. Vercel functions leave through a
rotating pool (three calls here produced `54.81.152.81`, `44.222.113.215` and
`3.91.35.75`), so whitelisting one of them never holds. This relay gives Aomi a single,
stable address to call from.

It stores no credentials. The API key and the HMAC signature travel per request and are
forwarded unchanged; only four upstream paths are relayed.

## Install on any machine with a public IP

```bash
sudo mkdir -p /opt/aomi-relay && sudo cp server.mjs /opt/aomi-relay/
sudo tee /opt/aomi-relay/relay.env >/dev/null <<'ENV'
PROXY_TOKEN=<openssl rand -hex 32>
HOST=127.0.0.1
PORT=8787
AUSTIN_BASE=https://austinstore.id
ENV
sudo chmod 600 /opt/aomi-relay/relay.env
sudo cp aomi-relay.service /etc/systemd/system/
sudo systemctl enable --now aomi-relay
curl -s http://127.0.0.1:8787/api/account            # 401 tanpa token: benar
```

TLS in front (the token must not travel in clear text over the internet):

```nginx
server {
  listen 443 ssl http2;
  server_name pay-relay.contoh.com;
  ssl_certificate     /etc/letsencrypt/live/pay-relay.contoh.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/pay-relay.contoh.com/privkey.pem;
  location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
  }
}
```

## Point Aomi at it

In Vercel add both, then redeploy:

```
AUSTINPAY_BASE_URL=https://pay-relay.contoh.com
AUSTIN_PROXY_TOKEN=<same PROXY_TOKEN>
```

## Then

1. Whitelist the relay's public IP (`curl -4 ifconfig.me` on that box) in the AustinPay
   dashboard. That address does not change.
2. Check `GET https://<aomi>/api/ops/provider?token=<OPS_TOKEN>`: it makes one signed
   account call and reports the egress IP it used.
