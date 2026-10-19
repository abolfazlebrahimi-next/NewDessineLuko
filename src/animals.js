// ================= حیوانات مزرعه =================
// گاو، گوسفند، خوک و مرغ در آغل شرق زمین می‌چرند و قدم می‌زنند.
// اگر مدل‌های GLB در public/models/animals باشند از آن‌ها استفاده می‌شود
// (cow.glb و...)؛ وگرنه حیوان مکعبی با کد ساخته می‌شود — هم‌سبک آدمک‌ها.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sharedManager } from './loader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ANIMALS, LAYOUT } from './config.js';

const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
function box(parent, w, h, d, c, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export class Animals {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.world.scene.add(this.group);
    this.loader = new GLTFLoader(sharedManager);
    this.animals = [];
    this.ready = false;
  }

  _load(file) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const timer = setTimeout(() => finish(null), 6000);
      try {
        this.loader.load(encodeURI(ANIMALS.basePath + file),
          (g) => { clearTimeout(timer); finish({ scene: g.scene, animations: g.animations }); },
          undefined,
          () => { clearTimeout(timer); finish(null); });
      } catch (e) { clearTimeout(timer); finish(null); }
    });
  }

  async init() {
    const pen = LAYOUT.animalPen;
    const entries = Object.entries(ANIMALS.kinds);
    let templates = {};
    try {
      const loaded = await Promise.all(entries.map(([, k]) => this._load(k.model)));
      entries.forEach(([id], i) => { if (loaded[i]) templates[id] = loaded[i]; });
    } catch (e) { templates = {}; }

    for (const [kindId, spec] of entries) {
      for (let i = 0; i < spec.count; i++) {
        const x = pen.minX + 0.7 + Math.random() * (pen.maxX - pen.minX - 1.4);
        const z = pen.minZ + 0.7 + Math.random() * (pen.maxZ - pen.minZ - 1.4);
        this._spawn(kindId, spec, templates[kindId] || null, x, z);
      }
    }
    this.ready = true;
  }

  _spawn(kindId, spec, tpl, x, z) {
    let model, limbs = null, mixer = null;
    if (tpl) {
      model = skeletonClone(tpl.scene);
      const box3 = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box3.getSize(size);
      const s = size.y > 0.01 ? spec.height / size.y : 1;
      model.scale.setScalar(s);
      model.position.set(x, -box3.min.y * s, z);
      if (tpl.animations && tpl.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        const a = mixer.clipAction(tpl.animations[0]);
        a.setLoop(THREE.LoopRepeat, Infinity).play();
      }
    } else {
      const built = this._buildBlocky(kindId, spec.height);
      model = built.group;
      limbs = built.limbs;
      model.position.set(x, 0, z);
    }
    model.rotation.y = Math.random() * Math.PI * 2;

    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.world.shadowTex, transparent: true, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2;
    const sw = spec.height * 1.15;
    sh.scale.set(sw, sw * 0.55, 1);
    sh.position.set(x, 0.024, z);
    this.group.add(sh);
    this.group.add(model);

    this.animals.push({
      kindId, spec, model, limbs, mixer, shadow: sh,
      state: 'graze',
      timer: 1 + Math.random() * 4,
      target: null,
      speed: spec.speed * (0.8 + Math.random() * 0.45),
      groundY: model.position.y,
      moving: false,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // ---------- حیوان مکعبی ----------
  _buildBlocky(kindId, height) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const legs = [];
    const makeLeg = (x, z, topY, len, c) => {
      const lg = new THREE.Group();
      lg.position.set(x, topY, z);
      box(lg, 0.07, len, 0.07, c, 0, -len / 2, 0);
      body.add(lg);
      legs.push(lg);
      return lg;
    };
    let head = null, tail = null;

    if (kindId === 'cow') {
      const white = 0xf5f0e6, patch = [0x6b4a2f, 0x3b3230][Math.floor(Math.random() * 2)];
      box(body, 0.34, 0.3, 0.58, white, 0, 0.42, 0);
      box(body, 0.35, 0.18, 0.2, patch, 0, 0.48, -0.1); // لکه
      box(body, 0.16, 0.09, 0.2, 0xe8a0b0, 0, 0.24, -0.16); // پستان
      makeLeg(-0.11, 0.2, 0.28, 0.28, white); makeLeg(0.11, 0.2, 0.28, 0.28, white);
      makeLeg(-0.11, -0.2, 0.28, 0.28, white); makeLeg(0.11, -0.2, 0.28, 0.28, white);
      head = new THREE.Group(); head.position.set(0, 0.5, 0.36); body.add(head);
      box(head, 0.24, 0.22, 0.2, white, 0, 0.04, 0.04);
      box(head, 0.18, 0.1, 0.1, 0xe8b0a6, 0, -0.02, 0.16); // پوزه
      box(head, 0.05, 0.09, 0.05, 0xd9c9a0, -0.13, 0.17, 0.02); // شاخ
      box(head, 0.05, 0.09, 0.05, 0xd9c9a0, 0.13, 0.17, 0.02);
      tail = box(body, 0.04, 0.3, 0.04, white, 0, 0.42, -0.32);
    } else if (kindId === 'sheep') {
      const wool = 0xf2eee2, dark = 0x4a4038;
      box(body, 0.34, 0.3, 0.5, wool, 0, 0.38, 0);
      box(body, 0.3, 0.1, 0.42, wool, 0, 0.56, 0); // پشم روی پشت
      makeLeg(-0.1, 0.16, 0.24, 0.24, dark); makeLeg(0.1, 0.16, 0.24, 0.24, dark);
      makeLeg(-0.1, -0.16, 0.24, 0.24, dark); makeLeg(0.1, -0.16, 0.24, 0.24, dark);
      head = new THREE.Group(); head.position.set(0, 0.44, 0.3); body.add(head);
      box(head, 0.16, 0.18, 0.2, dark, 0, 0, 0.05);
      box(head, 0.18, 0.08, 0.14, wool, 0, 0.12, 0.02); // کاکل پشمی
      tail = box(body, 0.12, 0.12, 0.1, wool, 0, 0.44, -0.28);
    } else if (kindId === 'pig') {
      const pink = 0xf0a8bc, deep = 0xe088a0;
      box(body, 0.32, 0.26, 0.5, pink, 0, 0.34, 0);
      makeLeg(-0.1, 0.17, 0.22, 0.22, deep); makeLeg(0.1, 0.17, 0.22, 0.22, deep);
      makeLeg(-0.1, -0.17, 0.22, 0.22, deep); makeLeg(0.1, -0.17, 0.22, 0.22, deep);
      head = new THREE.Group(); head.position.set(0, 0.38, 0.3); body.add(head);
      box(head, 0.24, 0.2, 0.16, pink, 0, 0, 0.03);
      box(head, 0.13, 0.11, 0.07, deep, 0, -0.02, 0.13); // بینی
      box(head, 0.07, 0.09, 0.03, deep, -0.1, 0.12, 0); // گوش
      box(head, 0.07, 0.09, 0.03, deep, 0.1, 0.12, 0);
      tail = box(body, 0.04, 0.12, 0.04, deep, 0, 0.44, -0.27);
    } else { // chicken
      const white = Math.random() < 0.5 ? 0xf7f3e8 : 0xc98a5e;
      box(body, 0.2, 0.2, 0.28, white, 0, 0.22, 0);
      makeLeg(-0.06, 0.03, 0.13, 0.13, 0xe8a33d); makeLeg(0.06, 0.03, 0.13, 0.13, 0xe8a33d);
      head = new THREE.Group(); head.position.set(0, 0.34, 0.13); body.add(head);
      box(head, 0.13, 0.13, 0.13, white, 0, 0.04, 0.02);
      box(head, 0.05, 0.04, 0.09, 0xf0a03d, 0, 0.01, 0.12); // منقار
      box(head, 0.04, 0.07, 0.1, 0xd64040, 0, 0.13, 0.02); // تاج
      tail = box(body, 0.16, 0.16, 0.06, white, 0, 0.34, -0.16);
      tail.rotation.x = -0.6;
    }

    // قد نهایی دقیقاً روی ارتفاع هدف تنظیم شود
    const bb = new THREE.Box3().setFromObject(g);
    const sz = new THREE.Vector3();
    bb.getSize(sz);
    if (sz.y > 0.01) g.scale.setScalar(height / sz.y);
    return { group: g, limbs: { legs, head, tail, body } };
  }

  _randomPenPoint(a) {
    const pen = LAYOUT.animalPen;
    return {
      x: pen.minX + 0.6 + Math.random() * (pen.maxX - pen.minX - 1.2),
      z: pen.minZ + 0.6 + Math.random() * (pen.maxZ - pen.minZ - 1.2),
    };
  }

  update(dt) {
    if (!this.ready) return;
    const step = Math.min(dt, 0.08);
    const t = performance.now() / 1000;
    for (const a of this.animals) {
      if (a.mixer) a.mixer.update(step);
      const pos = a.model.position;

      if (a.state === 'graze') {
        a.moving = false;
        a.timer -= step;
        if (a.timer <= 0) {
          a.target = this._randomPenPoint(a);
          a.state = 'walk';
        }
      } else {
        const dx = a.target.x - pos.x;
        const dz = a.target.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.2) {
          a.state = 'graze';
          a.timer = 2 + Math.random() * 5;
          a.moving = false;
        } else {
          const s = Math.min(d, a.speed * step);
          pos.x += (dx / d) * s;
          pos.z += (dz / d) * s;
          a.moving = true;
          const rot = Math.atan2(dx, dz);
          let diff = rot - a.model.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          a.model.rotation.y += diff * Math.min(1, step * 5);
        }
      }

      if (a.limbs) {
        const L = a.limbs;
        if (a.moving) {
          a.phase += step * a.speed * 16;
          L.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(a.phase + (i % 2) * Math.PI) * 0.55; });
          if (L.head) L.head.rotation.x *= 0.85;
          if (L.tail) L.tail.rotation.x = Math.sin(a.phase * 0.7) * 0.2;
        } else {
          L.legs.forEach((leg) => { leg.rotation.x *= 0.85; });
          // چرا: سر پایین و بالا می‌رود (مرغ تندتر نوک می‌زند)
          const dip = a.kindId === 'chicken'
            ? (Math.sin(t * 5 + a.phase) > 0.55 ? 0.55 : 0.05)
            : 0.28 + Math.sin(t * 1.1 + a.phase) * 0.18;
          if (L.head) L.head.rotation.x += (dip - L.head.rotation.x) * Math.min(1, step * 7);
          if (L.tail) L.tail.rotation.z = Math.sin(t * 2.3 + a.phase) * 0.25;
        }
      }

      a.shadow.position.set(pos.x, 0.024, pos.z);
      a.model.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) o.renderOrder = 1000 + pos.z * 10 + 2;
      });
    }
  }
}
