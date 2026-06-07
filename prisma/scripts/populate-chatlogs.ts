/** Usage: cd Kolabri-core-api && npx tsx prisma/scripts/populate-chatlogs.ts */

import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MONGO_URI = process.env.DATABASE_URL_MONGODB || process.env.MONGODB_URL || 'mongodb://localhost:27017/kolabri';

const COURSE_MESSAGES: Record<string, Array<{ content: string; engagementType: string; isHigherOrder: boolean; hotIndicators: string[] }>> = {
  'IF201': [
    { content: 'Menurut analisis aku, React lebih efisien buat SPA karena virtual DOM-nya, tapi kalau project butuh SEO, Next.js lebih tepat karena ada server-side rendering.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'karena'] },
    { content: 'Aku membandingkan cara authentication pakai JWT vs session cookie. Kelebihan JWT itu stateless, tapi kekurangannya token besar dan susah di-revoke.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'kelebihan', 'kekurangan'] },
    { content: 'Berdasarkan evaluasi kode yang aku bikin, implementasi CORS yang benar itu harus spesifik origin-nya, jangan pakai wildcard karena security risk.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi', 'karena'] },
    { content: 'Halo teman-teman! Ada yang udah ngerjain tugas web belum?', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Aku masih bingung soal useEffect, ada yang bisa bantu?', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF202': [
    { content: 'Berdasarkan analisis ERD yang kita bikin, ada beberapa redundansi data di tabel orders. Aku mengusulkan untuk normalisasi ke 3NF dengan memisahkan customer data ke tabel terpisah.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'mengusulkan', 'normalisasi'] },
    { content: 'Aku membandingkan performa query dengan dan tanpa index. Hasilnya, query dengan index 10x lebih cepat untuk tabel dengan 100rb row, tapi ada trade-off untuk operasi INSERT/UPDATE.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'trade-off'] },
    { content: 'Menurut evaluasi desain database kita, penggunaan foreign key constraint sangat penting untuk menjaga referential integrity.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi', 'menjaga'] },
    { content: 'SELECT query yang bener gimana sih? Aku error terus.', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Normalisasi itu ribet banget ya, tapi penting.', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF203': [
    { content: 'Aku menganalisis perbandingan merge sort dan quick sort. Merge sort stabil dengan O(n log n) guaranteed, tapi butuh O(n) space. Quick sort in-place tapi worst case O(n²).', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['menganalisis', 'perbandingan'] },
    { content: 'Berdasarkan evaluasi implementasi linked list vs array, kelebihan linked list untuk operasi insert/delete di tengah karena O(1), tapi kekurangannya akses random O(n).', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi', 'kelebihan', 'kekurangan'] },
    { content: 'Aku menyimpulkan bahwa dynamic programming efektif untuk masalah yang memiliki optimal substructure dan overlapping subproblems.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['menyimpulkan'] },
    { content: 'Big-O notation itu gimana cara baca?', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Sorting algorithm banyak banget, bingung pilih yang mana.', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF205': [
    { content: 'Berdasarkan analisis dataset yang kita punya, aku mengusulkan untuk pakai Random Forest karena tahan terhadap outlier dan bisa handle fitur yang tidak relevan.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'mengusulkan', 'karena'] },
    { content: 'Aku membandingkan performa SVM dan Logistic Regression untuk klasifikasi teks. Hasilnya SVM lebih baik untuk data high-dimensional karena margin maximization.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'karena'] },
    { content: 'Menurut evaluasi model yang aku latih, precision lebih penting daripada recall untuk kasus fraud detection karena false positive lebih murah daripada false negative.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi', 'karena'] },
    { content: 'Machine learning itu apa sih? Kok ribet banget.', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
    { content: 'Dataset yang bagus dicari dimana ya?', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF206': [
    { content: 'Berdasarkan analisis retrospektif sprint kita, komunikasi adalah faktor utama yang mempengaruhi velocity. Aku mengusulkan daily standup yang lebih terstruktur.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'mempengaruhi', 'mengusulkan'] },
    { content: 'Aku membandingkan pendekatan TDD dan BDD. TDD fokus pada unit test dulu, BDD fokus pada behavior. Untuk project kita, TDD lebih cocok karena scope-nya teknis.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'karena'] },
    { content: 'Menurut evaluasi code review yang kita lakukan, penggunaan checklist bisa meningkatkan efektivitas review.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi', 'meningkatkan'] },
    { content: 'Sprint planning kapan ya? Aku lupa jadwalnya.', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Agile itu susah diterapkan di team kecil.', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF204': [
    { content: 'Berdasarkan analisis traffic jaringan lab, aku menemukan bahwa bottleneck ada di layer transport karena banyak connection yang tidak ditutup dengan benar.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'menemukan', 'karena'] },
    { content: 'Aku membandingkan performa TCP dan UDP untuk streaming video. UDP lebih cocok karena toleran terhadap packet loss, sedangkan TCP retransmission menyebabkan delay.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'karena'] },
    { content: 'Menurut evaluasi konfigurasi firewall yang kita buat, aturan yang terlalu permissive bisa menjadi security risk. Prinsip least privilege harus diterapkan.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi', 'menjadi'] },
    { content: 'IP address itu gimana cara setting?', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Jaringan kompleks banget, banyak layer.', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF207': [
    { content: 'Berdasarkan analisis performa sistem, aku menemukan bahwa context switching yang terlalu sering menyebabkan overhead yang signifikan.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'menemukan', 'menyebabkan'] },
    { content: 'Aku membandingkan algoritma scheduling FCFS, SJF, dan Round Robin. Round Robin paling fair untuk time-sharing system karena setiap proses mendapat porsi CPU yang sama.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'karena'] },
    { content: 'Menurut evaluasi implementasi semaphore yang kita buat, penggunaan yang tidak tepat bisa menyebabkan deadlock atau starvation.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi', 'menyebabkan'] },
    { content: 'Process dan thread bedanya apa?', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Deadlock itu bikin pusing.', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF208': [
    { content: 'Berdasarkan analisis benchmark yang aku lakukan, Flutter lebih unggul dalam rendering performance karena menggunakan Skia engine.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'karena'] },
    { content: 'Aku membandingkan Redux dan MobX untuk state management. Redux lebih predictable tapi boilerplate, MobX lebih fleksibel tapi magic-nya susah di-debug.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'tapi'] },
    { content: 'Menurut evaluasi UX yang aku lakukan, offline-first approach meningkatkan user experience.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi', 'meningkatkan'] },
    { content: 'React Native gimana cara install?', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Mobile development susah ya, banyak platform.', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF209': [
    { content: 'Berdasarkan analisis performa rendering, penggunaan level of detail (LOD) bisa mengurangi polygon count tanpa mengurangi kualitas visual secara signifikan.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'mengurangi'] },
    { content: 'Aku membandingkan Phong shading dan Blinn-Phong shading. Blinn-Phong lebih efisien secara komputasi karena menggunakan half-vector.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'karena'] },
    { content: 'Menurut evaluasi texture mapping yang aku lakukan, penggunaan mipmap mengurangi aliasing pada texture.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi', 'mengurangi'] },
    { content: 'OpenGL itu gimana cara mulai?', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Grafika komputer itu math-heavy banget.', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF210': [
    { content: 'Berdasarkan analisis keamanan aplikasi web yang kita buat, ditemukan beberapa vulnerability: SQL injection di login form dan XSS di comment section.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'ditemukan'] },
    { content: 'Aku membandingkan bcrypt dan argon2 untuk password hashing. Argon2 lebih aman terhadap GPU attack karena memory-hard function.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'karena'] },
    { content: 'Menurut evaluasi keamanan yang aku lakukan, implementasi HTTPS saja tidak cukup. Perlu juga HSTS, secure cookies, dan Content Security Policy.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi'] },
    { content: 'SQL injection itu gimana cara cegah?', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Keamanan itu penting tapi susah.', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF211': [
    { content: 'Berdasarkan analisis dataset customer, aku menemukan 3 segmen yang berbeda menggunakan K-Means. Evaluasi dengan silhouette score menunjukkan k=3 adalah optimal.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'menemukan', 'evaluasi'] },
    { content: 'Aku membandingkan Decision Tree dan Random Forest untuk klasifikasi. Random Forest lebih robust terhadap overfitting karena ensemble dari banyak tree.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'karena'] },
    { content: 'Menurut evaluasi association rule yang kita temukan, support dan confidence threshold sangat mempengaruhi jumlah rules yang dihasilkan.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi', 'mempengaruhi'] },
    { content: 'K-Means clustering gimana cara kerjanya?', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Data mining itu susah, banyak preprocessing.', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
  'IF212': [
    { content: 'Berdasarkan analisis kebutuhan project, aku mengusulkan untuk menggunakan PaaS daripada IaaS karena mengurangi operational overhead.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['analisis', 'mengusulkan', 'karena'] },
    { content: 'Aku membandingkan performa Docker container dan VM. Container lebih ringan karena sharing host kernel, tapi VM lebih secure karena isolasi yang lebih kuat.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['membandingkan', 'karena'] },
    { content: 'Menurut evaluasi arsitektur microservices yang kita rancang, service decomposition harus berdasarkan business domain, bukan teknologi.', engagementType: 'cognitive', isHigherOrder: true, hotIndicators: ['evaluasi'] },
    { content: 'Docker itu gimana cara pakai?', engagementType: 'behavioral', isHigherOrder: false, hotIndicators: [] },
    { content: 'Cloud computing itu mahal ya?', engagementType: 'emotional', isHigherOrder: false, hotIndicators: [] },
  ],
};

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
  console.log('🌱 Populating ChatLog collection...\n');

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const ChatLog = mongoose.model('ChatLog', new mongoose.Schema({
    courseId: String,
    groupId: String,
    chatSpaceId: String,
    senderId: String,
    senderName: String,
    senderType: String,
    content: String,
    isIntervention: Boolean,
    isDeleted: Boolean,
    engagement: {
      engagementType: String,
      isHigherOrder: Boolean,
      lexicalVariety: Number,
      hotIndicators: [String],
      confidence: Number,
    },
    createdAt: Date,
  }, { collection: 'chatlogs' }));

  await ChatLog.deleteMany({});
  console.log('🧹 Cleaned existing ChatLogs');

  const groups = await prisma.group.findMany({
    include: { course: true, members: { include: { user: true } }, chatSpaces: true },
  });

  const NOW = new Date();
  const ONE_WEEK_AGO = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
  let totalMessages = 0;

  for (const group of groups) {
    const courseCode = group.course.code;
    const messages = COURSE_MESSAGES[courseCode] || COURSE_MESSAGES['IF201'];
    const chatSpace = group.chatSpaces[0];
    if (!chatSpace) continue;

    const members = group.members.map(m => ({ id: m.user.id, name: m.user.name }));

    for (let day = 0; day < 7; day++) {
      const dayDate = new Date(ONE_WEEK_AGO);
      dayDate.setDate(dayDate.getDate() + day);

      const messagesPerDay = Math.floor(Math.random() * 5) + 2;
      for (let msg = 0; msg < messagesPerDay; msg++) {
        const msgTemplate = randomElement(messages);
        const sender = randomElement(members);
        const msgDate = new Date(dayDate);
        msgDate.setHours(randomInt(8, 22), randomInt(0, 59), randomInt(0, 59));

        await ChatLog.create({
          courseId: group.courseId,
          groupId: group.id,
          chatSpaceId: chatSpace.id,
          senderId: sender.id,
          senderName: sender.name,
          senderType: 'student',
          content: msgTemplate.content,
          isIntervention: false,
          isDeleted: false,
          engagement: {
            engagementType: msgTemplate.engagementType,
            isHigherOrder: msgTemplate.isHigherOrder,
            lexicalVariety: Math.floor(Math.random() * 60) + 20,
            hotIndicators: msgTemplate.hotIndicators,
            confidence: Math.random() * 0.3 + 0.7,
          },
          createdAt: msgDate,
        });
        totalMessages++;
      }
    }

    console.log(`  ✅ ${group.course.code} ${group.name}: ${members.length} members`);
  }

  console.log(`\n🎉 Done! Created ${totalMessages} ChatLog entries`);

  await prisma.$disconnect();
  await mongoose.disconnect();
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

main().catch(console.error);
