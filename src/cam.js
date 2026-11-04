// ================= دوربینِ ایزومتریک (فقط ریاضی، بدونِ WebGL/three) =================
// زاویه‌ی دوربین یک‌جا این‌جا تعریف می‌شود تا ابزارِ ساختِ اسپریت
// (scripts/lib/soft-render.mjs) و بازی (src/world.js) دقیقاً یک چشمانداز بدهند.
//
// مختصاتِ «شهر» محلی است: x و z روی نقشه (مثل نقشه‌ی از بالا) و y ارتفاع.
// شهر مثلِ نسخه‌ی سه‌بعدی ۴۵ درجه چرخیده است تا بلوک‌ها لوزی دیده شوند؛
// این چرخش داخلِ همین فایل اعمال می‌شود، پس بقیه‌ی کد فقط x/z محلی می‌شناسد.

// ارتفاعِ کادرِ دیدِ عمودی با زوم ۱ (واحدِ شهر)
export const VIEW_HEIGHT = 18.5;
export const CAM_OFFSET = { y: 13.5, z: 11.8 };
export const ZOOM_MIN = 0.44;
export const ZOOM_MAX = 1.6;
export const SUN_POS = { x: 6, y: 14, z: 7 };

const LEN = Math.hypot(CAM_OFFSET.y, CAM_OFFSET.z);
// پایه‌های دوربین در فضای «جهان» (همان چیزی که three می‌داد)
export const CAM_BACK = { x: 0, y: CAM_OFFSET.y / LEN, z: CAM_OFFSET.z / LEN };
export const CAM_RIGHT = { x: 1, y: 0, z: 0 };
// up = cross(back, right)
export const CAM_UP = { x: 0, y: CAM_BACK.z, z: -CAM_BACK.y };
// چقدر یک واحد جلو/عقب روی صفحه جابه‌جا می‌شود (همان pitchSin قدیمی)
export const CAM_PITCH_SIN = -CAM_UP.z;
export const CAM_Y_SCREEN = CAM_UP.y;

const S2 = Math.SQRT1_2;

/** نقطه‌ی شهر (محلی) → جهانِ چرخیده (۴۵°) */
export function cityToWorld(x, z) {
  return { x: (x + z) * S2, z: (z - x) * S2 };
}

/** نقطه‌ی شهر → صفحه. sx/sy در «واحدِ دید» (پیش از زوم) و depth برای مرتب‌سازی. */
export function project(x, y, z) {
  const X = (x + z) * S2;
  const Z = (z - x) * S2;
  return {
    sx: X,
    sy: -(y * CAM_UP.y + Z * CAM_UP.z),
    depth: y * CAM_BACK.y + Z * CAM_BACK.z,
  };
}

export function depthOf(x, y, z) {
  return y * CAM_BACK.y + ((z - x) * S2) * CAM_BACK.z;
}

/** صفحه (واحدِ دید) → نقطه روی زمین (y=0) */
export function unproject(sx, sy) {
  const Z = -sy / CAM_UP.z;
  const X = sx;
  return { x: (X - Z) * S2 * Math.SQRT2 * S2, z: (X + Z) * S2 * Math.SQRT2 * S2 };
}
