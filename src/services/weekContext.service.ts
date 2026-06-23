import prisma from '../config/database.js';

export type WeekMaterialSnippet = {
    id: string;
    title: string;
    description: string | null;
};

export type SessionWeekContext = {
    weekId: string;
    weekIndex: number;
    weekTitle: string;
    materials: WeekMaterialSnippet[];
};

export class WeekContextService {
    static async sessionWeekForSessionDiscussion(weekId: string | null | undefined): Promise<SessionWeekContext | null> {
        if (!weekId) {
            return null;
        }

        try {
            const weekRows = await prisma.$queryRaw<
                { id: string; week_index: number; title: string; course_id: string }[]
            >`
                SELECT id, week_index, title, course_id
                FROM course_weeks
                WHERE id = ${weekId}::text
                LIMIT 1
            `;
            const week = weekRows[0];
            if (!week) {
                return null;
            }

            const materials = await prisma.$queryRaw<WeekMaterialSnippet[]>`
                SELECT cm.id, cm.title, cm.description
                FROM course_week_materials cwm
                INNER JOIN course_materials cm ON cm.id = cwm.course_material_id
                WHERE cwm.course_week_id = ${weekId}::text
                ORDER BY cwm.sort_order ASC
            `;

            return {
                weekId: week.id,
                weekIndex: week.week_index,
                weekTitle: week.title,
                materials,
            };
        } catch {
            // course_weeks lives in client-app MySQL
            return null;
        }
    }
}