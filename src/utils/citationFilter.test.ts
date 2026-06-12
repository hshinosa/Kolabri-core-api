import { describe, expect, it } from 'vitest';
import { filterCitationsForSession } from './citationFilter.js';

describe('filterCitationsForSession', () => {
    const allowed = [
        { id: 'mat-week-2', minWeekIndex: 2 },
        { id: 'mat-week-1', minWeekIndex: 1 },
    ];

    it('drops citations for materials not in allowed set', () => {
        const out = filterCitationsForSession(
            [{ course_material_id: 'unknown', label: 'X' }],
            allowed,
            3,
        );
        expect(out).toEqual([]);
    });

    it('drops materials assigned only to a future week relative to session', () => {
        const out = filterCitationsForSession(
            [{ course_material_id: 'mat-week-2', label: 'W2' }],
            allowed,
            1,
        );
        expect(out).toEqual([]);
    });

    it('keeps citations when material min week is at or before session week', () => {
        const cite = { course_material_id: 'mat-week-2', label: 'Doc', page: 4 };
        const out = filterCitationsForSession([cite], allowed, 2);
        expect(out).toEqual([cite]);
    });
});