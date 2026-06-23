# Attendance spec

## Requirement: Auto-attendance generation

Sistem WAJIB menghasilkan attendance record otomatis saat sesi diskusi ditutup (manual oleh dosen atau auto-close oleh sistem).

### Status determination

- **Hadir (present)**: ≥3 pesan dalam sesi DAN ≥1 pesan dengan `engagement.isHigherOrder = true`
- **Tidak Hadir (absent)**: <3 pesan ATAU 0 pesan HOT
- **Izin (excused)**: hanya bisa di-set oleh dosen via override

Tidak ada status "Terlambat".

### Data source

- Message count: MongoDB `ChatLog` collection, count by `senderId` + `sessionDiscussionId`
- HOT count: MongoDB `ChatLog` collection, count where `engagement.isHigherOrder = true` + `senderId` + `sessionDiscussionId`
- Threshold (3 pesan, 1 HOT) konfigurabel per course

### Attendance record

Setiap mahasiswa terdaftar di kelompok sesi diskusi WAJIB punya attendance record:
- `student_id`: mahasiswa ID
- `status`: present | absent | excused
- `marked_by`: `system` (auto) atau `{dosen_id}` (override)
- `notes`: metrik partisipasi (e.g., "12 pesan, 5 HOT") atau keterangan dosen

## Requirement: Auto-close 3 jam

Sistem WAJIB menutup sesi diskusi yang tidak memiliki pesan baru selama 3 jam.

- Cron job cek setiap 15 menit
- Query: `SessionDiscussion` where `closedAt = null` DAN pesan terakhir di MongoDB >3 jam yang lalu
- Saat auto-close: set `closedAt = now()`, `closedBy = 'system'`, trigger auto-attendance
- Sesi yang sudah ditutup TIDAK dapat dibuka kembali

## Requirement: Dosen override

Dosen WAJIB dapat mengoreksi status attendance yang dihasilkan sistem.

- Klik status mahasiswa → cycle: Hadir → Absen → Izin → Hadir
- Simpan koreksi → `marked_by` = `{dosen_id}`
- Status asli (auto) tetap tersimpan di `notes` untuk audit trail
- Badge berubah dari `Auto ✓` ke `Dikoreksi`

## Requirement: Dosen UI — tab per kelompok

Dosen UI WAJIB menggunakan tab per kelompok + tab "Semua".

- Tab: `[Semua] [Kelompok A] [Kelompok B] [Kelompok C]`
- 3 section grouping:
  1. Sesi per minggu (weekId terisi, group by `course_weeks.title`)
  2. Sesi Lainnya (weekId null, group by tanggal)
  3. Sedang Berjalan (closedAt null, belum ada attendance)
- Tidak ada tombol "+ Tambah Pertemuan" — attendance dibuat otomatis

## Requirement: Dosen bulk close

Dosen WAJIB dapat menutup multiple sesi sekaligus dari tab Riwayat Kehadiran.

- `[Tutup & Cat Kehadiran]` per sesi di section "Sedang Berjalan"
- `[Tutup Semua Sesi Berjalan]` untuk bulk close semua
- Setiap close trigger auto-attendance generation

## Requirement: Rekapitulasi dengan filter

Dosen WAJIB dapat melihat rekapitulasi kehadiran dengan filter.

- Filter: Minggu (termasuk opsi "Sesi Lainnya") + Kelompok
- Tabel: Mahasiswa | Hadir | Izin | Absen | Persentase
- Denominator = jumlah sesi yang ditutup (tidak termasuk "Sedang Berjalan")
- `excused` (izin) TIDAK dihitung sebagai absent
- Rata-rata kelas di bagian bawah

## Requirement: Mahasiswa attendance view

Mahasiswa WAJIB dapat melihat kehadirannya sendiri.

- Tab "Kehadiran" di course detail (hanya kelompoknya sendiri)
- Rekap card: X Hadir, Y Izin, Z Absen, persentase bar
- List per section: minggu → sesi lainnya → sedang berjalan
- Card per sesi: status badge, nama sesi, kelompok, tanggal, pesan count, HOT count
- Sesi "Sedang Berjalan": "Kehadiran akan dihitung setelah sesi ditutup"

## Requirement: SRS/SDD revisions

Dokumen SRS/SDD WAJIB direvisi sesuai rancangan:

- FR-031: "Presensi Otomatis dari Partisipasi"
- BR-018: threshold 3 pesan, 1 HOT, tidak ada Terlambat
- BR-023 (baru): auto-close 3 jam
- BR-024 (rancangan): notifikasi auto-close (belum implementasi)
- UC-019: "Presensi Otomatis Sesi Diskusi"
- SD-004: sequence diagram auto-attendance
- DOSEN_FLOW §8: revisi total
- APP_FLOW §2.8: revisi
- Class diagram: `recordAttendance()` + `autoCloseInactiveSessions()` + `bulkCloseSessions()`
