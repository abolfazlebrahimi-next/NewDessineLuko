// ================= آدمک‌های شهر لوکو =================
// مدل‌های Kenney Blocky Characters (GLB) — پرسه‌زنی بین شهر + رفتن داخل ساختمان‌ها
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTERS, LAYOUT, footprintOf } from './config.js';

const STATE = {
  WALK: 'walk',
  IDLE: 'idle',
  ENTER: 'enter',     // رسیدن به درِ ساختمان
  INSIDE: 'inside',   // داخل ساختمان
  EXIT: 'exit',
};

export class Characters {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.world.scene.add(this.group);
    this.loader = new GLTFLoader();
    this.mixers = [];
    this.people = [];
    this.templates = new Map(); // char -> {gltf}
    this.ready = false;
    this.clock = new THREE.Clock();
  }

  async init() {
    // چند مدل مختلف بارگذاری می‌کنیم
    const variants = [...CHARACTERS.variants]
      .sort(() => Math.random() - 0.5)
      .slice(0, CHARACTERS.count);

    const loadOne = (v) => new Promise((resolve) => {
      const url = encodeURI(`${CHARACTERS.modelPath}character-${v}.glb`);
      this.loader.load(
        url,
        (gltf) => resolve({ v, gltf }),
        undefined,
        () => resolve(null), // اگر بارگذاری نشد، بی‌خیال
      );
    });

    const loaded = (await Promise.all(variants.map(loadOne))).filter(Boolean);
    if (!loaded.length) return;

    for (const { v, gltf } of loaded) this.templates.set(v, gltf);

    // ساخت آدمک‌ها
    loaded.forEach((tpl, i) => {
      const person = this._spawnPerson(tpl, i);
      if (person) this.people.push(person);
    });
    this.ready = true;
  }

  _spawnPerson({ v, gltf }, index) {
    const model = gltf.scene.clone(true);
    model.scale.setScalar(CHARACTERS.scale);
    model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = false;
        o.frustumCulled = true;
        // کاراکترها در پاس شفاف رندر شوند تا با اسپرایت‌ها درست بیایند جلو
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.depthWrite = true;
      }
    });

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const clip of gltf.animations) {
      actions[clip.name] = mixer.clipAction(clip);
    }
    // حلقه‌ی انیمیشن‌ها
    for (const name of ['walk', 'idle', 'walk', 'sprint']) {
      const a = actions[name];
      if (a) { a.setLoop(THREE.LoopRepeat, Infinity); }
    }

    // محل شروع
    const w = CHARACTERS.wander;
    const x = w.minX + Math.random() * (w.maxX - w.minX);
    const z = w.minZ + Math.random() * (w.maxZ - w.minZ);
    model.position.set(x, 0, z);

    // سایه
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.world.shadowTex, transparent: true, depthWrite: false,
      })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(1.1, 0.55, 1);
    sh.position.set(x, 0.025, z);
    this.group.add(sh);
    this.group.add(model);

    const person = {
      model, mixer, actions, shadow: sh,
      state: STATE.IDLE,
      target: null,
      timer: 1 + Math.random() * 3,
      speed: CHARACTERS.speed * (0.85 + Math.random() * 0.35),
      insideTimer: 0,
      enterBuilding: null,
      currentAction: null,
      v,
    };
    this._playAction(person, 'idle');
    return person;
  }

  _playAction(person, name) {
    const a = person.actions[name] || person.actions[name === 'walk' ? 'walk' : 'idle'];
    if (!a || person.currentAction === a) return;
    if (person.currentAction) person.currentAction.fadeOut(0.25);
    a.reset().fadeIn(0.25).play();
    person.currentAction = a;
    person.currentName = name;
  }

  _randomPoint() {
    const w = CHARACTERS.wander;
    return {
      x: w.minX + Math.random() * (w.maxX - w.minX),
      z: w.minZ + Math.random() * (w.maxZ - w.minZ),
    };
  }

  _buildingDoor(b) {
    // جلوی ساختمان (در سمت +z)
    const pos = this.world.getSprite('building:' + b.id);
    const x = pos ? pos.position.x : b.x;
    const z = pos ? pos.position.z : b.z;
    return { x, z: z + 1.6, building: b };
  }

  _pickTarget(person) {
    // گاهی به سمت یک ساختمان می‌رود
    if (Math.random() < CHARACTERS.enterChance) {
      const b = LAYOUT.buildings[Math.floor(Math.random() * LAYOUT.buildings.length)];
      const door = this._buildingDoor(b);
      person.target = { x: door.x, z: door.z };
      person.enterBuilding = b;
      return;
    }
    person.enterBuilding = null;
    person.target = this._randomPoint();
  }

  update(dt) {
    if (!this.ready) return;
    const step = Math.min(dt, 0.08);
    for (const p of this.people) {
      p.mixer.update(step);
      const pos = p.model.position;

      switch (p.state) {
        case STATE.IDLE: {
          p.timer -= step;
          if (p.timer <= 0) {
            this._pickTarget(p);
            p.state = STATE.WALK;
            this._playAction(p, 'walk');
          }
          break;
        }
        case STATE.WALK: {
          if (!p.target) { p.state = STATE.IDLE; break; }
          const dx = p.target.x - pos.x;
          const dz = p.target.z - pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.25) {
            // رسید
            if (p.enterBuilding) {
              p.state = STATE.INSIDE;
              p.insideTimer = CHARACTERS.insideMin + Math.random() * (CHARACTERS.insideMax - CHARACTERS.insideMin);
              // رفتن داخل: محو شدن
              this._fade(p, 0);
              this._playAction(p, 'idle');
            } else {
              p.state = STATE.IDLE;
              p.timer = CHARACTERS.idleMin + Math.random() * (CHARACTERS.idleMax - CHARACTERS.idleMin);
              this._playAction(p, 'idle');
              // گاهی یک ایموت
              if (Math.random() < 0.25) {
                const emote = p.actions['emote-yes'] ? 'emote-yes' : 'idle';
                this._playAction(p, emote);
              }
            }
            break;
          }
          const stepLen = Math.min(d, p.speed * step);
          pos.x += (dx / d) * stepLen;
          pos.z += (dz / d) * stepLen;
          // رو به جهت حرکت
          const targetRot = Math.atan2(dx, dz);
          let diff = targetRot - p.model.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          p.model.rotation.y += diff * Math.min(1, step * 8);
          if (p.currentName !== 'walk') this._playAction(p, 'walk');
          break;
        }
        case STATE.INSIDE: {
          p.insideTimer -= step;
          if (p.insideTimer <= 0) {
            // بیرون آمدن
            p.state = STATE.EXIT;
            this._fade(p, 1);
            // کمی جابه‌جا شود تا روی در نماند
            const w = CHARACTERS.wander;
            p.target = this._randomPoint();
            p.state = STATE.WALK;
            this._playAction(p, 'walk');
          }
          break;
        }
      }

      // به‌روزرسانی سایه و renderOrder
      p.shadow.position.set(pos.x, 0.025, pos.z);
      p.model.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) {
          o.renderOrder = 1000 + pos.z * 10 + 2; // کمی جلوتر از هم‌تراز خودش
        }
      });
    }
  }

  _fade(person, targetOpacity) {
    person.fadeTarget = targetOpacity;
    person.model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.material.opacity = targetOpacity;
        o.visible = targetOpacity > 0.05;
      }
    });
    person.shadow.visible = targetOpacity > 0.05;
  }
}
