## Context

Attendance saat ini adalah manual ledger di client-app MySQL (`attendance_sessions` + `attendance_records`). Dosen buat "pertemuan" manual, tandai present/absent per mahasiswa. Tidak ada koneksi ke sesi diskusi. Mahasiswa tidak bisa lihat kehadirannya.

SRS (FR-031, BR-018) sebenarnya mensyaratkan: "Sistem juga mencatat presensi otomatis berdasarkan partisipasi dalam sesi diskusi" dan "Presensi dihitung berdasarkan partisipasi aktif dalam sesi, bukan sekadar kehadiran."

Data partisipasi sudah tersedia di MongoDB:
- Setiap ChatLog punya field `engagement.isHigherOrder` (HOT detection) — diisi oleh `socket/engagement.ts` saat pesan dikirim
- Message count per student = query MongoDB count by `senderId` + `sessionDiscussionId`
- HOT count per student = query MongoDB count where `engagement.isHigherOrder = true`

Sesi diskusi di core-api PostgreSQL punya `closedAt` (nullable). `closeSession()` sudah ada di `sessionDiscussion.service.ts`. Tapi tidak ada auto-close.

### Current state

| Layer | Current | Target |
|---|---|---|
| `attendance_sessions.title` | Dosen input manual "Pertemuan 1" | Auto-generated: `"{week_title} - {session_name} - {group_name}"` |
| `attendance_sessions.session_discussion_id` | Tidak ada | New column — link ke `session_discussions.id` |
| `attendance_sessions.week_id` | Tidak ada | New column — link ke `course_weeks.id` |
| `attendance_sessions.group_id` | Tidak ada | New column — link ke `groups.id` |
| `attendance_sessions.auto_generated` | Tidak ada | New column — boolean |
| `attendance_records.status` | present/absent/late/excused (dosen manual) | present/absent/excused (auto: present/absent, dosen override: excused) |
| `attendance_records.marked_by` | Dosen ID | `system` (auto) atau `{dosen_id}` (override) |
| `closeSession()` | Update `closedAt` only | Update `closedAt` + trigger auto-attendance |
| Auto-close | Tidak ada | Cron job: close sesi inaktif 3 jam |
| Dosen UI | Tab "Pertemuan" (manual create + mark) + Tab "Rekapitulasi" | Tab "Riwayat Kehadiran" (auto-filled, per kelompok, override) + Tab "Rekapitulasi" (filter) |
| Mahasiswa UI | Tidak ada | Tab "Kehadiran" baru di course detail |

## Decisions

### D1: Status — 3 only (Hadir / Tidak Hadir / Izin)

**Decision**: Hanya 3 status. Tidak ada "Terlambat".

**Rationale**: Deteksi "Terlambat" butuh waktu join mahasiswa. Socket join event tidak disimpan persistently. Proxy pesan pertama tidak akurat — mahasiswa bisa hadir tepat waktu tapi diam (pesan pertama >15 menit). Daripada false-positive late, hapus saja statusnya. Dosen bisa override ke "Izin" jika perlu keterangan khusus.

### D2: Threshold — ≥3 pesan DAN ≥1 HOT

**Decision**: Hadir = ≥3 pesan DAN ≥1 pesan HOT (Higher-Order Thinking).

**Rationale**: 
- Pesan saja (tanpa HOT) bisa diakali: spam 3 pesan "iya" "setuju" "sip"
- HOT detection sudah ada di `socket/engagement.ts` + `nlp_analytics.py` — mendeteksi kata pemicu analisis/evaluasi/sintesis (mengapa, bagaimana, analisis, evaluasi, bandingkan, dll)
- Engagement score (gabungan HOT% + lexical variety) ditampilkan di UI sebagai info, tapi tidak dipakai sebagai gate — terlalu kompleks untuk threshold
- Threshold konfigurabel per course (default: 3 pesan, 1 HOT)

### D3: Auto-close 3 jam (keheningan)

**Decision**: Sesi tanpa pesan baru selama 3 jam → auto-close oleh sistem.

**Rationale**:
- 3 jam cukup untuk sesi diskusi normal (biasanya 60-90 menit) + buffer untuk mahasiswa yang masih diskusi
- Berdasarkan keheningan (tidak ada pesan), bukan waktu absolut — sesi yang masih aktif tidak akan ditutup
- Dosen tidak perlu ingat tutup setiap sesi — sistem handle
- 24 jam terlalu lama: attendance tertunda berhari-hari kalau dosen lupa
- Cron job cek periodik (setiap 15 menit)

### D4: Sesi tidak bisa dibuka ulang

**Decision**: Sesi yang sudah ditutup (`closedAt != null`) tidak dapat dibuka kembali.

**Rationale**: Mencegah ambiguitas attendance record. Kalau sesi dibuka ulang, attendance record yang sudah dibuat menjadi tidak valid. Lebih clean: sekali tutup = final.

### D5: 1 mahasiswa = 1 kelompok

**Decision**: Tidak ada cross-group per sesi. 1 sesi diskusi = 1 kelompok.

**Rationale**: Seed data dan arsitektur saat ini sudah 1 sesi = 1 kelompok. Tidak perlu handle edge case multi-group.

### D6: Notifikasi auto-close — rancangan saja

**Decision**: BR-024 (notifikasi auto-close) dicatat sebagai rancangan. Implementasi saat ini: silent close.

**Rationale**: Sistem notifikasi belum lengkap (saat ini polling-only, no real-time notifications). Membangun notifikasi untuk auto-close saja tidak efisien. Tunggu sampai sistem notifikasi overall dibangun.

### D7: Migration di client-app MySQL (bukan Prisma)

**Decision**: Kolom baru `session_discussion_id`, `week_id`, `group_id`, `auto_generated`, `attendance_method` ditambahkan via Laravel migration ke `attendance_sessions` di MySQL.

**Rationale**: Tabel `attendance_sessions` dan `attendance_records` ada di client-app MySQL, bukan core-api PostgreSQL. Core-api tidak punya Prisma model untuk attendance — attendance diakses via HTTP API ke client-app.

## Risks / Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| Threshold 3 pesan + 1 HOT terlalu ketat untuk kelompok kecil (2-3 mhs) | MEDIUM | Threshold konfigurabel per course — dosen bisa turunkan ke 2 pesan |
| Auto-close 3 jam menutup sesi yang masih aktif tapi slow-paced | LOW | 3 jam cukup longgar; jika masih ada pesan dalam 3 jam terakhir, sesi tidak ditutup |
| HOT detection false negative (pesan substantive tanpa keyword HOT) | MEDIUM | Dosen bisa override ke "Hadir" jika sistem salah tandai |
| MongoDB query lambat untuk sesi dengan banyak pesan | LOW | Query hanya count + filter `isHigherOrder`, indexed by `sessionDiscussionId` + `senderId` |
| Core-api → client-app HTTP call untuk create attendance bisa fail | MEDIUM | Retry logic + log error; dosen bisa manual trigger dari UI |

## Execution Order

1. **SRS/SDD revisions** (dokumen)
2. **Client-app migration** (add columns to `attendance_sessions`)
3. **Core-api hook** (`closeSession` → query MongoDB → determine status → POST to client-app)
4. **Core-api auto-close cron** (cek periodik, close inaktif 3 jam)
5. **Client-app dosen UI rework** (AttendanceTab → tab per kelompok, override, bulk close, rekap)
6. **Client-app mahasiswa UI** (new page/controller/route/nav)
7. **Bug fixes** (N+1, math, auth, dead route, GlobalSearch)
8. **Verify**: tsc, php lint, grep sweep, E2E test
