// ================= پیکربندی کلی بازی شهر لوکو =================

export const ASSET = (f) => `assets/${f}`;

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
  soilNeeded: 3,        // چند بار خاک‌ریزی تا Product2 شود
  phaseDuration: 50,    // مدت هر مرحله رشد
  fertilizerBoost: 2.0, // ضریب سرعت با کود
  moistureDecay: 0.67,  // کاهش رطوبت در ثانیه (100 در ~150 ثانیه)
  moisturePerWater: 45,
  treeHoldMs: 5000,     // نگه‌داشتن درخت برای ترکاندن
  treeSpawnEvery: 24,   // هر چند ثانیه یک درخت جدید بیاید
  maxTrees: 9,
  customerSellDelay: 6, // ثانیه پس از رسیدن مشتری تا فروش خودکار
};

export const REWARDS = {
  treeDew: [8, 15],
  treeXp: 25,
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

// ---------- چیدمان شهر ----------
export const LAYOUT = {
  buildings: [
    {
      id: 'hall', name: 'تالار بازی', tex: 'AmusementPark.png',
      x: 0, z: -1.6, w: 7.6,
      desc: 'قلب شهر لوکو! هر روز جایزه‌ی روزانه‌ات را از اینجا بگیر.',
      action: { label: 'جایزه روزانه', coins: 500, xp: 20, cooldown: 300 },
    },
    {
      id: 'hospital', name: 'بیمارستان دکتر نیلا', tex: 'Hospital.png',
      x: -9.2, z: -2.4, w: 5.4,
      desc: 'دکتر نیلا همیشه به فکر مردم شهر است. هر چند وقت شبنم هدیه می‌دهد.',
      action: { label: 'دریافت کمک', dew: 10, xp: 10, cooldown: 90 },
    },
    {
      id: 'gym', name: 'باشگاه لوکو', tex: 'ClubLuko.png',
      x: 9.2, z: -2.4, w: 5.4,
      desc: 'در باشگاه لوکو تمرین کن و تجربه بگیر تا سریع‌تر لول آپ کنی!',
      action: { label: 'تمرین', xp: 45, cooldown: 60 },
    },
    {
      id: 'mechanic', name: 'مکانیکی', tex: 'Mechanic.png',
      x: -8.2, z: 3.6, w: 4.9,
      desc: 'مکانیک شهر ابزارها را تعمیر می‌کند و بابت کارش سکه می‌دهد.',
      action: { label: 'کار روزانه', coins: 180, xp: 10, cooldown: 90 },
    },
    {
      id: 'farm', name: 'مزرعه', tex: 'Farm.png',
      x: 8.2, z: 3.8, w: 4.9,
      desc: 'مزرعه‌ی لوکو! اینجا جایگاه‌های کشت، درخت‌ها و محصولات توست.',
      action: null,
    },
  ],
  // مزرعه‌ی باز: جایگاه‌های کشت اینجا می‌نشینند
  field: {
    cx: -0.2, cz: 5.6,
    cols: 5, rows: 2,
    spacing: 2.45,
  },
  // جای اولیه‌ی درخت‌ها (کناره‌های مزرعه + اطراف نقشه)
  treeSpots: [
    { x: -7.3, z: 5.0 }, { x: -7.1, z: 7.6 }, { x: -5.2, z: 8.2 },
    { x: 6.9, z: 5.2 }, { x: 7.2, z: 7.7 }, { x: 5.3, z: 8.3 },
    { x: -4.0, z: -5.6 }, { x: 4.2, z: -5.8 }, { x: -11.2, z: 1.2 },
    { x: 11.4, z: 1.0 }, { x: -10.8, z: -5.2 }, { x: 10.9, z: -5.0 },
    { x: -2.2, z: -5.2 }, { x: 2.4, z: -5.4 }, { x: 0.2, z: 9.0 },
    { x: -8.9, z: 8.0 }, { x: 9.0, z: 8.1 },
  ],
  // ردیف اول (وسط) جایگاه‌های اولیه‌ی بازی — ۴ جایگاه از اول در مزرعه هستند
  starterPlotCells: [5, 6, 7, 8],
};

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
