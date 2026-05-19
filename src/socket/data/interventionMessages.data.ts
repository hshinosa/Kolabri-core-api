export const INTERVENTION_MESSAGES = [
    "Sepertinya diskusi sudah agak sepi. Ada yang ingin berbagi pendapat atau pertanyaan?",
    "Tim, sudah beberapa saat tidak ada aktivitas. Apakah ada kesulitan yang bisa saya bantu?",
    "Bagaimana progress diskusi kalian? Jangan ragu untuk bertanya jika ada yang kurang jelas.",
    "Halo! Apakah kalian sudah menemukan solusi? Saya siap membantu jika diperlukan.",
    "Tim, mari kita lanjutkan diskusi. Apa langkah selanjutnya yang ingin kalian ambil?",
];

export const QUALITY_INTERVENTIONS: Record<'low_hot' | 'low_cognitive' | 'low_lexical' | 'general', string[]> = {
    low_hot: [
        "💡 **Tips Diskusi Berkualitas:** Coba ajukan pertanyaan 'mengapa' dan 'bagaimana' untuk memperdalam pemahaman. Misalnya: 'Mengapa hal ini penting?' atau 'Bagaimana konsep ini bisa diterapkan?'",
        "🎯 **Tingkatkan Diskusi:** Diskusi yang baik melibatkan analisis dan evaluasi. Coba bandingkan pendapat kalian atau jelaskan alasan di balik ide-ide yang disampaikan.",
        "🧠 **Berpikir Kritis:** Apa dampak atau konsekuensi dari topik yang sedang dibahas? Coba analisis lebih dalam dengan memberikan argumen dan bukti.",
        "📊 **Ajak Berpikir Tingkat Tinggi:** Daripada hanya menyatakan fakta, coba evaluasi kelebihan dan kekurangan dari setiap pendapat yang muncul.",
    ],
    low_cognitive: [
        "📚 **Fokus pada Isi:** Sepertinya diskusi lebih banyak koordinasi. Mari kita bahas substansi materi - apa yang sudah kalian pahami tentang topik ini?",
        "💬 **Perdalam Diskusi:** Bagaimana pemahaman kalian tentang konsep utama? Coba jelaskan dengan kata-kata sendiri.",
        "🔍 **Eksplorasi Materi:** Ada hubungan menarik antara topik ini dengan konsep lain. Apa yang bisa kalian hubungkan?",
        "📖 **Diskusi Substansial:** Apa kesimpulan atau insight baru yang sudah kalian dapatkan dari materi ini?",
    ],
    low_lexical: [
        "📝 **Variasi Bahasa:** Coba gunakan istilah-istilah kunci dari materi pembelajaran untuk memperkaya diskusi.",
        "🔤 **Kembangkan Kosakata:** Saat menjelaskan, gunakan sinonim atau parafrase untuk menunjukkan pemahaman yang lebih dalam.",
        "✍️ **Ekspresikan Lebih Rinci:** Jelaskan ide kalian dengan lebih detail menggunakan contoh konkret dan istilah akademis.",
    ],
    general: [
        "🌟 **Ayo Semangat!** Diskusi yang aktif membantu pemahaman bersama. Bagikan pendapat atau pertanyaan kalian!",
        "🤝 **Kolaborasi:** Coba tanggapi pendapat teman dengan memberikan perspektif tambahan atau pertanyaan lanjutan.",
    ],
};
