// تست بوت کامل برنامه با استاب WebGL/2D — شبیه‌سازی کلیک واقعی
import { JSDOM } from 'jsdom';

const html = `
<!DOCTYPE html>
<html><body>
  <div id="game">
    <canvas id="scene"></canvas>
    <div id="overlay">
      <div id="labels"></div>
      <div id="toasts"></div>
      <div id="drag-ghost"></div>
    </div>
  </div>
</body></html>
`;

const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;

// ---- استاب canvas 2D ----
function make2D() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'canvas') return { width: 128, height: 128 };
      if (typeof prop === 'string') return () => undefined;
      return undefined;
    },
    set() { return true; },
  });
}

// ---- استاب WebGL ----
function makeGL() {
  const constants = {};
  // مقداردهی ثابت‌های WebGL پرکاربرد
  let c = 1;
  const names = ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER',
    'ELEMENT_ARRAY_BUFFER','STATIC_DRAW','DYNAMIC_DRAW','FLOAT','UNSIGNED_SHORT','UNSIGNED_INT',
    'TRIANGLES','TEXTURE_2D','TEXTURE0','RGBA','RGB','UNSIGNED_BYTE','TEXTURE_MIN_FILTER',
    'TEXTURE_MAG_FILTER','TEXTURE_WRAP_S','TEXTURE_WRAP_T','LINEAR','NEAREST','CLAMP_TO_EDGE',
    'REPEAT','MIRRORED_REPEAT','COLOR_BUFFER_BIT','DEPTH_BUFFER_BIT','STENCIL_BUFFER_BIT',
    'DEPTH_TEST','BLEND','CULL_FACE','SCISSOR_TEST','TEXTURE_CUBE_MAP','FRAMEBUFFER',
    'RENDERBUFFER','COLOR_ATTACHMENT0','DEPTH_ATTACHMENT','FRAMEBUFFER_COMPLETE','DEPTH_COMPONENT16',
    'UNSIGNED_SHORT_5_6_5','UNSIGNED_SHORT_4_4_4_4','UNSIGNED_SHORT_5_5_5_1','LEQUAL','ALWAYS',
    'NOTEQUAL','KEEP','REPLACE','INCR','DECR','FRONT','BACK','FRONT_AND_BACK','CW','CCW',
    'ONE','ZERO','SRC_ALPHA','ONE_MINUS_SRC_ALPHA','DST_COLOR','FUNC_ADD','MAX','MIN',
    'TEXTURE_MAX_ANISOTROPY_EXT','MAX_TEXTURE_MAX_ANISOTROPY_EXT','MAX_SAMPLES','MAX_TEXTURE_SIZE',
    'MAX_VERTEX_TEXTURE_IMAGE_UNITS','MAX_TEXTURE_IMAGE_UNITS','MAX_VERTEX_ATTRIBS',
    'MAX_VERTEX_UNIFORM_VECTORS','MAX_VARYING_VECTORS','MAX_FRAGMENT_UNIFORM_VECTORS',
    'MAX_COMBINED_TEXTURE_IMAGE_UNITS','MAX_CUBE_MAP_TEXTURE_SIZE','MAX_RENDERBUFFER_SIZE',
    'MAX_VIEWPORT_DIMS','SHADING_LANGUAGE_VERSION','VERSION','VENDOR','RENDERER','DEPTH_COMPONENT',
    'STENCIL_INDEX8','PIXEL_PACK_BUFFER','PIXEL_UNPACK_BUFFER','COPY_READ_BUFFER','COPY_WRITE_BUFFER',
    'R8','RG8','RGB8','RGBA8','SRGB8','SRGB8_ALPHA8','R16F','RG16F','RGBA16F','R32F','RG32F','RGBA32F',
    'DEPTH24_STENCIL8','DEPTH_COMPONENT24','DEPTH_COMPONENT32F','HALF_FLOAT','FLOAT_32_UNSIGNED_INT_24_8_REV',
    'ANY_SAMPLES_PASSED','TRANSFORM_FEEDBACK','TIME_ELAPSED_EXT','QUERY_RESULT','SAMPLES_PASSED',
    'ACTIVE_UNIFORMS','ACTIVE_ATTRIBUTES','ATTACHED_SHADERS','VALIDATE_STATUS','DELETE_STATUS',
    'LINK_STATUS','COMPILE_STATUS','CURRENT_PROGRAM','FRAMEBUFFER_BINDING','RENDERBUFFER_BINDING',
    'TEXTURE_BINDING_2D','TEXTURE_BINDING_CUBE_MAP','ARRAY_BUFFER_BINDING','ELEMENT_ARRAY_BUFFER_BINDING',
    'VIEWPORT','SCISSOR_BOX','COLOR_CLEAR_VALUE','UNPACK_FLIP_Y_WEBGL','UNPACK_PREMULTIPLY_ALPHA_WEBGL',
    'UNPACK_ALIGNMENT','PACK_ALIGNMENT','UNPACK_COLORSPACE_CONVERSION_WEBGL','BROWSER_DEFAULT_WEBGL',
    'MAX_3D_TEXTURE_SIZE','MAX_ARRAY_TEXTURE_LAYERS','MIN_PROGRAM_TEXEL_OFFSET','MAX_PROGRAM_TEXEL_OFFSET',
    'MAX_DRAW_BUFFERS','DRAW_BUFFER0','BACK_LEFT','NONE','LOW_FLOAT','MEDIUM_FLOAT','HIGH_FLOAT',
    'LOW_INT','MEDIUM_INT','HIGH_INT','COMPRESSED_TEXTURE_FORMATS','SUBPIXEL_BITS','RED_BITS','GREEN_BITS',
    'BLUE_BITS','ALPHA_BITS','DEPTH_BITS','STENCIL_BITS','POLYGON_OFFSET_FACTOR','POLYGON_OFFSET_UNITS',
    'SAMPLE_COVERAGE_VALUE','SAMPLE_COVERAGE_INVERT','SAMPLE_ALPHA_TO_COVERAGE','MULTISAMPLE',
    'RGBA4','RGB5_A1','DEPTH_STENCIL','DEPTH_COMPONENT32','LUMINANCE','LUMINANCE_ALPHA','ALPHA',
    'STREAM_DRAW','STREAM_READ','STATIC_READ','DYNAMIC_READ','UNSIGNED_INT_24_8','UNSIGNED_INT_5_9_9_9_REV',
    'FLOAT_32_UNSIGNED_INT_24_8_REV','UNSIGNED_NORMALIZED','IMPLEMENTATION_COLOR_READ_TYPE',
    'IMPLEMENTATION_COLOR_READ_FORMAT','TEXTURE_3D','TEXTURE_2D_ARRAY','FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE',
    'TEXTURE_COMPARE_MODE','TEXTURE_COMPARE_FUNC','COMPARE_REF_TO_TEXTURE'];
  for (const n of names) constants[n] = c++;

  return new Proxy(constants, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'getContextAttributes') return () => ({ antialias: true, alpha: true });
      if (prop === 'getShaderPrecisionFormat') return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
      if (prop === 'getParameter') return (p) => {
        // نسخه/فروشنده باید رشته باشند
        const strParams = [t.VERSION, t.SHADING_LANGUAGE_VERSION, t.VENDOR, t.RENDERER];
        if (strParams.includes(p)) return 'WebGL 2.0 (stub)';
        if (p === t.MAX_VIEWPORT_DIMS) return new Int32Array([8192, 8192]);
        return 4096;
      };
      if (prop === 'getExtension') return () => null;
      if (prop === 'getProgramParameter') return () => true;
      if (prop === 'getShaderParameter') return () => true;
      if (prop === 'getProgramInfoLog' || prop === 'getShaderInfoLog') return () => '';
      if (prop === 'getUniformLocation') return () => ({});
      if (prop === 'getAttribLocation') return () => 0;
      if (prop === 'getError') return () => 0;
      if (prop === 'createBuffer' || prop === 'createTexture' || prop === 'createProgram' ||
          prop === 'createShader' || prop === 'createFramebuffer' || prop === 'createRenderbuffer' ||
          prop === 'createVertexArray' || prop === 'createQuery' || prop === 'createSampler') return () => ({});
      return () => undefined;
    },
    set() { return true; },
  });
}

const gl = makeGL();
window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') return make2D();
  return gl;
};

// ---- استاب AudioContext ----
function makeAudioParam() {
  return {
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
    setTargetAtTime() {},
  };
}
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.destination = { connect() {} }; }
  resume() { return Promise.resolve(); }
  createOscillator() {
    return {
      type: 'sine',
      frequency: makeAudioParam(),
      connect: (n) => n,
      start() {}, stop() {},
    };
  }
  createGain() {
    return {
      gain: makeAudioParam(),
      connect: (n) => n,
    };
  }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() {
    return { buffer: null, connect: (n) => n, start() {}, stop() {} };
  }
}
window.AudioContext = FakeAudioContext;

// ---- گلوبال‌ها ----
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.localStorage = window.localStorage;
const perfStub = { now: () => Date.now() };
global.performance = perfStub;
try { Object.defineProperty(window, 'performance', { value: perfStub, configurable: true }); } catch (_) {}
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.Image = window.Image;
global.Event = window.Event;
global.PointerEvent = window.MouseEvent; // jsdom PointerEvent ندارد
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });

const errors = [];
process.on('uncaughtException', (e) => errors.push('uncaught: ' + (e.stack || e)));
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + (e && e.stack || e)));
window.addEventListener('error', (e) => errors.push('onerror: ' + e.message));

console.log('--- بوت برنامه ---');
try {
  await import('./src/main.js');
} catch (e) {
  console.log('import main.js خطا داد:', e.stack || e);
}
await new Promise(r => setTimeout(r, 400));
console.log('main.js بوت شد ✓');

function clickEl(sel) {
  const el = document.querySelector(sel);
  if (!el) { console.log('پیدا نشد:', sel); return; }
  try {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
    console.log('کلیک', sel, '✓');
  } catch (e) {
    console.log('کلیک', sel, '✗ خطا:', e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e);
  }
}

function clickCanvas(x, y) {
  try {
    const canvas = document.getElementById('scene');
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    const down = new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(down, 'pointerId', { value: 1 });
    canvas.dispatchEvent(down);
    const up = new window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(up, 'pointerId', { value: 1 });
    canvas.dispatchEvent(up);
    console.log('کلیک روی canvas در', x, y, '✓');
  } catch (e) {
    console.log('کلیک canvas ✗ خطا:', e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  }
}

clickEl('#btn-mail');
clickEl('#btn-shop');
clickEl('#btn-friends');
clickEl('#btn-settings');
clickEl('#btn-mail');

// کلیک وسط صفحه → احتمالاً تالار بازی
clickCanvas(512, 384);
clickCanvas(200, 300);

setTimeout(() => {
  console.log('--- خطاهای جمع‌شده ---');
  console.log(errors.length ? errors.join('\n---\n') : '(بدون خطا)');
  process.exit(0);
}, 1000);
