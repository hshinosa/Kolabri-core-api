import { seedDemoData } from './scripts/seed-demo-data.js';
import { seedDemoChatlogs } from './scripts/seed-demo-chatlogs.js';
import { verifyDemoData } from './scripts/verify-demo-data.js';
import { fileURLToPath } from 'node:url';

async function main() {
    console.log('🌱 Running default full demo seed...');
    await seedDemoData();
    await seedDemoChatlogs();
    await verifyDemoData();
    console.log('✅ Default full demo seed complete');
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
    main()
        .catch((error) => {
            console.error('❌ Default full demo seed failed:', error);
            process.exit(1);
        });
}
