/* All 54 parshas of the Torah in order. */

const PARSHAS = [
  {
    "he": "בראשית",
    "en": "Bereshit",
    "ref": "Genesis 1:1-6:8",
    "book": "בראשית"
  },
  {
    "he": "נח",
    "en": "Noach",
    "ref": "Genesis 6:9-11:32",
    "book": "בראשית"
  },
  {
    "he": "לך לך",
    "en": "Lech-Lecha",
    "ref": "Genesis 12:1-17:27",
    "book": "בראשית"
  },
  {
    "he": "וירא",
    "en": "Vayera",
    "ref": "Genesis 18:1-22:24",
    "book": "בראשית"
  },
  {
    "he": "חיי שרה",
    "en": "Chayei Sara",
    "ref": "Genesis 23:1-25:18",
    "book": "בראשית"
  },
  {
    "he": "תולדות",
    "en": "Toldot",
    "ref": "Genesis 25:19-28:9",
    "book": "בראשית"
  },
  {
    "he": "ויצא",
    "en": "Vayetze",
    "ref": "Genesis 28:10-32:3",
    "book": "בראשית"
  },
  {
    "he": "וישלח",
    "en": "Vayishlach",
    "ref": "Genesis 32:4-36:43",
    "book": "בראשית"
  },
  {
    "he": "וישב",
    "en": "Vayeshev",
    "ref": "Genesis 37:1-40:23",
    "book": "בראשית"
  },
  {
    "he": "מקץ",
    "en": "Miketz",
    "ref": "Genesis 41:1-44:17",
    "book": "בראשית"
  },
  {
    "he": "ויגש",
    "en": "Vayigash",
    "ref": "Genesis 44:18-47:27",
    "book": "בראשית"
  },
  {
    "he": "ויחי",
    "en": "Vayechi",
    "ref": "Genesis 47:28-50:26",
    "book": "בראשית"
  },
  {
    "he": "שמות",
    "en": "Shemot",
    "ref": "Exodus 1:1-6:1",
    "book": "שמות"
  },
  {
    "he": "וארא",
    "en": "Vaera",
    "ref": "Exodus 6:2-9:35",
    "book": "שמות"
  },
  {
    "he": "בא",
    "en": "Bo",
    "ref": "Exodus 10:1-13:16",
    "book": "שמות"
  },
  {
    "he": "בשלח",
    "en": "Beshalach",
    "ref": "Exodus 13:17-17:16",
    "book": "שמות"
  },
  {
    "he": "יתרו",
    "en": "Yitro",
    "ref": "Exodus 18:1-20:23",
    "book": "שמות"
  },
  {
    "he": "משפטים",
    "en": "Mishpatim",
    "ref": "Exodus 21:1-24:18",
    "book": "שמות"
  },
  {
    "he": "תרומה",
    "en": "Terumah",
    "ref": "Exodus 25:1-27:19",
    "book": "שמות"
  },
  {
    "he": "תצוה",
    "en": "Tetzaveh",
    "ref": "Exodus 27:20-30:10",
    "book": "שמות"
  },
  {
    "he": "כי תשא",
    "en": "Ki Tisa",
    "ref": "Exodus 30:11-34:35",
    "book": "שמות"
  },
  {
    "he": "ויקהל",
    "en": "Vayakhel",
    "ref": "Exodus 35:1-38:20",
    "book": "שמות"
  },
  {
    "he": "פקודי",
    "en": "Pekudei",
    "ref": "Exodus 38:21-40:38",
    "book": "שמות"
  },
  {
    "he": "ויקרא",
    "en": "Vayikra",
    "ref": "Leviticus 1:1-5:26",
    "book": "ויקרא"
  },
  {
    "he": "צו",
    "en": "Tzav",
    "ref": "Leviticus 6:1-8:36",
    "book": "ויקרא"
  },
  {
    "he": "שמיני",
    "en": "Shmini",
    "ref": "Leviticus 9:1-11:47",
    "book": "ויקרא"
  },
  {
    "he": "תזריע",
    "en": "Tazria",
    "ref": "Leviticus 12:1-13:59",
    "book": "ויקרא"
  },
  {
    "he": "מצורע",
    "en": "Metzora",
    "ref": "Leviticus 14:1-15:33",
    "book": "ויקרא"
  },
  {
    "he": "אחרי מות",
    "en": "Achrei Mot",
    "ref": "Leviticus 16:1-18:30",
    "book": "ויקרא"
  },
  {
    "he": "קדושים",
    "en": "Kedoshim",
    "ref": "Leviticus 19:1-20:27",
    "book": "ויקרא"
  },
  {
    "he": "אמור",
    "en": "Emor",
    "ref": "Leviticus 21:1-24:23",
    "book": "ויקרא"
  },
  {
    "he": "בהר",
    "en": "Behar",
    "ref": "Leviticus 25:1-26:2",
    "book": "ויקרא"
  },
  {
    "he": "בחקתי",
    "en": "Bechukotai",
    "ref": "Leviticus 26:3-27:34",
    "book": "ויקרא"
  },
  {
    "he": "במדבר",
    "en": "Bamidbar",
    "ref": "Numbers 1:1-4:20",
    "book": "במדבר"
  },
  {
    "he": "נשא",
    "en": "Nasso",
    "ref": "Numbers 4:21-7:89",
    "book": "במדבר"
  },
  {
    "he": "בהעלתך",
    "en": "Beha'alotcha",
    "ref": "Numbers 8:1-12:16",
    "book": "במדבר"
  },
  {
    "he": "שלח",
    "en": "Sh'lach",
    "ref": "Numbers 13:1-15:41",
    "book": "במדבר"
  },
  {
    "he": "קרח",
    "en": "Korach",
    "ref": "Numbers 16:1-18:32",
    "book": "במדבר"
  },
  {
    "he": "חקת",
    "en": "Chukat",
    "ref": "Numbers 19:1-22:1",
    "book": "במדבר"
  },
  {
    "he": "בלק",
    "en": "Balak",
    "ref": "Numbers 22:2-25:9",
    "book": "במדבר"
  },
  {
    "he": "פנחס",
    "en": "Pinchas",
    "ref": "Numbers 25:10-30:1",
    "book": "במדבר"
  },
  {
    "he": "מטות",
    "en": "Matot",
    "ref": "Numbers 30:2-32:42",
    "book": "במדבר"
  },
  {
    "he": "מסעי",
    "en": "Masei",
    "ref": "Numbers 33:1-36:13",
    "book": "במדבר"
  },
  {
    "he": "דברים",
    "en": "Devarim",
    "ref": "Deuteronomy 1:1-3:22",
    "book": "דברים"
  },
  {
    "he": "ואתחנן",
    "en": "Vaetchanan",
    "ref": "Deuteronomy 3:23-7:11",
    "book": "דברים"
  },
  {
    "he": "עקב",
    "en": "Eikev",
    "ref": "Deuteronomy 7:12-11:25",
    "book": "דברים"
  },
  {
    "he": "ראה",
    "en": "Re'eh",
    "ref": "Deuteronomy 11:26-16:17",
    "book": "דברים"
  },
  {
    "he": "שופטים",
    "en": "Shoftim",
    "ref": "Deuteronomy 16:18-21:9",
    "book": "דברים"
  },
  {
    "he": "כי תצא",
    "en": "Ki Teitzei",
    "ref": "Deuteronomy 21:10-25:19",
    "book": "דברים"
  },
  {
    "he": "כי תבוא",
    "en": "Ki Tavo",
    "ref": "Deuteronomy 26:1-29:8",
    "book": "דברים"
  },
  {
    "he": "נצבים",
    "en": "Nitzavim",
    "ref": "Deuteronomy 29:9-30:20",
    "book": "דברים"
  },
  {
    "he": "וילך",
    "en": "Vayeilech",
    "ref": "Deuteronomy 31:1-30",
    "book": "דברים"
  },
  {
    "he": "האזינו",
    "en": "Ha'azinu",
    "ref": "Deuteronomy 32:1-52",
    "book": "דברים"
  },
  {
    "he": "וזאת הברכה",
    "en": "V'Zot HaBerachah",
    "ref": "Deuteronomy 33:1-34:12",
    "book": "דברים"
  }
];
