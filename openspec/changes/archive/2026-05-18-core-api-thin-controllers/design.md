## Context

14 controller files di `src/controllers/`. Controller yang "tebal" biasanya terjadi karena: query Prisma langsung di controller, kondisi bisnis di controller, atau transformasi data kompleks di controller. Audit diperlukan untuk identifikasi controller mana yang paling bermasalah.

## Goals / Non-Goals

**Goals:**
- Controller hanya: parse input → call service → return response
- Tidak ada `prisma.*` calls langsung di controller
- Kondisi bisnis pindah ke service

**Non-Goals:**
- Mengubah API contract
- Mengubah behavior
- Refactor service layer yang sudah benar

## Decisions

**1. Audit-first, prioritize worst offenders**
Tidak semua controller perlu direfactor. Fokus pada yang paling tebal.

**2. Incremental — satu controller per task**
Refactor satu controller sekaligus untuk minimize risk.

**3. Test coverage harus tetap sama atau lebih baik**
Setiap refactor harus diverifikasi dengan existing tests.

## Risks / Trade-offs

- **[Risk] Refactor memperkenalkan bug** → Mitigation: existing tests sebagai safety net.
- **[Risk] Scope creep** → Mitigation: hanya pindahkan logic yang jelas salah tempat.

## Migration Plan

1. Audit 14 controller — rank by "thickness"
2. Refactor top 3-5 controller yang paling tebal
3. Run tests setelah setiap controller
