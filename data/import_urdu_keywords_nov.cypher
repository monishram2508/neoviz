// Bayaaz-e-Hayaat: Urdu keyword additions, November 2026
// Source: Google Sheet "Bayaaz-e-Hayaat Metadata/Keywords" (Nazia Akhtar), FAA and JB tabs, read 17 Nov 2026.
// Sheet keywords first, then any existing keyword the sheet does not repeat, so facet tags such as "Urdu" and "mazmuun" stay.
// Case variants map onto the spelling already used in the archive. Rollback: data/backup_keywords_before_nov_urdu_import.json

// Personal Law mein Tabdeeli ka Haal: 46 keywords, 37 in Urdu
MATCH (w:Work {title: "Personal Law mein Tabdeeli ka Haal"})
SET w.keywords = ["Fatima Alam Ali", "Hyderabad", "Dakkan", "Deccan", "essay", "Urdu essay", "Personal Law", "Shahbano", "ulema", "Siyasat", "Islam", "character-building", "character formation", "Islamic law", "sharia", "reform", "legal reform", "fiqh", "jurisprudence", "Quran", "Hadith", "Hadees", "Qur'an", "servility", "servile mindset", "worldly benefit", "husband", "newspapers", "official statement", "divorced women", "divorce", "maintenance", "domestic violence", "Abandonment", "destitution", "women's participation", "Surah al Bakr", "seminar", "conference", "Surah al Ma'idah", "Urdu", "mazmuun", "gender", "Muslim Personal Law", "women’s rights", "Muslim women"],
    w.keywordsUrdu = ["فاطمہ عالم علی", "حیدرآباد", "دکن", "مضمون", "اردو مضمون", "پرسنل لا", "شاہ بانو", "علماء", "روزنامہ سیاست", "اسلام", "کردار سازی", "اسلامی قانون", "شریعت", "اصلاح", "قانونی اصلاح", "فقہ", "علمِ فقہ", "قرآن", "حدیث", "غلامانہ اطاعت", "غلامانہ ذہنیت", "دنیاوی مفاد", "شوہر", "اخبارات", "سرکاری بیان", "مطلقہ خواتین", "طلاق", "نان و نفقہ", "گھریلو تشدد", "ترکِ تعلق", "بے سروسامانی", "مفلسی", "خواتین کی شرکت", "سورۃ البقرہ", "سیمینار", "کانفرنس", "سورۃ المائدہ"];

// Meri Zubaan wa Qalam Se Kisi ka Dil na Dukhey: 32 keywords, 28 in Urdu
MATCH (w:Work {title: "Meri Zubaan wa Qalam Se Kisi ka Dil na Dukhey"})
SET w.keywords = ["Fatima Alam Ali", "Hyderabad", "Dakkan", "letter", "open letter", "unsent letter", "public apology", "regret", "reflection", "retrospection", "memory", "recollection", "nostalgia", "life-writing", "life narrative", "gratitude", "Allah", "offence", "hurt", "love", "heartache", "overconfidence", "afterlife", "hereafter", "aaqibat", "prayer", "complaint", "resentment", "Urdu", "Urdu essay", "mazmuun", "apology"],
    w.keywordsUrdu = ["فاطمہ عالم علی", "حیدرآباد", "دکن", "خط", "کھلا خط", "غیر مرسل خط", "علانیہ معذرت", "ندامت", "افسوس", "غور و فکر", "بازنگری", "یادداشت", "یادِ ماضی", "ناسٹلجیا", "حیات نگاری", "سوانحی بیانیہ", "شکرگزاری", "اللہ", "دل آزاری", "رنجش", "محبت", "دل شکستگی", "خود اعتمادی کی زیادتی", "آخرت", "عاقبت", "دعا", "شکایت", "کدورت"];

// Rasm-o-Riwaaj Ek Laanat: Urdu keyword added in the sheet since September
MATCH (w:Work {title: "Rasm-o-Riwaaj Ek Laanat"})
WHERE NOT "ظاہری نمود و نمائش" IN coalesce(w.keywordsUrdu, [])
SET w.keywordsUrdu = coalesce(w.keywordsUrdu, []) + "ظاہری نمود و نمائش";

// Baarish-e-Sang: Urdu keyword added in the sheet since September
MATCH (w:Work {title: "Baarish-e-Sang"})
WHERE NOT "بیانیہ آواز" IN coalesce(w.keywordsUrdu, [])
SET w.keywordsUrdu = coalesce(w.keywordsUrdu, []) + "بیانیہ آواز";
