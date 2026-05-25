import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create demo lecturer
    const hashedPassword = await bcrypt.hash('password123', 10);

    const lecturer = await prisma.user.upsert({
        where: { email: 'lecturer@kolabri.edu' },
        update: {
            password: hashedPassword,
            name: 'Dr. Ahmad Lecturer',
            role: UserRole.lecturer,
        },
        create: {
            email: 'lecturer@kolabri.edu',
            password: hashedPassword,
            name: 'Dr. Ahmad Lecturer',
            role: UserRole.lecturer,
        },
    });

    console.log('✅ Created lecturer:', lecturer.email);

    // Create demo students
    const studentEmails = [
        'student1@kolabri.edu',
        'student2@kolabri.edu',
        'student3@kolabri.edu',
    ];

    const students = [];
    for (const email of studentEmails) {
        const student = await prisma.user.upsert({
            where: { email },
            update: {
                password: hashedPassword,
                name: `Student ${email.split('@')[0]}`,
                role: UserRole.student,
            },
            create: {
                email,
                password: hashedPassword,
                name: `Student ${email.split('@')[0]}`,
                role: UserRole.student,
            },
        });
        students.push(student);
        console.log('✅ Created student:', student.email);
    }

    // Create demo course
    const course = await prisma.course.upsert({
        where: { code: 'CS401' },
        update: {},
        create: {
            code: 'CS401',
            name: 'Human-Computer Interaction',
            description: 'Learn the principles of designing user-centered interfaces',
            joinCode: 'HCI2024',
            ownerId: lecturer.id,
        },
    });

    console.log('✅ Created course:', course.code, '-', course.name);

    // Enroll students in course
    for (const student of students) {
        await prisma.courseStudent.upsert({
            where: {
                courseId_userId: {
                    courseId: course.id,
                    userId: student.id,
                },
            },
            update: {},
            create: {
                courseId: course.id,
                userId: student.id,
            },
        });
    }

    console.log('✅ Enrolled', students.length, 'students in course');

    // Create a demo group
    const group = await prisma.group.upsert({
        where: { id: 'demo-group-1' },
        update: {},
        create: {
            id: 'demo-group-1',
            name: 'Team Alpha',
            joinCode: 'GROUP-ALPHA',
            courseId: course.id,
            createdBy: lecturer.id,
        },
    });

    console.log('✅ Created group:', group.name);

    // Add students to group
    for (const student of students) {
        await prisma.groupMember.upsert({
            where: {
                groupId_userId: {
                    groupId: group.id,
                    userId: student.id,
                },
            },
            update: {},
            create: {
                groupId: group.id,
                userId: student.id,
            },
        });
    }

    console.log('✅ Added', students.length, 'members to group');

    // Create default ChatSpace for the group
    const chatSpace = await prisma.chatSpace.upsert({
        where: { id: 'demo-chatspace-1' },
        update: {},
        create: {
            id: 'demo-chatspace-1',
            name: 'General Discussion',
            description: 'Default discussion space for Team Alpha',
            isDefault: true,
            groupId: group.id,
            createdBy: lecturer.id,
        },
    });

    console.log('✅ Created chat space:', chatSpace.name);

    console.log('');
    console.log('🎉 Seeding completed!');
    console.log('');
    console.log('Demo Credentials:');
    console.log('  Lecturer: lecturer@kolabri.edu / password123');
    console.log('  Student:  student1@kolabri.edu / password123');
    console.log('  Course Join Code: HCI2024');
    console.log('  Group Join Code:  GROUP-ALPHA');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
