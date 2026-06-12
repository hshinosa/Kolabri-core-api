export const PRIVACY_POLICY = {
  version: '1.0.0',
  lastUpdated: '2026-06-10',
  content: {
    title: 'Kebijakan Privasi Kolabri',
    sections: [
      {
        heading: 'Pengumpulan Data',
        content: 'Kolabri mengumpulkan data yang Anda berikan secara langsung: nama, email, jurnal, pesan chat, refleksi, dan tujuan pembelajaran. Kami juga mengumpulkan data penggunaan (frekuensi chat, durasi sesi) untuk meningkatkan layanan.'
      },
      {
        heading: 'Penggunaan Data',
        content: 'Data digunakan untuk: menyediakan layanan journaling dan AI chat, memberikan scaffolding akademik, memantau kesehatan diskusi, dan menghasilkan analitik pembelajaran. Data AI interaction digunakan untuk meningkatkan kualitas respons AI.'
      },
      {
        heading: 'Penyimpanan Data',
        content: 'Data disimpan di server yang aman dengan enkripsi. Pesan chat disimpan selama akun aktif. Setelah penghapusan akun, data di-anonymize dalam 30 hari kemudian dihapus permanen.'
      },
      {
        heading: 'Berbagi Data',
        content: 'Data tidak dibagikan kepada pihak ketiga kecuali: dosen mata kuliah dapat melihat data diskusi dan analitik, dan admin sistem memiliki akses untuk pemeliharaan. Tidak ada data yang dijual.'
      },
      {
        heading: 'Hak Pengguna',
        content: 'Anda berhak: mengakses data Anda, mengekspor seluruh data, mencabut persetujuan AI interaction, mengatur preferensi privasi, dan menghapus akun. Hubungi admin untuk permintaan data.'
      }
    ]
  }
};

export const DATA_CATEGORIES = [
  { name: 'Profil', description: 'Nama, email, dan preferensi pengguna', purpose: 'Identitas dan personalisasi', retentionPeriod: 'Selama akun aktif + 30 hari setelah penghapusan' },
  { name: 'Jurnal', description: 'Entri jurnal harian dan mingguan', purpose: 'Refleksi pembelajaran', retentionPeriod: 'Selama akun aktif + 30 hari setelah penghapusan' },
  { name: 'Pesan Chat', description: 'Pesan dalam diskusi grup dan chat AI', purpose: 'Kolaborasi dan scaffolding akademik', retentionPeriod: 'Selama akun aktif + 30 hari setelah penghapusan' },
  { name: 'Refleksi', description: 'Refleksi sesi dan mingguan', purpose: 'Evaluasi pembelajaran', retentionPeriod: 'Selama akun aktif + 30 hari setelah penghapusan' },
  { name: 'Tujuan Pembelajaran', description: 'Learning goals per sesi diskusi', purpose: 'Arahkan diskusi', retentionPeriod: 'Selama akun aktif + 30 hari setelah penghapusan' },
  { name: 'Data Penggunaan', description: 'Frekuensi chat, durasi sesi, pola interaksi', purpose: 'Analitik dan peningkatan layanan', retentionPeriod: 'Selama akun aktif + 30 hari setelah penghapusan' },
  { name: 'Log Audit', description: 'Catatan tindakan sistem (login, consent, export)', purpose: 'Keamanan dan kepatuhan', retentionPeriod: '1 tahun setelah tindakan' },
  { name: 'Preferensi Privasi', description: 'Pengaturan visibilitas analytics, consent AI, data sharing', purpose: 'Kontrol pengguna atas data', retentionPeriod: 'Selama akun aktif + 30 hari setelah penghapusan' }
];
