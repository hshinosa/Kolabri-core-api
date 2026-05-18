## Why

Input dari user tidak disanitasi sebelum disimpan ke database atau diteruskan ke AI Engine. String yang mengandung HTML tags, script injection, atau karakter berbahaya bisa masuk ke storage dan downstream consumers, membuka risiko XSS dan data corruption.

## What Changes

- Tambah sanitization middleware di `src/middleware/` yang memproses semua string input sebelum request handler dijalankan
- Strip HTML tags dari string fields (menggunakan library seperti `sanitize-html` atau implementasi manual dengan regex)
- Trim whitespace berlebih
- Terapkan di `src/app.ts` sebagai global middleware untuk semua routes
- Tidak mengubah behavior validasi Zod yang sudah ada — sanitization berjalan sebelum validation

## Capabilities

### New Capabilities

- `input-sanitization`: Middleware yang secara otomatis membersihkan semua string input dari HTML tags dan karakter berbahaya sebelum request diproses oleh handler manapun

### Modified Capabilities

- (none)

## Impact

- `src/middleware/sanitize.ts` — file baru
- `src/app.ts` — tambah middleware ke chain
- `package.json` — kemungkinan tambah dependency `sanitize-html` atau `xss`
- Semua endpoint yang menerima string input dari user terdampak
