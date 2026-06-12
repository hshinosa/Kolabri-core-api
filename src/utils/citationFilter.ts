export type CitationInput = {
    course_material_id: string;
    label?: string;
    page?: number;
};

export type AllowedMaterialMeta = {
    id: string;
    minWeekIndex: number;
};

/**
 * Keep citations whose material is assigned to a week with week_index <= sessionWeekIndex.
 */
export function filterCitationsForSession(
    citations: CitationInput[],
    allowedMaterials: AllowedMaterialMeta[],
    sessionWeekIndex: number
): CitationInput[] {
    const allowed = new Map(allowedMaterials.map((m) => [m.id, m.minWeekIndex]));
    return citations.filter((c) => {
        const minWeek = allowed.get(c.course_material_id);
        if (minWeek === undefined) {
            return false;
        }
        return minWeek <= sessionWeekIndex;
    });
}

export async function allowedMaterialsForCourseMaxWeek(
    courseId: string,
    maxWeekIndex: number
): Promise<AllowedMaterialMeta[]> {
    const { default: prisma } = await import('../config/database.js');
    try {
        const rows = await prisma.$queryRaw<{ id: string; min_week_index: number }[]>`
            SELECT cm.id,
                   MIN(cw.week_index)::int AS min_week_index
            FROM course_materials cm
            INNER JOIN course_week_materials cwm ON cwm.course_material_id = cm.id
            INNER JOIN course_weeks cw ON cw.id = cwm.course_week_id
            WHERE cm.course_id = ${courseId}::uuid
              AND cw.week_index <= ${maxWeekIndex}
            GROUP BY cm.id
        `;
        return rows.map((r) => ({ id: r.id, minWeekIndex: r.min_week_index }));
    } catch {
        // course_weeks lives in client-app MySQL
        return [];
    }
}