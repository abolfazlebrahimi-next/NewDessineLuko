// ================= آدمک‌های شهر لوکو =================
// اهالی شهر: پرسه‌زنی، رفتن داخل ساختمان‌ها، و هرازگاهی گپ دونفره با حباب حرف 💬
// مشتری‌ها هم از همین آدمک‌ها هستند: می‌آیند محصول را وارسی می‌کنند،
// شاید اولی را نپسندند و دومی را بخرند، بعد خداحافظی می‌کنند و می‌روند 🛒
//
// قد همه‌ی آدمک‌ها دقیقاً روی CHARACTERS.height تنظیم می‌شود (۰.۹۵ واحد)
// تا خیلی کوچک‌تر از خانه‌ها (۳ تا ۵ واحد) باشند.
// اگر مدل character-*.glb در public/models/characters باشد از آن استفاده می‌شود،
// وگرنه آدمک مکعبی با کد ساخته می‌شود.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS, LAYOUT, CHAT_DIALOGUES, CUSTOMER_LINES } from './config.js';

const S = {
  IDLE: 'idle',
  WALK: 'walk',
  INSIDE: 'inside',
  TO_CHAT: 'toChat',
  CHAT: 'chat',
  CUST_WALK: 'custWalk',
  CUST_ACT: 'custAct',
  CUST_LEAVE: 'custLeave',
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fill = (tpl, crop) => (tpl || '').replace('{crop}', crop || 'محصول');

const SKINS = [0xf6c79a, 0xe8b088, 0xc98a5e, 0x8a5a3b];
const SHIRTS = [0x5b8fd6, 0xe2574c, 0x58c470, 0xf0b84e, 0x9b6dd6, 0x38b6b0, 0xe87fb0, 0xf2f0e4];
const PANTS = [0x3d4a66, 0x6b4a2f, 0x4a4a4a, 0x71806a, 0x8c4a56];
const HAIRS = [0x33261a, 0x6b421c, 0xd9a441, 0x222222, 0xb0483a, 0x888888];

export class Characters {
  constructor(world, ui) {
    this.world = world;
    this.ui = ui;
    this.group = new THREE.Group();
    this.world.scene.add(this.group);
    this.loader = new GLTFLoader();
    this.people = [];
    this.templates = [];      // [{ scene, animations }]
    this.tplCursor = 0;
    this.ready = false;
    this.seq = 0;
    this.customer = null;
    this.chatTimer = 5 + Math.random() * 4;
  }

  async init() {
    const loadOne = (v) => new Promise((resolve) => {
      let done = false;
      const finish = (val) => { if (!done) { done = true; resolve(val); } };
      const timer = setTimeout(() => finish(null), 6000);
      try {
        this.loader.load(
          encodeURI(`${CHARACTERS.modelPath}character-${v}.glb`),
          (gltf) => { clearTimeout(timer); finish({ scene: gltf.scene, animations: gltf.animations }); },
          undefined,
          () => { clearTimeout(timer); finish(null); },
        );
      } catch (e) { clearTimeout(timer); finish(null); }
    });

    try {
      const loaded = await Promise.all(CHARACTERS.variants.map(loadOne));
      this.templates = loaded.filter(Boolean);
    } catch (e) {
      this.templates = [];
    }

    this.ready = true;
    for (let i = 0; i < CHARACTERS.count; i++) {
      const p = this._randomPoint();
      this.createPerson('villager', p.x, p.z);
    }
  }

  // ---------- ساخت یک آدمک ----------
  createPerson(role, x, z) {
    const heightMul = 0.92 + Math.random() * 0.14;
    let model, mixer = null, actions = null, limbs = null;

    if (this.templates.length) {
      const tpl = this.templates[this.tplCursor++ % this.templates.length];
      model = skeletonClone(tpl.scene);
      model.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) {
          o.castShadow = false;
          o.frustumCulled = true;
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.depthWrite = true;
        }
      });
      // تنظیم دقیق قد — آدمک نباید از خانه بزرگ‌تر شود!
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const s = size.y > 0.01 ? (CHARACTERS.height * heightMul) / size.y : 0.5;
      model.scale.setScalar(s);
      model.position.set(x, -box.min.y * s, z);

      mixer = new THREE.AnimationMixer(model);
      actions = {};
      for (const clip of tpl.animations) actions[clip.name] = mixer.clipAction(clip);
      for (const name of ['walk', 'idle', 'sprint']) {
        if (actions[name]) actions[name].setLoop(THREE.LoopRepeat, Infinity);
      }
    } else {
      const built = this._buildBlocky(heightMul);
      model = built.group;
      limbs = built.limbs;
      model.position.set(x, 0, z);
    }

    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.world.shadowTex, transparent: true, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(0.55, 0.28, 1);
    sh.position.set(x, 0.025, z);
    this.group.add(sh);
    this.group.add(model);

    const person = {
      id: 'person_' + (this.seq++),
      role, model, mixer, actions, limbs, shadow: sh,
      state: S.IDLE,
      target: null,
      timer: 0.5 + Math.random() * 2.5,
      speed: CHARACTERS.speed * (0.85 + Math.random() * 0.35),
      insideTimer: 0,
      enterBuilding: null,
      currentAction: null,
      currentName: null,
      moving: false,
      walkPhase: Math.random() * Math.PI * 2,
      talking: false,
      groundY: model.position.y,
      bubbleTimer: 0,
      chat: null,
      chatIdx: 0,
      chatSlot: null,
      cust: null,
    };
    this.people.push(person);
    this._playAction(person, 'idle');
    return person;
  }

  // آدمک مکعبی با کد (وقتی مدل GLB نیست) — قد کل ~۰.۹۵ واحد
  _buildBlocky(heightMul) {
    const skin = pick(SKINS), shirt = pick(SHIRTS), pants = pick(PANTS), hair = pick(HAIRS);
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const box = (w, h, d, c, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(x, y, z);
      return m;
    };

    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    group.scale.setScalar(heightMul * (CHARACTERS.height / 0.97));

    // پاها (محور در لگن، برای تاب‌خوردن هنگام راه‌رفتن)
    const makeLeg = (sx) => {
      const g = new THREE.Group();
      g.position.set(sx * 0.085, 0.32, 0);
      g.add(box(0.11, 0.32, 0.13, pants, 0, -0.16, 0));
      g.add(box(0.11, 0.06, 0.19, 0x3a2a1c, 0, -0.30, 0.03)); // کفش
      body.add(g);
      return g;
    };
    const makeArm = (sx) => {
      const g = new THREE.Group();
      g.position.set(sx * 0.225, 0.66, 0);
      g.add(box(0.09, 0.34, 0.11, shirt, 0, -0.15, 0));
      g.add(box(0.09, 0.07, 0.11, skin, 0, -0.33, 0)); // دست
      body.add(g);
      return g;
    };

    const legL = makeLeg(-1), legR = makeLeg(1);
    body.add(box(0.36, 0.36, 0.2, shirt, 0, 0.5, 0));           // تنه
    const armL = makeArm(-1), armR = makeArm(1);
    const head = new THREE.Group();
    head.position.set(0, 0.68, 0);
    head.add(box(0.27, 0.24, 0.25, skin, 0, 0.12, 0));          // سر
    head.add(box(0.29, 0.07, 0.27, hair, 0, 0.255, 0));         // مو
    head.add(box(0.035, 0.05, 0.012, 0x26201c, -0.06, 0.13, 0.128)); // چشم‌ها
    head.add(box(0.035, 0.05, 0.012, 0x26201c, 0.06, 0.13, 0.128));
    body.add(head);

    return { group, limbs: { legL, legR, armL, armR, head, body } };
  }

  _despawn(person) {
    this._hideBubble(person);
    this.group.remove(person.model);
    this.group.remove(person.shadow);
    this.people = this.people.filter(p => p !== person);
    if (this.customer === person) this.customer = null;
  }

  _playAction(person, name) {
    if (!person.actions) return;
    const a = person.actions[name] || person.actions[name === 'walk' ? 'walk' : 'idle'];
    if (!a || person.currentAction === a) return;
    if (person.currentAction) person.currentAction.fadeOut(0.22);
    a.reset().fadeIn(0.22).play();
    person.currentAction = a;
    person.currentName = name;
  }

  // ---------- حباب حرف ----------
  _say(person, text, sec = 2) {
    if (!this.ui || !text) return;
    const pos = person.model.position;
    this.ui.showBubble('bubble_' + person.id, pos.x, pos.z, text, CHARACTERS.height + 0.32);
    person.bubbleTimer = sec;
  }

  _hideBubble(person) {
    person.bubbleTimer = 0;
    if (this.ui) this.ui.hideBubble('bubble_' + person.id);
  }

  // ---------- حرکت ----------
  _randomPoint() {
    const w = CHARACTERS.wander;
    return {
      x: w.minX + Math.random() * (w.maxX - w.minX),
      z: w.minZ + Math.random() * (w.maxZ - w.minZ),
    };
  }

  _buildingDoor(b) {
    const sp = this.world.getSprite('building:' + b.id);
    const x = sp ? sp.position.x : b.x;
    const z = sp ? sp.position.z : b.z;
    return { x, z: z + 1.6 };
  }

  _moveToward(p, dt, arriveDist = 0.24) {
    if (!p.target) { p.moving = false; return true; }
    const pos = p.model.position;
    const dx = p.target.x - pos.x;
    const dz = p.target.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < arriveDist) { p.moving = false; return true; }
    const stepLen = Math.min(d, p.speed * dt);
    pos.x += (dx / d) * stepLen;
    pos.z += (dz / d) * stepLen;
    p.moving = true;
    this._faceToward(p, p.target.x, p.target.z, dt);
    return false;
  }

  _faceToward(p, x, z, dt) {
    const pos = p.model.position;
    const dx = x - pos.x, dz = z - pos.z;
    if (Math.hypot(dx, dz) < 0.01) return;
    const targetRot = Math.atan2(dx, dz);
    let diff = targetRot - p.model.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.model.rotation.y += diff * Math.min(1, dt * 9);
  }

  _fade(person, visible) {
    person.model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.visible = visible;
        if (o.material && 'opacity' in o.material) o.material.opacity = visible ? 1 : 0;
      }
    });
    person.shadow.visible = visible;
  }

  _pickTarget(person) {
    if (Math.random() < CHARACTERS.enterChance) {
      const b = pick(LAYOUT.buildings);
      person.target = this._buildingDoor(b);
      person.enterBuilding = b;
      return;
    }
    person.enterBuilding = null;
    person.target = this._randomPoint();
  }

  // ---------- گپ دونفره ----------
  _tryStartChat() {
    const free = this.people.filter(p =>
      p.role === 'villager' && !p.chat && (p.state === S.IDLE || p.state === S.WALK));
    if (free.length < 2) return;
    const a = pick(free);
    let b = null, best = Infinity;
    for (const p of free) {
      if (p === a) continue;
      const d = (p.model.position.x - a.model.position.x) ** 2 +
                (p.model.position.z - a.model.position.z) ** 2;
      if (d < best) { best = d; b = p; }
    }
    if (!b) return;

    const w = CHARACTERS.wander;
    const mx = THREE.MathUtils.clamp((a.model.position.x + b.model.position.x) / 2, w.minX, w.maxX);
    const mz = THREE.MathUtils.clamp((a.model.position.z + b.model.position.z) / 2, w.minZ, w.maxZ);
    let dx = b.model.position.x - a.model.position.x;
    let dz = b.model.position.z - a.model.position.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;

    const chat = {
      lines: pick(CHAT_DIALOGUES),
      lineIdx: -1,
      lineTimer: 0,
      started: false,
      dur: CHARACTERS.chat.durMin + Math.random() * (CHARACTERS.chat.durMax - CHARACTERS.chat.durMin),
      a, b,
    };
    a.chat = chat; a.chatIdx = 0; a.enterBuilding = null;
    b.chat = chat; b.chatIdx = 1; b.enterBuilding = null;
    a.chatSlot = { x: mx - dx * 0.38, z: mz - dz * 0.38 };
    b.chatSlot = { x: mx + dx * 0.38, z: mz + dz * 0.38 };
    a.target = a.chatSlot; b.target = b.chatSlot;
    a.state = S.TO_CHAT; b.state = S.TO_CHAT;
  }

  _endChat(chat) {
    for (const p of [chat.a, chat.b]) {
      if (!p) continue;
      p.chat = null;
      p.chatSlot = null;
      p.talking = false;
      this._hideBubble(p);
      if (p.state === S.CHAT || p.state === S.TO_CHAT) {
        p.state = S.IDLE;
        p.timer = 0.6 + Math.random() * 1.4;
        this._playAction(p, 'idle');
      }
    }
  }

  _updateChatTalk(chat, dt) {
    // فقط نفر اول ساعت دیالوگ را جلو می‌برد
    if (!chat.started) {
      if (chat.a.state !== S.CHAT || chat.b.state !== S.CHAT) return;
      chat.started = true;
      chat.lineTimer = 0.35;
    }
    chat.dur -= dt;
    chat.lineTimer -= dt;
    if (chat.lineTimer <= 0) {
      chat.lineIdx += 1;
      if (chat.lineIdx >= chat.lines.length || chat.dur <= 0) {
        this._endChat(chat);
        return;
      }
      chat.lineTimer = CHARACTERS.chat.lineSec;
      const speaker = chat.lineIdx % 2 === 0 ? chat.a : chat.b;
      const other = speaker === chat.a ? chat.b : chat.a;
      other.talking = false;
      this._hideBubble(other);
      this._playAction(other, 'idle');
      speaker.talking = true;
      this._say(speaker, chat.lines[chat.lineIdx], CHARACTERS.chat.lineSec + 0.15);
      this._playAction(speaker, speaker.actions && speaker.actions['emote-yes'] ? 'emote-yes' : 'idle');
    }
    if (chat.dur <= 0) this._endChat(chat);
  }

  // ================= مشتری =================
  /**
   * stops: [{ plotId, x, z, faceX, faceZ, cropName, decision: 'buy'|'reject' }]
   * مشتری به نوبت سر هر ایستگاه می‌رود، محصول را وارسی می‌کند و طبق decision
   * یا رد می‌کند و سراغ بعدی می‌رود یا می‌خرد و خداحافظی می‌کند.
   */
  requestCustomer({ stops, isReady, onBuy, onDone }) {
    if (!this.ready || this.customer || !stops || !stops.length) return false;
    const side = Math.random() < 0.5 ? -1 : 1;
    const gateX = CHARACTERS.gate.x * side;
    const person = this.createPerson('customer', gateX, CHARACTERS.gate.z);
    person.speed = CHARACTERS.speed * 1.2;
    person.cust = {
      stops, idx: 0, isReady, onBuy, onDone, gateX,
      phase: 'go', timer: 0, bought: false,
    };
    person.state = S.CUST_WALK;
    person.target = { x: stops[0].x, z: stops[0].z };
    this.customer = person;
    this._say(person, pick(CUSTOMER_LINES.arrive), 2.4);
    return true;
  }

  get customerActive() { return !!this.customer; }

  _custNextStop(p) {
    const c = p.cust;
    c.idx += 1;
    if (c.idx < c.stops.length) {
      c.phase = 'go';
      p.state = S.CUST_WALK;
      p.target = { x: c.stops[c.idx].x, z: c.stops[c.idx].z };
    } else {
      p.state = S.CUST_LEAVE;
      p.target = { x: c.gateX, z: CHARACTERS.gate.z };
    }
  }

  _updateCustomer(p, dt) {
    const c = p.cust;
    if (!c) return;
    const stop = c.stops[c.idx];

    if (p.state === S.CUST_WALK) {
      if (!stop) { this._custNextStop(p); return; }
      if (this._moveToward(p, dt, 0.28)) {
        p.state = S.CUST_ACT;
        p.moving = false;
        if (!c.isReady(stop.plotId)) {
          c.phase = 'gone';
          c.timer = 1.3;
          this._say(p, pick(CUSTOMER_LINES.gone), 1.3);
        } else {
          c.phase = 'inspect';
          c.timer = 1.6;
          this._say(p, fill(pick(CUSTOMER_LINES.inspect), stop.cropName), 1.6);
        }
        this._playAction(p, 'idle');
      } else {
        this._playAction(p, 'walk');
      }
      return;
    }

    if (p.state === S.CUST_ACT) {
      if (stop) this._faceToward(p, stop.faceX, stop.faceZ, dt);
      c.timer -= dt;
      if (c.timer > 0) return;

      if (c.phase === 'gone') { this._custNextStop(p); return; }

      if (c.phase === 'inspect') {
        if (!c.isReady(stop.plotId)) {
          c.phase = 'gone';
          c.timer = 1.2;
          this._say(p, pick(CUSTOMER_LINES.gone), 1.2);
          return;
        }
        if (stop.decision === 'buy') {
          c.phase = 'buy';
          c.timer = 1.7;
          p.talking = true;
          this._say(p, fill(pick(CUSTOMER_LINES.buy), stop.cropName), 1.7);
          this._playAction(p, p.actions && p.actions['emote-yes'] ? 'emote-yes' : 'idle');
        } else {
          c.phase = 'reject';
          c.timer = 1.7;
          this._say(p, fill(pick(CUSTOMER_LINES.reject), stop.cropName), 1.7);
          this._playAction(p, p.actions && p.actions['emote-no'] ? 'emote-no' : 'idle');
        }
        return;
      }

      if (c.phase === 'reject') {
        p.talking = false;
        this._custNextStop(p);
        return;
      }

      if (c.phase === 'buy') {
        p.talking = false;
        if (c.isReady(stop.plotId)) {
          c.bought = true;
          try { c.onBuy(stop.plotId); } catch (e) { console.error('[customer buy]', e); }
        }
        c.phase = 'thanks';
        c.timer = 1.4;
        this._say(p, pick(CUSTOMER_LINES.thanks), 1.4);
        this._playAction(p, 'idle');
        return;
      }

      if (c.phase === 'thanks') {
        p.state = S.CUST_LEAVE;
        p.target = { x: c.gateX, z: CHARACTERS.gate.z };
      }
      return;
    }

    if (p.state === S.CUST_LEAVE) {
      if (this._moveToward(p, dt, 0.4)) {
        const done = c.onDone;
        this._despawn(p);
        if (done) { try { done(); } catch (e) { /* ok */ } }
      } else {
        this._playAction(p, 'walk');
      }
    }
  }

  // ================= حلقه‌ی اصلی =================
  update(dt) {
    if (!this.ready) return;
    const step = Math.min(dt, 0.08);
    const t = performance.now() / 1000;

    // زمان‌بندی گپ‌های دونفره
    this.chatTimer -= step;
    if (this.chatTimer <= 0) {
      this.chatTimer = CHARACTERS.chat.everyMin +
        Math.random() * (CHARACTERS.chat.everyMax - CHARACTERS.chat.everyMin);
      this._tryStartChat();
    }

    for (const p of [...this.people]) {
      if (p.mixer) p.mixer.update(step);
      const pos = p.model.position;

      switch (p.state) {
        case S.IDLE: {
          p.moving = false;
          if (p.currentName !== 'idle' && !p.chat) this._playAction(p, 'idle');
          p.timer -= step;
          if (p.timer <= 0 && p.role === 'villager') {
            this._pickTarget(p);
            p.state = S.WALK;
            this._playAction(p, 'walk');
          }
          break;
        }
        case S.WALK: {
          if (this._moveToward(p, step)) {
            if (p.enterBuilding) {
              p.state = S.INSIDE;
              p.insideTimer = CHARACTERS.insideMin +
                Math.random() * (CHARACTERS.insideMax - CHARACTERS.insideMin);
              p.enterBuilding = null;
              this._hideBubble(p);
              this._fade(p, false);
              this._playAction(p, 'idle');
            } else {
              p.state = S.IDLE;
              p.timer = CHARACTERS.idleMin + Math.random() * (CHARACTERS.idleMax - CHARACTERS.idleMin);
              this._playAction(p, Math.random() < 0.2 && p.actions && p.actions['emote-yes'] ? 'emote-yes' : 'idle');
            }
          } else if (p.currentName !== 'walk') {
            this._playAction(p, 'walk');
          }
          break;
        }
        case S.INSIDE: {
          p.moving = false;
          p.insideTimer -= step;
          if (p.insideTimer <= 0) {
            this._fade(p, true);
            p.enterBuilding = null;
            p.target = this._randomPoint();
            p.state = S.WALK;
            this._playAction(p, 'walk');
          }
          break;
        }
        case S.TO_CHAT: {
          if (!p.chat) { p.state = S.IDLE; break; }
          if (this._moveToward(p, step, 0.16)) {
            p.state = S.CHAT;
            p.moving = false;
            this._playAction(p, 'idle');
          } else if (p.currentName !== 'walk') {
            this._playAction(p, 'walk');
          }
          break;
        }
        case S.CHAT: {
          p.moving = false;
          if (!p.chat) { p.state = S.IDLE; break; }
          const partner = p.chatIdx === 0 ? p.chat.b : p.chat.a;
          if (partner) this._faceToward(p, partner.model.position.x, partner.model.position.z, step);
          if (p.chatIdx === 0) this._updateChatTalk(p.chat, step);
          break;
        }
        case S.CUST_WALK:
        case S.CUST_ACT:
        case S.CUST_LEAVE: {
          this._updateCustomer(p, step);
          break;
        }
      }

      // انیمیشن آدمک مکعبی
      if (p.limbs) {
        const L = p.limbs;
        if (p.moving) {
          p.walkPhase += step * p.speed * 7.5;
          const s = Math.sin(p.walkPhase);
          L.legL.rotation.x = s * 0.65;
          L.legR.rotation.x = -s * 0.65;
          L.armL.rotation.x = -s * 0.5;
          L.armR.rotation.x = s * 0.5;
          L.body.position.y = Math.abs(Math.cos(p.walkPhase)) * 0.03;
        } else {
          const k = Math.min(1, step * 10);
          L.legL.rotation.x *= (1 - k);
          L.legR.rotation.x *= (1 - k);
          L.armL.rotation.x *= (1 - k);
          if (p.talking) {
            // ژست حرف‌زدن: دست تکان می‌خورد و بدن کمی بالا-پایین می‌شود
            L.armR.rotation.x = -0.7 + Math.sin(t * 9 + p.walkPhase) * 0.3;
            L.body.position.y = Math.abs(Math.sin(t * 7 + p.walkPhase)) * 0.02;
            L.head.rotation.y = Math.sin(t * 2.2 + p.walkPhase) * 0.12;
          } else {
            L.armR.rotation.x *= (1 - k);
            L.body.position.y = Math.sin(t * 1.8 + p.walkPhase) * 0.008;
            L.head.rotation.y *= (1 - k);
          }
        }
      }

      // حباب حرف: دنبال‌کردن آدمک و اتمام زمان
      if (p.bubbleTimer > 0) {
        p.bubbleTimer -= step;
        if (this.ui) this.ui.moveBubble('bubble_' + p.id, pos.x, pos.z);
        if (p.bubbleTimer <= 0) this._hideBubble(p);
      }

      // سایه و ترتیب رندر
      p.shadow.position.set(pos.x, 0.025, pos.z);
      p.model.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) o.renderOrder = 1000 + pos.z * 10 + 2;
      });
    }
  }
}
