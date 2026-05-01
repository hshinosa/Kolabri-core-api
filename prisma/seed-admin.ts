import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding first admin account...');

    const hashedPassword = await bcrypt.hash('password', 10);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@kolabri.id' },
        update: {},
        create: {
            email: 'admin@kolabri.id',
            password: hashedPassword,
            name: 'Admin Kolabri',
            role: UserRole.admin,
        },
    });

    console.log('✅ Created admin:', admin.email);
}

main()
    .catch((e) => {
        console.error('❌ Admin seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
