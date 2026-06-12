/** Usage: cd Kolabri-core-api && npx tsx prisma/scripts/seed-demo-data.ts */

import { NotificationType, PrismaClient, UserRole, type User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();

const NOW = new Date();
const ONE_WEEK_AGO = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);

function seedUuid(seed: string): string {
  const h = createHash('md5').update(seed).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}

type ActivityLevel = 'high' | 'medium' | 'low' | 'silent';
type StudentWithEngagement = User & { engagement: ActivityLevel };

type DemoAiChatSeed = {
  studentEmail: string;
  title: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
};

interface CourseContent {
  code: string;
  name: string;
  description: string;
  topics: string[];
  assignmentQuestions: string[];
  hotDiscussions: string[];
  aiPrompts: string[];
  aiResponses: string[];
  goals: string[];
  reflections: string[];
}

const COURSE_DEMO_CONFIG: Record<string, {
  minMembersPerGroup: number;
  maxMembersPerGroup: number;
  aiGuardrailConfig: { preset: 'strict' | 'balanced' | 'relaxed'; allowRewrite: boolean; allowFlagOnly: boolean };
  aiScaffoldingConfig: { scaffoldingLevel: 'early' | 'late' | 'auto'; enabled: boolean };
  knowledgeBase?: Array<{ fileName: string; filePath: string; fileSize: number; mimeType: string; vectorStatus: 'ready' | 'processing' }>;
}> = {
  IF201: {
    minMembersPerGroup: 2,
    maxMembersPerGroup: 3,
    aiGuardrailConfig: { preset: 'balanced', allowRewrite: true, allowFlagOnly: false },
    aiScaffoldingConfig: { scaffoldingLevel: 'auto', enabled: true },
    knowledgeBase: [{ fileName: 'web-architecture-handbook.pdf', filePath: '/demo/kb/web-architecture-handbook.pdf', fileSize: 1850000, mimeType: 'application/pdf', vectorStatus: 'ready' }],
  },
  IF202: {
    minMembersPerGroup: 2,
    maxMembersPerGroup: 2,
    aiGuardrailConfig: { preset: 'strict', allowRewrite: false, allowFlagOnly: false },
    aiScaffoldingConfig: { scaffoldingLevel: 'auto', enabled: true },
    knowledgeBase: [{ fileName: 'database-normalization-cheatsheet.pdf', filePath: '/demo/kb/database-normalization-cheatsheet.pdf', fileSize: 980000, mimeType: 'application/pdf', vectorStatus: 'ready' }],
  },
  IF203: {
    minMembersPerGroup: 2,
    maxMembersPerGroup: 3,
    aiGuardrailConfig: { preset: 'relaxed', allowRewrite: true, allowFlagOnly: true },
    aiScaffoldingConfig: { scaffoldingLevel: 'auto', enabled: true },
    knowledgeBase: [{ fileName: 'algorithm-complexity-notes.pdf', filePath: '/demo/kb/algorithm-complexity-notes.pdf', fileSize: 1210000, mimeType: 'application/pdf', vectorStatus: 'processing' }],
  },
  IF204: {
    minMembersPerGroup: 1,
    maxMembersPerGroup: 4,
    aiGuardrailConfig: { preset: 'balanced', allowRewrite: true, allowFlagOnly: false },
    aiScaffoldingConfig: { scaffoldingLevel: 'auto', enabled: true },
  },
};

const COURSES: CourseContent[] = [
  {
    code: 'IF201', name: 'Pemrograman Web',
    description: 'Mempelajari pengembangan aplikasi web modern menggunakan HTML, CSS, JavaScript, dan framework.',
    topics: ['React', 'CSS Grid', 'REST API', 'authentication', 'responsive design', 'deployment'],
    assignmentQuestions: [
      'Gimana cara bikin responsive navbar di React?',
      'Ada yang tau cara handle CORS error waktu fetch API?',
      'useEffect aku jalan terus infinite loop, kenapa ya?',
      'Form validation yang bener kayak gimana sih?',
      'Cara deploy ke Vercel gimana?',
      'JWT token expired terus, gimana handle refresh token?',
    ],
    hotDiscussions: [
      'Menurut analisis aku, React lebih efisien buat SPA karena virtual DOM-nya, tapi kalau project butuh SEO, Next.js lebih tepat karena ada server-side rendering.',
      'Aku membandingkan cara authentication pakai JWT vs session cookie. Kelebihan JWT itu stateless, tapi kekurangannya token besar dan susah di-revoke.',
      'Berdasarkan evaluasi kode yang aku bikin, implementasi CORS yang benar itu harus spesifik origin-nya, jangan pakai wildcard karena security risk.',
      'Aku menyimpulkan bahwa penggunaan useEffect yang benar harus diperhatikan dependency array-nya, kalau tidak bisa menyebabkan infinite re-render yang berdampak pada performa.',
      'Menurutku, alasan kenapa form validation harus dilakukan di client dan server adalah karena client-side bisa memberikan feedback instan, tapi server-side tetap diperlukan untuk keamanan.',
    ],
    aiPrompts: [
      'Jelaskan perbedaan antara controlled dan uncontrolled component di React',
      'Buatkan contoh custom hook untuk fetch data dengan loading state',
      'Bagaimana cara implementasi OAuth2 dengan Google di Express.js?',
      'Apa best practice untuk struktur folder project React yang besar?',
      'Bandingkan Ant Design vs Material-UI untuk project enterprise',
    ],
    aiResponses: [
      'Controlled component adalah komponen React yang value-nya dikontrol oleh state React. Uncontrolled component menyimpan state sendiri di DOM. Controlled lebih predictable karena React menjadi single source of truth.',
      'Berikut contoh custom hook useFetch: pertama buat state untuk data, loading, error. Kemudian gunakan useEffect untuk fetch saat component mount. Return semua state tersebut.',
      'Untuk implementasi OAuth2 Google: 1) Buat project di Google Console, 2) Install passport-google-oauth20, 3) Configure callback URL, 4) Serialize user ke session.',
      'Best practice struktur folder React: /src/components (reusable), /pages (route-based), /hooks (custom hooks), /services (API calls), /utils (helpers), /context (providers).',
      'Ant Design cocok untuk enterprise karena komponen lengkap dan konsisten. Material-UI lebih fleksibel untuk customisasi. Pilih Ant Design jika butuh development cepat dengan standar enterprise.',
    ],
    goals: [
      'Bisa membuat aplikasi CRUD lengkap dengan React dan Express',
      'Memahami konsep authentication dan authorization dengan JWT',
      'Mampu deploy aplikasi ke production dengan CI/CD',
      'Menguasai responsive design untuk berbagai ukuran layar',
    ],
    reflections: [
      'Tugas kali ini challenging karena harus integrasi frontend dan backend. Tapi jadi paham alur data dari React ke API.',
      'Masih bingung soal state management, terutama kapan pakai Context vs Redux. Perlu eksplorasi lebih.',
      'Alhamdulillah berhasil deploy ke Vercel. Ternyata environment variable harus di-set juga di hosting.',
      'Code review dari teman membantu banget, ternyata ada beberapa anti-pattern yang selama ini aku pakai.',
    ],
  },
  {
    code: 'IF202', name: 'Basis Data',
    description: 'Konsep dasar dan lanjutan sistem basis data relasional, SQL, dan desain database.',
    topics: ['normalization', 'SQL queries', 'indexing', 'transaction', 'ERD', 'NoSQL'],
    assignmentQuestions: [
      'Normalisasi dari 1NF ke 3NF gimana sih?',
      'Query JOIN yang bener kayak gimana?',
      'Kapan sebaiknya pakai INDEX?',
      'ERD untuk sistem kasir toko gimana?',
      'Perbedaan INNER JOIN dan LEFT JOIN apa?',
      'Cara optimasi query yang lambat gimana?',
    ],
    hotDiscussions: [
      'Berdasarkan analisis ERD yang kita bikin, ada beberapa redundansi data di tabel orders. Aku mengusulkan untuk normalisasi ke 3NF dengan memisahkan customer data ke tabel terpisah.',
      'Aku membandingkan performa query dengan dan tanpa index. Hasilnya, query dengan index 10x lebih cepat untuk tabel dengan 100rb row, tapi ada trade-off untuk operasi INSERT/UPDATE.',
      'Menurut evaluasi desain database kita, penggunaan foreign key constraint sangat penting untuk menjaga referential integrity, meskipun sedikit memperlambat operasi write.',
      'Aku menyimpulkan bahwa pemilihan antara SQL dan NoSQL harus berdasarkan karakteristik data. Data relasional dengan hubungan kompleks lebih cocok pakai SQL, sedangkan data semi-structured cocok pakai NoSQL.',
      'Alasan kenapa transaction penting adalah untuk menjaga ACID properties. Tanpa transaction, concurrent update bisa menyebabkan data inconsistency yang berdampak pada integritas sistem.',
    ],
    aiPrompts: [
      'Jelaskan konsep database normalization dengan contoh',
      'Buatkan query untuk mencari top 5 customer berdasarkan total belanja',
      'Apa perbedaan antara clustered dan non-clustered index?',
      'Bagaimana cara menangani deadlock di PostgreSQL?',
      'Kapan sebaiknya menggunakan NoSQL daripada SQL?',
    ],
    aiResponses: [
      'Database normalization adalah proses mengorganisasi data untuk mengurangi redundansi. 1NF: atomic values, 2NF: tidak ada partial dependency, 3NF: tidak ada transitive dependency.',
      'SELECT c.name, SUM(o.total) as total_belanja FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.name ORDER BY total_belanja DESC LIMIT 5;',
      'Clustered index menentukan urutan fisik data di disk (hanya 1 per tabel). Non-clustered index adalah struktur terpisah yang berisi pointer ke data.',
      'Untuk menangani deadlock: 1) Deteksi dengan timeout, 2) Prevention dengan lock ordering, 3) Hindari nested transaction, 4) Gunakan SELECT FOR UPDATE dengan urutan konsisten.',
      'Gunakan NoSQL jika: data schema fleksibel, butuh horizontal scaling, data berbentuk document/key-value. Contoh: user profiles, product catalog, logging.',
    ],
    goals: [
      'Bisa mendesain ERD yang proper untuk sistem nyata',
      'Menguasai SQL untuk berbagai jenis query',
      'Memahami konsep normalization sampai 3NF',
      'Bisa melakukan optimasi query database',
    ],
    reflections: [
      'Tugas ERD ternyata lebih susah dari yang aku kira. Perlu banyak latihan buat identifikasi entitas dan relasi.',
      'Praktikum SQL sangat membantu untuk memahami konsep JOIN yang sebelumnya abstrak.',
      'Normalisasi itu penting banget, tapi kadang denormalisasi diperlukan untuk performa. Perlu bijak.',
      'Project database design bikin aku paham pentingnya planning sebelum coding.',
    ],
  },
  {
    code: 'IF203', name: 'Algoritma dan Struktur Data',
    description: 'Analisis algoritma, struktur data dasar dan lanjutan, kompleksitas waktu.',
    topics: ['sorting', 'searching', 'linked list', 'tree', 'graph', 'dynamic programming', 'complexity analysis'],
    assignmentQuestions: [
      'Perbedaan time complexity O(n log n) dan O(n²) dampaknya gimana?',
      'Implementasi binary search tree gimana?',
      'Kapan pakai BFS vs DFS?',
      'Dynamic programming itu konsepnya gimana?',
      'Cara analisis Big-O dari nested loop gimana?',
      'Hash map collision handling gimana?',
    ],
    hotDiscussions: [
      'Aku menganalisis perbandingan merge sort dan quick sort. Merge sort stabil dengan O(n log n) guaranteed, tapi butuh O(n) space. Quick sort in-place tapi worst case O(n²).',
      'Berdasarkan evaluasi implementasi linked list vs array, kelebihan linked list untuk operasi insert/delete di tengah karena O(1), tapi kekurangannya akses random O(n).',
      'Menurut analisis aku, penggunaan hash map dengan proper hash function bisa mengurangi complexity pencarian dari O(n) ke O(1) amortized. Tapi perlu pertimbangkan collision rate.',
      'Aku menyimpulkan bahwa dynamic programming efektif untuk masalah yang memiliki optimal substructure dan overlapping subproblems, seperti fibonacci dan knapsack problem.',
      'Alasan kenapa pemilihan algoritma yang tepat penting adalah karena perbedaan performa yang signifikan pada data besar. O(n) vs O(n²) bisa berarti detik vs jam.',
    ],
    aiPrompts: [
      'Jelaskan konsep dynamic programming dengan contoh sederhana',
      'Bandingkan time complexity berbagai sorting algorithm',
      'Bagaimana cara mendeteksi cycle di linked list?',
      'Apa itu balanced binary tree dan mengapa penting?',
      'Contoh penggunaan graph di kehidupan nyata apa?',
    ],
    aiResponses: [
      'Dynamic programming adalah teknik menyelesaikan masalah dengan memecahnya menjadi subproblem lebih kecil dan menyimpan hasilnya. Contoh: fibonacci dengan memoization mengurangi complexity dari O(2^n) ke O(n).',
      'Bubble sort: O(n²), Selection sort: O(n²), Insertion sort: O(n²) avg, Merge sort: O(n log n), Quick sort: O(n log n) avg, Heap sort: O(n log n).',
      'Deteksi cycle: gunakan Floyd\'s algorithm (tortoise and hare). Dua pointer, satu maju 1 step, satu maju 2 steps. Jika bertemu, ada cycle.',
      'Balanced BST memastikan tinggi tree O(log n) sehingga operasi search/insert/delete O(log n). Contoh: AVL tree, Red-Black tree.',
      'Graph digunakan di: social network (friends), GPS navigation (shortest path), web crawling (links), dependency resolution (packages).',
    ],
    goals: [
      'Menguasai minimal 5 jenis sorting algorithm',
      'Bisa mengimplementasikan tree dan graph traversal',
      'Memahami konsep dynamic programming',
      'Mampu analisis Big-O dari kode yang ditulis',
    ],
    reflections: [
      'Dynamic programming awalnya sangat membingungkan, tapi setelah latihan soal berkali-kali mulai paham polanya.',
      'Implementasi graph traversal ternyata banyak dipakai di project nyata, seperti fitur rekomendasi.',
      'Analisis complexity membantu aku paham kenapa kode aku lambat dan bagaimana mengoptimasinya.',
      'Latihan di LeetCode sangat membantu untuk memahami pattern algoritma.',
    ],
  },
  {
    code: 'IF205', name: 'Kecerdasan Buatan',
    description: 'Konsep AI, machine learning, deep learning, dan aplikasinya.',
    topics: ['machine learning', 'neural network', 'classification', 'regression', 'NLP', 'computer vision', 'model evaluation'],
    assignmentQuestions: [
      'Perbedaan supervised dan unsupervised learning apa?',
      'Cara pilih model yang tepat untuk dataset kita gimana?',
      'Overfitting itu gimana cara ngatasinnya?',
      'Feature engineering itu penting ga sih?',
      'Confusion matrix dibaca gimana?',
      'Kapan pakai CNN vs RNN?',
    ],
    hotDiscussions: [
      'Berdasarkan analisis dataset yang kita punya, aku mengusulkan untuk pakai Random Forest karena tahan terhadap outlier dan bisa handle fitur yang tidak relevan.',
      'Aku membandingkan performa SVM dan Logistic Regression untuk klasifikasi teks. Hasilnya SVM lebih baik untuk data high-dimensional karena margin maximization.',
      'Menurut evaluasi model yang aku latih, precision lebih penting daripada recall untuk kasus fraud detection karena false positive lebih murah daripada false negative.',
      'Aku menyimpulkan bahwa feature engineering memiliki dampak lebih besar pada performa model daripada pemilihan algoritma. Data quality menentukan hasil akhir.',
      'Alasan kenapa cross-validation penting adalah untuk menghindari overfitting pada data training dan mendapatkan estimasi performa yang lebih reliable.',
    ],
    aiPrompts: [
      'Jelaskan bagaimana neural network belajar dengan backpropagation',
      'Contoh implementasi sentiment analysis dengan NLP apa?',
      'Bagaimana cara menangani imbalanced dataset?',
      'Apa itu transfer learning dan kapan digunakan?',
      'Perbedaan CNN dan RNN untuk image recognition?',
    ],
    aiResponses: [
      'Backpropagation bekerja dengan menghitung gradient loss terhadap setiap weight, kemudian update weight berdasarkan learning rate. Proses ini berulang hingga konvergen.',
      'Sentiment analysis bisa pakai: 1) Preprocessing (tokenisasi, stemming), 2) Feature extraction (TF-IDF, word embedding), 3) Model (Naive Bayes, LSTM, BERT).',
      'Menangani imbalanced dataset: 1) Oversampling minoritas (SMOTE), 2) Undersampling mayoritas, 3) Class weight adjustment, 4) Ensemble methods.',
      'Transfer learning menggunakan pre-trained model (seperti BERT, ResNet) dan fine-tune untuk task spesifik. Cocok untuk dataset kecil.',
      'CNN untuk spatial pattern (image), RNN untuk sequential pattern (text/time series). CNN lebih efisien untuk image karena convolution operation.',
    ],
    goals: [
      'Bisa memilih algoritma ML yang tepat untuk berbagai jenis masalah',
      'Mampu melakukan preprocessing dan feature engineering',
      'Memahami evaluasi model (precision, recall, F1)',
      'Bisa implementasi deep learning untuk kasus sederhana',
    ],
    reflections: [
      'Project ML pertama ini challenging banget, tapi jadi paham alur end-to-end dari data ke model.',
      'Preprocessing data ternyata makan waktu 80% dari keseluruhan project. Data cleaning itu crucial.',
      'Overfitting masalah utama yang aku hadapi. Regularization dan cross-validation sangat membantu.',
      'Kaggle competition sangat membantu untuk belajar best practices dalam ML.',
    ],
  },
  {
    code: 'IF206', name: 'Rekayasa Perangkat Lunak',
    description: 'Metodologi pengembangan perangkat lunak, testing, dan manajemen proyek.',
    topics: ['agile', 'scrum', 'testing', 'UML', 'design patterns', 'CI/CD', 'code review'],
    assignmentQuestions: [
      'Scrum ceremony apa aja yang wajib?',
      'Unit test yang baik itu kayak gimana?',
      'Design pattern singleton itu gimana?',
      'Cara bikin UML class diagram yang benar?',
      'CI/CD pipeline itu apa aja step-nya?',
      'Code review yang efektif gimana?',
    ],
    hotDiscussions: [
      'Berdasarkan analisis retrospektif sprint kita, komunikasi adalah faktor utama yang mempengaruhi velocity. Aku mengusulkan daily standup yang lebih terstruktur.',
      'Aku membandingkan pendekatan TDD dan BDD. TDD fokus pada unit test dulu, BDD fokus pada behavior. Untuk project kita, TDD lebih cocok karena scope-nya teknis.',
      'Menurut evaluasi code review yang kita lakukan, penggunaan checklist bisa meningkatkan efektivitas review karena reviewer tahu aspek apa yang harus diperhatikan.',
      'Aku menyimpulkan bahwa penggunaan design pattern yang tepat bisa meningkatkan maintainability kode, tapi over-engineering juga harus dihindari.',
      'Alasan kenapa CI/CD penting adalah karena mengurangi human error dalam deployment dan memberikan feedback cepat jika ada yang broken.',
    ],
    aiPrompts: [
      'Jelaskan perbedaan Scrum dan Kanban',
      'Contoh unit test yang baik untuk function calculateTotal?',
      'Bagaimana cara menerapkan SOLID principles?',
      'Apa itu technical debt dan bagaimana mengelolanya?',
      'Best practice untuk git branching strategy?',
    ],
    aiResponses: [
      'Scrum: fixed sprint (2-4 minggu), defined roles (PO, SM, Dev), ceremonies (planning, review, retro). Kanban: continuous flow, WIP limits, visual board. Scrum lebih terstruktur, Kanban lebih fleksibel.',
      'Unit test yang baik: 1) Test satu behavior, 2) Descriptive name, 3) Arrange-Act-Assert pattern, 4) Independent, 5) Fast execution.',
      'SOLID: S (Single Responsibility), O (Open/Closed), L (Liskov Substitution), I (Interface Segregation), D (Dependency Inversion).',
      'Technical debt: shortcut dalam kode yang mempercepat development sekarang tapi menambah biaya maintenance. Kelola dengan: tracking, prioritization, regular refactoring.',
      'Git Flow: main (production), develop (integration), feature/*, release/*, hotfix/*. Atau GitHub Flow yang lebih sederhana: main + feature branches.',
    ],
    goals: [
      'Memahami dan bisa menerapkan Scrum dalam team',
      'Mampu menulis unit test yang comprehensive',
      'Menguasai minimal 3 design pattern',
      'Bisa setup CI/CD pipeline sederhana',
    ],
    reflections: [
      'Sprint pertama chaotic banget karena belum terbiasa dengan Scrum. Tapi sprint ke-3 sudah lebih smooth.',
      'Code review membantu banget untuk belajar best practices dari senior developer.',
      'Ternyata technical debt itu real, kode yang buruk di awal jadi masalah besar nantinya.',
      'Teamwork dan komunikasi sama pentingnya dengan technical skill dalam software engineering.',
    ],
  },
  {
    code: 'IF204', name: 'Jaringan Komputer',
    description: 'Konsep jaringan, protokol TCP/IP, keamanan jaringan, dan administrasi server.',
    topics: ['TCP/IP', 'OSI model', 'routing', 'firewall', 'DNS', 'DHCP', 'network security'],
    assignmentQuestions: [
      'Layer OSI itu apa aja fungsinya?',
      'TCP dan UDP perbedaannya apa?',
      'Cara konfigurasi firewall gimana?',
      'DNS resolution process gimana?',
      'Subnetting itu gimana cara hitungnya?',
      'VPN itu gimana cara kerjanya?',
    ],
    hotDiscussions: [
      'Berdasarkan analisis traffic jaringan lab, aku menemukan bahwa bottleneck ada di layer transport karena banyak connection yang tidak ditutup dengan benar.',
      'Aku membandingkan performa TCP dan UDP untuk streaming video. UDP lebih cocok karena toleran terhadap packet loss, sedangkan TCP retransmission menyebabkan delay.',
      'Menurut evaluasi konfigurasi firewall yang kita buat, aturan yang terlalu permissive bisa menjadi security risk. Prinsip least privilege harus diterapkan.',
      'Aku menyimpulkan bahwa pemahaman tentang OSI model membantu dalam troubleshooting karena bisa mengisolasi masalah di layer tertentu.',
      'Alasan kenapa DNS caching penting adalah untuk mengurangi latency dan load pada authoritative DNS server, sehingga resolusi domain lebih cepat.',
    ],
    aiPrompts: [
      'Jelaskan 7 layer OSI model dengan contoh',
      'Bagaimana cara kerja TCP three-way handshake?',
      'Apa itu subnetting dan mengapa diperlukan?',
      'Contoh serangan jaringan dan cara pencegahannya?',
      'Perbedaan symmetric dan asymmetric encryption?',
    ],
    aiResponses: [
      '7 Layer OSI: 1) Physical (kabel, sinyal), 2) Data Link (MAC, switch), 3) Network (IP, router), 4) Transport (TCP, UDP), 5) Session (koneksi), 6) Presentation (enkripsi), 7) Application (HTTP, SMTP).',
      'TCP three-way handshake: 1) Client kirim SYN, 2) Server balas SYN-ACK, 3) Client kirim ACK. Setelah itu koneksi established dan data bisa dikirim.',
      'Subnetting membagi network besar menjadi subnetwork lebih kecil. Tujuan: mengurangi broadcast domain, meningkatkan keamanan, dan menghemat IP address.',
      'Serangan: DDoS (flood traffic), Man-in-the-Middle (intercept), Phishing (social engineering). Pencegahan: firewall, IDS/IPS, edukasi user.',
      'Symmetric: satu key untuk encrypt/decrypt (AES, cepat). Asymmetric: public-private key pair (RSA, lambat). Biasanya kombinasi: asymmetric untuk exchange key, symmetric untuk data.',
    ],
    goals: [
      'Memahami semua layer OSI model dan fungsinya',
      'Bisa melakukan subnetting dengan cepat',
      'Mampu konfigurasi firewall dan routing',
      'Memahami konsep keamanan jaringan dasar',
    ],
    reflections: [
      'Lab networking sangat membantu untuk memahami konsep yang abstrak. Hands-on experience penting.',
      'Subnetting awalnya membingungkan, tapi setelah latihan terus jadi terbiasa.',
      'Keamanan jaringan itu kompleks tapi penting banget. Banyak aspek yang harus dipertimbangkan.',
      'Troubleshooting jaringan melatih kemampuan berpikir logis dan sistematis.',
    ],
  },
  {
    code: 'IF207', name: 'Sistem Operasi',
    description: 'Konsep sistem operasi, manajemen proses, memori, dan file system.',
    topics: ['process management', 'threading', 'memory management', 'scheduling', 'deadlock', 'file system'],
    assignmentQuestions: [
      'Perbedaan process dan thread apa?',
      'Scheduling algorithm mana yang paling fair?',
      'Deadlock itu gimana cara cegahnya?',
      'Virtual memory itu gimana cara kerjanya?',
      'Mutex dan semaphore perbedaannya apa?',
      'Fragmentation itu apa dan gimana solusinya?',
    ],
    hotDiscussions: [
      'Berdasarkan analisis performa sistem, aku menemukan bahwa context switching yang terlalu sering menyebabkan overhead yang signifikan. Aku mengusulkan untuk mengurangi jumlah thread.',
      'Aku membandingkan algoritma scheduling FCFS, SJF, dan Round Robin. Round Robin paling fair untuk time-sharing system karena setiap proses mendapat porsi CPU yang sama.',
      'Menurut evaluasi implementasi semaphore yang kita buat, penggunaan yang tidak tepat bisa menyebabkan deadlock atau starvation. Perlu perhatian lebih pada ordering.',
      'Aku menyimpulkan bahwa virtual memory memungkinkan sistem menjalankan program yang lebih besar dari physical memory, tapi ada trade-off pada I/O karena swapping.',
      'Alasan kenapa pemahaman tentang process synchronization penting adalah karena concurrent access pada shared resource tanpa proper locking bisa menyebabkan race condition.',
    ],
    aiPrompts: [
      'Jelaskan konsep virtual memory dengan diagram',
      'Bagaimana cara kerja page replacement algorithm?',
      'Apa itu deadlock dan 4 kondisi necessary-nya?',
      'Perbedaan user mode dan kernel mode?',
      'Contoh implementasi producer-consumer problem?',
    ],
    aiResponses: [
      'Virtual memory: OS membuat ilusi memory tak terbatas dengan menggunakan disk sebagai extensi RAM. Data dipindah antara RAM dan disk dalam unit yang disebut page.',
      'Page replacement: FIFO (ganti page terlama), LRU (ganti page paling jarang dipakai), Optimal (ganti page yang paling lama tidak dipakai di masa depan).',
      'Deadlock: 4 kondisi necessary: 1) Mutual exclusion, 2) Hold and wait, 3) No preemption, 4) Circular request. Pencegahan: hindari salah satu kondisi.',
      'User mode: eksekusi aplikasi biasa, akses terbatas. Kernel mode: eksekusi OS, akses penuh ke hardware. System call adalah pintu masuk dari user ke kernel mode.',
      'Producer-consumer: gunakan semaphore untuk sinkronisasi. Mutex untuk critical section, empty dan full semaphore untuk buffer management.',
    ],
    goals: [
      'Memahami manajemen proses dan thread',
      'Bisa menjelaskan berbagai scheduling algorithm',
      'Memahami konsep virtual memory dan paging',
      'Mampu mendeteksi dan mencegah deadlock',
    ],
    reflections: [
      'Sistem operasi ternyata kompleks banget. Banyak konsep yang harus dipahami secara mendalam.',
      'Implementasi thread synchronization sangat tricky. Race condition sulit di-debug.',
      'Virtual memory adalah konsep yang elegant tapi implementasinya kompleks.',
      'Lab OS membantu banget untuk memahami konsep process management.',
    ],
  },
  {
    code: 'IF208', name: 'Pemrograman Mobile',
    description: 'Pengembangan aplikasi mobile untuk Android dan iOS.',
    topics: ['React Native', 'Flutter', 'state management', 'API integration', 'push notification', 'offline storage'],
    assignmentQuestions: [
      'React Native vs Flutter bagus yang mana?',
      'State management di mobile gimana?',
      'Cara handle offline mode gimana?',
      'Push notification gimana implementasinya?',
      'Navigation di React Native gimana?',
      'Optimasi performa mobile app gimana?',
    ],
    hotDiscussions: [
      'Berdasarkan analisis benchmark yang aku lakukan, Flutter lebih unggul dalam rendering performance karena menggunakan Skia engine, sedangkan React Native lebih mudah untuk web developer.',
      'Aku membandingkan Redux dan MobX untuk state management. Redux lebih predictable tapi boilerplate, MobX lebih fleksibel tapi magic-nya susah di-debug.',
      'Menurut evaluasi UX yang aku lakukan, offline-first approach meningkatkan user experience karena aplikasi tetap responsif meskipun koneksi tidak stabil.',
      'Aku menyimpulkan bahwa penggunaan proper navigation pattern sangat penting untuk UX mobile karena user expect konsistensi dalam berinteraksi dengan aplikasi.',
      'Alasan kenapa optimasi performa penting di mobile adalah karena resource terbatas (RAM, CPU, baterai) dan user expect aplikasi yang smooth.',
    ],
    aiPrompts: [
      'Jelaskan cara kerja React Native bridge',
      'Contoh implementasi offline storage dengan AsyncStorage?',
      'Bagaimana cara handle different screen sizes?',
      'Apa itu code push dan bagaimana cara kerjanya?',
      'Best practice untuk mobile app architecture?',
    ],
    aiResponses: [
      'React Native bridge menghubungkan JavaScript thread dengan native thread. JS thread menjalankan business logic, native thread menjalankan UI rendering. Bridge mengirimkan serializable messages.',
      'AsyncStorage: key-value storage async. Gunakan try-catch untuk error handling. Untuk data kompleks, serialize ke JSON. Untuk large data, gunakan SQLite.',
      'Handle screen sizes: 1) Gunakan Flexbox, 2) Responsive units (dp, sp), 3) MediaQuery untuk breakpoint, 4) Orientation handling, 5) Test di berbagai device.',
      'Code Push: update aplikasi tanpa melalui App Store/Play Store. Push update ke server, app download dan apply saat next launch. Cocok untuk hotfix.',
      'Architecture: Clean Architecture (domain, data, presentation), BLoC pattern (Flutter), MVVM (Android), MVC (iOS). Pilih yang sesuai dengan team dan project.',
    ],
    goals: [
      'Bisa membuat aplikasi mobile cross-platform',
      'Menguasai state management dan navigation',
      'Mampu integrasi dengan REST API',
      'Bisa implementasi push notification dan offline mode',
    ],
    reflections: [
      'Mobile development ternyata berbeda banget dengan web. Banyak aspek yang harus dipertimbangkan.',
      'Testing di berbagai device sangat penting karena behavior bisa berbeda.',
      'Performance optimization di mobile lebih krusial karena resource terbatas.',
      'User experience di mobile harus lebih diperhatikan karena layar kecil.',
    ],
  },
  {
    code: 'IF209', name: 'Grafika Komputer',
    description: 'Konsep rendering, transformasi, dan animasi grafis komputer.',
    topics: ['OpenGL', 'transformasi', 'rendering pipeline', 'shading', 'texture mapping', '3D modeling'],
    assignmentQuestions: [
      'Transformasi 2D gimana cara hitungnya?',
      'Rendering pipeline itu step-nya apa?',
      'Texture mapping gimana cara kerjanya?',
      'Shading model mana yang paling realistis?',
      'Cara bikin animasi sederhana gimana?',
      'OpenGL vs DirectX perbedaannya apa?',
    ],
    hotDiscussions: [
      'Berdasarkan analisis performa rendering, penggunaan level of detail (LOD) bisa mengurangi polygon count tanpa mengurangi kualitas visual secara signifikan.',
      'Aku membandingkan Phong shading dan Blinn-Phong shading. Blinn-Phong lebih efisien secara komputasi karena menggunakan half-vector daripada reflection vector.',
      'Menurut evaluasi texture mapping yang aku lakukan, penggunaan mipmap mengurangi aliasing pada texture yang dilihat dari jarak jauh, tapi membutuhkan 33% lebih banyak memory.',
      'Aku menyimpulkan bahwa pipeline rendering modern sangat kompleks dan membutuhkan pemahaman tentang linear algebra dan physics untuk implementasi yang benar.',
      'Alasan kenapa grafika komputer penting adalah karena aplikasinya sangat luas: game, simulasi, visualisasi data, AR/VR, dan banyak lagi.',
    ],
    aiPrompts: [
      'Jelaskan konsep transformasi homogeneous coordinate',
      'Bagaimana cara kerja ray tracing?',
      'Apa itu shader dan jenis-jenisnya?',
      'Contoh penggunaan grafika komputer di bidang non-game?',
      'Perbedaan rasterization dan ray tracing?',
    ],
    aiResponses: [
      'Homogeneous coordinate menggunakan 4D (x,y,z,w) untuk merepresentasikan 3D point. Keuntungan: semua transformasi (translate, rotate, scale) bisa dikalikan sebagai matrix.',
      'Ray tracing: tembakkan ray dari camera ke setiap pixel, hit intersection dengan objek, hitung warna berdasarkan pencahayaan. Sangat realistis tapi komputasi berat.',
      'Shader: program yang berjalan di GPU. Vertex shader (proses vertex), Fragment/Pixel shader (proses pixel), Geometry shader (generate primitive baru).',
      'Non-game: medical imaging (CT scan visualization), architecture (walkthrough), film (VFX), scientific visualization (molecular structure), autonomous driving (simulation).',
      'Rasterization: konversi geometric ke pixel (cepat, real-time). Ray tracing: simulasi cahaya (lambat, photorealistic). Hybrid approach menggabungkan keduanya.',
    ],
    goals: [
      'Memahami konsep transformasi 2D dan 3D',
      'Bisa menggunakan OpenGL untuk rendering sederhana',
      'Memahami shading dan lighting model',
      'Mampu membuat animasi dasar',
    ],
    reflections: [
      'Grafika komputer ternyata sangat mathematical. Linear algebra adalah fondasinya.',
      'Implementasi shader pertama sangat challenging tapi rewarding saat hasilnya muncul.',
      'Optimasi rendering itu seni, ada banyak trade-off antara kualitas dan performa.',
      'Project akhir sangat satisfying karena bisa melihat hasil visual dari kode yang ditulis.',
    ],
  },
  {
    code: 'IF210', name: 'Keamanan Informasi',
    description: 'Kriptografi, keamanan jaringan, dan ethical hacking.',
    topics: ['cryptography', 'encryption', 'hashing', 'penetration testing', 'OWASP', 'security audit'],
    assignmentQuestions: [
      'Enkripsi simetris dan asimetris perbedaannya apa?',
      'Hashing itu buat apa?',
      'OWASP Top 10 itu apa aja?',
      'Cara bikin password yang aman gimana?',
      'SQL Injection gimana cara cegahnya?',
      'HTTPS itu gimana cara kerjanya?',
    ],
    hotDiscussions: [
      'Berdasarkan analisis keamanan aplikasi web yang kita buat, ditemukan beberapa vulnerability: SQL injection di login form dan XSS di comment section. Aku mengusulkan untuk menggunakan prepared statement dan output encoding.',
      'Aku membandingkan bcrypt dan argon2 untuk password hashing. Argon2 lebih aman terhadap GPU attack karena memory-hard function, tapi bcrypt lebih widely supported.',
      'Menurut evaluasi keamanan yang aku lakukan, implementasi HTTPS saja tidak cukup. Perlu juga HSTS, secure cookies, dan Content Security Policy untuk proteksi lengkap.',
      'Aku menyimpulkan bahwa security harus dipertimbangkan sejak awal development (shift-left security), bukan ditambahkan di akhir karena lebih mahal dan riskan.',
      'Alasan kenapa ethical hacking penting adalah karena untuk melindungi sistem, kita harus berpikir seperti attacker. Defense in depth adalah strategi yang tepat.',
    ],
    aiPrompts: [
      'Jelaskan cara kerja RSA encryption',
      'Contoh implementasi secure authentication?',
      'Bagaimana cara melakukan penetration testing?',
      'Apa itu zero trust security model?',
      'Best practice untuk API security?',
    ],
    aiResponses: [
      'RSA: generate dua prime besar (p,q), hitung n=p*q dan phi=(p-1)*(q-1), pilih e coprime dengan phi, hitung d = e^-1 mod phi. Public key (e,n), private key (d,n).',
      'Secure auth: 1) Password hashing (bcrypt/argon2), 2) Rate limiting, 3) MFA, 4) Session management, 5) JWT dengan short expiry, 6) HTTPS only.',
      'Penetration testing: 1) Reconnaissance, 2) Scanning, 3) Gaining access, 4) Maintaining access, 5) Covering tracks. Tools: Nmap, Burp Suite, Metasploit.',
      'Zero trust: never trust, always verify. Setiap request harus authenticated dan authorized. Microsegmentasi, least privilege access, continuous monitoring.',
      'API security: 1) Authentication (OAuth2/JWT), 2) Rate limiting, 3) Input validation, 4) HTTPS, 5) CORS policy, 6) API key rotation, 7) Logging.',
    ],
    goals: [
      'Memahami konsep kriptografi dasar',
      'Bisa mengidentifikasi common security vulnerabilities',
      'Mampu melakukan security audit sederhana',
      'Memahami ethical hacking dan responsible disclosure',
    ],
    reflections: [
      'Keamanan informasi itu sangat penting dan sering diabaikan. Banyak developer yang tidak aware.',
      'Praktik ethical hacking sangat menarik dan menantang. Berpikir seperti attacker membantu memperkuat pertahanan.',
      'OWASP Top 10 adalah panduan yang sangat berguna untuk developer dalam membangun aplikasi yang aman.',
      'Security bukan fitur, tapi proses yang harus terus-menerus diperhatikan.',
    ],
  },
  {
    code: 'IF211', name: 'Data Mining',
    description: 'Teknik penambangan data, analisis pola, dan knowledge discovery.',
    topics: ['clustering', 'classification', 'association rules', 'anomaly detection', 'text mining', 'visualization'],
    assignmentQuestions: [
      'K-Means clustering gimana cara kerjanya?',
      'Apriori algorithm untuk apa?',
      'Anomaly detection gimana metodenya?',
      'Text mining preprocessing apa aja?',
      'Evaluasi model classification gimana?',
      'Visualisasi data yang efektif gimana?',
    ],
    hotDiscussions: [
      'Berdasarkan analisis dataset customer, aku menemukan 3 segmen yang berbeda menggunakan K-Means. Evaluasi dengan silhouette score menunjukkan k=3 adalah optimal.',
      'Aku membandingkan Decision Tree dan Random Forest untuk klasifikasi. Random Forest lebih robust terhadap overfitting karena ensemble dari banyak tree.',
      'Menurut evaluasi association rule yang kita temukan, support dan confidence threshold sangat mempengaruhi jumlah rules yang dihasilkan. Perlu keseimbangan.',
      'Aku menyimpulkan bahwa data preprocessing memiliki dampak besar pada hasil mining. Missing values, outliers, dan noise harus ditangani dengan tepat.',
      'Alasan kenapa data visualization penting adalah karena memudahkan interpretasi hasil mining dan membantu dalam pengambilan keputusan.',
    ],
    aiPrompts: [
      'Jelaskan perbedaan supervised dan unsupervised learning',
      'Contoh implementasi K-Means clustering?',
      'Bagaimana cara menangani missing values?',
      'Apa itu feature selection dan mengapa penting?',
      'Contoh aplikasi data mining di industri?',
    ],
    aiResponses: [
      'Supervised: data berlabel, prediksi output (classification, regression). Unsupervised: data tanpa label, temukan pola (clustering, association).',
      'K-Means: 1) Pilih k centroid, 2) Assign setiap data ke centroid terdekat, 3) Update centroid, 4) Ulangi hingga konvergen. Evaluasi: elbow method, silhouette score.',
      'Missing values: 1) Hapus baris (jika sedikit), 2) Imputasi (mean, median, mode), 3) Model-based imputation, 4) Flag sebagai kategori terpisah.',
      'Feature selection memilih subset fitur yang paling relevan. Tujuan: kurangi dimensionality, hindari curse of dimensionality, improve interpretability.',
      'Industri: retail (customer segmentation), finance (fraud detection), healthcare (disease prediction), manufacturing (quality control), marketing (recommendation).',
    ],
    goals: [
      'Memahami berbagai teknik data mining',
      'Bisa melakukan clustering dan classification',
      'Mampu mengevaluasi hasil mining',
      'Bisa membuat visualisasi data yang efektif',
    ],
    reflections: [
      'Data mining ternyata sangat powerful untuk menemukan insight yang tersembunyi dalam data.',
      'Preprocessing data adalah langkah yang paling time-consuming tapi krusial.',
      'Pemilihan algoritma yang tepat sangat mempengaruhi hasil, perlu eksperimen.',
      'Visualisasi data sangat membantu untuk mempresentasikan hasil analisis.',
    ],
  },
  {
    code: 'IF212', name: 'Cloud Computing',
    description: 'Konsep cloud, virtualisasi, dan layanan cloud modern.',
    topics: ['IaaS', 'PaaS', 'SaaS', 'Docker', 'Kubernetes', 'serverless', 'microservices'],
    assignmentQuestions: [
      'IaaS, PaaS, SaaS perbedaannya apa?',
      'Docker container vs VM perbedaannya?',
      'Kubernetes itu buat apa?',
      'Serverless architecture gimana?',
      'Microservices vs monolith bagus mana?',
      'Cloud cost optimization gimana?',
    ],
    hotDiscussions: [
      'Berdasarkan analisis kebutuhan project, aku mengusulkan untuk menggunakan PaaS daripada IaaS karena mengurangi operational overhead dan mempercepat deployment.',
      'Aku membandingkan performa Docker container dan VM. Container lebih ringan karena sharing host kernel, tapi VM lebih secure karena isolasi yang lebih kuat.',
      'Menurut evaluasi arsitektur microservices yang kita rancang, service decomposition harus berdasarkan business domain, bukan teknologi. Domain-Driven Design membantu.',
      'Aku menyimpulkan bahwa serverless cocok untuk workload yang sporadic dan event-driven, tapi tidak untuk long-running process karena cold start dan timeout limitation.',
      'Alasan kenapa cloud computing populer adalah karena scalability, pay-as-you-go pricing, dan mengurangi kebutuhan infrastruktur on-premise.',
    ],
    aiPrompts: [
      'Jelaskan cara kerja Docker container',
      'Contoh deployment aplikasi ke AWS?',
      'Bagaimana cara scaling aplikasi di cloud?',
      'Apa itu Infrastructure as Code?',
      'Best practice untuk cloud security?',
    ],
    aiResponses: [
      'Docker: package aplikasi dengan dependencies ke container image. Container berjalan isolated di host OS. Dockerfile mendefinisikan build steps. Docker Compose untuk multi-container.',
      'AWS deployment: 1) Buat EC2 instance atau gunakan ECS/EKS, 2) Setup VPC dan security group, 3) Deploy container, 4) Configure load balancer, 5) Setup CI/CD pipeline.',
      'Scaling: horizontal (tambah instance) atau vertical (upgrade resource). Auto-scaling berdasarkan metrics (CPU, memory, request count). Load balancer mendistribusikan traffic.',
      'IaC: manage infrastructure melalui code (Terraform, CloudFormation). Version control, reproducible, automated provisioning. Declarative vs imperative approach.',
      'Cloud security: 1) IAM (least privilege), 2) Encryption (at rest, in transit), 3) Network security (VPC, firewall), 4) Logging & monitoring, 5) Compliance.',
    ],
    goals: [
      'Memahami konsep cloud computing dan layanannya',
      'Bisa menggunakan Docker untuk containerization',
      'Mampu deploy aplikasi ke cloud',
      'Memahami microservices architecture',
    ],
    reflections: [
      'Cloud computing mengubah cara kita membangun dan deploy aplikasi. Lebih fleksibel dan scalable.',
      'Docker sangat memudahkan development dan deployment. Consistent environment di semua stage.',
      'Cost optimization di cloud penting banget, mudah kalap kalau tidak dimonitor.',
      'Microservices bukan silver bullet, ada trade-off yang harus dipertimbangkan.',
    ],
  },
];

const STUDENTS: { email: string; name: string; engagement: ActivityLevel }[] = [
  { email: 'andi.pratama@student.ac.id', name: 'Andi Pratama', engagement: 'high' },
  { email: 'dewi.kusuma@student.ac.id', name: 'Dewi Kusuma', engagement: 'high' },
  { email: 'rudi.hartono@student.ac.id', name: 'Rudi Hartono', engagement: 'medium' },
  { email: 'maya.sari@student.ac.id', name: 'Maya Sari', engagement: 'medium' },
  { email: 'eko.wijaya@student.ac.id', name: 'Eko Wijaya', engagement: 'medium' },
  { email: 'rina.putri@student.ac.id', name: 'Rina Putri', engagement: 'low' },
  { email: 'dimas.anggara@student.ac.id', name: 'Dimas Anggara', engagement: 'high' },
  { email: 'lisa.permata@student.ac.id', name: 'Lisa Permata', engagement: 'medium' },
  { email: 'ahmad.fauzi@student.ac.id', name: 'Ahmad Fauzi', engagement: 'low' },
  { email: 'grace.natalia@student.ac.id', name: 'Grace Natalia', engagement: 'high' },
  { email: 'rizki.pratama@student.ac.id', name: 'Rizki Pratama', engagement: 'silent' },
  { email: 'nina.safitri@student.ac.id', name: 'Nina Safitri', engagement: 'medium' },
  { email: 'fajar.setiawan@student.ac.id', name: 'Fajar Setiawan', engagement: 'low' },
  { email: 'indah.lestari@student.ac.id', name: 'Indah Lestari', engagement: 'silent' },
  { email: 'yoga.putra@student.ac.id', name: 'Yoga Putra', engagement: 'medium' },
];

const LECTURERS = [
  { email: 'budi.santoso@univ.ac.id', name: 'Dr. Budi Santoso, M.Kom.' },
  { email: 'siti.rahayu@univ.ac.id', name: 'Prof. Siti Rahayu, Ph.D.' },
];

const DEMO_AI_CHATS: DemoAiChatSeed[] = [
  {
    studentEmail: 'andi.pratama@student.ac.id',
    title: 'Ringkasan usability testing',
    messages: [
      { role: 'user', content: 'Tolong ringkas prinsip usability testing untuk presentasi besok.' },
      { role: 'assistant', content: 'Fokus utamanya: tujuan tes, task scenario, observasi perilaku, dan temuan prioritas tinggi.' },
      { role: 'user', content: 'Bisa ubah jadi poin-poin singkat?' },
      { role: 'assistant', content: 'Bisa: 1) tetapkan tujuan, 2) pilih task nyata, 3) amati hambatan, 4) kategorikan severity, 5) rumuskan rekomendasi.' },
    ],
  },
  {
    studentEmail: 'maya.sari@student.ac.id',
    title: 'Contoh pertanyaan HOT',
    messages: [
      { role: 'user', content: 'Bantu buat pertanyaan HOT untuk diskusi collaborative learning.' },
      { role: 'assistant', content: 'Contoh: Mengapa collaborative learning bisa efektif pada konteks tertentu tetapi gagal di konteks lain?' },
      { role: 'user', content: 'Tambah 2 lagi.' },
      { role: 'assistant', content: '1) Bagaimana kualitas fasilitasi memengaruhi kedalaman diskusi? 2) Kapan intervensi dosen justru menghambat agency mahasiswa?' },
    ],
  },
  {
    studentEmail: 'grace.natalia@student.ac.id',
    title: 'Evaluasi arsitektur modular',
    messages: [
      { role: 'user', content: 'Bandingkan arsitektur monolit vs modular untuk aplikasi kolaboratif.' },
      { role: 'assistant', content: 'Monolit lebih sederhana untuk start, modular unggul pada isolasi tanggung jawab dan scaling tim.' },
      { role: 'user', content: 'Apa trade-off terbesarnya?' },
      { role: 'assistant', content: 'Koordinasi kontrak antar modul, observability, dan deployment pipeline yang lebih kompleks.' },
    ],
  },
  {
    studentEmail: 'yoga.putra@student.ac.id',
    title: 'Interpretasi clustering',
    messages: [
      { role: 'user', content: 'Bagaimana menjelaskan cluster agar tidak cuma deskriptif?' },
      { role: 'assistant', content: 'Hubungkan karakteristik cluster dengan keputusan yang bisa diambil, misalnya intervensi, segmentasi, atau prioritas analisis.' },
      { role: 'user', content: 'Kasih contoh singkat.' },
      { role: 'assistant', content: 'Jika cluster menunjukkan partisipasi rendah namun kualitas ide tinggi, tindak lanjutnya bisa fokus ke fasilitasi agar ide lebih sering muncul.' },
    ],
  },
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSubset<T>(arr: T[], min: number, max: number): T[] {
  const count = randomInt(min, Math.min(max, arr.length));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function generateConversationFlow(course: CourseContent, participants: string[]): Array<{
  senderId: string;
  content: string;
  senderType: 'user' | 'ai';
  isIntervention: boolean;
  timeOffset: number;
}> {
  const messages: Array<{
    senderId: string;
    content: string;
    senderType: 'user' | 'ai';
    isIntervention: boolean;
    timeOffset: number;
  }> = [];

  const flowType = randomInt(1, 5);
  let baseOffset = 0;

  switch (flowType) {
    case 1:
      messages.push({ senderId: participants[0], content: randomElement(course.assignmentQuestions), senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(2, 15);
      messages.push({ senderId: participants[1], content: randomElement(course.hotDiscussions), senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(5, 30);
      messages.push({ senderId: participants[2 % participants.length], content: 'Setuju sama analisis kamu. Tapi ada satu hal yang perlu dipertimbangkan juga.', senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(2, 10);
      messages.push({ senderId: participants[0], content: 'Oh iya bener, makasih inputnya! Aku jadi paham sekarang.', senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      break;

    case 2:
      messages.push({ senderId: participants[0], content: `Ada yang udah ngerjain tugas ${course.name}? Aku stuck di bagian ini.`, senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(5, 20);
      messages.push({ senderId: participants[1], content: 'Aku udah selesai. Coba approach ini deh...', senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(2, 10);
      for (let i = 0; i < randomInt(3, 6); i++) {
        const sender = participants[i % participants.length];
        messages.push({ senderId: sender, content: randomElement(course.hotDiscussions), senderType: 'user', isIntervention: false, timeOffset: baseOffset });
        baseOffset += randomInt(3, 15);
      }
      break;

    case 3:
      messages.push({ senderId: participants[0], content: 'Guys, ada yang mau jelasin materi kemarin? Aku ga masuk.', senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(3, 10);
      messages.push({ senderId: participants[1], content: randomElement(course.assignmentQuestions), senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(5, 15);
      messages.push({ senderId: participants[2 % participants.length], content: randomElement(course.hotDiscussions), senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(10, 30);
      messages.push({ senderId: participants[0], content: `Coba tanya AI dulu deh tentang ${randomElement(course.topics)}`, senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(2, 5);
      messages.push({ senderId: participants[0], content: randomElement(course.aiResponses), senderType: 'ai', isIntervention: false, timeOffset: baseOffset });
      break;

    case 4:
      for (let i = 0; i < randomInt(4, 8); i++) {
        const sender = participants[i % participants.length];
        const isQuestion = Math.random() < 0.4;
        messages.push({
          senderId: sender,
          content: isQuestion ? randomElement(course.assignmentQuestions) : randomElement(course.hotDiscussions),
          senderType: 'user',
          isIntervention: false,
          timeOffset: baseOffset,
        });
        baseOffset += randomInt(3, 20);
      }
      break;

    case 5:
      messages.push({ senderId: participants[0], content: 'Besok ada quiz kan? Yang udah belajar?', senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(5, 15);
      messages.push({ senderId: participants[1], content: 'Udah, tapi masih bingung soal ini...', senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(3, 10);
      messages.push({ senderId: participants[2 % participants.length], content: randomElement(course.hotDiscussions), senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      baseOffset += randomInt(10, 25);
      messages.push({ senderId: participants[0], content: 'Makasih penjelasannya! Jadi paham sekarang.', senderType: 'user', isIntervention: false, timeOffset: baseOffset });
      break;
  }

  return messages;
}

export async function seedDemoData() {
  console.log('🌱 Starting full demo dataset seed...\n');

  console.log('🧹 Cleaning existing data...');
  await prisma.aiChatMessage.deleteMany();
  await prisma.aiChat.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.knowledgeBase.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.aiUsage.deleteMany();
  await prisma.reflection.deleteMany();
  await prisma.learningGoal.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatSpace.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.courseStudent.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Cleaned\n');

  console.log('👥 Creating users...');
  const hashedPassword = await bcrypt.hash('password123', 10);

  const lecturers = [];
  for (const data of LECTURERS) {
    const lecturer = await prisma.user.create({
      data: { id: seedUuid(`user-${data.email}`), email: data.email, password: hashedPassword, name: data.name, role: UserRole.lecturer },
    });
    lecturers.push(lecturer);
    console.log(`  ✅ Lecturer: ${lecturer.name}`);
  }

  const students: StudentWithEngagement[] = [];
  for (const data of STUDENTS) {
    const student = await prisma.user.create({
      data: { id: seedUuid(`user-${data.email}`), email: data.email, password: hashedPassword, name: data.name, role: UserRole.student },
    });
    students.push({ ...student, engagement: data.engagement });
    console.log(`  ✅ Student: ${student.name} (${data.engagement})`);
  }
  console.log('');

  console.log('🤖 Creating demo AI chats...');
  for (const [index, chatSeed] of DEMO_AI_CHATS.entries()) {
    const student = students.find(candidate => candidate.email === chatSeed.studentEmail);
    if (!student) {
      throw new Error(`Demo AI chat seed user not found: ${chatSeed.studentEmail}`);
    }

    const createdChat = await prisma.aiChat.create({
      data: {
        title: chatSeed.title,
        userId: student.id,
        createdAt: new Date(NOW.getTime() - (index + 1) * 24 * 60 * 60 * 1000),
      },
    });

    for (const [messageIndex, message] of chatSeed.messages.entries()) {
      await prisma.aiChatMessage.create({
        data: {
          chatId: createdChat.id,
          role: message.role,
          content: message.content,
          createdAt: new Date(createdChat.createdAt.getTime() + messageIndex * 3 * 60 * 1000),
        },
      });
    }

    console.log(`  ✅ AI Chat: ${chatSeed.title} (${student.name})`);
  }
  console.log('');

  console.log('📚 Creating courses with contextual data...');
  const courses = [];
  let totalMessages = 0;
  let totalGoals = 0;
  let totalReflections = 0;
  let totalAiUsage = 0;

  for (let i = 0; i < COURSES.length; i++) {
    const courseContent = COURSES[i];
    const owner = lecturers[i % lecturers.length];

    const course = await prisma.course.create({
      data: {
        id: seedUuid(`course-${courseContent.code}`),
        code: courseContent.code,
        name: courseContent.name,
        description: courseContent.description,
        joinCode: `JOIN-${courseContent.code}`,
        minMembersPerGroup: COURSE_DEMO_CONFIG[courseContent.code]?.minMembersPerGroup ?? 1,
        maxMembersPerGroup: COURSE_DEMO_CONFIG[courseContent.code]?.maxMembersPerGroup ?? 1000,
        aiGuardrailConfig: COURSE_DEMO_CONFIG[courseContent.code]?.aiGuardrailConfig ?? {
          preset: 'balanced',
          allowRewrite: true,
          allowFlagOnly: false,
        },
        ownerId: owner.id,
      },
    });
    courses.push({ ...course, content: courseContent });

    const enrolledStudents = randomSubset(students, 8, 12);
    for (const student of enrolledStudents) {
      await prisma.courseStudent.create({ data: { courseId: course.id, userId: student.id } });
    }
    console.log(`  ✅ ${course.code} - ${course.name} (${enrolledStudents.length} students)`);

    const weekIds = [1, 2, 3].map(i => seedUuid(`${courseContent.code}-week-${i}`));

    const COURSE_WEEK_DATA: Record<string, Array<{ title: string; materials: string[] }>> = {
      IF201: [
        { title: 'Fundamental Web & React', materials: ['React SPA Architecture', 'Component Lifecycle & Hooks'] },
        { title: 'API & Authentication', materials: ['Autentikasi JWT', 'REST API Integration'] },
        { title: 'Deployment & Optimization', materials: ['Responsive Design Strategy', 'Deployment Pipeline'] },
      ],
      IF202: [
        { title: 'Desain Database', materials: ['Normalisasi Database', 'ERD & Relasi Antar Tabel'] },
        { title: 'Optimasi Query', materials: ['Query Optimization', 'Indexing Strategy'] },
        { title: 'Database Lanjut', materials: ['Transaksi & Concurrency', 'NoSQL vs RDBMS'] },
      ],
      IF203: [
        { title: 'Algoritma Sorting & Searching', materials: ['Sorting Algorithm Comparison', 'Binary Search & Variasinya'] },
        { title: 'Struktur Data Lanjut', materials: ['Tree & Graph Traversal', 'Linked List & Stack/Queue'] },
        { title: 'Analisis Kompleksitas', materials: ['Dynamic Programming', 'Big-O Analysis'] },
      ],
      IF204: [
        { title: 'Model Jaringan', materials: ['TCP/IP & OSI Layer', 'Protokol Jaringan Dasar'] },
        { title: 'Routing & Switching', materials: ['Routing Protocol (OSPF, BGP)', 'VLAN & Subnetting'] },
        { title: 'Keamanan Jaringan', materials: ['Network Security Fundamentals', 'Firewall & IDS/IPS'] },
      ],
      IF205: [
        { title: 'Dasar Machine Learning', materials: ['Machine Learning Pipeline', 'Supervised vs Unsupervised Learning'] },
        { title: 'Evaluasi Model', materials: ['Model Evaluation Metrics', 'Cross-Validation & Hyperparameter Tuning'] },
        { title: 'Deep Learning & NLP', materials: ['Neural Network Architecture', 'Prompt Engineering'] },
      ],
      IF206: [
        { title: 'Requirements & Design', materials: ['Software Requirement Analysis', 'UML & Use Case Diagram'] },
        { title: 'Arsitektur & Pattern', materials: ['Clean Architecture', 'Design Patterns'] },
        { title: 'Testing & CI/CD', materials: ['Testing Strategy (Unit, Integration)', 'CI/CD Pipeline'] },
      ],
      IF207: [
        { title: 'Manajemen Proses', materials: ['Process Scheduling Algorithm', 'Threading & Concurrency'] },
        { title: 'Manajemen Memori', materials: ['Memory Management & Paging', 'Virtual Memory'] },
        { title: 'File System & I/O', materials: ['File System Organization', 'Deadlock Prevention'] },
      ],
      IF208: [
        { title: 'Mobile UI & Navigation', materials: ['Mobile UI Pattern', 'Navigation & Routing'] },
        { title: 'State & Data', materials: ['State Management (Redux, Provider)', 'API Consumption & Caching'] },
        { title: 'Offline & Push', materials: ['Offline Storage (SQLite, Hive)', 'Push Notification Integration'] },
      ],
      IF209: [
        { title: 'Dasar Grafika', materials: ['Rendering Pipeline', 'Transformasi Geometri 2D/3D'] },
        { title: 'Shading & Lighting', materials: ['Lighting Model (Phong, Blinn)', 'Texture Mapping'] },
        { title: '3D & Animasi', materials: ['3D Modeling Basics', 'Camera & Projection'] },
      ],
      IF210: [
        { title: 'Kriptografi Dasar', materials: ['Encryption & Decryption (AES, RSA)', 'Hashing & Digital Signature'] },
        { title: 'Application Security', materials: ['Threat Modeling', 'OWASP Top 10'] },
        { title: 'Secure Development', materials: ['Access Control (RBAC, ABAC)', 'Secure Coding Practices'] },
      ],
      IF211: [
        { title: 'Preprocessing & EDA', materials: ['Data Preprocessing & Cleaning', 'Exploratory Data Analysis'] },
        { title: 'Clustering & Classification', materials: ['Clustering K-Means & Hierarchical', 'Classification (Decision Tree, SVM)'] },
        { title: 'Advanced Mining', materials: ['Association Rule Mining', 'Anomaly Detection'] },
      ],
      IF212: [
        { title: 'Cloud Fundamentals', materials: ['IaaS, PaaS, SaaS Overview', 'Cloud Deployment Models'] },
        { title: 'Container & Orchestration', materials: ['Docker Container Basics', 'Kubernetes Architecture'] },
        { title: 'Microservices & Serverless', materials: ['Microservices Design Pattern', 'Serverless (Lambda, Cloud Functions)'] },
      ],
    };

    const weekData = COURSE_WEEK_DATA[courseContent.code] || [
      { title: `Minggu 1: ${courseContent.topics[0]}`, materials: [courseContent.topics[0]] },
      { title: `Minggu 2: ${courseContent.topics[1] || courseContent.topics[0]}`, materials: [courseContent.topics[1] || courseContent.topics[0]] },
      { title: `Minggu 3: ${courseContent.topics[2] || courseContent.topics[0]}`, materials: [courseContent.topics[2] || courseContent.topics[0]] },
    ];

    for (let w = 0; w < weekIds.length; w++) {
      await prisma.courseWeek.upsert({
        where: { id: weekIds[w] },
        update: {},
        create: {
          id: weekIds[w],
          courseId: course.id,
          weekIndex: w + 1,
          title: weekData[w].title,
          sortOrder: w,
        },
      });

      for (let m = 0; m < weekData[w].materials.length; m++) {
        const materialId = seedUuid(`${courseContent.code}-week-${w + 1}-mat-${m}`);
        const topic = weekData[w].materials[m];
        const fileName = `${courseContent.code.toLowerCase()}-${topic.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')}.pdf`;
        await prisma.courseMaterial.upsert({
          where: { id: materialId },
          update: {},
          create: {
            id: materialId,
            courseId: course.id,
            title: topic,
            description: `Materi ${courseContent.name} minggu ${w + 1}: ${topic}. Baca sebelum sesi diskusi kelompok.`,
            fileName,
            filePath: `demo-materials/${fileName}`,
            fileType: 'application/pdf',
            fileSize: randomInt(15000, 35000),
            uploadedBy: owner.id,
            sortOrder: m,
          },
        });
        await prisma.courseWeekMaterial.upsert({
          where: { id: `${materialId}-link` },
          update: {},
          create: {
            id: `${materialId}-link`,
            courseWeekId: weekIds[w],
            courseMaterialId: materialId,
            sortOrder: m,
          },
        });
      }
    }
    console.log(`  ✅ ${courseContent.code} - 3 course weeks + ${weekData.reduce((s, w) => s + w.materials.length, 0)} materials created`);

    const groupCount = randomInt(2, 4);
    const highEngagement = enrolledStudents.filter(s => s.engagement === 'high');
    const mediumEngagement = enrolledStudents.filter(s => s.engagement === 'medium');
    const lowEngagement = enrolledStudents.filter(s => s.engagement === 'low');
    const silentStudents = enrolledStudents.filter(s => s.engagement === 'silent');

    for (let g = 0; g < groupCount; g++) {
      const groupName = `Kelompok ${String.fromCharCode(65 + g)}`;

      const groupMembers: StudentWithEngagement[] = [];
      if (highEngagement.length > 0) groupMembers.push(highEngagement.shift()!);
      if (mediumEngagement.length > 0) groupMembers.push(mediumEngagement.shift()!);
      if (lowEngagement.length > 0 && Math.random() > 0.5) groupMembers.push(lowEngagement.shift()!);
      if (silentStudents.length > 0 && Math.random() > 0.7) groupMembers.push(silentStudents.shift()!);

      while (groupMembers.length < 3 && enrolledStudents.length > groupMembers.length) {
        const remaining = enrolledStudents.filter(s => !groupMembers.find(gm => gm.id === s.id));
        if (remaining.length > 0) groupMembers.push(randomElement(remaining));
        else break;
      }

      const group = await prisma.group.create({
        data: { id: seedUuid(`group-${courseContent.code}-${g + 1}`), name: groupName, joinCode: `GRP-${courseContent.code}-${g + 1}`, courseId: course.id, createdBy: groupMembers[0].id },
      });

      for (const member of groupMembers) {
        await prisma.groupMember.create({ data: { groupId: group.id, userId: member.id } });
      }

      const chatSpace = await prisma.chatSpace.create({
        data: {
          name: 'Diskusi Utama',
          description: null,
          isDefault: true,
          groupId: group.id,
          createdBy: groupMembers[0].id,
          weekId: weekIds[0],
        },
      });

      const activityLevel: ActivityLevel = g === 0 ? 'high' : g === 1 ? 'medium' : g === 2 ? 'low' : 'silent';
      const messagesPerDay = activityLevel === 'high' ? randomInt(10, 20) : activityLevel === 'medium' ? randomInt(5, 12) : activityLevel === 'low' ? randomInt(1, 5) : randomInt(1, 2);
      let groupMessageCount = 0;

      for (let day = 0; day < 7; day++) {
        const dayDate = new Date(ONE_WEEK_AGO);
        dayDate.setDate(dayDate.getDate() + day);

        if (isWeekend(dayDate) && Math.random() > 0.3) continue;

        const dayMessages = messagesPerDay + randomInt(-2, 3);
        if (dayMessages <= 0) continue;

        const conversationFlows = Math.ceil(dayMessages / 5);
        for (let flow = 0; flow < conversationFlows; flow++) {
          const conversation = generateConversationFlow(courseContent, groupMembers.map(m => m.id));
          const startHour = randomInt(8, 20);

          for (const msg of conversation) {
            const msgDate = new Date(dayDate);
            msgDate.setHours(startHour + Math.floor(msg.timeOffset / 60), msg.timeOffset % 60, randomInt(0, 59));

            await prisma.chatMessage.create({
              data: {
                content: msg.content,
                senderType: msg.senderType,
                isIntervention: msg.isIntervention,
                chatSpaceId: chatSpace.id,
                senderId: msg.senderId,
                createdAt: msgDate,
              },
            });
            totalMessages++;
            groupMessageCount++;
          }
        }

        if (activityLevel === 'high' || activityLevel === 'medium') {
          if (Math.random() < 0.3) {
            const interventionDate = new Date(dayDate);
            interventionDate.setHours(randomInt(10, 18), randomInt(0, 59));
            const interventionMessages = [
              `Diskusi kalian tentang ${randomElement(courseContent.topics)} sangat bagus! Coba juga eksplorasi dari sudut pandang yang berbeda.`,
              `Ada pertanyaan yang belum terjawab? Saya bisa bantu menjelaskan konsep ${randomElement(courseContent.topics)}.`,
              `Bagus sekali kolaborasi kalian! Pertahankan semangat diskusi ini.`,
              `Coba kaitkan konsep ${randomElement(courseContent.topics)} dengan materi sebelumnya untuk pemahaman yang lebih baik.`,
            ];
            await prisma.chatMessage.create({
              data: {
                content: randomElement(interventionMessages),
                senderType: 'ai',
                isIntervention: true,
                chatSpaceId: chatSpace.id,
                senderId: groupMembers[0].id,
                createdAt: interventionDate,
              },
            });
            totalMessages++;
            groupMessageCount++;
          }
        }
      }

      if (groupMessageCount === 0) {
        await prisma.chatMessage.create({
          data: {
            content: `Mulai diskusi ${courseContent.name}: apa bagian materi yang paling perlu kita pahami bersama?`,
            senderType: 'user',
            isIntervention: false,
            chatSpaceId: chatSpace.id,
            senderId: groupMembers[0].id,
            createdAt: randomDate(ONE_WEEK_AGO, NOW),
          },
        });
        totalMessages++;
      }

      for (const member of groupMembers) {
        await prisma.learningGoal.create({
          data: {
            content: randomElement(courseContent.goals),
            isValidated: Math.random() > 0.4,
            chatSpaceId: chatSpace.id,
            userId: member.id,
            createdAt: randomDate(ONE_WEEK_AGO, NOW),
          },
        });
        totalGoals++;
      }

      for (const member of groupMembers) {
        const goals = await prisma.learningGoal.findMany({ where: { chatSpaceId: chatSpace.id, userId: member.id } });
        await prisma.reflection.create({
          data: {
            content: randomElement(courseContent.reflections),
            type: Math.random() > 0.7 ? 'weekly' : 'session',
            goalId: goals.length > 0 ? goals[0].id : null,
            userId: member.id,
            chatSpaceId: chatSpace.id,
            createdAt: randomDate(ONE_WEEK_AGO, NOW),
          },
        });
        totalReflections++;
      }

      console.log(`    ✅ ${groupName} (${groupMembers.length} members, ${activityLevel})`);
    }

    for (const student of enrolledStudents) {
      const usageCount = student.engagement === 'high' ? randomInt(8, 15) : student.engagement === 'medium' ? randomInt(4, 8) : student.engagement === 'low' ? randomInt(1, 4) : randomInt(1, 2);

      for (let u = 0; u < usageCount; u++) {
        const provider = randomElement(['openai', 'anthropic', 'google']);
        const model = provider === 'openai' ? 'gpt-4' : provider === 'anthropic' ? 'claude-3-sonnet' : 'gemini-pro';
        const promptTokens = randomInt(50, 300);
        const completionTokens = randomInt(100, 800);

        await prisma.aiUsage.create({
          data: {
            userId: student.id,
            courseId: course.id,
            provider,
            model,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            estimatedCost: (promptTokens + completionTokens) * 0.00001,
            latencyMs: randomInt(500, 3000),
            createdAt: randomDate(ONE_WEEK_AGO, NOW),
          },
        });
        totalAiUsage++;
      }
    }

    for (const [kbIndex, kb] of (COURSE_DEMO_CONFIG[courseContent.code]?.knowledgeBase ?? []).entries()) {
      await prisma.knowledgeBase.create({
        data: {
          fileName: kb.fileName,
          filePath: kb.filePath,
          fileSize: kb.fileSize,
          mimeType: kb.mimeType,
          vectorStatus: kb.vectorStatus,
          courseId: course.id,
          uploadedBy: owner.id,
          uploadedAt: new Date(NOW.getTime() - (kbIndex + 1) * 24 * 60 * 60 * 1000),
          processedAt: kb.vectorStatus === 'ready' ? new Date(NOW.getTime() - kbIndex * 24 * 60 * 60 * 1000) : null,
        },
      });
    }
  }
  console.log('');

  console.log('🔔 Creating lecturer notifications...');
  for (const lecturer of lecturers) {
    await prisma.notification.createMany({
      data: [
        {
          userId: lecturer.id,
          type: NotificationType.info,
          title: 'Aktivitas kelas meningkat',
          message: 'Beberapa grup menunjukkan peningkatan diskusi dalam 7 hari terakhir.',
          createdAt: randomDate(ONE_WEEK_AGO, NOW),
        },
        {
          userId: lecturer.id,
          type: NotificationType.warning,
          title: 'Mahasiswa perlu perhatian',
          message: 'Ada mahasiswa dengan partisipasi rendah yang perlu ditindaklanjuti.',
          createdAt: randomDate(ONE_WEEK_AGO, NOW),
        },
        {
          userId: lecturer.id,
          type: NotificationType.success,
          title: 'Refleksi belajar terkumpul',
          message: 'Refleksi mingguan mahasiswa sudah tersedia untuk dianalisis.',
          createdAt: randomDate(ONE_WEEK_AGO, NOW),
        },
      ],
    });
    console.log(`  ✅ Notifications: ${lecturer.name}`);
  }
  console.log('');

  // Production Readiness: ensure ≥10 Qdrant points per demo course for real RAG verification
  if (typeof seedQdrantPointsForDemoCourses === 'function') {
    await seedQdrantPointsForDemoCourses(courses);
  } else {
    console.log('  ⏭ Skipping Qdrant seed (seedQdrantPointsForDemoCourses not defined)');
  }

  console.log('═══════════════════════════════════════');
  console.log('🎉 Full demo dataset seed completed!\n');
  console.log('📊 Summary:');
  console.log(`  Lecturers:    ${lecturers.length}`);
  console.log(`  Students:     ${students.length}`);
  console.log(`  Courses:      ${courses.length}`);
  console.log(`  Messages:     ${totalMessages}`);
  console.log(`  Goals:        ${totalGoals}`);
  console.log(`  Reflections:  ${totalReflections}`);
  console.log(`  AI Usage:     ${totalAiUsage}`);
  console.log('\n📋 Demo Credentials:');
  console.log('  Lecturer 1: budi.santoso@univ.ac.id / password123');
  console.log('  Lecturer 2: siti.rahayu@univ.ac.id / password123');
  console.log('  Student:    andi.pratama@student.ac.id / password123');
  console.log('\n📈 Features:');
  console.log('  ✅ Course-specific conversations per mata kuliah');
  console.log('  ✅ HOT (Higher-Order Thinking) indicators');
  console.log('  ✅ Pedagogical conversation flows');
  console.log('  ✅ Varied engagement levels per student');
  console.log('  ✅ Realistic time patterns (weekday vs weekend)');
  console.log('  ✅ Contextual AI usage per course');
  console.log('  ✅ AI interventions for active groups');
  console.log('═══════════════════════════════════════');
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  seedDemoData()
    .catch((e) => { console.error('❌ Demo dataset seed failed:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
