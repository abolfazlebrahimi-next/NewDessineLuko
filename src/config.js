// ================= پیکربندی کلی بازی شهر لوکو =================

export const ASSET = (f) => `assets/${f}`;

// ---------- ابعاد نقشه (بزرگ‌تر از قبل) ----------
export const MAP = {
  minX: -17, maxX: 17,
  minZ: -8, maxZ: 16.5,
  // محدوده‌ی حرکت دوربین
  panMinX: -15, panMaxX: 15,
  panMinZ: -6, panMaxZ: 12,
};

// ---------- اقتصاد ----------
export const PRICES = {
  plot: 2500,          // جایگاه کشت — نباید ارزان باشد
  soil: 30,
  water: 25,
  fertilizer: 80,
  wateringCan: 10,     // آب‌پاش کامل — با شبنم
  seeds: { carrot: 120, wheat: 100, cabbage: 150, eggplant: 180 },
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
    price: PRICES.plot, currency: 'coins', category: 'plots',
    desc: 'یک جایگاه کشت جدید برای مزرعه‌ات بساز.',
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
};

// ترتیب کارت‌ها در سینی پایین
export const TRAY_ORDER = [
  'plot', 'soil', 'water', 'fertilizer', 'wateringCan',
  'carrotSeed', 'wheatSeed', 'cabbageSeed', 'eggplantSeed',
];

export const CATEGORIES = [
  { id: 'plots', name: 'جایگاه کشت' },
  { id: 'care', name: 'آب و کود' },
  { id: 'seeds', name: 'دانه‌ها' },
];

// ---------- چیدمان شهر (پخش‌شده روی نقشه‌ی بزرگ) ----------
export const LAYOUT = {
  buildings: [
    {
      id: 'hall', name: 'تالار بازی', tex: 'AmusementPark.png',
      x: 0, z: -3.2, w: 7.6,
      desc: 'قلب شهر لوکو! هر روز جایزه‌ی روزانه‌ات را از اینجا بگیر.',
      action: { label: 'جایزه روزانه', coins: 500, xp: 20, cooldown: 300 },
    },
    {
      id: 'hospital', name: 'بیمارستان دکتر نیلا', tex: 'Hospital.png',
      x: -10.5, z: -3.4, w: 5.4,
      desc: 'دکتر نیلا همیشه به فکر مردم شهر است. هر چند وقت شبنم هدیه می‌دهد.',
      action: { label: 'دریافت کمک', dew: 10, xp: 10, cooldown: 90 },
    },
    {
      id: 'gym', name: 'باشگاه لوکو', tex: 'ClubLuko.png',
      x: 10.5, z: -3.4, w: 5.4,
      desc: 'در باشگاه لوکو تمرین کن و تجربه بگیر تا سریع‌تر لول آپ کنی!',
      action: { label: 'تمرین', xp: 45, cooldown: 60 },
    },
    {
      id: 'mechanic', name: 'مکانیکی', tex: 'Mechanic.png',
      x: -10.8, z: 1.4, w: 4.9,
      desc: 'مکانیک شهر ابزارها را تعمیر می‌کند و بابت کارش سکه می‌دهد.',
      action: { label: 'کار روزانه', coins: 180, xp: 10, cooldown: 90 },
    },
    {
      id: 'farm', name: 'مزرعه', tex: 'Farm.png',
      x: 10.8, z: 1.4, w: 4.9,
      desc: 'مزرعه‌ی لوکو! جنوب شهر پر از زمین‌های کشت است؛ اول درخت‌ها و سنگ‌ها را با سکه پاک کن تا زمین باز شود.',
      action: null,
    },
  ],
  // زمین کشت بزرگ جنوب شهر: ۸ × ۵ = ۴۰ سلول.
  // بیشتر سلول‌ها اول بازی با درخت/سنگ بسته‌اند و باید با سکه پاک شوند.
  field: {
    cx: 0, cz: 9.2,
    cols: 8, rows: 5,
    spacing: 2.45,
  },
  // سلول‌هایی که از اول بازند (ردیف اول وسط + کمی از ردیف دوم)
  starterClearedCells: [1, 2, 3, 4, 5, 6, 10, 11, 12, 13],
  // جایگاه‌های اولیه‌ی بازی — ۴ جایگاه روی ردیف اول زمین
  starterPlotCells: [2, 3, 4, 5],
  // جای درخت‌ها و سنگ‌های وحشی دور شهر (بیرون زمین کشت)
  wildSpots: [
    { x: -15.6, z: -5.4 }, { x: -14.2, z: -1.8 }, { x: -15.8, z: 2.4 }, { x: -14.4, z: 6.2 },
    { x: -15.6, z: 10.2 }, { x: -14.2, z: 13.8 }, { x: -12.6, z: -6.2 }, { x: -12.2, z: 9.4 },
    { x: 15.6, z: -5.4 }, { x: 14.2, z: -1.6 }, { x: 15.8, z: 2.6 }, { x: 14.4, z: 6.4 },
    { x: 15.6, z: 10.4 }, { x: 14.2, z: 14.0 }, { x: 12.6, z: -6.2 }, { x: 12.2, z: 9.6 },
    { x: -6.4, z: -6.6 }, { x: -2.2, z: -7.0 }, { x: 2.4, z: -6.8 }, { x: 6.6, z: -6.6 },
    { x: -7.5, z: 15.9 }, { x: -2.8, z: 16.1 }, { x: 2.6, z: 15.8 }, { x: 7.4, z: 16.0 },
    { x: -11.8, z: 4.6 }, { x: 11.8, z: 4.8 }, { x: -5.4, z: -6.0 }, { x: 5.2, z: -6.1 },
  ],
};

// ---------- موانع: درخت‌ها و سنگ‌های پکیج جدید (Kenney Survival Kit) ----------
export const OBSTACLES = {
  basePath: 'models/nature/', // فایل‌های GLB در public/models/nature
  models: {
    tree: ['tree.glb', 'tree-tall.glb', 'tree-autumn.glb'],
    rock: ['rock-a.glb', 'rock-b.glb', 'rock-c.glb'],
    grass: ['grass.glb', 'grass-large.glb'],
  },
  treeHeight: 1.95,   // ارتفاع هدف درخت سه‌بعدی (کوتاه‌تر از خانه‌ها)
  rockWidth: 1.25,    // پهنای هدف سنگ
  grassHeight: 0.5,   // بوته‌های تزیینی دور نقشه
  initialWild: 16,    // چند مانع وحشی اول بازی دور شهر باشد
  maxWild: 22,
  regrowEvery: 38,    // هر چند ثانیه احتمال رویش یک درخت وحشی تازه
};

// هزینه‌ی پاک‌کردن مانع با سکه — هرچه از زمین باز دورتر، گران‌تر
export function obstacleCost(kind, ringDist = 1, typeIdx = 0) {
  const d = Math.max(1, ringDist);
  if (kind === 'rock') return 170 + d * 60;
  return 100 + d * 45 + (typeIdx === 1 ? 40 : 0); // درخت بلند کمی گران‌تر
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
  count: 8,             // تعداد اهالی شهر
  height: 0.95,         // قد آدمک (خانه‌ها ۳ تا ۵ واحدند!)
  speed: 1.5,           // واحد در ثانیه
  idleMin: 1.2,
  idleMax: 3.5,
  enterChance: 0.35,    // احتمال رفتن به داخل یک ساختمان
  insideMin: 3.5,
  insideMax: 8,
  modelPath: 'models/characters/',
  variants: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  // محدوده‌ی پرسه‌زنی اهالی (میدان وسط شهر، بین ساختمان‌ها و مزرعه)
  wander: { minX: -12.5, maxX: 12.5, minZ: -0.6, maxZ: 3.2 },
  // گپ‌وگفت دو نفره: هر چند ثانیه یک بار دو نفر کنار هم می‌ایستند و حرف می‌زنند
  chat: { everyMin: 6, everyMax: 12, durMin: 5.5, durMax: 8.5, lineSec: 1.9 },
  // مشتری از کدام دروازه وارد/خارج شود
  gate: { x: 16, z: 2.0 },
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
  },
};
