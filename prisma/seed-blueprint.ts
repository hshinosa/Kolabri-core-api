type Role = 'admin' | 'lecturer' | 'student';
type DiscussionProfile = 'high' | 'moderate' | 'low';
type SenderType = 'student' | 'lecturer' | 'ai' | 'bot' | 'system';

export interface DemoUser {
    key: string;
    name: string;
    email: string;
    role: Role;
    avatarUrl?: string;
    themePreference?: 'light' | 'dark' | 'system';
    languagePreference?: 'id' | 'en';
}

export interface DemoCourse {
    key: string;
    code: string;
    name: string;
    description: string;
    joinCode: string;
    semester: string;
    academicYear: string;
    ownerKey: string;
    studentKeys: string[];
    status: 'active' | 'medium' | 'light';
}

export interface DemoGroup {
    key: string;
    courseKey: string;
    name: string;
    joinCode: string;
    createdByKey: string;
    memberKeys: string[];
}

export interface DemoChatSpace {
    key: string;
    groupKey: string;
    name: string;
    description: string;
    type: 'Akademik' | 'Proyek' | 'Umum';
    isDefault?: boolean;
    summary?: string;
}

export interface DemoGoal {
    key: string;
    chatSpaceKey: string;
    userKey: string;
    content: string;
    isValidated?: boolean;
}

export interface DemoReflection {
    key: string;
    userKey: string;
    chatSpaceKey: string;
    goalKey?: string;
    type: 'session' | 'weekly';
    content: string;
}

export interface DemoKnowledgeBase {
    key: string;
    courseKey: string;
    uploadedByKey: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    vectorStatus: 'pending' | 'processing' | 'ready' | 'failed' | 'skipped';
}

export interface DemoAiChat {
    key: string;
    userKey: string;
    title: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface DemoNotification {
    userKey: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    isRead?: boolean;
}

export interface DemoAiProvider {
    key: string;
    name: string;
    displayName: string;
    apiKey: string;
    baseUrl?: string;
    isActive: boolean;
    fallbackOrder: number;
    config: Record<string, unknown>;
}

export interface DemoAiUsage {
    userKey: string;
    courseKey?: string;
    providerKey: string;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    estimatedCost: number;
    latencyMs: number;
}

export interface DemoAuditLog {
    userKey: string;
    action: string;
    entityType: string;
    entityKey: string;
    changes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface DemoActivityLog {
    courseKey: string;
    groupKey?: string;
    userKey: string;
    activityType: 'goal_set' | 'reflection_written' | 'message_sent' | 'file_uploaded' | 'course_joined' | 'group_joined';
    metadata?: Record<string, unknown>;
}

export interface DemoSilenceEvent {
    courseKey: string;
    groupKey: string;
    chatSpaceKey: string;
    silenceDuration: number;
    interventionSent: boolean;
}

export interface DemoDiscussionMessage {
    senderKey: string;
    senderType: SenderType;
    content: string;
    isIntervention?: boolean;
    replyToIndex?: number;
    mentions?: string[];
    engagement?: {
        engagementType: 'cognitive' | 'behavioral' | 'emotional';
        isHigherOrder: boolean;
        lexicalVariety: number;
        hotIndicators: string[];
        confidence: number;
    };
}

export interface DemoDiscussion {
    key: string;
    courseKey: string;
    groupKey: string;
    chatSpaceKey: string;
    profile: DiscussionProfile;
    messages: DemoDiscussionMessage[];
}

export interface DemoCourseTemplate {
    key: string;
    name: string;
    description: string;
    namePattern: string;
    descriptionTemplate: string;
    defaultGroups: Array<{ name: string; description: string }>;
    createdByKey: string;
}

export interface DemoBlueprint {
    password: string;
    users: {
        admins: DemoUser[];
        lecturers: DemoUser[];
        students: DemoUser[];
    };
    courses: DemoCourse[];
    courseTemplates: DemoCourseTemplate[];
    groups: DemoGroup[];
    chatSpaces: DemoChatSpace[];
    learningGoals: DemoGoal[];
    reflections: DemoReflection[];
    knowledgeBases: DemoKnowledgeBase[];
    aiChats: DemoAiChat[];
    notifications: DemoNotification[];
    aiProviders: DemoAiProvider[];
    aiUsages: DemoAiUsage[];
    auditLogs: DemoAuditLog[];
    activityLogs: DemoActivityLog[];
    silenceEvents: DemoSilenceEvent[];
    discussions: DemoDiscussion[];
}

export function createDemoBlueprint(): DemoBlueprint {
    const users: DemoBlueprint['users'] = {
        admins: [
            { key: 'admin-rina', name: 'Rina Admin Kolabri', email: 'admin@kolabri.id', role: 'admin', themePreference: 'light', languagePreference: 'id' },
        ] as DemoUser[],
        lecturers: [
            { key: 'lecturer-ahmad', name: 'Dr. Ahmad Lecturer', email: 'lecturer@kolabri.edu', role: 'lecturer', themePreference: 'light', languagePreference: 'id' },
            { key: 'lecturer-sari', name: 'Dr. Sari Pratama', email: 'sari@kolabri.edu', role: 'lecturer', themePreference: 'light', languagePreference: 'id' },
            { key: 'lecturer-bima', name: 'Bima Nugraha, M.Kom', email: 'bima@kolabri.edu', role: 'lecturer', themePreference: 'dark', languagePreference: 'id' },
        ] as DemoUser[],
        students: [
            { key: 'student-alya', name: 'Alya Putri', email: 'student1@kolabri.edu', role: 'student', themePreference: 'light', languagePreference: 'id' },
            { key: 'student-bagas', name: 'Bagas Pratama', email: 'student2@kolabri.edu', role: 'student', themePreference: 'dark', languagePreference: 'id' },
            { key: 'student-citra', name: 'Citra Lestari', email: 'student3@kolabri.edu', role: 'student', themePreference: 'light', languagePreference: 'id' },
            { key: 'student-dimas', name: 'Dimas Saputra', email: 'student4@kolabri.edu', role: 'student', themePreference: 'system', languagePreference: 'id' },
            { key: 'student-eka', name: 'Eka Maharani', email: 'student5@kolabri.edu', role: 'student', themePreference: 'light', languagePreference: 'id' },
            { key: 'student-fajar', name: 'Fajar Nugroho', email: 'student6@kolabri.edu', role: 'student', themePreference: 'light', languagePreference: 'id' },
            { key: 'student-gita', name: 'Gita Rahma', email: 'student7@kolabri.edu', role: 'student', themePreference: 'dark', languagePreference: 'id' },
            { key: 'student-hana', name: 'Hana Azzahra', email: 'student8@kolabri.edu', role: 'student', themePreference: 'light', languagePreference: 'id' },
            { key: 'student-ivan', name: 'Ivan Surya', email: 'student9@kolabri.edu', role: 'student', themePreference: 'system', languagePreference: 'id' },
        ] as DemoUser[],
    };

    const courses: DemoCourse[] = [
        {
            key: 'course-hci',
            code: 'CS401',
            name: 'Human-Computer Interaction',
            description: 'Mata kuliah interaksi manusia dan komputer dengan fokus diskusi evaluatif dan prototyping.',
            joinCode: 'HCI2024',
            semester: 'Ganjil',
            academicYear: '2025/2026',
            ownerKey: 'lecturer-ahmad',
            studentKeys: ['student-alya', 'student-bagas', 'student-citra', 'student-dimas'],
            status: 'active',
        },
        {
            key: 'course-se',
            code: 'SE305',
            name: 'Software Engineering Studio',
            description: 'Kolaborasi tim, analisis kebutuhan, dokumentasi, dan sprint reflection.',
            joinCode: 'SESTUDIO25',
            semester: 'Ganjil',
            academicYear: '2025/2026',
            ownerKey: 'lecturer-sari',
            studentKeys: ['student-eka', 'student-fajar', 'student-gita', 'student-hana'],
            status: 'active',
        },
        {
            key: 'course-dm',
            code: 'DM210',
            name: 'Data Mining Fundamentals',
            description: 'Eksplorasi data, insight extraction, dan diskusi kasus terapan.',
            joinCode: 'DATAMINING25',
            semester: 'Ganjil',
            academicYear: '2025/2026',
            ownerKey: 'lecturer-bima',
            studentKeys: ['student-bagas', 'student-citra', 'student-ivan', 'student-hana'],
            status: 'medium',
        },
        {
            key: 'course-pm',
            code: 'PM115',
            name: 'Project Management Basics',
            description: 'Kelas ringan untuk edge case data minim namun tetap terlihat hidup.',
            joinCode: 'PROJMAN25',
            semester: 'Genap',
            academicYear: '2025/2026',
            ownerKey: 'lecturer-ahmad',
            studentKeys: ['student-alya', 'student-fajar', 'student-ivan'],
            status: 'light',
        },
    ];

    const courseTemplates: DemoCourseTemplate[] = [
        {
            key: 'template-discussion-intensive',
            name: 'Template Diskusi Intensif',
            description: 'Template kelas dengan fokus diskusi, refleksi, dan goal setting.',
            namePattern: 'Kelas Diskusi - {{courseName}}',
            descriptionTemplate: 'Template untuk {{courseName}} dengan struktur grup aktif dan evaluasi mingguan.',
            defaultGroups: [
                { name: 'Kelompok Eksplorasi', description: 'Diskusi ide dan pertanyaan awal' },
                { name: 'Kelompok Sintesis', description: 'Merangkum insight dan rekomendasi' },
            ],
            createdByKey: 'lecturer-sari',
        },
        {
            key: 'template-project-studio',
            name: 'Template Studio Proyek',
            description: 'Template proyek dengan ruang akademik, proyek, dan umum.',
            namePattern: 'Studio - {{courseName}}',
            descriptionTemplate: 'Template proyek aktif untuk {{courseName}}.',
            defaultGroups: [
                { name: 'Tim Alpha', description: 'Tim eksekusi utama' },
                { name: 'Tim Beta', description: 'Tim validasi dan QA' },
            ],
            createdByKey: 'lecturer-ahmad',
        },
    ];

    const groups: DemoGroup[] = [
{ key: 'group-hci-alpha', courseKey: 'course-hci', name: 'Team Alpha', joinCode: 'GROUP-ALPHA', createdByKey: 'student-alya', memberKeys: ['student-alya', 'student-bagas'] },
{ key: 'group-hci-beta', courseKey: 'course-hci', name: 'Team Beta', joinCode: 'GROUP-BETA', createdByKey: 'student-citra', memberKeys: ['student-citra', 'student-dimas'] },
{ key: 'group-se-gamma', courseKey: 'course-se', name: 'Sprint Gamma', joinCode: 'SPRINT-GAMMA', createdByKey: 'student-eka', memberKeys: ['student-eka', 'student-fajar'] },
{ key: 'group-se-delta', courseKey: 'course-se', name: 'Sprint Delta', joinCode: 'SPRINT-DELTA', createdByKey: 'student-gita', memberKeys: ['student-gita', 'student-hana'] },
{ key: 'group-dm-insight', courseKey: 'course-dm', name: 'Insight Hunters', joinCode: 'INSIGHT-DM', createdByKey: 'student-bagas', memberKeys: ['student-bagas', 'student-citra'] },
{ key: 'group-dm-lab', courseKey: 'course-dm', name: 'Lab Miners', joinCode: 'LAB-MINERS', createdByKey: 'student-ivan', memberKeys: ['student-ivan', 'student-hana'] },
{ key: 'group-pm-lite', courseKey: 'course-pm', name: 'Project Starters', joinCode: 'STARTER-PM', createdByKey: 'student-alya', memberKeys: ['student-alya', 'student-fajar', 'student-ivan'] },
    ];

    const chatSpaces: DemoChatSpace[] = [
        { key: 'space-hci-alpha-general', groupKey: 'group-hci-alpha', name: 'Diskusi Umum', description: 'Diskusi utama HCI Team Alpha', type: 'Akademik', isDefault: true, summary: 'Diskusi kuat tentang evaluasi usability dan metode think aloud.' },
        { key: 'space-hci-alpha-prototype', groupKey: 'group-hci-alpha', name: 'Review Prototipe', description: 'Review wireframe dan usability issue', type: 'Proyek', summary: 'Tim menyepakati perbaikan navigasi dan hierarchy CTA.' },
        { key: 'space-hci-beta-general', groupKey: 'group-hci-beta', name: 'Diskusi Umum', description: 'Diskusi utama HCI Team Beta', type: 'Akademik', isDefault: true, summary: 'Diskusi moderat, butuh dorongan untuk memperdalam alasan desain.' },
        { key: 'space-se-gamma-general', groupKey: 'group-se-gamma', name: 'Sprint & Backlog', description: 'Daily sync dan backlog refinement', type: 'Proyek', isDefault: true, summary: 'Diskusi aktif tentang pembagian task dan risiko sprint.' },
        { key: 'space-se-delta-general', groupKey: 'group-se-delta', name: 'Diskusi Arsitektur', description: 'Membahas arsitektur solusi', type: 'Akademik', isDefault: true, summary: 'Pembahasan struktur service dan validasi API cukup tajam.' },
        { key: 'space-dm-insight-general', groupKey: 'group-dm-insight', name: 'Analisis Dataset', description: 'Eksplorasi pattern dan insight data', type: 'Akademik', isDefault: true, summary: 'Banyak insight, namun partisipasi belum merata.' },
        { key: 'space-dm-lab-general', groupKey: 'group-dm-lab', name: 'Praktikum Mining', description: 'Praktikum clustering dan evaluasi model', type: 'Proyek', isDefault: true, summary: 'Aktivitas rendah, cocok untuk demo early intervention.' },
        { key: 'space-pm-lite-general', groupKey: 'group-pm-lite', name: 'Kickoff Proyek', description: 'Sesi kickoff kelas ringan', type: 'Umum', isDefault: true, summary: 'Aktivitas awal berjalan, namun belum konsisten.' },
    ];

    const learningGoals: DemoGoal[] = [
        { key: 'goal-hci-alpha-1', chatSpaceKey: 'space-hci-alpha-general', userKey: 'student-alya', content: 'Menganalisis faktor yang memengaruhi usability pada aplikasi mobile.', isValidated: true },
        { key: 'goal-hci-beta-1', chatSpaceKey: 'space-hci-beta-general', userKey: 'student-citra', content: 'Menyusun argumentasi desain berbasis hasil evaluasi pengguna.', isValidated: true },
        { key: 'goal-se-gamma-1', chatSpaceKey: 'space-se-gamma-general', userKey: 'student-eka', content: 'Mampu memetakan backlog ke sprint goals yang realistis.', isValidated: true },
        { key: 'goal-se-delta-1', chatSpaceKey: 'space-se-delta-general', userKey: 'student-gita', content: 'Menjelaskan trade-off arsitektur modular untuk aplikasi kolaboratif.', isValidated: true },
        { key: 'goal-dm-insight-1', chatSpaceKey: 'space-dm-insight-general', userKey: 'student-bagas', content: 'Membedakan kualitas insight berdasarkan evidence data.', isValidated: true },
        { key: 'goal-dm-lab-1', chatSpaceKey: 'space-dm-lab-general', userKey: 'student-ivan', content: 'Menginterpretasikan hasil clustering secara kritis.', isValidated: false },
        { key: 'goal-pm-lite-1', chatSpaceKey: 'space-pm-lite-general', userKey: 'student-fajar', content: 'Menyusun prioritas risiko awal proyek tim kecil.', isValidated: false },
    ];

    const reflections: DemoReflection[] = [
        { key: 'reflection-1', userKey: 'student-alya', chatSpaceKey: 'space-hci-alpha-general', goalKey: 'goal-hci-alpha-1', type: 'session', content: 'Saya mulai bisa menghubungkan feedback pengguna dengan keputusan layout secara lebih sistematis.' },
        { key: 'reflection-2', userKey: 'student-bagas', chatSpaceKey: 'space-hci-alpha-general', goalKey: 'goal-hci-alpha-1', type: 'weekly', content: 'Diskusi tim membantu saya melihat bahwa evaluasi usability harus dibuktikan dengan contoh konkret.' },
        { key: 'reflection-3', userKey: 'student-citra', chatSpaceKey: 'space-hci-beta-general', goalKey: 'goal-hci-beta-1', type: 'session', content: 'Saya masih perlu memperkuat alasan saat menyarankan perubahan navigasi.' },
        { key: 'reflection-4', userKey: 'student-dimas', chatSpaceKey: 'space-hci-beta-general', type: 'weekly', content: 'Tim kami cukup aktif, tapi perlu lebih banyak pertanyaan HOT supaya analisis tidak dangkal.' },
        { key: 'reflection-5', userKey: 'student-eka', chatSpaceKey: 'space-se-gamma-general', goalKey: 'goal-se-gamma-1', type: 'session', content: 'Backlog refinement jadi lebih jelas setelah kami pecah story berdasarkan risiko.' },
        { key: 'reflection-6', userKey: 'student-fajar', chatSpaceKey: 'space-se-gamma-general', type: 'weekly', content: 'Saya belajar bahwa estimasi sprint harus mempertimbangkan blocker integrasi.' },
        { key: 'reflection-7', userKey: 'student-gita', chatSpaceKey: 'space-se-delta-general', goalKey: 'goal-se-delta-1', type: 'session', content: 'Arsitektur service terpisah mempermudah reasoning, tapi koordinasi endpoint perlu disiplin.' },
        { key: 'reflection-8', userKey: 'student-hana', chatSpaceKey: 'space-se-delta-general', type: 'weekly', content: 'Saya mulai memahami trade-off modularitas vs kompleksitas deployment.' },
        { key: 'reflection-9', userKey: 'student-bagas', chatSpaceKey: 'space-dm-insight-general', goalKey: 'goal-dm-insight-1', type: 'session', content: 'Insight yang kuat ternyata harus menjawab mengapa pola itu penting bagi keputusan.' },
        { key: 'reflection-10', userKey: 'student-citra', chatSpaceKey: 'space-dm-insight-general', type: 'weekly', content: 'Saya ingin lebih teliti membedakan insight deskriptif dan insight yang actionable.' },
        { key: 'reflection-11', userKey: 'student-ivan', chatSpaceKey: 'space-dm-lab-general', goalKey: 'goal-dm-lab-1', type: 'session', content: 'Saya masih bingung menjelaskan kualitas cluster tanpa contoh kasus.' },
        { key: 'reflection-12', userKey: 'student-fajar', chatSpaceKey: 'space-pm-lite-general', goalKey: 'goal-pm-lite-1', type: 'session', content: 'Kami butuh lebih banyak struktur agar kickoff tidak hanya jadi update status.' },
    ];

    const knowledgeBases: DemoKnowledgeBase[] = [
        { key: 'kb-hci-guide', courseKey: 'course-hci', uploadedByKey: 'lecturer-ahmad', fileName: 'hci-usability-guide.pdf', filePath: '/demo/kb/hci-usability-guide.pdf', fileSize: 2480000, mimeType: 'application/pdf', vectorStatus: 'ready' },
        { key: 'kb-se-template', courseKey: 'course-se', uploadedByKey: 'lecturer-sari', fileName: 'sprint-planning-template.docx', filePath: '/demo/kb/sprint-planning-template.docx', fileSize: 980000, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', vectorStatus: 'ready' },
        { key: 'kb-dm-notes', courseKey: 'course-dm', uploadedByKey: 'lecturer-bima', fileName: 'data-mining-notes.pdf', filePath: '/demo/kb/data-mining-notes.pdf', fileSize: 1760000, mimeType: 'application/pdf', vectorStatus: 'processing' },
    ];

    const aiChats: DemoAiChat[] = [
        {
            key: 'ai-chat-alya-1',
            userKey: 'student-alya',
            title: 'Ringkasan materi usability',
            messages: [
                { role: 'user', content: 'Tolong ringkas prinsip usability testing untuk presentasi besok.' },
                { role: 'assistant', content: 'Tentu. Fokus utamanya: tujuan tes, task scenario, observasi perilaku, dan temuan prioritas tinggi.' },
                { role: 'user', content: 'Bisa ubah jadi poin-poin singkat?' },
                { role: 'assistant', content: 'Bisa: 1) tetapkan tujuan, 2) pilih task nyata, 3) amati hambatan, 4) kategorikan severity, 5) rumuskan rekomendasi.' },
            ],
        },
        {
            key: 'ai-chat-bagas-1',
            userKey: 'student-bagas',
            title: 'Contoh HOT question',
            messages: [
                { role: 'user', content: 'Bantu buat pertanyaan HOT untuk diskusi collaborative learning.' },
                { role: 'assistant', content: 'Contoh: Mengapa collaborative learning bisa efektif pada konteks tertentu tetapi gagal di konteks lain?' },
                { role: 'user', content: 'Tambah 2 lagi.' },
                { role: 'assistant', content: '1) Bagaimana kualitas fasilitasi memengaruhi kedalaman diskusi? 2) Kapan intervensi dosen justru menghambat agency mahasiswa?' },
            ],
        },
        {
            key: 'ai-chat-gita-1',
            userKey: 'student-gita',
            title: 'Evaluasi arsitektur modular',
            messages: [
                { role: 'user', content: 'Bandingkan arsitektur monolit vs modular untuk aplikasi kolaboratif.' },
                { role: 'assistant', content: 'Monolit lebih sederhana untuk start, modular unggul pada isolasi tanggung jawab dan scaling tim.' },
                { role: 'user', content: 'Apa trade-off terbesarnya?' },
                { role: 'assistant', content: 'Koordinasi kontrak antar modul, observability, dan deployment pipeline yang lebih kompleks.' },
            ],
        },
        {
            key: 'ai-chat-ivan-1',
            userKey: 'student-ivan',
            title: 'Interpretasi clustering',
            messages: [
                { role: 'user', content: 'Bagaimana menjelaskan cluster agar tidak cuma deskriptif?' },
                { role: 'assistant', content: 'Hubungkan karakteristik cluster dengan keputusan yang bisa diambil, misalnya intervensi, segmentasi, atau prioritas analisis.' },
                { role: 'user', content: 'Kasih contoh singkat.' },
                { role: 'assistant', content: 'Jika cluster menunjukkan partisipasi rendah namun kualitas tinggi, intervensinya bisa fokus pada frekuensi, bukan kualitas argumen.' },
            ],
        },
    ];

    const notifications: DemoNotification[] = [
        { userKey: 'lecturer-ahmad', type: 'info', title: 'Ringkasan diskusi siap', message: 'Ringkasan terbaru untuk Team Alpha sudah tersedia.', isRead: false },
        { userKey: 'lecturer-ahmad', type: 'warning', title: 'Diskusi perlu perhatian', message: 'Project Starters menunjukkan partisipasi rendah dalam 24 jam terakhir.', isRead: false },
        { userKey: 'lecturer-sari', type: 'success', title: 'Goal tervalidasi', message: 'Learning goal Sprint Gamma telah tervalidasi.', isRead: true },
        { userKey: 'lecturer-bima', type: 'info', title: 'Knowledge base diproses', message: 'Data Mining Notes sedang diproses untuk semantic search.', isRead: false },
        { userKey: 'student-alya', type: 'success', title: 'Anda bergabung ke grup', message: 'Selamat datang di Team Alpha.', isRead: true },
        { userKey: 'student-bagas', type: 'info', title: 'Refleksi mingguan tersedia', message: 'Silakan kirim refleksi mingguan untuk HCI.', isRead: false },
        { userKey: 'student-citra', type: 'warning', title: 'Aktivitas diskusi menurun', message: 'Coba ajukan pertanyaan analitis untuk mendorong diskusi grup.', isRead: false },
        { userKey: 'student-dimas', type: 'info', title: 'Template diskusi baru', message: 'Dosen membagikan template diskusi usability.', isRead: true },
        { userKey: 'student-eka', type: 'success', title: 'Sprint goal tercapai', message: 'Kelompok Anda menyelesaikan backlog prioritas tinggi.', isRead: true },
        { userKey: 'student-fajar', type: 'info', title: 'AI chat aktif', message: 'Riwayat chat AI Anda tersimpan untuk referensi.', isRead: true },
        { userKey: 'student-gita', type: 'info', title: 'Diskusi arsitektur diperbarui', message: 'Ada balasan baru pada Architecture Corner.', isRead: false },
        { userKey: 'student-ivan', type: 'error', title: 'Insight perlu revisi', message: 'Dosen meminta penjelasan lebih kuat untuk hasil clustering.', isRead: false },
    ];

    const aiProviders: DemoAiProvider[] = [
        { key: 'provider-openai', name: 'openai', displayName: 'OpenAI GPT', apiKey: 'demo-openai-key', isActive: false, fallbackOrder: 2, config: { models: ['gpt-4o-mini', 'gpt-4.1-mini'], temperature: 0.4 } },
        { key: 'provider-anthropic', name: 'anthropic', displayName: 'Anthropic Claude', apiKey: 'demo-anthropic-key', isActive: false, fallbackOrder: 3, config: { models: ['claude-3-5-sonnet'], temperature: 0.3 } },
        { key: 'provider-google', name: 'google', displayName: 'Google Gemini', apiKey: 'demo-google-key', isActive: false, fallbackOrder: 4, config: { models: ['gemini-1.5-pro'], temperature: 0.5 } },
    ];

    const aiUsages: DemoAiUsage[] = [
        { userKey: 'student-alya', courseKey: 'course-hci', providerKey: 'provider-openai', provider: 'openai', model: 'gpt-4o-mini', promptTokens: 420, completionTokens: 710, estimatedCost: 0.012, latencyMs: 1180 },
        { userKey: 'student-bagas', courseKey: 'course-hci', providerKey: 'provider-openai', provider: 'openai', model: 'gpt-4o-mini', promptTokens: 360, completionTokens: 540, estimatedCost: 0.009, latencyMs: 980 },
        { userKey: 'student-citra', courseKey: 'course-dm', providerKey: 'provider-anthropic', provider: 'anthropic', model: 'claude-3-5-sonnet', promptTokens: 510, completionTokens: 760, estimatedCost: 0.019, latencyMs: 1420 },
        { userKey: 'student-eka', courseKey: 'course-se', providerKey: 'provider-openai', provider: 'openai', model: 'gpt-4o-mini', promptTokens: 280, completionTokens: 460, estimatedCost: 0.007, latencyMs: 820 },
        { userKey: 'student-fajar', courseKey: 'course-pm', providerKey: 'provider-google', provider: 'google', model: 'gemini-1.5-pro', promptTokens: 300, completionTokens: 430, estimatedCost: 0.006, latencyMs: 1310 },
        { userKey: 'student-gita', courseKey: 'course-se', providerKey: 'provider-anthropic', provider: 'anthropic', model: 'claude-3-5-sonnet', promptTokens: 620, completionTokens: 800, estimatedCost: 0.022, latencyMs: 1560 },
        { userKey: 'student-hana', courseKey: 'course-dm', providerKey: 'provider-openai', provider: 'openai', model: 'gpt-4.1-mini', promptTokens: 390, completionTokens: 520, estimatedCost: 0.010, latencyMs: 900 },
        { userKey: 'student-ivan', courseKey: 'course-dm', providerKey: 'provider-google', provider: 'google', model: 'gemini-1.5-pro', promptTokens: 270, completionTokens: 390, estimatedCost: 0.005, latencyMs: 1220 },
    ];

    const auditLogs: DemoAuditLog[] = [
        { userKey: 'admin-rina', action: 'CREATE_PROVIDER', entityType: 'AiProvider', entityKey: 'provider-openai', metadata: { source: 'seed' } },
        { userKey: 'admin-rina', action: 'CREATE_PROVIDER', entityType: 'AiProvider', entityKey: 'provider-anthropic', metadata: { source: 'seed' } },
        { userKey: 'admin-rina', action: 'CREATE_PROVIDER', entityType: 'AiProvider', entityKey: 'provider-google', metadata: { source: 'seed' } },
        { userKey: 'lecturer-ahmad', action: 'CREATE_COURSE', entityType: 'Course', entityKey: 'course-hci', changes: { code: 'CS401' } },
        { userKey: 'lecturer-sari', action: 'CREATE_COURSE', entityType: 'Course', entityKey: 'course-se', changes: { code: 'SE305' } },
        { userKey: 'lecturer-bima', action: 'CREATE_COURSE', entityType: 'Course', entityKey: 'course-dm', changes: { code: 'DM210' } },
        { userKey: 'lecturer-ahmad', action: 'CREATE_GROUP', entityType: 'Group', entityKey: 'group-hci-alpha', metadata: { memberCount: 2 } },
        { userKey: 'lecturer-sari', action: 'CREATE_GROUP', entityType: 'Group', entityKey: 'group-se-gamma', metadata: { memberCount: 2 } },
        { userKey: 'lecturer-bima', action: 'UPLOAD_KB', entityType: 'KnowledgeBase', entityKey: 'kb-dm-notes', metadata: { vectorStatus: 'processing' } },
        { userKey: 'student-alya', action: 'WRITE_REFLECTION', entityType: 'Reflection', entityKey: 'reflection-1', metadata: { type: 'session' } },
        { userKey: 'student-gita', action: 'AI_CHAT', entityType: 'AiChat', entityKey: 'ai-chat-gita-1', metadata: { model: 'claude-3-5-sonnet' } },
    ];

    const activityLogs: DemoActivityLog[] = [
        { courseKey: 'course-hci', groupKey: 'group-hci-alpha', userKey: 'student-alya', activityType: 'course_joined', metadata: { courseName: 'Human-Computer Interaction' } },
        { courseKey: 'course-hci', groupKey: 'group-hci-alpha', userKey: 'student-alya', activityType: 'group_joined', metadata: { groupName: 'Team Alpha' } },
        { courseKey: 'course-hci', groupKey: 'group-hci-alpha', userKey: 'student-alya', activityType: 'goal_set', metadata: { goal: 'Menganalisis faktor usability' } },
        { courseKey: 'course-hci', groupKey: 'group-hci-alpha', userKey: 'student-bagas', activityType: 'message_sent', metadata: { preview: 'Menurut saya karena ada proses diskusi...' } },
        { courseKey: 'course-hci', groupKey: 'group-hci-beta', userKey: 'student-citra', activityType: 'reflection_written', metadata: { reflectionType: 'session' } },
        { courseKey: 'course-se', groupKey: 'group-se-gamma', userKey: 'student-eka', activityType: 'course_joined', metadata: { courseName: 'Software Engineering Studio' } },
        { courseKey: 'course-se', groupKey: 'group-se-gamma', userKey: 'student-eka', activityType: 'goal_set', metadata: { goal: 'Memetakan backlog ke sprint goals' } },
        { courseKey: 'course-se', groupKey: 'group-se-gamma', userKey: 'student-fajar', activityType: 'message_sent', metadata: { preview: 'Kalau kita taruh API gateway...' } },
        { courseKey: 'course-se', groupKey: 'group-se-delta', userKey: 'student-gita', activityType: 'reflection_written', metadata: { reflectionType: 'weekly' } },
        { courseKey: 'course-se', groupKey: 'group-se-delta', userKey: 'student-hana', activityType: 'file_uploaded', metadata: { fileName: 'service-boundary-notes.pdf' } },
        { courseKey: 'course-dm', groupKey: 'group-dm-insight', userKey: 'student-bagas', activityType: 'message_sent', metadata: { preview: 'Kalau pattern ini muncul terus...' } },
        { courseKey: 'course-dm', groupKey: 'group-dm-insight', userKey: 'student-citra', activityType: 'reflection_written', metadata: { reflectionType: 'weekly' } },
        { courseKey: 'course-dm', groupKey: 'group-dm-lab', userKey: 'student-ivan', activityType: 'goal_set', metadata: { goal: 'Menginterpretasikan clustering' } },
        { courseKey: 'course-dm', groupKey: 'group-dm-lab', userKey: 'student-hana', activityType: 'message_sent', metadata: { preview: 'Aku masih bingung cluster ini...' } },
        { courseKey: 'course-pm', groupKey: 'group-pm-lite', userKey: 'student-fajar', activityType: 'course_joined', metadata: { courseName: 'Project Management Basics' } },
        { courseKey: 'course-pm', groupKey: 'group-pm-lite', userKey: 'student-ivan', activityType: 'group_joined', metadata: { groupName: 'Project Starters' } },
        { courseKey: 'course-pm', groupKey: 'group-pm-lite', userKey: 'student-fajar', activityType: 'message_sent', metadata: { preview: 'Siapa yang pegang risk register awal?' } },
        { courseKey: 'course-se', groupKey: 'group-se-gamma', userKey: 'lecturer-sari', activityType: 'file_uploaded', metadata: { fileName: 'sprint-planning-template.docx' } },
    ];

    const silenceEvents: DemoSilenceEvent[] = [
        { courseKey: 'course-dm', groupKey: 'group-dm-lab', chatSpaceKey: 'space-dm-lab-general', silenceDuration: 5400, interventionSent: true },
        { courseKey: 'course-pm', groupKey: 'group-pm-lite', chatSpaceKey: 'space-pm-lite-general', silenceDuration: 3200, interventionSent: false },
    ];

    const discussions: DemoDiscussion[] = [
        {
            key: 'discussion-hci-alpha-general',
            courseKey: 'course-hci',
            groupKey: 'group-hci-alpha',
            chatSpaceKey: 'space-hci-alpha-general',
            profile: 'high',
            messages: [
                { senderKey: 'student-alya', senderType: 'student', content: 'Mengapa hasil usability testing kita menunjukkan pengguna berhenti di langkah checkout kedua?', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.82, hotIndicators: ['mengapa', 'hasil', 'menunjukkan'], confidence: 0.96 } },
                { senderKey: 'student-bagas', senderType: 'student', content: 'Menurut saya karena label tombolnya ambigu dan feedback setelah klik kurang terlihat.', replyToIndex: 0, engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.79, hotIndicators: ['karena', 'ambigu', 'feedback'], confidence: 0.93 } },
                { senderKey: 'student-alya', senderType: 'student', content: 'Bagaimana kalau kita bandingkan dengan flow versi kompetitor supaya tahu ekspektasi pengguna?', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.83, hotIndicators: ['bagaimana', 'bandingkan'], confidence: 0.95 } },
                { senderKey: 'lecturer-ahmad', senderType: 'lecturer', content: 'Bagus. Coba kaitkan juga dengan prinsip visibility of system status.', engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.7, hotIndicators: ['coba'], confidence: 0.88 } },
                { senderKey: 'student-bagas', senderType: 'student', content: 'Berarti masalahnya bukan cuma copy tombol, tapi juga tidak ada indikator progres yang meyakinkan.', replyToIndex: 3, engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.81, hotIndicators: ['berarti', 'bukan cuma'], confidence: 0.92 } },
                { senderKey: 'student-alya', senderType: 'student', content: 'Aku setuju, jadi rekomendasi utama kita: perjelas label, tampilkan progress, dan beri feedback sukses/gagal yang eksplisit.', engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.77, hotIndicators: ['rekomendasi'], confidence: 0.9 } },
            ],
        },
        {
            key: 'discussion-hci-alpha-prototype',
            courseKey: 'course-hci',
            groupKey: 'group-hci-alpha',
            chatSpaceKey: 'space-hci-alpha-prototype',
            profile: 'high',
            messages: [
                { senderKey: 'student-alya', senderType: 'student', content: 'Kalau CTA utama kita pindah ke kanan bawah, apakah hierarki visualnya jadi lebih jelas?', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.8, hotIndicators: ['apakah', 'hierarki'], confidence: 0.94 } },
                { senderKey: 'student-bagas', senderType: 'student', content: 'Iya, terutama untuk pengguna mobile, area itu lebih mudah dijangkau ibu jari.', engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.74, hotIndicators: ['pengguna mobile'], confidence: 0.85 } },
                { senderKey: 'lecturer-ahmad', senderType: 'lecturer', content: 'Tambahkan bukti dari hasil observasi pengguna untuk memperkuat argumen kalian.', engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.69, hotIndicators: ['bukti'], confidence: 0.86 } },
                { senderKey: 'student-alya', senderType: 'student', content: 'Baik, dari 5 partisipan, 4 orang langsung mencari tombol di area kanan bawah setelah scroll pertama.', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.76, hotIndicators: ['dari 5 partisipan'], confidence: 0.91 } },
            ],
        },
        {
            key: 'discussion-hci-beta-general',
            courseKey: 'course-hci',
            groupKey: 'group-hci-beta',
            chatSpaceKey: 'space-hci-beta-general',
            profile: 'moderate',
            messages: [
                { senderKey: 'student-citra', senderType: 'student', content: 'Menurut kalian, menu navigasi kita sudah cukup sederhana belum?', engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.68, hotIndicators: [], confidence: 0.81 } },
                { senderKey: 'student-dimas', senderType: 'student', content: 'Lumayan sederhana, tapi masih ada dua menu yang namanya mirip.', engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.66, hotIndicators: [], confidence: 0.79 } },
                { senderKey: 'student-citra', senderType: 'student', content: 'Kalau begitu mungkin kita perlu rename salah satunya supaya tidak membingungkan.', engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.7, hotIndicators: ['mungkin'], confidence: 0.8 } },
            ],
        },
        {
            key: 'discussion-se-gamma-general',
            courseKey: 'course-se',
            groupKey: 'group-se-gamma',
            chatSpaceKey: 'space-se-gamma-general',
            profile: 'high',
            messages: [
                { senderKey: 'student-eka', senderType: 'student', content: 'Bagaimana kita membagi backlog supaya risiko integrasi tidak menumpuk di akhir sprint?', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.81, hotIndicators: ['bagaimana', 'risiko integrasi'], confidence: 0.95 } },
                { senderKey: 'student-fajar', senderType: 'student', content: 'Kita bisa kelompokkan task berdasarkan kontrak API lalu buat integration checkpoint di tengah sprint.', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.8, hotIndicators: ['berdasarkan', 'checkpoint'], confidence: 0.93 } },
                { senderKey: 'lecturer-sari', senderType: 'lecturer', content: 'Bagus. Apa indikator bahwa checkpoint itu benar-benar menurunkan risiko?', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.75, hotIndicators: ['apa indikator'], confidence: 0.9 } },
                { senderKey: 'student-eka', senderType: 'student', content: 'Jika pada checkpoint kita sudah punya contract test lolos dan tidak ada blocker dependency, berarti risiko utama turun.', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.79, hotIndicators: ['jika', 'berarti'], confidence: 0.92 } },
                { senderKey: 'student-fajar', senderType: 'student', content: '@AI bantu rangkum 3 risiko sprint yang paling kritis untuk tim kecil.', mentions: ['AI'], engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.72, hotIndicators: ['@AI'], confidence: 0.87 } },
                { senderKey: 'lecturer-sari', senderType: 'ai', content: 'Tiga risiko utama: dependency antar modul, scope creep, dan validasi integrasi yang terlambat.', isIntervention: true, engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.73, hotIndicators: ['risiko utama'], confidence: 0.88 } },
            ],
        },
        {
            key: 'discussion-se-delta-general',
            courseKey: 'course-se',
            groupKey: 'group-se-delta',
            chatSpaceKey: 'space-se-delta-general',
            profile: 'high',
            messages: [
                { senderKey: 'student-gita', senderType: 'student', content: 'Mengapa service auth sebaiknya dipisah dari service analytics pada tahap ini?', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.85, hotIndicators: ['mengapa', 'dipisah'], confidence: 0.96 } },
                { senderKey: 'student-hana', senderType: 'student', content: 'Karena kebutuhan scaling, data access, dan concern keamanan mereka berbeda cukup jauh.', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.79, hotIndicators: ['karena', 'keamanan'], confidence: 0.92 } },
                { senderKey: 'student-gita', senderType: 'student', content: 'Tapi kalau dipisah terlalu cepat, overhead observability dan deployment bisa naik.', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.78, hotIndicators: ['tapi', 'overhead'], confidence: 0.91 } },
                { senderKey: 'lecturer-sari', senderType: 'lecturer', content: 'Nah, itu trade-off penting. Kalian sudah mulai melihat kapan modularitas membantu dan kapan membebani.', engagement: { engagementType: 'emotional', isHigherOrder: false, lexicalVariety: 0.69, hotIndicators: ['trade-off'], confidence: 0.84 } },
            ],
        },
        {
            key: 'discussion-dm-insight-general',
            courseKey: 'course-dm',
            groupKey: 'group-dm-insight',
            chatSpaceKey: 'space-dm-insight-general',
            profile: 'moderate',
            messages: [
                { senderKey: 'student-bagas', senderType: 'student', content: 'Kalau cluster ini berisi pengguna aktif tapi churn tinggi, insight apa yang paling relevan?', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.8, hotIndicators: ['insight apa'], confidence: 0.93 } },
                { senderKey: 'student-citra', senderType: 'student', content: 'Mungkin mereka aktif karena butuh bantuan cepat, jadi retention problem-nya ada di value jangka panjang.', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.76, hotIndicators: ['mungkin', 'retention'], confidence: 0.89 } },
                { senderKey: 'lecturer-bima', senderType: 'lecturer', content: 'Bagus, lanjutkan dengan evidence apa yang perlu dicek untuk memvalidasi hipotesis itu.', engagement: { engagementType: 'cognitive', isHigherOrder: true, lexicalVariety: 0.72, hotIndicators: ['evidence'], confidence: 0.88 } },
            ],
        },
        {
            key: 'discussion-dm-lab-general',
            courseKey: 'course-dm',
            groupKey: 'group-dm-lab',
            chatSpaceKey: 'space-dm-lab-general',
            profile: 'low',
            messages: [
                { senderKey: 'student-ivan', senderType: 'student', content: 'Aku masih bingung hasil cluster ini maksudnya apa.', engagement: { engagementType: 'emotional', isHigherOrder: false, lexicalVariety: 0.55, hotIndicators: [], confidence: 0.78 } },
                { senderKey: 'student-hana', senderType: 'student', content: 'Sama, mungkin nanti kita lihat lagi.', engagement: { engagementType: 'emotional', isHigherOrder: false, lexicalVariety: 0.51, hotIndicators: [], confidence: 0.72 } },
                { senderKey: 'lecturer-bima', senderType: 'ai', content: 'Coba mulai dari membandingkan ciri utama setiap cluster dan hubungkan ke keputusan yang bisa diambil.', isIntervention: true, engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.68, hotIndicators: ['membandingkan'], confidence: 0.85 } },
            ],
        },
        {
            key: 'discussion-pm-lite-general',
            courseKey: 'course-pm',
            groupKey: 'group-pm-lite',
            chatSpaceKey: 'space-pm-lite-general',
            profile: 'low',
            messages: [
                { senderKey: 'student-fajar', senderType: 'student', content: 'Kita mulai dari mana ya untuk risk register?', engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.62, hotIndicators: [], confidence: 0.8 } },
                { senderKey: 'student-ivan', senderType: 'student', content: 'Belum tahu juga, mungkin list aja semua masalah yang kepikiran.', engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.58, hotIndicators: [], confidence: 0.75 } },
                { senderKey: 'student-alya', senderType: 'student', content: 'Oke, aku tulis dulu risiko soal timeline dan koordinasi tim.', engagement: { engagementType: 'behavioral', isHigherOrder: false, lexicalVariety: 0.64, hotIndicators: [], confidence: 0.8 } },
            ],
        },
    ];

    return {
        password: 'password123',
        users,
        courses,
        courseTemplates,
        groups,
        chatSpaces,
        learningGoals,
        reflections,
        knowledgeBases,
        aiChats,
        notifications,
        aiProviders,
        aiUsages,
        auditLogs,
        activityLogs,
        silenceEvents,
        discussions,
    };
}
