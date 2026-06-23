## Why

Fitur attendance/presensi saat ini berupa manual ledger dosen yang terisolasi dari sesi diskusi — dosen harus buat "pertemuan" manual, tandai hadir/absen per mahasiswa, dan tidak ada koneksi ke sesi diskusi. SRS (FR-031, BR-018) sebenarnya mensyaratkan presensi otomatis dari partisipasi, bukan manual. Rancangan ini mengubah attendance menjadi **auto-attendance berbasis partisipasi sesi diskusi**: saat sesi ditutup, sistem menghitung pesan + HOT per mahasiswa dan menghasilkan attendance record otomatis. Dosen tinggal review + koreksi. Mahasiswa bisa lihat kehadirannya sendiri.

## What Changes

### Core-api (Node.js + Prisma + MongoDB)
- **Hook di `closeSession`**: saat sesi diskusi ditutup (manual atau auto-close), query MongoDB untuk pesan + HOT count per mahasiswa → determine status (present/absent) → POST ke client-app untuk create attendance records
- **Auto-close cron job**: cek periodik sesi dengan `closedAt = null` DAN pesan terakhir >3 jam → close otomatis + trigger auto-attendance
- **New endpoint**: `POST /api/session-discussions/{id}/auto-attendance` — dipanggil oleh client-app atau internal saat close
- **Bulk close endpoint**: `POST /api/session-discussions/bulk-close` — dosen tutup multiple sesi sekaligus

### Client-app (Laravel + React)
- **Skema `attendance_sessions`**: tambah `session_discussion_id`, `week_id`, `group_id`, `auto_generated`, `attendance_method`
- **LecturerAttendanceController**: rework — hapus manual create/mark, ganti dengan auto-generate dari sesi diskusi + override
- **AttendanceTab.tsx**: rework UI — tab per kelompok, 3 section grouping (minggu → sesi lainnya → sedang berjalan), override page, bulk close, rekapitulasi dengan filter
- **StudentAttendanceController + page**: baru — mahasiswa lihat kehadiran sendiri (status, pesan, HOT, rekap)
- **Route + nav**: route baru untuk student attendance, nav tab "Kehadiran" di course detail mahasiswa

### Aturan penentuan status
- **Hadir (present)**: ≥3 pesan DAN ≥1 pesan HOT (Higher-Order Thinking)
- **Tidak Hadir (absent)**: <3 pesan ATAU 0 pesan HOT
- **Izin (excused)**: hanya dosen override
- Tidak ada status "Terlambat"

### SRS/SDD revisions
- FR-031: "Presensi & Kehadiran" → "Presensi Otomatis dari Partisipasi"
- BR-018: diperjelas dengan threshold (3 pesan, 1 HOT)
- BR-023 (baru): auto-close 3 jam tanpa pesan
- BR-024 (rancangan): notifikasi auto-close (belum implementasi — silent close)
- UC-019: "Presensi Sesi" → "Presensi Otomatis Sesi Diskusi"
- SD-004: sequence diagram diperjelas dengan alur auto-attendance
- DOSEN_FLOW §8: revisi total dari manual → auto-attendance workflow
- APP_FLOW §2.8: revisi
- Class diagram: `recordAttendance()` diperjelas

## Capabilities

### New Capabilities

- `auto-attendance`: Sistem mencatat presensi mahasiswa otomatis berdasarkan partisipasi (pesan + HOT) saat sesi diskusi ditutup. Dosen dapat review, koreksi (override), bulk close, filter per kelompok/minggu, export. Mahasiswa dapat lihat kehadiran sendiri.

### Modified Capabilities

- `discussion-session-api`: `closeSession` sekarang trigger auto-attendance generation. Auto-close cron job menutup sesi inaktif 3 jam.
- `attendance-api`: Manual CRUD attendance dihapus. Diganti dengan auto-generate + override.

## Migration Notes

1. Tambah kolom ke `attendance_sessions` (migration Laravel, bukan Prisma — tabel ini di MySQL client-app)
2. Hook `closeSession` di core-api — query MongoDB, determine status, POST ke client-app
3. Auto-close cron job di core-api — jalankan periodik
4. Rework AttendanceTab.tsx — hapus manual create/mark, ganti auto-filled + override
5. Buat student attendance page/controller/route/nav baru
6. Bug fixes: N+1 query, attendance rate math, auth check, dead route, GlobalSearch relation
7. SRS/SDD revisions dilakukan di Phase 1 (dokumen)
