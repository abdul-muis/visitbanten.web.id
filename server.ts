import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import cookieParser from "cookie-parser";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

// Initialize Google Gemini AI SDK if API Key is provided
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Ensure upload directories exist
const uploadFolders = ["destinations", "religi", "akomodasi", "paket", "kalender", "logo", "hero", "slides"];
const uploadsBaseDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsBaseDir)) {
  fs.mkdirSync(uploadsBaseDir, { recursive: true });
}
for (const folder of uploadFolders) {
  const fPath = path.join(uploadsBaseDir, folder);
  if (!fs.existsSync(fPath)) {
    fs.mkdirSync(fPath, { recursive: true });
  }
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const rawFolder = req.body.folder || "destinations";
    const folder = uploadFolders.includes(rawFolder) ? rawFolder : "destinations";
    const destDir = path.join(uploadsBaseDir, folder);
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    const uniqueName = crypto.randomBytes(8).toString("hex") + safeExt;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format gambar harus JPG, PNG, atau WEBP."));
    }
  },
});

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser("banten-secret-key-12345"));

// Data Interfaces
interface SiteData {
  settings: {
    title: string;
    subtitle: string;
    footerTagline: string;
    logo: string;
    coordTag: string;
    colors: Record<string, string>;
  };
  buttons: {
    searchBtnText: string;
    adminBtnText: string;
    notifBtnText: string;
    contrastBtnText: string;
    scrollCueText: string;
  };
  hero: {
    eyebrow: string;
    title1: string;
    title2: string;
    title3: string;
    sub: string;
    searchPlaceholder: string;
    searchBtn: string;
    cta1Text: string;
    cta1Link: string;
    cta2Text: string;
    cta2Action: string; // 'badak' | 'link'
    cta2Link?: string;
    slides: Array<{ url: string; alt: string }>;
    tickerItems: string[];
    weatherCards: Array<{ id: string; name: string; info: string; temp: string }>;
  };
  badakConfig: {
    fabText: string;
    fabSub: string;
    panelTitle: string;
    panelStatus: string;
    greetMsg: string;
    placeholder: string;
    sendBtn: string;
    suggestChips: Array<{ label: string; query: string }>;
    systemPromptNote?: string;
  };
  sections: {
    destinasi: { eyebrow: string; title: string; lede: string };
    religi: { eyebrow: string; title: string; lede: string };
    akomodasi: { eyebrow: string; title: string; lede: string };
    paket: { eyebrow: string; title: string; lede: string };
    pengalaman: {
      eyebrow: string;
      title: string;
      lede: string;
      tabs: Array<{
        id: string;
        tabLabel: string;
        featureImg: string;
        featureTitle: string;
        featureDesc: string;
        meta1Label: string;
        meta1Val: string;
        meta2Label: string;
        meta2Val: string;
        meta3Label: string;
        meta3Val: string;
        side1Title: string;
        side1Desc: string;
        side1Img?: string;
        side2Title: string;
        side2Desc: string;
        side2Img?: string;
      }>;
    };
    kalender: { eyebrow: string; title: string; lede: string };
    ekraf: { eyebrow: string; title: string; lede: string; audioBtnText: string };
    rencana: {
      eyebrow: string;
      title: string;
      lede: string;
      interestLabel: string;
      durationLabel: string;
      btnText: string;
    };
    informasi: {
      eyebrow: string;
      title: string;
      cards: Array<{ icon: string; title: string; text: string }>;
    };
  };
  footer: {
    tagline: string;
    col1Title: string;
    col2Title: string;
    col3Title: string;
    officeAddress: string;
    officeEmail: string;
    officePhone: string;
    copyright: string;
    coord: string;
  };
  menu: Array<{ label: string; href: string }>;
  destinations: Array<{ id: string; title: string; coord: string; tag: string; desc: string; img: string }>;
  religi: Array<{ id: string; title: string; coord: string; category: string; desc: string; img: string }>;
  akomodasi: Array<{ id: string; title: string; type: string; desc: string; img: string }>;
  paket: Array<{ id: string; title: string; duration: string; price: string; desc: string; img: string }>;
  kalender: Array<{ id: string; title: string; date: string; location: string; desc: string; img: string }>;
  ekraf: Array<{ id: string; title: string; category: string; icon: string; desc: string }>;
}

export interface TourismNotification {
  id: string;
  title: string;
  body: string;
  category: "event" | "weather" | "promo" | "info";
  timestamp: string;
  read?: boolean;
}

export interface ChatQueryLog {
  id: string;
  query: string;
  category: string;
  timestamp: string;
  language: string;
}

// In-Memory Database
const siteData: SiteData = {
  settings: {
    title: "Dinas Pariwisata",
    subtitle: "Provinsi Banten",
    footerTagline: "Dinas Pariwisata Provinsi Banten — mempromosikan pesona alam, keagungan budaya, dan sejarah Banten ke penjuru dunia.",
    logo: "assets/logo/logo_ebe_small.png",
    coordTag: "06°02'S 105°53'E — PROVINSI BANTEN · EXCITING BANTEN",
    colors: {
      "--ink": "#0B1E2D",
      "--ember": "#E2672E",
      "--moss": "#4F7A5E",
      "--gold": "#C9A227",
      "--ivory": "#F8F7F2",
      "--charcoal": "#13221C",
    },
  },
  buttons: {
    searchBtnText: "Cari",
    adminBtnText: "⚙ Admin",
    notifBtnText: "Pusat Notifikasi",
    contrastBtnText: "◐ Kontras",
    scrollCueText: "Gulir",
  },
  hero: {
    eyebrow: "MERCUSUAR CIKONENG, ANYER — TITIK NOL JALAN RAYA POS",
    title1: "Ujung Barat",
    title2: "Nusantara,",
    title3: "Menyala Saat Senja.",
    sub: "Dari rimba konservasi Badak Jawa di Ujung Kulon, kearifan suci Suku Baduy, hingga menara bersejarah Kesultanan Banten — satu provinsi dengan pesona laut, rimba, budaya, dan spiritualitas tak ternilai.",
    searchPlaceholder: 'Mau ke mana? Coba "Ujung Kulon", "Baduy", "Pantai Anyer"…',
    searchBtn: "Cari Wisata",
    cta1Text: "Jelajahi Destinasi",
    cta1Link: "#destinasi",
    cta2Text: "Tanya Si Badak AI 🦏",
    cta2Action: "badak",
    cta2Link: "#",
    slides: [
      { url: "assets/img/1000407444.jpg", alt: "Mercusuar Cikoneng Anyer" },
      { url: "assets/img/1000407443.jpg", alt: "Taman Nasional Ujung Kulon" },
      { url: "assets/img/1000407432.jpg", alt: "Pulau Sangiang" },
      { url: "assets/img/1000407446.jpg", alt: "Banten Lama & Keraton Surosowan" },
      { url: "assets/img/1000407448.jpg", alt: "Kampung Adat Baduy" },
    ],
    tickerItems: [
      "TAMAN NASIONAL UJUNG KULON · 06°45'S 105°20'E",
      "TANJUNG LESUNG KEK PARIWISATA · 06°30'S 105°38'E",
      "PULAU SANGIANG BAHARI · 05°55'S 105°49'E",
      "BANTEN LAMA & KERATON SUROSOWAN · 06°02'S 106°09'E",
      "KAMPUNG ADAT KANEKES BADUY · 06°32'S 106°22'E",
      "MERCUSUAR CIKONENG ANYER · 06°02'S 105°53'E",
      "PANTAI SAWARNA LEBAK · 06°59'S 106°18'E",
    ],
    weatherCards: [
      { id: "w1", name: "🌊 Pantai Anyer & Carita", info: "Selat Sunda · Ombak 0.6m · Cerah", temp: "29°C" },
      { id: "w2", name: "🦏 TN Ujung Kulon & Peucang", info: "Laut Selatan · Ombak Tenang · Cerah", temp: "28°C" },
      { id: "w3", name: "🕌 Banten Lama & Kota Serang", info: "Pusat Ziarah · Angin Sepoi · Cerah Berawan", temp: "31°C" },
      { id: "w4", name: "🌿 Adat Baduy (Kanekes, Lebak)", info: "Hutan Pegunungan · Sejuk Asri", temp: "24°C" },
    ],
  },
  badakConfig: {
    fabText: "Tanya Si Badak",
    fabSub: "AI Tour Guide",
    panelTitle: "Si Badak — Asisten Wisata AI Banten",
    panelStatus: "Sistem Aktif & Terhubung ke Gemini 3.7",
    greetMsg: "Sampurasun! Halo, saya <strong>Si Badak</strong>, asisten AI cerdas Dinas Pariwisata Provinsi Banten. Mau liburan ke mana? Tanyakan rute Ujung Kulon, kearifan Baduy, kuliner Rabeg & Sate Bandeng, atau rekomendasi hotel pantai!",
    placeholder: "Ketik pertanyaan wisata Banten di sini...",
    sendBtn: "↑",
    suggestChips: [
      { label: "Rute 3D2N Ujung Kulon", query: "Rekomendasikan itinerary 3 hari ke Ujung Kulon dan Pulau Peucang" },
      { label: "Aturan Ziarah Banten Lama", query: "Bagaimana sejarah dan aturan ziarah ke Masjid Agung Banten Lama?" },
      { label: "Pantangan Adat Baduy", query: "Apa saja pantangan adat dan aturan berkunjung ke Suku Baduy Dalam?" },
      { label: "Kuliner Khas Wajib Coba", query: "Apa saja kuliner khas Banten yang wajib dicoba beserta lokasinya?" },
    ],
  },
  sections: {
    destinasi: {
      eyebrow: "PETA SINGGAH UTAMA",
      title: "Destinasi Unggulan Banten",
      lede: "Enam titik ikonik yang mendefinisikan Banten: rimba perawan Ujung Kulon, laut bergradasi di Sangiang, dan peninggalan megah kesultanan maritim abad ke-16.",
    },
    religi: {
      eyebrow: "JEJAK SPIRITUAL & SEJARAH",
      title: "Wisata Religi & Warisan Kesultanan",
      lede: "Menyusuri napak tilas dakwah para Sultan Banten, menara kuno bergaya pagoda, dan simbol akulturasi lintas iman yang abadi.",
    },
    akomodasi: {
      eyebrow: "TEMPAT BERISTIRAHAT",
      title: "Akomodasi & Resor Pilihan",
      lede: "Dari resor tepi pantai Selat Sunda hingga glamping sejuk di kaki pegunungan Pandeglang.",
    },
    paket: {
      eyebrow: "PERJALANAN SIAP NIKMATI",
      title: "Paket Wisata Eksklusif",
      lede: "Dikelola bersama pemandu lokal resmi dan komunitas warga adat untuk pengalaman yang berkesan dan aman.",
    },
    pengalaman: {
      eyebrow: "EMPAT LAPISAN PESONA",
      title: "Pengalaman Autentik Banten",
      lede: "Banten tidak hanya dilihat, namun dirasakan melalui harmoni alam liar, kearifan adat, kelezatan rempah, dan keramahan masyarakatnya.",
      tabs: [
        {
          id: "alam",
          tabLabel: "🌿 Alam Liar",
          featureImg: "assets/img/1000407443.jpg",
          featureTitle: "Berkemah di tepi hutan hujan Pulau Peucang, Ujung Kulon",
          featureDesc: "Di dalam kawasan Taman Nasional Ujung Kulon, situs warisan dunia UNESCO ini menyatukan hutan hujan dataran rendah terakhir di Jawa dengan laguna sebening kaca dan habitat badak Jawa.",
          meta1Label: "Durasi ideal",
          meta1Val: "2–3 hari",
          meta2Label: "Akses Utama",
          meta2Val: "Perahu dari Sumur / Taman Jaya",
          meta3Label: "Musim Terbaik",
          meta3Val: "Mei – Oktober",
          side1Title: "Bendungan & Perbukitan Lebak",
          side1Desc: "Waduk alami di kaki pegunungan selatan.",
          side1Img: "assets/img/1000407439.jpg",
          side2Title: "Snorkeling Terumbu Karang Sangiang",
          side2Desc: "Terumbu karang dangkal warna-warni di Selat Sunda.",
          side2Img: "assets/img/1000407433.jpg",
        },
        {
          id: "budaya",
          tabLabel: "🏮 Adat & Budaya",
          featureImg: "assets/img/1000407448.jpg",
          featureTitle: "Angklung Buhun & Tenun Gedogan Kanekes Baduy",
          featureDesc: "Berbeda dari angklung biasa, Angklung Buhun dimainkan secara sakral saat masa tanam dan panen padi. Dipadukan dengan keahlian menenun kain tradisional wanita Baduy.",
          meta1Label: "Lokasi",
          meta1Val: "Kanekes & Kasepuhan Citorek",
          meta2Label: "Masa Sakral",
          meta2Val: "Upacara Seba Baduy (April)",
          meta3Label: "Etika Adat",
          meta3Val: "Wajib didampingi pemandu lokal",
          side1Title: "Rampak Bedug Kolosal",
          side1Desc: "Ratusan bedug ditabuh serentak dalam harmoni seni silat dan religi.",
          side1Img: "assets/img/1000407440.jpg",
          side2Title: "Terbang Gede & Debus Pusaka",
          side2Desc: "Kesenian bela diri dan spiritualitas legendaris Banten.",
          side2Img: "assets/img/1000407436.jpg",
        },
        {
          id: "kuliner",
          tabLabel: "🍲 Kuliner Rempah",
          featureImg: "assets/img/1000407430.jpg",
          featureTitle: "Kue Balok Menes — Kuliner Legendaris Pandeglang",
          featureDesc: "Adonan olahan beras yang difermentasi, dikukus dalam cetakan bambu tradisional, lalu disiram kinca gula aren murni khas Menes yang legit.",
          meta1Label: "Pusat Kuliner",
          meta1Val: "Pasar Menes, Pandeglang",
          meta2Label: "Waktu Terbaik",
          meta2Val: "Pagi hari selagi hangat",
          meta3Label: "Wajib Coba",
          meta3Val: "Rabeg Banten & Sate Bandeng",
          side1Title: "Sate Bandeng Tanpa Duri",
          side1Desc: "Ikan bandeng segar yang diolah bersama rempah dan kelapa sangrai, dibakar dalam jepitan bambu — warisan istana Sultan Banten.",
          side2Title: "Rabeg Banten",
          side2Desc: "Gulai daging kambing berempah pekat lada hitam, kayu manis, dan kecap manis warisan kesultanan maritim.",
        },
      ],
    },
    kalender: {
      eyebrow: "AGENDA BUDAYA 2026",
      title: "Kalender Event Pariwisata",
      lede: "Rayakan festival tahunan pesisir Anyer, tradisi sakral Seba Baduy, dan kemeriahan Rampak Bedug kolosal.",
    },
    ekraf: {
      eyebrow: "KARYA ANAK NEGERI",
      title: "Ekonomi Kreatif & Kriya Khas",
      lede: "Warisan pusaka Golok Ciomas, keanggunan Batik Banten ragam hias Surosowan, hingga gurihnya Emping Menes.",
      audioBtnText: "🔊 Dengarkan Ringkasan Audio Halaman Ini",
    },
    rencana: {
      eyebrow: "ITINERARY INTERAKTIF",
      title: "Rencanakan Perjalanan Wisata Anda",
      lede: "Pilih minat dan durasi liburan Anda. Sistem cerdas kami akan menyusun rute perjalanan beserta titik koordinatnya.",
      interestLabel: "Minat Utama Wisata",
      durationLabel: "Durasi Liburan",
      btnText: "Buat Rekomendasi Rute",
    },
    informasi: {
      eyebrow: "PANDUAN PERJALANAN",
      title: "Informasi Praktis Sebelum Berangkat",
      cards: [
        {
          icon: "✈",
          title: "Akses & Rute Menuju Banten",
          text: "Hanya 1.5–2 jam dari Jakarta via Tol Jakarta–Merak. Akses kereta Commuter Line Tanah Abang–Rangkasbitung–Merak, atau Bandara Soekarno-Hatta Tangerang.",
        },
        {
          icon: "☀",
          title: "Musim & Prakiraan Cuaca",
          text: "Bulan Mei–Oktober sangat ideal untuk wisata bahari Pulau Sangiang & Ujung Kulon. Musim penghujan menyajikan keindahan curug dan terasering sawah yang asri.",
        },
        {
          icon: "🚌",
          title: "Transportasi & Pemandu Lokal",
          text: "Gunakan pemandu wisata bersertifikat HPI untuk pendakian dan ekspedisi Ujung Kulon. Menuju Baduy Dalam wajib jalan kaki dari terminal Ciboleger.",
        },
        {
          icon: "🌿",
          title: "Aturan & Etika Adat",
          text: "Hormati pantangan adat di Baduy Dalam: tanpa kamera/gadget, dilarang sabun/sampo kimiawi di sungai, dan patuhi arahan tetua adat.",
        },
      ],
    },
  },
  footer: {
    tagline: "Dinas Pariwisata Provinsi Banten — Memajukan pariwisata berkelanjutan, melestarikan warisan budaya leluhur, dan memancarkan pesona Banten ke panggung dunia.",
    col1Title: "Eksplorasi Banten",
    col2Title: "Informasi Instansi",
    col3Title: "Kontak & Layanan",
    officeAddress: "Kawasan Pusat Pemerintahan Provinsi Banten (KP3B), Jl. Syech Nawawi Al-Bantani, Kota Serang, Banten 42171",
    officeEmail: "dispar@bantenprov.go.id",
    officePhone: "+62 254 200 000 / +62 811 1234 567",
    copyright: "© 2026 Dinas Pariwisata Provinsi Banten. Exciting Banten — Wonderful Indonesia.",
    coord: "06°02'S 105°53'E",
  },
  menu: [
    { label: "Destinasi", href: "#destinasi" },
    { label: "Religi", href: "#religi" },
    { label: "Akomodasi", href: "#akomodasi" },
    { label: "Paket Wisata", href: "#paket" },
    { label: "Pengalaman", href: "#pengalaman" },
    { label: "Kalender", href: "#kalender" },
    { label: "Ekraf", href: "#ekraf" },
    { label: "Rencana", href: "#rencana" },
    { label: "Info", href: "#informasi" },
  ],
  destinations: [
    {
      id: "1",
      title: "Taman Nasional Ujung Kulon",
      coord: "06°45'S 105°20'E",
      tag: "Alam & Konservasi",
      desc: "Rumah terakhir badak Jawa di dunia (Rhinoceros sondaicus). Berlayar ke Pulau Peucang, jelajah padang savana Cidaon, dan nikmati pantai berpasir putih bersih.",
      img: "assets/img/1000407443.jpg",
    },
    {
      id: "2",
      title: "Tanjung Lesung",
      coord: "06°30'S 105°38'E",
      tag: "Alam & Resor",
      desc: "Kawasan Ekonomi Khusus (KEK) Pariwisata berstandar internasional dengan vila tepi pantai, olahraga air, dan panorama megah Gunung Krakatau.",
      img: "assets/img/1000407442.jpg",
    },
    {
      id: "3",
      title: "Pulau Sangiang",
      coord: "05°55'S 105°49'E",
      tag: "Bahari",
      desc: "Taman wisata alam laut dengan terumbu karang indah di Selat Sunda. Spot snorkeling unggulan, goa kelelawar, dan pesona air laut tiga gradasi warna.",
      img: "assets/img/1000407432.jpg",
    },
    {
      id: "4",
      title: "Banten Lama & Keraton Surosowan",
      coord: "06°02'S 106°09'E",
      tag: "Sejarah & Warisan",
      desc: "Pusat Kesultanan Banten abad ke-16. Menara Masjid Agung Banten, reruntuhan megah Keraton Surosowan, Keraton Kaibon, dan Museum Situs Kepurbakalaan.",
      img: "assets/img/1000407446.jpg",
    },
    {
      id: "5",
      title: "Kasepuhan Adat & Baduy",
      coord: "06°32'S 106°22'E",
      tag: "Budaya & Adat",
      desc: "Menyelami kearifan lokal Urang Kanekes (Baduy Dalam & Luar) yang menjaga harmoni alam tanpa gawai modern, alunan Angklung Buhun, dan tenun tradisional.",
      img: "assets/img/1000407448.jpg",
    },
    {
      id: "6",
      title: "Anyer & Mercusuar Cikoneng",
      coord: "06°02'S 105°53'E",
      tag: "Pesisir",
      desc: "Titik nol Jalan Raya Pos Anyer–Panarukan. Mercusuar bersejarah peninggalan tahun 1885 dengan panorama matahari terbenam spektakuler di pesisir Selat Sunda.",
      img: "assets/img/1000407444.jpg",
    },
  ],
  religi: [
    {
      id: "1",
      title: "Masjid Agung Banten & Ziarah Makam Sultan",
      coord: "06°02'S 106°09'E",
      category: "Islam",
      desc: "Didirikan oleh Sultan Maulana Hasanuddin pada tahun 1552. Menara bergaya pagoda karya Tjek Ban Tjut dan makam para sultan yang selalu ramai diziarahi.",
      img: "assets/img/1000407450.jpg",
    },
    {
      id: "2",
      title: "Kompleks Keraton Surosowan & Kaibon",
      coord: "06°02'S 106°09'E",
      category: "Sejarah Islam",
      desc: "Napak tilas kejayaan Kesultanan Banten. Pintu gerbang megah Keraton Kaibon yang dipersembahkan untuk Ratu Aisyah, ibunda Sultan Syafiuddin.",
      img: "assets/img/1000407446.jpg",
    },
    {
      id: "3",
      title: "Vihara Avalokitesvara, Banten Lama",
      coord: "06°02'S 106°09'E",
      category: "Lintas Iman",
      desc: "Salah satu vihara tertua di Indonesia (abad ke-16), simbol toleransi tinggi Kesultanan Banten saat menyambut rombongan Putri Ong Tien Nio.",
      img: "assets/img/1000407431.jpg",
    },
  ],
  akomodasi: [
    {
      id: "1",
      title: "Resor Tepi Pantai Anyer & Carita",
      type: "Resor Pantai",
      desc: "Kolam renang infinity menghadap Selat Sunda, akses langsung ke pasir putih landai, ramah keluarga dan anak.",
      img: "assets/img/1000407441.jpg",
    },
    {
      id: "2",
      title: "The Royale Krakatau Hotel Cilegon",
      type: "Hotel Bisnis & Golf",
      desc: "Fasilitas bintang 4 dengan lapangan golf 18-hole, convention center, dan restoran kuliner internasional & lokal Banten.",
      img: "assets/img/1000407449.jpg",
    },
    {
      id: "3",
      title: "Glamping Dome Kaki Gunung Karang",
      type: "Glamping Pegunungan",
      desc: "Tenda kubah mewah beratap kanvas dengan panorama kabut pegunungan, udara sejuk Pandeglang, dan dek api unggun malam.",
      img: "assets/img/1000407438.jpg",
    },
    {
      id: "4",
      title: "Vila Apung Tanjung Lesung & Carita",
      type: "Resor Kontemporer",
      desc: "Vila berkonsep water villa terapung di atas air laut jernih, favorit untuk liburan romantis dan bulan madu.",
      img: "assets/img/1000407452.jpg",
    },
  ],
  paket: [
    {
      id: "1",
      title: "Paket Ekspedisi Ujung Kulon 3D2N",
      duration: "3 hari 2 malam",
      price: "Rp 2.750.000 / orang",
      desc: "Kapal privat ke Pulau Peucang, snorkeling laguna jernih, trekking habitat satwa di Cidaon, dan kano di Sungai Cigenter.",
      img: "assets/img/1000407443.jpg",
    },
    {
      id: "2",
      title: "Paket Budaya Baduy & Kasepuhan 2D1N",
      duration: "2 hari 1 malam",
      price: "Rp 950.000 / orang",
      desc: "Trekking santai dipandu warga lokal ke Kanekes, bermalam di rumah panggung kayu, belajar menenun, dan mencicipi hidangan alami.",
      img: "assets/img/1000407448.jpg",
    },
    {
      id: "3",
      title: "Paket Bahari Pulau Sangiang & Sunset Anyer 2D1N",
      duration: "2 hari 1 malam",
      price: "Rp 1.450.000 / orang",
      desc: "Snorkeling di Legon Bajo & Tanjung Bajo, jelajah Goa Kelelawar, dan menikmati senja keemasan di Mercusuar Cikoneng.",
      img: "assets/img/1000407432.jpg",
    },
    {
      id: "4",
      title: "Paket Wisata Religi & Heritage Banten Lama 1D",
      duration: "1 hari (Day Tour)",
      price: "Rp 450.000 / orang",
      desc: "Ziarah ke makam Sultan Hasanuddin di Masjid Agung Banten, eksplorasi Museum Situs Banten Lama, Keraton Kaibon & Vihara tertua.",
      img: "assets/img/1000407450.jpg",
    },
  ],
  kalender: [
    {
      id: "1",
      title: "Tradisi Seba Baduy 2026",
      date: "April 2026",
      location: "Kanekes (Lebak) & Pendopo Gubernur Serang",
      desc: "Upacara adat sakral masyarakat Baduy membawa hasil bumi sebagai bentuk silaturahmi dan rasa syukur kepada pimpinan daerah.",
      img: "assets/img/1000407448.jpg",
    },
    {
      id: "2",
      title: "Festival Rampak Bedug Banten",
      date: "Agustus 2026",
      location: "Alun-Alun Pandeglang & Pantai Carita",
      desc: "Koreografi kolosal ratusan penabuh bedug berpadu dengan seni silat dan sholawat tradisional Banten.",
      img: "assets/img/1000407440.jpg",
    },
    {
      id: "3",
      title: "Anyer Krakatau Sunset Festival",
      date: "Juni 2026",
      location: "Pesisir Mercusuar Cikoneng Anyer",
      desc: "Perayaan seni musik pesisir, bazar kuliner seafood dan ekraf, festival layang-layang raksasa, dan parade perahu hias.",
      img: "assets/img/1000407444.jpg",
    },
    {
      id: "4",
      title: "Malam Budaya Debus & Terbang Gede",
      date: "Oktober 2026",
      location: "Kawasan Banten Lama, Kota Serang",
      desc: "Atraksi seni bela diri legendaris Debus Banten berpadu dengan instrumen perkusi Terbang Gede dalam suasana malam penuh khidmat.",
      img: "assets/img/1000407436.jpg",
    },
  ],
  ekraf: [
    {
      id: "1",
      title: "Batik Banten — Motif Surosowan",
      category: "Tekstil & Warisan",
      icon: "🎨",
      desc: "Batik khas dengan 75 ragam hias motif yang direkonstruksi dari artefak keramik dan ornamen Keraton Surosowan Kesultanan Banten.",
    },
    {
      id: "2",
      title: "Golok Ciomas Pusaka",
      category: "Kriya Logam",
      icon: "🗡️",
      desc: "Karya pandai besi legendaris Ciomas Serang yang ditempa secara turun-temurun dengan teknik khusus dan nilai filosofis tinggi.",
    },
    {
      id: "3",
      title: "Kain Tenun Adat Baduy",
      category: "Kriya Tekstil",
      icon: "🧵",
      desc: "Ditenun dengan alat tenun gedogan manual oleh wanita Baduy menggunakan serat kapas asli dan pewarna daun alami hutan.",
    },
    {
      id: "4",
      title: "Emping Melinjo Menes Renyah",
      category: "Kuliner Khas",
      icon: "🥜",
      desc: "Olahan biji melinjo pilihan yang dipipihkan dengan tangan secara tradisional di Menes Pandeglang, menghasilkan tekstur renyah dan gurih.",
    },
    {
      id: "5",
      title: "Gerabah Tradisional Bumi Jaya",
      category: "Kriya Tanah Liat",
      icon: "🏺",
      desc: "Kerajinan tembikar tanah liat khas Ciruas Serang yang dibuat dengan teknik putaran manual sejak era Kesultanan Banten.",
    },
  ],
};

// Real-time Push Notifications Store
const notificationsList: TourismNotification[] = [
  {
    id: "notif-1",
    title: "✨ Kalender Wisata Banten 2026 Dirilis!",
    body: "Jadwal resmi Seba Baduy, Anyer Krakatau Festival, dan Rampak Bedug kini dapat diakses di portal.",
    category: "event",
    timestamp: new Date().toISOString(),
  },
  {
    id: "notif-2",
    title: "🌊 Info Cuaca Selat Sunda & Ujung Kulon",
    body: "Kondisi perairan Selat Sunda terpantau cerah berawan dengan ombak 0.5 - 1.25m, sangat aman untuk snorkeling dan penyeberangan.",
    category: "weather",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "notif-3",
    title: "🧳 Promo Paket Wisata Baduy & Religi",
    body: "Dapatkan paket ziarah Banten Lama dan Baduy 2D1N dengan pemandu lokal resmi Dinas Pariwisata.",
    category: "promo",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
  },
];

// Analytics Data Store
const analyticsData = {
  totalVisitors: 48290,
  aiQueriesTotal: 1420,
  activeNotifs: notificationsList.length,
  regionsStats: [
    { region: "Kab. Pandeglang (Ujung Kulon & Carita)", visitors: 16400, percent: 34 },
    { region: "Kab. Serang (Anyer & Ciomas)", visitors: 13200, percent: 27 },
    { region: "Kota Serang (Banten Lama)", visitors: 9800, percent: 20 },
    { region: "Kab. Lebak (Seba Baduy & Sawarna)", visitors: 6500, percent: 14 },
    { region: "Kota Cilegon & Tangerang", visitors: 2390, percent: 5 },
  ],
  interestStats: [
    { interest: "Wisata Alam & Konservasi", value: 38 },
    { interest: "Wisata Budaya & Adat", value: 26 },
    { interest: "Wisata Religi & Sejarah", value: 21 },
    { interest: "Wisata Bahari & Pantai", value: 15 },
  ],
  recentQueries: [
    { id: "q1", query: "Bagaimana cara ke Ujung Kulon dari Jakarta?", category: "Transportasi", timestamp: "10 menit lalu", language: "id" },
    { id: "q2", query: "Berapa biaya paket Baduy 2 hari 1 malam?", category: "Paket Wisata", timestamp: "25 menit lalu", language: "id" },
    { id: "q3", query: "What are the rules when visiting Baduy Dalam?", category: "Budaya", timestamp: "1 jam lalu", language: "en" },
    { id: "q4", query: "Rekomendasi hotel terbaik di pinggir pantai Anyer", category: "Akomodasi", timestamp: "2 jam lalu", language: "id" },
    { id: "q5", query: "Sejarah Masjid Agung Banten dan Menaranya", category: "Religi", timestamp: "4 jam lalu", language: "id" },
  ] as ChatQueryLog[],
};

// Admin User Store
interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const adminUsers: AdminUser[] = [
  {
    id: "1",
    username: "admin",
    passwordHash: hashPassword("admin12345"),
  },
];

// Active Sessions Store
interface SessionInfo {
  adminId: string;
  username: string;
  csrfToken: string;
  expiresAt: number;
}
const sessions = new Map<string, SessionInfo>();

function getSession(req: Request): SessionInfo | null {
  const sid = req.cookies?.banten_sid;
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(sid);
    return null;
  }
  return s;
}

// ----------------------------------------------------
// GEMINI AI INTEGRATION: SI BADAK ASSISTANT
// ----------------------------------------------------

function buildGeminiSystemPrompt(): string {
  const destSummary = siteData.destinations.map((d) => `- ${d.title} (${d.tag}, Koordinat: ${d.coord}): ${d.desc}`).join("\n");
  const religiSummary = siteData.religi.map((r) => `- ${r.title} (${r.category}): ${r.desc}`).join("\n");
  const staysSummary = siteData.akomodasi.map((a) => `- ${a.title} (Tipe: ${a.type}): ${a.desc}`).join("\n");
  const paketsSummary = siteData.paket.map((p) => `- ${p.title} (Durasi: ${p.duration}, Harga: ${p.price}): ${p.desc}`).join("\n");
  const eventsSummary = siteData.kalender.map((k) => `- ${k.title} (${k.date} di ${k.location}): ${k.desc}`).join("\n");
  const ekrafSummary = siteData.ekraf.map((e) => `- ${e.title} (${e.category}): ${e.desc}`).join("\n");

  return `Anda adalah "Si Badak", Asisten AI dan Pemandu Wisata Cerdas Resmi dari Dinas Pariwisata Provinsi Banten (Exciting Banten).
Karakter Anda ramah, bijaksana, hangat, berbudaya, informatif, dan sangat paham seluk-beluk Banten dari ujung barat hingga timur.

Pengetahuan Utama Anda tentang Banten meliputi:
1. DESTINASI AKTIF DI PORTAL:
${destSummary}

2. WISATA RELIGI & SEJARAH KESULTANAN BANTEN:
${religiSummary}
(Paham tentang Sultan Maulana Hasanuddin, Sunan Gunung Jati, Keraton Surosowan, Keraton Kaibon, Vihara Avalokitesvara, Tasik Kardi, Meriam Ki Amuk)

3. AKOMODASI & TEMPAT MENGINAP:
${staysSummary}

4. PAKET WISATA RESMI:
${paketsSummary}

5. KALENDER EVENT & BUDAYA:
${eventsSummary}

6. PRODUK EKONOMI KREATIF & KULINER:
${ekrafSummary}
Kuliner khas: Sate Bandeng, Rabeg kambing berempah, Kue Balok Menes, Angeun Lada, Emping Melinjo, Pecak Bandeng Sawah Luhur, Nasi Sumsum Serang.

7. ATURAN & ETIKA KHUSUS:
- Baduy Dalam (Cibeo, Cikertawarna, Cikeusik): DILARANG mengambil foto/video, dilarang sabun/sampo kimiawi, dilarang alat elektronik, wajib berjalan kaki tanpa alas kaki modern di zona inti, hormati puun dan adat.
- Baduy Luar (Ciboleger, Gajeboh, Kaduketug): Boleh foto wajar, wajib berpakaian sopan.
- Ujung Kulon: Kawasan konservasi satwa dilindungi Badak Jawa, wajib dipandu ranger TNUK, musim terbaik Mei–Oktober.

PANDUAN MENJAWAB:
- Jawablah dengan bahasa yang diminta pengguna (Bahasa Indonesia secara default, English jika ditanya dalam bahasa Inggris, atau Basa Sunda jika disapa bahasa Sunda).
- Gunakan format Markdown yang rapi (gunakan bold, bullet points, dan subjudul yang jelas).
- Berikan saran rute (itinerary) yang logis jika pengguna menanyakan rencana liburan 1 hari, 2 hari, atau 3 hari.
- Tambahkan estimasi biaya, tips keselamatan, waktu tempuh dari Jakarta/Merak/Bandara Soekarno-Hatta, dan koordinat jika relevan.
- Jika ada paket wisata terkait di portal, rekomendasikan nama paket dan harganya.
- Jawab secara lengkap, solutif, dan mengundang untuk berwisata ke Banten!`;
}

// Fallback intelligent responses if Gemini API is temporarily offline or key not provided
function generateLocalIntelligentReply(query: string, lang: string): string {
  const q = query.toLowerCase();

  if (lang === "en") {
    if (q.includes("ujung kulon") || q.includes("rhino") || q.includes("peucang")) {
      return `🦏 **Ujung Kulon National Park & Peucang Island Travel Guide:**\n\n- **Best Season:** May – October for calm seas and sunny weather.\n- **Access:** Drive from Jakarta to Sumur / Taman Jaya (approx. 5-6 hours), then take a chartered boat (2-3 hours) to Peucang Island.\n- **Highlights:** Home to the endangered Javan Rhinoceros (*Rhinoceros sondaicus*), white sand beaches, Cidaon wildlife pasture (peacocks & wild banteng), and Cigenter river canoeing.\n- **Official Package:** *Ujung Kulon Expedition 3D2N* (approx. Rp 2,750,000 / person).`;
    }
    if (q.includes("baduy") || q.includes("rule") || q.includes("custom")) {
      return `🌿 **Visiting Baduy Traditional Villages (Kanekes):**\n\n- **Entry Point:** Ciboleger terminal (Lebak Regency), continue by walking.\n- **Important Rules (Baduy Dalam):** Strictly NO cameras/smartphones, NO chemical soap/shampoo, and respect local elders.\n- **Culture:** Experience handwoven fabrics, Angklung Buhun melodies, and organic living.\n- **Official Package:** *Baduy & Kasepuhan Cultural Trip 2D1N* (approx. Rp 950,000 / person).`;
    }
    return `Hello! I am **Si Badak**, your official Banten Tourism AI Assistant. Banten offers pristine rainforests in Ujung Kulon, sunset beaches in Anyer, historical Sultanate heritage in Banten Lama, and peaceful cultural retreats in Baduy. What would you like to explore today?`;
  }

  // Indonesian / Sundanese
  if (q.includes("ujung kulon") || q.includes("peucang") || q.includes("badak")) {
    return `🦏 **Panduan Eksplorasi Taman Nasional Ujung Kulon:**\n\n1. **Waktu Terbaik:** Mei – Oktober saat perairan Selat Sunda tenang dan cerah.\n2. **Rute Perjalanan:**\n   - Jakarta / Serang ➔ Tol Merak keluar Serang Timur / Pandeglang ➔ Labuan ➔ Sumur / Taman Jaya (± 5-6 jam darat).\n   - Dari Dermaga Sumur naik kapal motor tradisional (2-3 jam) menuju **Pulau Peucang**.\n3. **Aktivitas Unggulan:**\n   - Mengamati satwa liar (banteng, rusa, merak) di Savana Cidaon saat fajar/senja.\n   - Snorkeling di karang laguna Pulau Peucang.\n   - Susur sungai purba Cigenter dengan kano (habitat buaya muara & badak jawa).\n4. **Rekomendasi Paket:** Paket Wisata *Ujung Kulon 3D2N* seharga Rp 2.750.000/orang sudah termasuk kapal, pemandu ranger, homestay/tenda, dan konsumsi.`;
  }

  if (q.includes("baduy") || q.includes("kasepuhan") || q.includes("kanekes") || q.includes("aturan")) {
    return `🌿 **Panduan Wisata Budaya Suku Baduy (Kanekes, Lebak):**\n\n- **Akses Masuk:** Berangkat dari Terminal Ciboleger atau Cijahe (Lebak). Dari titik ini, perjalanan sepenuhnya dilakukan dengan berjalan kaki.\n- **Aturan Adat Baduy Dalam (Cibeo, Cikertawarna, Cikeusik):**\n  1. ❌ Dilarang memotret atau merekam video dalam bentuk apa pun.\n  2. ❌ Dilarang menggunakan sabun, sampo, atau pasta gigi kimia di sungai.\n  3. ❌ Dilarang membawa alat elektronik musik yang bersuara bising.\n  4. ❌ Dilarang masuk bagi Warga Negara Asing (WNA) khusus ke Baduy Dalam (WNA hanya sampai Baduy Luar).\n- **Oleh-oleh Khas:** Madu hutan asli Baduy, kain tenun gedogan khas motif poleng, dan tas koja serat kayu teureup.\n- **Paket Tersedia:** *Paket Budaya Baduy 2D1N* (Rp 950.000/orang).`;
  }

  if (q.includes("kuliner") || q.includes("makan") || q.includes("sate bandeng") || q.includes("rabeg") || q.includes("kue balok")) {
    return `🍽️ **Kuliner Khas Wajib Coba di Banten:**\n\n1. **Rabeg Banten:** Olahan gulai daging kambing dengan racikan rempah lada hitam, cengkeh, kayu manis, dan kecap manis warisan kuliner Kesultanan Banten.\n2. **Sate Bandeng:** Ikan bandeng tanpa duri yang diolah bersama kelapa sangrai dan rempah, dibakar dalam jepitan bambu.\n3. **Kue Balok Menes:** Kue olahan beras fermentasi dari Menes Pandeglang, disiram sirup kinca gula aren cair yang legit.\n4. **Angeun Lada:** Sup sayur pedas gurih khas Pandeglang/Lebak dengan aroma khas daun walang.\n5. **Emping Melinjo Menes:** Keripik melinjo renyah khas Menes yang bisa dibeli di toko oleh-oleh seantero Banten.`;
  }

  if (q.includes("religi") || q.includes("masjid agung") || q.includes("ziarah") || q.includes("sultan") || q.includes("surosowan")) {
    return `🕌 **Wisata Religi & Sejarah Banten Lama:**\n\n1. **Masjid Agung Banten:** Dibangun tahun 1552 oleh Sultan Maulana Hasanuddin. Menara unik bergaya pagoda setinggi 24 meter dengan tangga spiral.\n2. **Makam Para Sultan Banten:** Kompleks makam Sultan Maulana Hasanuddin, Sultan Ageng Tirtayasa, dan keluarga kesultanan yang ramai dikunjungi peziarah.\n3. **Keraton Surosowan & Keraton Kaibon:** Reruntuhan megah pusat pemerintahan maritim abad ke-16.\n4. **Vihara Avalokitesvara:** Klenteng tertua di Banten yang berdiri berdampingan sejak era kesultanan, bukti nyata toleransi antarumat beragama.\n5. **Paket:** Tersedia *Paket Ziarah & Heritage Banten Lama 1D* seharga Rp 450.000/orang.`;
  }

  if (q.includes("rute") || q.includes("itinerary") || q.includes("rencana") || q.includes("2 hari") || q.includes("3 hari")) {
    return `🗺️ **Rekomendasi Itinerary Wisata Banten (3 Hari 2 Malam):**\n\n- **Hari 1 (Pesisir & Religi):**\n  - Pagi: Perjalanan dari Jakarta ke Serang (Banten Lama), ziarah Masjid Agung & eksplorasi Keraton Surosowan.\n  - Siang: Menikmati Sate Bandeng & Rabeg di Kota Serang.\n  - Sore: Melanjutkan perjalanan ke Anyer, menikmati senja di Mercusuar Cikoneng, check-in resor pantai Anyer.\n\n- **Hari 2 (Bahari & Snorkeling):**\n  - Pagi: Menyeberang ke Pulau Sangiang untuk snorkeling dan jelajah goa laut.\n  - Siang: Bersantai di pantai pasir putih Anyer / Tanjung Lesung.\n  - Malam: Barbeku seafood segar tepi pantai.\n\n- **Hari 3 (Ekraf & Kuliner):**\n  - Pagi: Mampir ke Menes membeli Kue Balok dan Emping Melinjo.\n  - Siang: Mengunjungi sentra Batik Banten di Kota Serang sebelum kembali ke Jakarta.`;
  }

  return `Halo! Saya **Si Badak**, Asisten AI Pemandu Wisata Resmi Banten. 🦏\n\nSaya dapat membantu Anda merencanakan liburan impian ke:\n- **Taman Nasional Ujung Kulon & Pulau Peucang** (habitat badak jawa)\n- **Kampung Adat Baduy & Kasepuhan** (kearifan lokal & tenun)\n- **Wisata Religi Banten Lama** (Masjid Agung & Makam Sultan)\n- **Pantai Anyer, Carita, Tanjung Lesung & Pulau Sangiang**\n- **Kuliner khas:** Rabeg, Sate Bandeng, Kue Balok Menes\n\nSilakan tanyakan rute, tiket, akomodasi, atau jadwal festival!`;
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Data Retrieval: /api/data & /api/data.php
const handleGetData = (req: Request, res: Response) => {
  res.json(siteData);
};
app.get("/api/data.php", handleGetData);
app.get("/api/data", handleGetData);

// 2. Gemini AI Chat Endpoint: /api/gemini/chat & /api/ai/chat
app.post(["/api/gemini/chat", "/api/ai/chat"], async (req: Request, res: Response) => {
  try {
    const { message, history, language = "id" } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Pesan tidak boleh kosong." });
    }

    const cleanMsg = message.trim();

    // Log query to analytics store
    const logItem: ChatQueryLog = {
      id: "q-" + Date.now(),
      query: cleanMsg,
      category: categorizeQuery(cleanMsg),
      timestamp: "Baru saja",
      language: language,
    };
    analyticsData.recentQueries.unshift(logItem);
    if (analyticsData.recentQueries.length > 20) {
      analyticsData.recentQueries.pop();
    }
    analyticsData.aiQueriesTotal += 1;

    const gemini = getGeminiClient();

    if (gemini) {
      // Build system prompt with current portal knowledge
      const systemInstruction = buildGeminiSystemPrompt();

      // Format message history for Gemini chat if provided
      const contents: Array<any> = [];

      if (Array.isArray(history) && history.length > 0) {
        // Take last 6 turns for conversational context
        const recentHistory = history.slice(-6);
        for (const item of recentHistory) {
          contents.push({
            role: item.role === "user" ? "user" : "model",
            parts: [{ text: String(item.text || "") }],
          });
        }
      }

      contents.push({
        role: "user",
        parts: [{ text: cleanMsg }],
      });

      const response = await gemini.models.generateContent({
        model: "gemini-3.7-flash",
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        },
      });

      const replyText = response.text || generateLocalIntelligentReply(cleanMsg, language);
      return res.json({
        reply: replyText,
        engine: "gemini-3.7-flash",
        timestamp: new Date().toISOString(),
      });
    } else {
      // Intelligent fallback engine
      const replyText = generateLocalIntelligentReply(cleanMsg, language);
      return res.json({
        reply: replyText,
        engine: "sibadak-expert-knowledge",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error("Gemini AI API Error:", error);
    // Graceful fallback to guarantee UI continuity
    const fallbackText = generateLocalIntelligentReply(req.body?.message || "", req.body?.language || "id");
    return res.json({
      reply: fallbackText,
      engine: "fallback",
      errorNote: error.message || "Failed to reach Gemini API directly, served via Banten Tourism Knowledge Base.",
      timestamp: new Date().toISOString(),
    });
  }
});

function categorizeQuery(q: string): string {
  const s = q.toLowerCase();
  if (s.includes("rute") || s.includes("itinerary") || s.includes("hari") || s.includes("kemana")) return "Rute & Rencana";
  if (s.includes("baduy") || s.includes("kasepuhan") || s.includes("angklung") || s.includes("adat")) return "Budaya Baduy";
  if (s.includes("ujung kulon") || s.includes("peucang") || s.includes("badak") || s.includes("alam")) return "Ujung Kulon";
  if (s.includes("religi") || s.includes("masjid") || s.includes("makam") || s.includes("ziarah")) return "Wisata Religi";
  if (s.includes("makan") || s.includes("kuliner") || s.includes("rabeg") || s.includes("bandeng")) return "Kuliner Khas";
  if (s.includes("hotel") || s.includes("resor") || s.includes("glamping") || s.includes("inap")) return "Akomodasi";
  if (s.includes("paket") || s.includes("harga") || s.includes("biaya") || s.includes("murah")) return "Paket Wisata";
  return "Informasi Umum";
}

// 3. Push Notifications API: /api/notifications
app.get("/api/notifications", (req: Request, res: Response) => {
  res.json({
    notifications: notificationsList,
    count: notificationsList.length,
  });
});

app.post("/api/notifications", (req: Request, res: Response) => {
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: "Silakan login sebagai admin terlebih dahulu." });
  }

  const { title, body, category = "info" } = req.body;
  if (!title || !body) {
    return res.status(422).json({ error: "Judul dan isi notifikasi wajib diisi." });
  }

  const newNotif: TourismNotification = {
    id: "notif-" + Date.now(),
    title: String(title).trim(),
    body: String(body).trim(),
    category: ["event", "weather", "promo", "info"].includes(category) ? category : "info",
    timestamp: new Date().toISOString(),
  };

  notificationsList.unshift(newNotif);
  analyticsData.activeNotifs = notificationsList.length;

  return res.status(201).json({ ok: true, notification: newNotif });
});

app.delete("/api/notifications/:id", (req: Request, res: Response) => {
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: "Silakan login sebagai admin." });
  }

  const id = req.params.id;
  const idx = notificationsList.findIndex((n) => n.id === id);
  if (idx !== -1) {
    notificationsList.splice(idx, 1);
    analyticsData.activeNotifs = notificationsList.length;
  }
  return res.json({ ok: true });
});

// 4. Analytics Endpoint: /api/analytics
app.get("/api/analytics", (req: Request, res: Response) => {
  // Update visitor count with subtle organic simulation
  analyticsData.totalVisitors += Math.floor(Math.random() * 3);
  res.json({
    totalVisitors: analyticsData.totalVisitors,
    aiQueriesTotal: analyticsData.aiQueriesTotal,
    totalDestinations: siteData.destinations.length + siteData.religi.length,
    totalStays: siteData.akomodasi.length,
    totalPackages: siteData.paket.length,
    totalEvents: siteData.kalender.length,
    activeNotifs: notificationsList.length,
    regionsStats: analyticsData.regionsStats,
    interestStats: analyticsData.interestStats,
    recentQueries: analyticsData.recentQueries,
  });
});

// 5. Auth Endpoints: /api/auth.php & /api/auth
const handleAuth = (req: Request, res: Response) => {
  const action = (req.query.action as string) || req.body.action || "";

  switch (action) {
    case "login": {
      const { username, password } = req.body;
      const cleanUser = (username || "").trim();
      const user = adminUsers.find(
        (u) => u.username.toLowerCase() === cleanUser.toLowerCase() && u.passwordHash === hashPassword(password || "")
      );

      if (!user) {
        return res.status(401).json({ error: "Username atau password salah." });
      }

      const sid = crypto.randomBytes(24).toString("hex");
      const csrfToken = crypto.randomBytes(16).toString("hex");
      sessions.set(sid, {
        adminId: user.id,
        username: user.username,
        csrfToken,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });

      res.cookie("banten_sid", sid, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return res.json({ ok: true, username: user.username, csrf_token: csrfToken });
    }

    case "logout": {
      const sid = req.cookies?.banten_sid;
      if (sid) sessions.delete(sid);
      res.clearCookie("banten_sid");
      return res.json({ ok: true });
    }

    case "check": {
      const sess = getSession(req);
      if (sess) {
        return res.json({ authenticated: true, username: sess.username, csrf_token: sess.csrfToken });
      }
      return res.json({ authenticated: false });
    }

    case "change_password": {
      const sess = getSession(req);
      if (!sess) {
        return res.status(401).json({ error: "Sesi berakhir. Silakan login kembali." });
      }

      const { current_password, new_password } = req.body;
      if (!new_password || new_password.length < 8) {
        return res.status(422).json({ error: "Password baru minimal 8 karakter." });
      }

      const user = adminUsers.find((u) => u.id === sess.adminId);
      if (!user || user.passwordHash !== hashPassword(current_password || "")) {
        return res.status(401).json({ error: "Password saat ini salah." });
      }

      user.passwordHash = hashPassword(new_password);
      return res.json({ ok: true });
    }

    default:
      return res.status(400).json({ error: "Aksi tidak dikenal." });
  }
};

app.all("/api/auth.php", handleAuth);
app.all("/api/auth", handleAuth);

// 6. Settings: /api/settings.php & /api/settings
const handleSettings = (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  }

  const { title, subtitle, footerTagline, logo, coordTag, colors } = req.body;
  if (title !== undefined) siteData.settings.title = title || "Dinas Pariwisata";
  if (subtitle !== undefined) siteData.settings.subtitle = subtitle || "Provinsi Banten";
  if (footerTagline !== undefined) siteData.settings.footerTagline = footerTagline;
  if (logo !== undefined) siteData.settings.logo = logo || "assets/logo/logo_ebe_small.png";
  if (coordTag !== undefined) siteData.settings.coordTag = coordTag;
  if (colors && typeof colors === "object") {
    siteData.settings.colors = { ...siteData.settings.colors, ...colors };
  }

  return res.json({ ok: true, settings: siteData.settings });
};

app.all("/api/settings.php", handleSettings);
app.all("/api/settings", handleSettings);

// 6b. Hero Section Management: /api/hero
app.post("/api/hero", (req: Request, res: Response) => {
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  }

  const heroData = req.body;
  if (!heroData || typeof heroData !== "object") {
    return res.status(422).json({ error: "Data hero tidak valid." });
  }

  siteData.hero = {
    ...siteData.hero,
    ...heroData,
  };

  return res.json({ ok: true, hero: siteData.hero });
});

// 6c. Si Badak Chatbot & Floating Button Management: /api/badak
app.post("/api/badak", (req: Request, res: Response) => {
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  }

  const badakData = req.body;
  if (!badakData || typeof badakData !== "object") {
    return res.status(422).json({ error: "Data Badak tidak valid." });
  }

  siteData.badakConfig = {
    ...siteData.badakConfig,
    ...badakData,
  };

  return res.json({ ok: true, badakConfig: siteData.badakConfig });
});

// 6d. Content Sections Management: /api/sections
app.post("/api/sections", (req: Request, res: Response) => {
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  }

  const sectionsData = req.body;
  if (!sectionsData || typeof sectionsData !== "object") {
    return res.status(422).json({ error: "Data seksi tidak valid." });
  }

  siteData.sections = {
    ...siteData.sections,
    ...sectionsData,
  };

  return res.json({ ok: true, sections: siteData.sections });
});

// 6e. Global Buttons Management: /api/buttons
app.post("/api/buttons", (req: Request, res: Response) => {
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  }

  const buttonsData = req.body;
  if (!buttonsData || typeof buttonsData !== "object") {
    return res.status(422).json({ error: "Data tombol tidak valid." });
  }

  siteData.buttons = {
    ...siteData.buttons,
    ...buttonsData,
  };

  return res.json({ ok: true, buttons: siteData.buttons });
});

// 6f. Footer Management: /api/footer
app.post("/api/footer", (req: Request, res: Response) => {
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  }

  const footerData = req.body;
  if (!footerData || typeof footerData !== "object") {
    return res.status(422).json({ error: "Data footer tidak valid." });
  }

  siteData.footer = {
    ...siteData.footer,
    ...footerData,
  };

  return res.json({ ok: true, footer: siteData.footer });
});

// 7. Menu: /api/menu.php & /api/menu
const handleMenu = (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  }

  const menu = req.body.menu;
  if (!Array.isArray(menu)) {
    return res.status(422).json({ error: "Format menu tidak valid." });
  }

  siteData.menu = menu.map((m: { label?: string; href?: string }) => ({
    label: (m.label || "Menu").trim(),
    href: (m.href || "#").trim(),
  }));

  return res.json({ ok: true });
};

app.all("/api/menu.php", handleMenu);
app.all("/api/menu", handleMenu);

// 8. Items CRUD: /api/items.php & /api/items
const handleItems = (req: Request, res: Response) => {
  const collection = (req.query.collection as string) || "";
  const validCollections = ["destinations", "religi", "akomodasi", "paket", "kalender", "ekraf"] as const;
  type CollectionKey = typeof validCollections[number];

  if (!validCollections.includes(collection as CollectionKey)) {
    return res.status(404).json({ error: "Koleksi tidak dikenal." });
  }

  const collKey = collection as CollectionKey;
  const list = siteData[collKey] as Array<Record<string, any>>;

  switch (req.method) {
    case "GET": {
      return res.json({ items: list });
    }

    case "POST": {
      const sess = getSession(req);
      if (!sess) return res.status(401).json({ error: "Silakan login terlebih dahulu." });

      const newId = String(Date.now());
      const newItem = { id: newId, ...req.body };
      list.push(newItem);
      return res.status(201).json({ ok: true, item: newItem });
    }

    case "PUT": {
      const sess = getSession(req);
      if (!sess) return res.status(401).json({ error: "Silakan login terlebih dahulu." });

      const id = String(req.query.id || req.body.id || "");
      const idx = list.findIndex((item) => String(item.id) === id);
      if (idx === -1) {
        return res.status(404).json({ error: "Item tidak ditemukan." });
      }

      list[idx] = { ...list[idx], ...req.body, id };
      return res.json({ ok: true, item: list[idx] });
    }

    case "DELETE": {
      const sess = getSession(req);
      if (!sess) return res.status(401).json({ error: "Silakan login terlebih dahulu." });

      const id = String(req.query.id || "");
      const idx = list.findIndex((item) => String(item.id) === id);
      if (idx === -1) {
        return res.status(404).json({ error: "Item tidak ditemukan." });
      }

      list.splice(idx, 1);
      return res.json({ ok: true });
    }

    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
};

app.all("/api/items.php", handleItems);
app.all("/api/items", handleItems);

// 9. Bulk Import/Export Data: /api/data/import
app.post("/api/data/import", (req: Request, res: Response) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: "Silakan login terlebih dahulu." });

  const imported = req.body;
  if (!imported || typeof imported !== "object") {
    return res.status(422).json({ error: "Format data JSON tidak valid." });
  }

  if (imported.settings) siteData.settings = { ...siteData.settings, ...imported.settings };
  if (imported.buttons) siteData.buttons = { ...siteData.buttons, ...imported.buttons };
  if (imported.hero) siteData.hero = { ...siteData.hero, ...imported.hero };
  if (imported.badakConfig) siteData.badakConfig = { ...siteData.badakConfig, ...imported.badakConfig };
  if (imported.sections) siteData.sections = { ...siteData.sections, ...imported.sections };
  if (imported.footer) siteData.footer = { ...siteData.footer, ...imported.footer };
  if (Array.isArray(imported.menu)) siteData.menu = imported.menu;
  if (Array.isArray(imported.destinations)) siteData.destinations = imported.destinations;
  if (Array.isArray(imported.religi)) siteData.religi = imported.religi;
  if (Array.isArray(imported.akomodasi)) siteData.akomodasi = imported.akomodasi;
  if (Array.isArray(imported.paket)) siteData.paket = imported.paket;
  if (Array.isArray(imported.kalender)) siteData.kalender = imported.kalender;
  if (Array.isArray(imported.ekraf)) siteData.ekraf = imported.ekraf;

  return res.json({ ok: true, message: "Seluruh data situs berhasil diperbarui dan diimpor." });
});

// 10. Upload Endpoint: /api/upload.php & /api/upload
const handleUpload = (req: Request, res: Response) => {
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  }

  if (!req.file) {
    return res.status(422).json({ error: "Tidak ada berkas gambar yang diterima." });
  }

  const rawFolder = req.body.folder || "destinations";
  const folder = uploadFolders.includes(rawFolder) ? rawFolder : "destinations";
  const relativePath = `uploads/${folder}/${req.file.filename}`;

  return res.json({ ok: true, path: relativePath });
};

app.post("/api/upload.php", upload.single("image"), handleUpload);
app.post("/api/upload", upload.single("image"), handleUpload);

// Error handler for upload errors
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(422).json({ error: err.message });
  }
  next(err);
});

// ----------------------------------------------------
// STATIC ASSETS & SPA ROUTING
// ----------------------------------------------------
app.use("/assets", express.static(path.join(process.cwd(), "assets")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use(express.static(process.cwd()));

// SPA Fallback
app.get("*", (req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

// Start Server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Banten Tourism Portal running on http://0.0.0.0:${PORT}`);
});
