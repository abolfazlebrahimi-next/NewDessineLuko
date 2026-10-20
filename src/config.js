// ================= پیکربندی کلی بازی شهر لوکو =================

// در بیلد تک‌فایل، همه‌ی فایل‌ها داخل خود HTML هستند و از این نقشه خوانده می‌شوند
export function assetUrl(path) {
  const map = globalThis.__ASSET_MAP__;
  if (map && map[path]) return map[path];
  return path;
}
export const ASSET = (f) => assetUrl(`assets/${f}`);

// ---------- نقشه‌ی یکپارچه: شهر در شمال، مزرعه در جنوب ----------
// با کشیدن انگشت/موس روی نقشه می‌توانی آزادانه از شهر تا مزرعه حرکت کنی
// (بینشان جنگل است و بعداً می‌شود جاده کشید). کلیک روی ساختمان مزرعه یا
// دکمه‌ی کنار صفحه هم با ابرها سریع جابجایت می‌کند.
export const MAP_BOUNDS = {
  minX: -84, maxX: 84, minZ: -84, maxZ: 84,
  panMinX: -58, panMaxX: 58, panMinZ: -58, panMaxZ: 58, // محدوده‌ی حرکت دوربین روی شهر (لوزی)
};

// ---------- شهر لوکو: شبکه‌ی بلوک‌ها، ساختمان‌های اصلی، مدل‌های Kenney ----------
export const CITY = {
  pitch: 15.6,        // فاصله‌ی مرکز بلوک‌ها
  block: 11,          // اندازه‌ی هر بلوک
  road: 4.6,          // پهنای خیابان
  range: 3,           // بلوک‌ها از ۳- تا ۳ (۷×۷)؛ هسته‌ی اصلی ۳×۳ وسط است
  cityBase: 'models/city/',          // Kenney City Kit (Industrial)
  suburbBase: 'models/suburban/',    // Kenney City Kit (Suburban)
  natureBase: 'models/nature/',      // درخت/سنگ/علف از پکیج Kenney Survival Kit (همان پکیج محصول قبلی)
  carBase: 'models/cars/',           // Kenney Car Kit
  suburbScale: 3.0,                  // مقیاس یکنواخت خانه‌ها و وسایل حیاط
  houses: [           // خانه‌های محله‌های مسکونی (Kenney City Kit Suburban)
    'building-type-a', 'building-type-b', 'building-type-c', 'building-type-d', 'building-type-e',
    'building-type-f', 'building-type-g', 'building-type-h', 'building-type-i', 'building-type-j',
    'building-type-k', 'building-type-l', 'building-type-m', 'building-type-n', 'building-type-o',
    'building-type-p', 'building-type-q', 'building-type-r', 'building-type-s', 'building-type-t',
    'building-type-u',
  ],
  trees: ['tree', 'tree-tall', 'tree-autumn', 'tree-autumn-tall'],
  half: 0,            // نصف پهنای ناحیه‌ی شهری (پایین‌تر محاسبه می‌شود)
  filler: [           // ساختمان‌های پرکننده‌ی دور شهر (Kenney City Kit)
    'building-a', 'building-b', 'building-c', 'building-d', 'building-e',
    'building-f', 'building-g', 'building-h', 'building-i', 'building-j',
    'building-k', 'building-l', 'building-m', 'building-n', 'building-o',
    'building-p', 'building-q', 'building-r', 'building-s', 'building-t',
  ],
  cars: [             // ماشین‌های در حال تردد (Kenney Car Kit)
    'sedan', 'sedan-sports', 'hatchback-sports', 'taxi', 'police',
    'ambulance', 'firetruck', 'garbage-truck', 'van', 'suv',
    'suv-luxury', 'truck', 'delivery', 'race', 'race-future',
    'kart-oobi', 'kart-oodi', 'kart-ooli', 'kart-oopi', 'kart-oozi',
    'tractor',
  ],
};

CITY.half = ((CITY.range * 2 + 1) * CITY.pitch + CITY.road) / 2;

export const AREAS = {
  town: {
    id: 'town', name: 'شهر',
    minX: -17, maxX: 17, minZ: -8, maxZ: 16.5,
    panMinX: -15, panMaxX: 15, panMinZ: -6, panMaxZ: 12,
    focus: { x: 0, z: 2.2, zoom: 1.0 },
  },
  farm: {
    id: 'farm', name: 'مزرعه',
    minX: -17, maxX: 17, minZ: 58, maxZ: 92,
    panMinX: -15, panMaxX: 15, panMinZ: 62, panMaxZ: 86,
    focus: { x: 0, z: 75, zoom: 0.9 },
  },
};

// مرکز صحنه‌ی مزرعه (برای چیدن دکور، حصار حیوانات و...)
export const FARM_CENTER = { x: 0, z: 75 };

// ---------- حالت تست ----------
// فعلاً برای تست راحت همه‌ی امکانات، سکه و شبنم نامحدود است.
// اقتصاد واقعی: سکه و شبنم محدودند و باید با فروش محصول و جایزه به‌دست بیایند.
export const TEST_MODE = { infiniteMoney: false };
export const INFINITE_BALANCE = 999999999;

// هر آیتمی که خریده باشی را می‌توانی در فروشگاه با این نسبتِ قیمت خرید بفروشی
export const ITEM_SELL_RATIO = 0.5;

// ---------- اقتصاد ----------
export const PRICES = {
  plot: 2500,          // جایگاه کشت — نباید ارزان باشد
  soil: 30,
  water: 25,
  fertilizer: 80,
  wateringCan: 10,     // آب‌پاش کامل — با شبنم
  seeds: { carrot: 120, wheat: 100, cabbage: 150, eggplant: 180 },
  build: { fence: 60, wall: 130, tent: 450, house: 1600 },
};

export const SELL_PRICES = {
  carrot: 600,
  wheat: 550,
  cabbage: 750,
  eggplant: 850,
};

// ---------- محصولات ----------
// phases: مراحل رشد که بعد از کاشت نمایش داده می‌شوند
export const CROPS = {
  wheat: {
    id: 'wheat',
    name: 'گندم',
    emoji: '🌾',
    seedIcon: 'Wheatgrain.png',
    sell: SELL_PRICES.wheat,
    phases: [
      { tex: 'Product3.png', scale: 0.82 }, // جوانه‌ی گندم
      { tex: 'Product4.png', scale: 1.0 },  // گندم رسیده
    ],
  },
  eggplant: {
    id: 'eggplant',
    name: 'بادمجان',
    emoji: '🍆',
    seedIcon: 'Eggplantseed.png',
    sell: SELL_PRICES.eggplant,
    phases: [
      { tex: 'Eggplantcrop.png', scale: 0.45 },
      { tex: 'Eggplantcrop.png', scale: 0.72 },
      { tex: 'Eggplantcrop.png', scale: 1.0 },
    ],
  },
  carrot: {
    id: 'carrot',
    name: 'هویج',
    emoji: '🥕',
    seedIcon: 'Carrotseed.png',
    sell: SELL_PRICES.carrot,
    phases: [
      { tex: 'Carrotcrop.png', scale: 0.45 },
      { tex: 'Carrotcrop.png', scale: 0.72 },
      { tex: 'Carrotcrop.png', scale: 1.0 },
    ],
  },
  cabbage: {
    id: 'cabbage',
    name: 'کلم',
    emoji: '🥬',
    seedIcon: 'Cabbageseed.png',
    sell: SELL_PRICES.cabbage,
    phases: [
      { tex: 'Cabbageproduct.png', scale: 0.45 },
      { tex: 'Cabbageproduct.png', scale: 0.72 },
      { tex: 'Cabbageproduct.png', scale: 1.0 },
    ],
  },
};

// زمان‌ها (ثانیه)
export const TIMING = {
  soilNeeded: 3,          // چند بار خاک‌ریزی تا Product2 شود
  phaseDuration: 50,      // مدت هر مرحله رشد
  fertilizerBoost: 2.0,   // ضریب سرعت با کود
  moistureDecay: 0.67,    // کاهش رطوبت در ثانیه (100 در ~150 ثانیه)
  moisturePerWater: 45,
  obstacleSelectSec: 6,   // مدت نمایش قیمت پاک‌کردن مانع بعد از کلیک اول
  customerGapSec: 5,      // فاصله‌ی بين آمدن دو مشتری
};

export const REWARDS = {
  obstacleDew: [3, 8],    // شبنمی که با پاک‌کردن درخت/سنگ گیرت می‌آید
  obstacleXp: 15,
  cropXp: 40,
  levelUpCoins: 150,
};

export function xpForLevel(level) {
  return 400 + level * 150;
}

// ---------- آیتم‌های کارتی / فروشگاه ----------
export const ITEMS = {
  plot: {
    id: 'plot', name: 'جایگاه کشت', icon: 'Product1.png',
    price: PRICES.plot, currency: 'coins', category: 'plots', place: 'ground', ghost: 2.2,
    desc: 'یک جایگاه کشت جدید برای مزرعه‌ات بساز (فقط در صفحه‌ی مزرعه).',
  },
  soil: {
    id: 'soil', name: 'خاک کشاورزی', icon: 'Agriculturalsoil.png',
    price: PRICES.soil, currency: 'coins', category: 'care',
    desc: 'خاک حاصلخیز برای پر کردن جایگاه کشت.',
  },
  water: {
    id: 'water', name: 'آب', icon: 'Water.png',
    price: PRICES.water, currency: 'coins', category: 'care',
    desc: 'گیاه تشنه را آبیاری کن.',
  },
  fertilizer: {
    id: 'fertilizer', name: 'کود', icon: 'AgriculturalFertilizer.png',
    price: PRICES.fertilizer, currency: 'coins', category: 'care',
    desc: 'سرعت رشد محصول را دو برابر می‌کند.',
  },
  wateringCan: {
    id: 'wateringCan', name: 'آب‌پاش کامل', icon: 'Water.png',
    price: PRICES.wateringCan, currency: 'dew', category: 'care',
    desc: 'همه‌ی جایگاه‌ها را یک‌جا آبیاری می‌کند.',
  },
  wheatSeed: {
    id: 'wheatSeed', name: 'دانه گندم', icon: 'Wheatgrain.png',
    price: PRICES.seeds.wheat, currency: 'coins', category: 'seeds', crop: 'wheat',
    desc: 'دانه‌ی گندم برای کاشت.',
  },
  carrotSeed: {
    id: 'carrotSeed', name: 'دانه هویج', icon: 'Carrotseed.png',
    price: PRICES.seeds.carrot, currency: 'coins', category: 'seeds', crop: 'carrot',
    desc: 'دانه‌ی هویج برای کاشت.',
  },
  cabbageSeed: {
    id: 'cabbageSeed', name: 'دانه کلم', icon: 'Cabbageseed.png',
    price: PRICES.seeds.cabbage, currency: 'coins', category: 'seeds', crop: 'cabbage',
    desc: 'دانه‌ی کلم برای کاشت.',
  },
  eggplantSeed: {
    id: 'eggplantSeed', name: 'دانه بادمجان', icon: 'Eggplantseed.png',
    price: PRICES.seeds.eggplant, currency: 'coins', category: 'seeds', crop: 'eggplant',
    desc: 'دانه‌ی بادمجان برای کاشت.',
  },
  // ---------- ساخت‌وساز (از پکیج مدل دوم) ----------
  fence: {
    id: 'fence', name: 'حصار چوبی', icon: null, svg: 'fence',
    price: PRICES.build.fence, currency: 'coins', category: 'build', place: 'ground', ghost: 1.25,
    desc: 'یک تکه حصار. کنار هم بچسبانشان تا دور مزرعه یا حیاط دیوار بکشی. حصار ساخته‌شده را با درگ جابجا کن (حصارهای چسبیده با هم میان!)؛ کلیک = چرخش، دوبار کلیک سریع = برداشتن.',
  },
  wall: {
    id: 'wall', name: 'دیوار', icon: null, svg: 'wall',
    price: PRICES.build.wall, currency: 'coins', category: 'build', place: 'ground', ghost: 1.25,
    desc: 'یک تکه دیوار بلند و محکم. دیوارهای کنار هم را می‌شود با هم درگ‌ودراپ کرد؛ کلیک = چرخش، دوبار کلیک سریع = برداشتن.',
  },
  tent: {
    id: 'tent', name: 'چادر', icon: null, svg: 'tent',
    price: PRICES.build.tent, currency: 'coins', category: 'build', place: 'ground', ghost: 2.3,
    desc: 'یک چادر قشنگ برای تزیین مزرعه یا شهر (۲×۲ خانه). با درگ جابجا می‌شود.',
  },
  house: {
    id: 'house', name: 'خانه‌ی چوبی', icon: null, svg: 'house',
    price: PRICES.build.house, currency: 'coins', category: 'build', place: 'ground', ghost: 3.3,
    desc: 'یک خانه‌ی چوبی با سقف، برای ساختن محله‌ی خودت (۳×۳ خانه). با درگ جابجا می‌شود.',
  },
};

// ترتیب کارت‌ها در سینی پایین
export const TRAY_ORDER = [
  'plot', 'soil', 'water', 'fertilizer', 'wateringCan',
  'carrotSeed', 'wheatSeed', 'cabbageSeed', 'eggplantSeed',
  'fence', 'wall', 'tent', 'house',
];

export const CATEGORIES = [
  { id: 'plots', name: 'جایگاه کشت' },
  { id: 'care', name: 'آب و کود' },
  { id: 'seeds', name: 'دانه‌ها' },
  { id: 'build', name: 'ساخت‌وساز' },
];

// ---------- سازه‌های قابل ساختن (مدل‌ها در public/models/build) ----------
export const STRUCTURES = {
  basePath: 'models/build/',
  cell: 1.04, // اندازه‌ی خانه‌ی شبکه‌ی ساخت — سازه‌ها کامل به هم می‌چسبند
  kinds: {
    fence: { model: 'fence.glb', cells: 1, targetH: 0.52, rotatable: true, pieces: 2 },
    wall: { model: 'metal-panel.glb', cells: 1, targetW: 1.04, rotatable: true, pieces: 1 },
    tent: { model: 'tent.glb', cells: 2, targetW: 1.55, rotatable: false, pieces: 1 },
    house: { model: 'structure-roof.glb', cells: 3, targetW: 2.6, rotatable: false, pieces: 1 },
  },
};

// آیتم‌هایی که روی زمین انداخته می‌شوند (نه روی جایگاه)
export function isGroundItem(itemId) {
  const it = ITEMS[itemId];
  return !!it && it.place === 'ground';
}
export function isBuildItem(itemId) {
  const it = ITEMS[itemId];
  return !!it && it.category === 'build';
}

// ---------- چیدمان شهر (پخش‌شده روی نقشه‌ی بزرگ) ----------
// w: پهنای اسپریت؛ fd: نسبت ارتفاعِ لوزیِ کفِ ساختمان به پهنای عکس (برای نشاندن روی زمین)
export const LAYOUT = {
  buildings: [
    {
      id: 'hall', name: 'تالار اصلی شهر', tex: 'city-hall.webp',
      col: 0, row: 0, w: 9.4, fd: 0.5,
      desc: 'قلب شهر لوکو! جایزه‌ی روزانه‌ات را از تالار اصلی بگیر.',
      action: { label: 'جایزه روزانه', coins: 400, xp: 20, cooldown: 300 },
    },
    {
      id: 'clinic', name: 'مطب دکتر نیلا', tex: 'city-clinic.webp',
      col: -1, row: -1, w: 6.9, fd: 0.5,
      desc: 'مطب گرم و صمیمی دکتر نیلا؛ همیشه به فکر سلامتی مردم شهر است و شبنم هدیه می‌دهد.',
      action: { label: 'دریافت کمک', dew: 12, xp: 10, cooldown: 90 },
    },
    {
      id: 'council', name: 'ساختمان شورای شهر لوکو', tex: 'city-council.webp',
      col: 1, row: -1, w: 8.9, fd: 0.34,
      desc: 'اینجا برای آینده‌ی شهر تصمیم گرفته می‌شود؛ بودجه‌ی شهر را از شورا بگیر.',
      action: { label: 'بودجه شهر', coins: 220, xp: 15, cooldown: 180 },
    },
    {
      id: 'cinema', name: 'سینما', tex: 'city-cinema.webp',
      col: 1, row: 0, w: 8.5, fd: 0.5,
      desc: 'سینمای لوکو با فرش قرمز معروفش! فیلم ببین و تجربه بگیر.',
      action: { label: 'تماشای فیلم', xp: 35, cooldown: 120 },
    },
    {
      id: 'gym', name: 'کلاب ورزشی', tex: 'city-gym.webp',
      col: -1, row: 0, w: 8.7, fd: 0.34,
      desc: 'کلاب ورزشی لوکو؛ تمرین کن تا سریع‌تر لول‌آپ کنی!',
      action: { label: 'تمرین', xp: 45, cooldown: 60 },
    },
    {
      id: 'garden', name: 'باغچه', tex: 'Tree2.png',
      col: -1, row: 1, w: 0,
      desc: 'باغچه‌ی آرام شهر با فواره و نیمکت‌های چوبی؛ گل‌ها را آبیاری کن.',
      action: { label: 'آبیاری باغچه', dew: 8, xp: 8, cooldown: 90 },
    },
    {
      id: 'leaderboard', name: 'تابلو لیدربرد', tex: 'city-leaderboard.webp',
      col: 0, row: 1, w: 3.1, onMap: false, // تابلو از روی نقشه برداشته شد (از دکمه‌ی HUD باز می‌شود)
      desc: 'تابلوی لیدربرد شهر لوکو؛ بهترین شهردارها اینجا معرفی می‌شوند!',
      action: { label: 'جایزه رتبه', coins: 120, xp: 12, cooldown: 240 },
    },
    {
      id: 'house', name: 'خونه یوزر', tex: 'city-house.webp',
      col: 1, row: 1, w: 6.4, fd: 0.5,
      desc: 'خانه‌ی دنج تو در قلب شهر لوکو. استراحت کن و انرژی بگیر.',
      action: { label: 'استراحت', coins: 90, xp: 10, cooldown: 120 },
    },
  ],
  // زمین کشت در صحنه‌ی جدا و مخصوص مزرعه است (جنوب نقشه، دور از شهر):
  // ۱۰ × ۷ = ۷۰ سلول با فاصله‌ی چسبیده به هم تا جایگاه‌ها کامل به هم بچسبند.
  // بیشتر سلول‌ها اول بازی زیر جنگل انبوه درخت و سنگ‌اند و باید با سکه پاک شوند.
  field: {
    cx: 0, cz: 76,
    cols: 10, rows: 7,
    spacing: 2.08, // پهنای جایگاه ۲.۰۵ است، پس جایگاه‌ها تقریباً بدون فاصله کنار هم می‌نشینند
  },
  // سلول‌هایی که از اول بازند (ردیف اول وسط + کمی از ردیف دوم)
  starterClearedCells: [2, 3, 4, 5, 6, 7, 13, 14, 15, 16],
  // جایگاه‌های اولیه‌ی بازی — ۴ جایگاه روی ردیف اول زمین
  starterPlotCells: [3, 4, 5, 6],
  // جای درخت‌ها و سنگ‌های وحشی دور شهر (قابل پاک‌کردن با سکه)
  wildSpotsTown: [
    { x: -15.6, z: -5.4 }, { x: -14.2, z: -1.8 }, { x: -15.8, z: 2.4 }, { x: -14.4, z: 6.2 },
    { x: -15.6, z: 10.2 }, { x: -14.2, z: 13.8 }, { x: -12.6, z: -6.2 }, { x: -12.9, z: 9.4 },
    { x: 15.6, z: -5.4 }, { x: 14.2, z: -1.6 }, { x: 15.8, z: 2.6 }, { x: 14.4, z: 6.4 },
    { x: 15.6, z: 10.4 }, { x: 14.2, z: 14.0 }, { x: 12.6, z: -6.2 }, { x: 12.9, z: 9.6 },
    { x: -6.4, z: -6.6 }, { x: -2.2, z: -7.0 }, { x: 2.4, z: -6.8 }, { x: 6.6, z: -6.6 },
    { x: -7.5, z: 15.9 }, { x: -2.8, z: 16.1 }, { x: 2.6, z: 15.8 }, { x: 7.4, z: 16.0 },
    { x: -13.9, z: 4.6 }, { x: 13.9, z: 4.8 }, { x: -5.4, z: -6.0 }, { x: 5.2, z: -6.1 },
    { x: -13.2, z: -4.4 }, { x: 13.2, z: -4.2 }, { x: -11.4, z: 14.8 }, { x: 11.5, z: 15.0 },
  ],
  // جای درخت‌ها و سنگ‌های وحشی دور زمین در صحنه‌ی مزرعه (حلقه‌ی جنگلی دور مزرعه)
  wildSpotsFarm: [
    { x: -12.4, z: 64.8 }, { x: -8.2, z: 64.2 }, { x: -3.4, z: 64.6 }, { x: 1.8, z: 64.2 },
    { x: 6.4, z: 64.7 }, { x: 11.2, z: 64.3 }, { x: -14.6, z: 68.4 }, { x: -14.2, z: 73.6 },
    { x: -14.8, z: 78.8 }, { x: -14.3, z: 83.6 }, { x: -11.8, z: 86.2 }, { x: -6.6, z: 86.6 },
    { x: -1.2, z: 86.3 }, { x: 4.6, z: 86.7 }, { x: 9.8, z: 86.2 }, { x: -12.6, z: 70.2 },
    { x: -12.2, z: 81.4 }, { x: 12.8, z: 67.2 }, { x: -15.8, z: 66.2 }, { x: -15.4, z: 85.4 },
    { x: 7.8, z: 63.4 }, { x: -9.6, z: 63.2 }, { x: 2.2, z: 63.6 }, { x: -4.4, z: 63.3 },
  ],
  // خانه‌ی مزرعه در صحنه‌ی مزرعه (کلیک روی آن = برگشت به شهر با ابرها)
  farmhouse: { x: -8.6, z: 66.4, w: 5.2 },
  // آغل حیوانات در شرق زمین
  animalPen: { minX: 11.6, maxX: 16.2, minZ: 71.5, maxZ: 79.5 },
};

// ---------- موانع: درخت‌ها و سنگ‌های پکیج جدید (Kenney Survival Kit) ----------
export const OBSTACLES = {
  basePath: 'models/nature/', // فایل‌های GLB در public/models/nature
  models: {
    tree: ['tree.glb', 'tree-tall.glb', 'tree-autumn.glb', 'tree-autumn-tall.glb'],
    rock: ['rock-a.glb', 'rock-b.glb', 'rock-c.glb'],
    grass: ['grass.glb', 'grass-large.glb'],
  },
  treeHeight: 2.1,    // ارتفاع هدف درخت سه‌بعدی (کوتاه‌تر از خانه‌ها)
  rockWidth: 1.3,     // پهنای هدف سنگ
  grassHeight: 0.5,   // بوته‌های تزیینی دور نقشه
  initialWildTown: 22, // مانع وحشی اول بازی دور شهر
  initialWildFarm: 20, // مانع وحشی اول بازی دور مزرعه
  maxWild: 52,
  regrowEvery: 34,    // هر چند ثانیه احتمال رویش یک درخت وحشی تازه
};

// هزینه‌ی پاک‌کردن مانع با سکه — هرچه از زمین باز دورتر، کمی گران‌تر (با سقف)
export function obstacleCost(kind, ringDist = 1, typeIdx = 0) {
  const d = Math.min(5, Math.max(1, ringDist));
  if (kind === 'rock') return 150 + d * 55;
  return 90 + d * 40 + (typeIdx === 1 || typeIdx === 3 ? 40 : 0); // درخت بلند کمی گران‌تر
}

// نیم‌قطر تقریبی اشیاء برای جلوگیری از هم‌پوشانی (مثل کلش)
export function footprintOf(kind, width) {
  if (kind === 'tree') return { rx: width * 0.32, rz: width * 0.22 };
  if (kind === 'rock') return { rx: width * 0.42, rz: width * 0.32 };
  if (kind === 'plot') return { rx: width * 0.42, rz: width * 0.30 };
  return { rx: width * 0.40, rz: width * 0.22 }; // ساختمان
}

// ---------- آدمک‌های شهر ----------
// اگر مدل‌های character-*.glb را داخل public/models/characters بگذاری
// خودکار استفاده می‌شوند؛ وگرنه آدمک‌های مکعبیِ ساخته‌شده با کد می‌آیند.
// در هر دو حالت قد آدمک دقیقاً روی height تنظیم می‌شود تا از خانه‌ها کوچک‌تر باشد.
export const CHARACTERS = {
  count: 6,             // تعداد اهالی شهر
  farmCount: 3,         // چند نفر هم همیشه در مزرعه پرسه می‌زنند
  height: 0.95,         // قد آدمک (خانه‌ها ۳ تا ۵ واحدند!)
  speed: 1.5,           // واحد در ثانیه
  idleMin: 1.2,
  idleMax: 3.5,
  enterChance: 0.35,    // احتمال رفتن به داخل یک ساختمان (فقط اهالی شهر)
  insideMin: 3.5,
  insideMax: 8,
  modelPath: 'models/characters/',
  variants: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  // محدوده‌ی پرسه‌زنی هر صحنه
  wander: { minX: -12.5, maxX: 12.5, minZ: -0.6, maxZ: 3.2 },
  wanderFarm: { minX: -11.5, maxX: 10.5, minZ: 63.8, maxZ: 68.2 },
  // گپ‌وگفت دو نفره: هر چند ثانیه یک بار دو نفر کنار هم می‌ایستند و حرف می‌زنند
  chat: { everyMin: 6, everyMax: 12, durMin: 5.5, durMax: 8.5, lineSec: 1.9 },
  // مشتری از راه شمالی مزرعه (بین خانه‌ی مزرعه و زمین، کنار آغل) وارد/خارج می‌شود
  gate: { x: 16.5, z: 67.8 },
};

// ---------- حیوانات مزرعه ----------
// اگر فایل‌های cow.glb / sheep.glb / pig.glb / chicken.glb را در
// public/models/animals بگذاری استفاده می‌شوند؛ وگرنه حیوان مکعبی با کد ساخته می‌شود.
export const ANIMALS = {
  basePath: 'models/animals/',
  kinds: {
    cow: { name: 'گاو', model: 'cow.glb', height: 0.78, count: 3, speed: 0.32 },
    sheep: { name: 'گوسفند', model: 'sheep.glb', height: 0.55, count: 3, speed: 0.36 },
    pig: { name: 'خوک', model: 'pig.glb', height: 0.5, count: 2, speed: 0.4 },
    chicken: { name: 'مرغ', model: 'chicken.glb', height: 0.34, count: 4, speed: 0.55 },
  },
};

// دیالوگ‌های گپ اهالی شهر (به نوبت بین دو نفر ردوبدل می‌شوند)
export const CHAT_DIALOGUES = [
  ['سلام! امروز هوا عالیه ☀️', 'آره، برای کشاورزی حرف نداره! 🌾', 'محصولاتت رسیدن؟', 'تقریباً! منتظر مشتری‌ام 😄'],
  ['شنیدی؟ زمین‌های جنوب پر از درخته! 🌳', 'آره، با سکه پاکشون می‌کنن زمین باز می‌شه.', 'منم می‌خوام مزرعه‌مو بزرگ کنم!'],
  ['دکتر نیلا امروز شبنم هدیه می‌ده 💧', 'جدی؟ پس برم بیمارستان!', 'منم میام! 🏃'],
  ['تالار بازی جایزه‌ی روزانه داره 🎁', 'من دیروز گرفتم، ۵۰۰ سکه!', 'خوش به حالت! 😍'],
  ['هویج‌های امسال خیلی خوشمزه‌ن 🥕', 'من عاشق کلمم! 🥬', 'بادمجون گرون‌تر فروش می‌ره‌ها 🍆'],
  ['دیروز یه سنگ گنده رو از زمینم برداشتم 🪨', 'سکه‌ی زیادی دادی؟', 'آره ولی زمینم دوبرابر شد! 💪'],
];

// جمله‌های مشتری‌ها — {crop} با اسم محصول جایگزین می‌شود
export const CUSTOMER_LINES = {
  arrive: ['محصول تازه چی دارین؟ 🧺', 'شنیدم اینجا محصول رسیده! 👀', 'اومدم خرید کنم! 🛒'],
  inspect: ['🤔 {crop}؟ بذار خوب ببینم...', 'هممم، {crop}... 🤔', 'این {crop} چطوره؟ 👀'],
  reject: ['نه، این یکی رو نمی‌خوام 🙄', 'امروز حسِ {crop} نیست!', 'این نه... بریم بعدی! 🚶', 'خیلی کوچیکه، نمی‌خوام 😕'],
  buy: ['همینه که می‌خواستم! 😍', '{crop} عالیه، می‌خرمش! 💰', 'چه {crop} خوبی! مال منه! 🎉'],
  thanks: ['ممنون! 👋', 'خرید خوبی بود! 😊', 'دفعه‌ی بعد بازم میام! 👋'],
  gone: ['اوه، تموم شده! 😅', 'دیر رسیدم انگار... 😞'],
};

// ---------- تعداد خرید گروهی در فروشگاه ----------
export const BUY_STEPS = [1, 5, 10];

// نام فایل تصاویر وضعیت جایگاه
export const PLOT_TEX = {
  empty: 'Product1.png',
  tilled: 'Product2.png',
};

export const START = {
  coins: 6000,
  dew: 150,
  level: 1,
  xp: 0,
  inventory: {
    plot: 1, soil: 3, water: 4, fertilizer: 2, wateringCan: 1,
    wheatSeed: 2, carrotSeed: 2, cabbageSeed: 1, eggplantSeed: 1,
    fence: 8, wall: 2, tent: 0, house: 0,
  },
};
