## Context

Tidak ada sanitization middleware di Core API saat ini. Semua string input dari user masuk langsung ke Zod validation → service → database atau AI Engine. `src/app.ts` sudah punya middleware chain (helmet, cors, express.json, rateLimiter) tapi belum ada sanitization step.

## Goals / Non-Goals

**Goals:**
- Strip HTML tags dari semua string values di `req.body` secara rekursif
- Trim whitespace berlebih dari string values
- Terapkan sebagai global middleware sebelum validation

**Non-Goals:**
- Content moderation atau semantic filtering
- Sanitasi file content (multer handles separately)
- Sanitasi `req.params` dan `req.query` (scope terbatas ke body)
- Encoding/escaping untuk output (itu tanggung jawab client)

## Decisions

**1. Library `xss` bukan `sanitize-html`**
`xss` (15KB) lebih ringan dari `sanitize-html` (200KB+). Untuk use case ini (strip semua HTML tags dari plain text input), `xss` sudah cukup. `sanitize-html` lebih cocok jika perlu whitelist tag tertentu.
Alternatif ditolak: implementasi manual dengan regex — rawan edge cases.

**2. Rekursif untuk nested objects dan arrays**
`req.body` bisa berupa nested object (misal: `{ messages: [{ content: "..." }] }`). Sanitization harus rekursif untuk cover semua string values, bukan hanya top-level fields.

**3. Posisi di middleware chain: setelah `express.json()`, sebelum `validate`**
Sanitization harus berjalan setelah body di-parse (setelah `express.json()`) tapi sebelum Zod validation agar data yang divalidasi sudah bersih.

**4. Tidak modify `req.params` dan `req.query`**
Params dan query biasanya berisi ID atau enum values yang sudah divalidasi oleh Zod. Sanitizing them bisa break routing. Scope dibatasi ke `req.body` saja.

## Risks / Trade-offs

- **[Risk] Over-sanitization merusak konten legitimate** (misal: code snippet di chat yang mengandung `<br>`) → Mitigation: `xss` dengan mode strip-all hanya menghapus tags, tidak mengubah teks di dalam tags. Konten tetap terbaca.
- **[Risk] Performance overhead untuk payload besar** → Mitigation: sanitization O(n) terhadap ukuran body. Untuk payload normal (<10KB), overhead tidak signifikan.
- **[Risk] Dependency baru** → Mitigation: `xss` adalah library yang well-maintained dengan 0 dependencies.

## Migration Plan

1. `npm install xss` di `Kolabri-core-api`
2. Buat `src/middleware/sanitize.ts`
3. Tambah ke middleware chain di `src/app.ts` setelah `express.json()`
4. Deploy — tidak ada breaking change untuk input yang sudah bersih
