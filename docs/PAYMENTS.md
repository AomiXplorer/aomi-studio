# Aomi — akses berbayar (AustinPay + akun otomatis)

Dokumen ini menjelaskan cara mengaktifkan, mengoperasikan, dan memperbaiki alur pembelian
akun Aomi: QRIS lewat AustinPay, verifikasi webhook, pembuatan akun otomatis, dan pengiriman
kredensial lewat email.

Tidak ada satu pun nilai rahasia di repository. Semua kredensial dibaca dari environment
server dan tidak pernah dikirim ke browser.

---

## 1. Alur yang berjalan

```
/buy (email → username)
      │  POST /api/purchase/check-email, /check-username
      ▼
POST /api/purchase/order ──► AustinPay POST /api/deposit/create (ditandatangani HMAC)
      │                        └─► order + qr_image + expired_at disimpan di Redis
      ▼
/buy/pay  ── QRIS, nominal, transaction id, countdown, Copy Amount,
      │       Check Payment Status, Cancel Payment
      │
      ├─ webhook  POST /webhook/austinpay   (utama, deposit.paid)
      └─ polling  GET  /api/purchase/order/:id  (cadangan, maksimal tiap 5 detik)
      ▼
markPaid (atomik, sekali) ──► provisionAccount (idempoten)
      │                         ├─ username final (aman dari tabrakan)
      │                         ├─ password acak 70-bit, bcrypt di database
      │                         ├─ role user, status active
      │                         └─ ciphertext password (AES-256-GCM) untuk retry email
      ▼
email kredensial ──► /buy/success  (tanpa password, hanya email + username)
```

Status yang **tidak** pernah membuat akun: `pending`, `expired`, `failed`, `cancelled`.
Hanya transaksi yang benar-benar dibayar (webhook tersignature valid, atau jawaban
`paid` dari endpoint cek milik AustinPay) yang bisa memindahkan order dari `pending`.

---

## 2. Environment variables

Isi di Vercel → Project → Settings → Environment Variables (Production).

### Wajib untuk pembayaran

| Nama | Isi | Catatan |
| --- | --- | --- |
| `AUSTIN_API_KEY` | API key AustinPay | Jangan pernah ditaruh di frontend. Sudah terpasang di Vercel. |
| `AUSTIN_API_SECRET` | API secret untuk HMAC request | Sudah terpasang di Vercel. |
| `AUSTINPAY_WEBHOOK_SECRET` | Webhook secret dari dashboard AustinPay | **Belum diisi.** Tanpa ini webhook ditolak (503/401) dan konfirmasi jatuh ke polling. |

### Wajib untuk pengiriman kredensial

| Nama | Isi | Catatan |
| --- | --- | --- |
| `SMTP_HOST` | host SMTP | **Belum diisi.** |
| `SMTP_PORT` | `587` (STARTTLS) atau `465` (TLS) | **Belum diisi.** |
| `SMTP_USER` | username SMTP | **Belum diisi.** |
| `SMTP_PASSWORD` | password / app password | **Belum diisi.** |
| `SMTP_FROM` | contoh `Aomi <no-reply@domainmu.com>` | **Belum diisi.** |

Selama salah satu dari dua kelompok di atas belum lengkap, checkout **menolak membuat
order** dengan pesan "Pembayaran belum aktif di server ini". Itu disengaja: lebih baik
pembeli tidak membayar daripada membayar lalu tidak menerima kredensial.

### Opsional

| Nama | Default | Fungsi |
| --- | --- | --- |
| `AOMI_ACCESS_PRICE` | `25000` | Harga akses dalam rupiah (integer, 1.000–10.000.000). Harga selalu dibaca di server. |
| `AUSTINPAY_BASE_URL` | `https://austinstore.id` | Hanya untuk pengujian lokal. |
| `AOMI_PUBLIC_URL` | `https://vierraapi.my.id` | Dipakai untuk link login di dalam email. |

Secret lain yang sudah ada (`AOMI_SESSION_SECRET`, `AOMI_ENCRYPTION_KEY`, Upstash, Telegram)
tidak berubah dan tetap wajib.

---

## 3. Mendaftarkan webhook

1. Masuk ke dashboard AustinPay, buka halaman **Webhook / Callback**.
2. URL: `https://<domain-aomi>/webhook/austinpay`
3. Event: `deposit.paid` (event lain diabaikan dengan aman).
4. Salin **webhook secret** dari dashboard itu ke `AUSTINPAY_WEBHOOK_SECRET`, lalu redeploy.

Verifikasi yang dilakukan server, sebelum body diparse:

- header `X-AustinPay-Signature` wajib ada,
- HMAC-SHA256 dari **raw body** dengan `AUSTINPAY_WEBHOOK_SECRET`,
- perbandingan timing-safe,
- signature salah / kosong → `401`, tidak ada perubahan status.

Kalau dashboard tidak menyediakan secret, webhook tidak bisa dipercaya dan sebaiknya
dibiarkan tidak terdaftar: alur tetap benar lewat polling 5 detik.

### IP whitelist

AustinPay mewajibkan IP server terdaftar di dashboard. Vercel memakai IP keluar dinamis,
jadi:

- cara paling aman: pakai **Vercel Secure Compute / static egress IP** (paket berbayar),
  lalu daftarkan IP itu, atau
- jalankan seluruh panggilan AustinPay dari satu worker dengan IP tetap, atau
- minta AustinPay mengizinkan rentang IP Vercel: `76.76.21.0/24`.

Tanpa itu, endpoint deposit akan menjawab `403` dan halaman pembayaran menampilkan pesan
"IP server tidak ada di whitelist". Ini batasan provider, bukan bug kode.

---

## 4. Batas dan perilaku yang disengaja

| Hal | Nilai |
| --- | --- |
| Harga | Server-side constant; browser tidak pernah mengirim nominal. |
| QRIS per email | Maksimal satu yang masih hidup; klik ulang memakai QR yang sama. |
| Rate limit buat order | 6 per 10 menit per IP, 4 per 15 menit per email. |
| Rate limit cek status | 1 permintaan ke AustinPay per 5 detik per order. |
| Masa berlaku order lokal | Mengikuti `expired_at` dari provider (fallback 10 menit). |
| Token order | Random 24 byte, disimpan sebagai SHA-256; token lama mati saat link diperbarui. |
| Password | `Aomi-XXXX-XXXX-XXXX`, CSPRNG, bcrypt cost 12, tidak pernah di database sebagai plaintext. |
| Email dobel | Dicegah: satu order hanya punya satu email sukses; percobaan lain tercatat sebagai baris log. |

Tombol "Check Payment Status" **tidak** pernah menandai lunas. Ia hanya bertanya ke
AustinPay; keputusan tetap milik provider.

---

## 5. Operasional dari panel owner

Buka `/admin` → tab **Payments**.

- **Statistik**: total pengguna, transaksi sukses, pending, gagal/expired, pendapatan,
  email terkirim/gagal.
- **Koneksi pembayaran**: sidik jari API key (hanya 4 karakter terakhir), status HMAC,
  status webhook secret, host SMTP, serta URL webhook yang harus didaftarkan.
- **Cek kredensial**: satu request ke AustinPay untuk memastikan key dan signature diterima.
  Jangan dipakai berulang; endpoint deposit dibatasi 5 request/menit.
- **Buat akun**: mengulang provisioning untuk order yang sudah lunas tapi akunnya gagal
  dibuat. Idempoten, tidak akan membuat akun kedua.
- **Kirim ulang**: mengirim ulang email memakai ciphertext password yang tersimpan.
- **Reset password**: membuat password baru, menyimpannya, dan mengirimkannya ke pembeli.
- **Batalkan**: hanya untuk order yang belum dibayar.

Tab **Accounts** sekarang menampilkan email dan tanggal daftar setiap akun, dan bisa membuat
akun manual dengan email.

---

## 6. Kalau ada yang gagal

| Gejala | Penyebab yang paling sering | Tindakan |
| --- | --- | --- |
| "Pembayaran belum aktif di server ini" | env AustinPay atau SMTP belum lengkap | Isi env, redeploy |
| "AustinPay menolak request: IP tidak ada di whitelist" | whitelist IP | lihat bagian 3 |
| QRIS muncul tapi akun tidak dibuat | webhook secret salah, webhook belum didaftarkan | cek `/admin` → Payments, atau tunggu polling |
| Akun ada, email gagal | SMTP menolak / kredensial salah | perbaiki SMTP lalu **Kirim ulang** |
| Password hilang dari email | pembeli menghapus email | **Reset password** di panel |
| Order `failed` dengan `providerError` | provider menolak nominal / limit | lihat pesan di baris order |

Semua aksi owner dan semua perubahan status pembayaran masuk ke audit log (`/admin` →
Activity), tanpa menyimpan rahasia.

---

## 7. Menguji tanpa menyentuh uang sungguhan

```bash
npm run build

node scripts/qa/mock-redis.mjs 6391 &
node scripts/qa/mock-austinpay.mjs 6392 apg_test_local_key test-hmac-secret &
node scripts/qa/mock-smtp.mjs 2525 6394 &

UPSTASH_REDIS_REST_URL=http://127.0.0.1:6391 UPSTASH_REDIS_REST_TOKEN=qa \
AOMI_SESSION_SECRET=qa-session-secret-0123456789abcdef0123456789abcdef \
AOMI_ENCRYPTION_KEY=$(openssl rand -base64 32) \
AOMI_AUTH_JSON="$(node scripts/qa/make-auth.mjs owner 'owner-qa-password-123')" \
AUSTIN_API_KEY=apg_test_local_key AUSTIN_API_SECRET=test-hmac-secret \
AUSTINPAY_WEBHOOK_SECRET=qa-webhook-secret AUSTINPAY_BASE_URL=http://127.0.0.1:6392 \
SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_USER=qa SMTP_PASSWORD=qa-pass SMTP_FROM="Aomi <qa@example.test>" \
AOMI_PUBLIC_URL=http://127.0.0.1:3104 \
npx next start -p 3104 &

BASE=http://127.0.0.1:3104 node scripts/qa/payments-check.mjs
```

`payments-check.mjs` menjalankan 49 pemeriksaan lewat HTTP sungguhan: dua langkah checkout,
validasi email/username, QRIS, token, signature webhook, idempotensi, akun + email, cancel,
expired, batas akses owner, dan bukti bahwa password tidak tersimpan sebagai plaintext.
