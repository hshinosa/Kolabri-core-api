import prisma from '../src/config/database.js';

const courseId = process.argv[2] ?? 'bc0061ab-decf-430a-842e-e7e8ea11afa0';

async function main() {
    const rows = await prisma.knowledgeBase.findMany({
        where: { courseId },
        select: { id: true, fileName: true, vectorStatus: true },
    });
    console.log(`Course ${courseId}: ${rows.length} KB record(s)`);
    for (const r of rows) {
        console.log(`  - ${r.fileName} (${r.vectorStatus}) ${r.id}`);
    }
    const del = await prisma.knowledgeBase.deleteMany({ where: { courseId } });
    console.log(`Deleted: ${del.count}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());