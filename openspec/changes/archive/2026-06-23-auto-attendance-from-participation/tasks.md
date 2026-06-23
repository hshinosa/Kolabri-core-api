## 1. SRS/SDD Revisions

- [ ] 1.1 Edit SRS v2: FR-031 → "Presensi Otomatis dari Partisipasi" (revisi deskripsi + acceptance criteria)
- [ ] 1.2 Edit SRS v2: BR-018 diperjelas (threshold 3 pesan, 1 HOT, tidak ada Terlambat)
- [ ] 1.3 Edit SRS v2: tambah BR-023 (auto-close 3 jam tanpa pesan)
- [ ] 1.4 Edit SRS v2: tambah BR-024 rancangan (notifikasi auto-close — belum implementasi)
- [ ] 1.5 Edit SRS v2: UC-019 → "Presensi Otomatis Sesi Diskusi"
- [ ] 1.6 Edit SRS v2: hak akses mahasiswa diperjelas (kehadiran pribadi: status, pesan, HOT, rekap)
- [ ] 1.7 Edit SDD v2: SD-004 sequence diagram diperjelas (alur auto-attendance saat close)
- [ ] 1.8 Edit SDD v2: class diagram `recordAttendance()` diperjelas + `autoCloseInactiveSessions()` + `bulkCloseSessions()`
- [ ] 1.9 Edit DOSEN_FLOW_DETAILED: §8 revisi total (8.1 Riwayat, 8.2 Tutup & Bulk Close, 8.3 Koreksi, 8.4 Rekapitulasi)
- [ ] 1.10 Edit APP_FLOW_BY_ROLE: §2.8 revisi (Attendance Tracking → Auto-Attendance Workflow)

## 2. Client-app — DB migration

- [ ] 2.1 Buat Laravel migration: add `session_discussion_id` (VARCHAR(36), nullable, unique), `week_id` (VARCHAR(36), nullable), `group_id` (VARCHAR(36), nullable), `auto_generated` (BOOLEAN, default false), `attendance_method` (ENUM('auto','manual'), default 'auto') to `attendance_sessions`
- [ ] 2.2 Update `AttendanceSession` model: fillable + casts untuk kolom baru
- [ ] 2.3 `php artisan migrate` — verify migration success

## 3. Core-api — auto-attendance hook

- [ ] 3.1 Buat `src/services/attendance.service.ts`:
  - `generateAttendance(sessionDiscussionId)`: query MongoDB ChatLog per student (count pesan + count HOT where `engagement.isHigherOrder = true`) → determine status (present: count ≥3 AND hotCount ≥1, absent: otherwise) → POST ke client-app `/api/attendance/auto-generate`
  - `bulkCloseSessions(sessionDiscussionIds[], dosenId)`: close multiple + call generateAttendance per session
- [ ] 3.2 Edit `src/services/sessionDiscussion.service.ts` `closeSession()`: setelah update `closedAt`, call `attendanceService.generateAttendance(sessionDiscussionId)`
- [ ] 3.3 Edit `src/controllers/sessionDiscussion.controller.ts`: expose bulk close endpoint
- [ ] 3.4 Edit `src/routes/sessionDiscussion.routes.ts`: `POST /:id/close` (existing), `POST /bulk-close` (new)
- [ ] 3.5 Configurable threshold: tambah ke course settings (default: 3 pesan, 1 HOT) — atau hardcode dulu, config later
- [ ] 3.6 `npx tsc --noEmit` — 0 errors

## 4. Core-api — auto-close cron job

- [ ] 4.1 Buat `src/jobs/auto-close.job.ts`: query sesi dengan `closedAt = null` DAN pesan terakhir >3 jam → call `closeSession()` per sesi (closedBy = 'system')
- [ ] 4.2 Schedule: jalankan setiap 15 menit (node-cron atau setInterval)
- [ ] 4.3 Edit `src/server.ts`: start cron job on boot
- [ ] 4.4 Log: setiap auto-close dicatat dengan sessionDiscussionId + reason
- [ ] 4.5 `npx tsc --noEmit` — 0 errors

## 5. Client-app — dosen UI rework

- [ ] 5.1 Edit `LecturerAttendanceController.php`:
  - `index()`: hapus manual create, ganti query attendance_sessions yang auto-generated (filter by course + optional group/week) — eager load records (fix N+1)
  - `show(sessionId)`: return attendance records + message count + HOT count per student
  - `override(sessionId, studentId, newStatus)`: update record, set `marked_by = dosen_id`, preserve auto-status in notes
  - `bulkClose()`: proxy ke core-api `POST /api/session-discussions/bulk-close`
  - `summary()`: filter by week + group, fix math (excused ≠ absent, no late column, pending excluded from denominator)
  - Hapus: `store()`, `markAttendance()`, `updateSession()`
  - Add auth check: verify dosen owns course
- [ ] 5.2 Edit `routes/web.php`: update attendance routes (remove create/mark, add override/bulk-close)
- [ ] 5.3 Rework `AttendanceTab.tsx`:
  - Tab per kelompok: `[Semua] [Kelompok A] [Kelompok B] [Kelompok C]`
  - 3 section grouping: minggu (by weekId) → sesi lainnya (weekId null) → sedang berjalan (closedAt null)
  - Card per sesi: badge (Auto ✓ / Auto ✓ otomatis / Sedang Berjalan / Dikoreksi), % hadir, [Lihat Detail] [Hapus]
  - Bulk close: `[Tutup & Cat Kehadiran]` per sesi, `[Tutup Semua Sesi Berjalan]`
  - Hapus: tombol "+ Tambah Pertemuan", form create, mode "Tandai" manual
- [ ] 5.4 Buat override page (detail sesi):
  - List mahasiswa: status badge (clickable cycle: Hadir → Absen → Izin), nama, email, pesan count, HOT count
  - `[Simpan Koreksi]` button
- [ ] 5.5 Rework rekapitulasi tab:
  - Filter: Minggu dropdown (termasuk "Sesi Lainnya"), Kelompok dropdown
  - Tabel: Mahasiswa | Hadir | Izin | Absen | % (hapus kolom Telat)
  - Rata-rata kelas di bawah
- [ ] 5.6 `npx tsc --noEmit` — 0 errors
- [ ] 5.7 `php -l` on changed files

## 6. Client-app — mahasiswa UI

- [ ] 6.1 Buat `StudentAttendanceController.php`:
  - `index(courseId)`: return attendance records for mahasiswa's group only (status, pesan count, HOT count, session name, week title, closedAt)
  - `summary(courseId)`: return rekap (total hadir/absent/excused, persentase)
- [ ] 6.2 Edit `routes/web.php`: add `GET /student/courses/{course}/attendance`
- [ ] 6.3 Buat page `resources/js/pages/student/courses/attendance.tsx`:
  - Rekap card: X Hadir, Y Izin, Z Absen, persentase bar
  - List per section: minggu → sesi lainnya → sedang berjalan
  - Card per sesi: status badge, nama sesi, kelompok, tanggal, pesan count, HOT count
  - Sedang berjalan: "Kehadiran akan dihitung setelah sesi ditutup"
- [ ] 6.4 Edit `student-nav.tsx`: add "Kehadiran" tab di course detail mahasiswa
- [ ] 6.5 Edit `index.d.ts`: add attendance types untuk student view
- [ ] 6.6 `npx tsc --noEmit` — 0 errors

## 7. Bug fixes

- [ ] 7.1 Fix N+1 query in `LecturerAttendanceController.index()` — eager load records
- [ ] 7.2 Fix attendance rate math: `excused` ≠ absent, no late, pending excluded from denominator
- [ ] 7.3 Add auth check: dosen must own course to access attendance
- [ ] 7.4 Remove dead route: `updateSession` (exists but no UI calls it)
- [ ] 7.5 Fix `GlobalSearch` `whereHas('course')` — `AttendanceSession` has no `course()` relation

## 8. Deploy + verify

- [ ] 8.1 rsync all 3 repos to VPS
- [ ] 8.2 Rebuild containers: `docker compose build core-api client-app && docker compose up -d core-api client-app`
- [ ] 8.3 Run Laravel migration on VPS
- [ ] 8.4 E2E test: login dosen → buka course → tab attendance → lihat auto-attendance dari sesi yang ditutup → override → rekap
- [ ] 8.5 E2E test: login mahasiswa → buka course → tab kehadiran → lihat status
- [ ] 8.6 E2E test: close sesi diskusi → verify attendance auto-generated
- [ ] 8.7 E2E test: wait 3 jam (or trigger cron manually) → verify auto-close + auto-attendance

## 9. Commit + archive

- [ ] 9.1 Git commit all 3 repos
- [ ] 9.2 Archive OpenSpec in core-api
