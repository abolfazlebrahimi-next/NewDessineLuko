// ================= جهان بازی با Three.js =================
import * as THREE from 'three';
import { ASSET, MAP } from './config.js';

const VIEW_HEIGHT = 15.2;      // ارتفاع دید ارتوگرافیک (نقشه بزرگ‌تر شده)
const CAM_POS = new THREE.Vector3(0, 13.5, 11.8);
const CAM_TARGET = new THREE.Vector3(0, 0, 2.2);

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x7ec850, 1);

    this.scene = new THREE.Scene();
    // نور — برای مدل‌های سه‌بعدی (درخت/سنگ/آدمک) لازم است؛ اسپریت‌ها بی‌نیازند
    this.scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x4a7a34, 1.9));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    sun.position.set(6, 14, 7);
    this.scene.add(sun);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.camera.position.copy(CAM_POS);
    this.camera.lookAt(CAM_TARGET);

    this.loader = new THREE.TextureLoader();
    this.texCache = new Map();
    this.clickables = [];        // برای ری‌کست
    this.byTag = new Map();      // tag -> mesh
    this.effects = [];           // انیمیشن‌های فعال
    this.panTarget = new THREE.Vector3().copy(CAM_TARGET);
    this.zoom = 1;

    this._makeGround();
    this._makeShadowTexture();
    this._makeRingTexture();
    this._makeGhostTexture();
    this._makeParticleTexture();

    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------- بافت‌ها ----------
  texture(file) {
    if (!this.texCache.has(file)) {
      const t = this.loader.load(ASSET(file));
      t.colorSpace = THREE.SRGBColorSpace;
      this.texCache.set(file, t);
    }
    return this.texCache.get(file);
  }

  _makeGround() {
    const grass = this.loader.load(ASSET('grass_tile.png'));
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    grass.repeat.set(9, 6);
    grass.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: grass });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(72, 46), mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, 0, 1);
    this.ground.renderOrder = -1000;
    this.scene.add(this.ground);

    // لکه‌های روشن‌تر چمن زیر ساختمان‌ها برای عمق بیشتر
    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = patchCanvas.height = 256;
    const pctx = patchCanvas.getContext('2d');
    const g = pctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.20)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    pctx.fillStyle = g;
    pctx.fillRect(0, 0, 256, 256);
    const patchTex = new THREE.CanvasTexture(patchCanvas);
    this.patchMat = new THREE.MeshBasicMaterial({
      map: patchTex, transparent: true, depthWrite: false,
    });
    for (const [x, z, s] of [
      [0, -3.0, 11], [-10.5, -3.4, 7], [10.5, -3.4, 7], [-10.8, 1.4, 6.5], [10.8, 1.4, 6.5],
      [0, 1.4, 15],   // میدان وسط شهر
      [0, 9.2, 21],   // زمین کشت بزرگ جنوب شهر
    ]) {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(s, s), this.patchMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(x, 0.01, z);
      patch.renderOrder = -999;
      this.scene.add(patch);
    }
  }

  _makeShadowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(20,50,15,0.38)');
    g.addColorStop(0.65, 'rgba(20,50,15,0.20)');
    g.addColorStop(1, 'rgba(20,50,15,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    this.shadowTex = new THREE.CanvasTexture(c);
  }

  _makeRingTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(90,220,110,0.95)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.stroke();
    this.ringTex = new THREE.CanvasTexture(c);
  }

  _makeGhostTexture() {
    // سایه/پد جانمایی مربعی گرد مثل کلش
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, Math.PI * 2);
    ctx.stroke();
    this.ghostTex = new THREE.CanvasTexture(c);
  }

  _makeParticleTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.particleTex = new THREE.CanvasTexture(c);
  }

  // ---------- ساخت اشیاء ----------
  /**
   * اسپریت ایستاده روی زمین (ساختمان/درخت/جایگاه)
   */
  addSprite({ tag, file, texture = null, x, z, width, y = 0, clickable = true, anchorBottom = true }) {
    const tex = texture || this.texture(file);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    const aspect = tex.image && tex.image.width ? tex.image.width / tex.image.height : 1.5;
    const h = width / aspect;
    sp.scale.set(width, h, 1);
    sp.center.set(0.5, anchorBottom ? 0 : 0.5);
    sp.position.set(x, y, z);
    sp.renderOrder = 1000 + z * 10;
    sp.userData = { tag, type: tag.split(':')[0], id: tag, baseScale: sp.scale.clone(), aspect };
    this.scene.add(sp);
    this.clickables.push(sp);
    this.byTag.set(tag, sp);

    // سایه
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: this.shadowTex, transparent: true, depthWrite: false, depthTest: false,
    }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(width * 0.85, width * 0.38, 1);
    sh.position.set(x, 0.03, z + width * 0.12);
    sh.renderOrder = 990 + z * 10;
    this.scene.add(sh);
    sp.userData.shadow = sh;
    return sp;
  }

  setSpriteTexture(sp, file, width, scaleMul = 1) {
    sp.material.map = this.texture(file);
    sp.material.needsUpdate = true;
    const tex = sp.material.map;
    const aspect = tex.image && tex.image.width ? tex.image.width / tex.image.height : sp.userData.aspect;
    const w = width * scaleMul;
    sp.scale.set(w, w / aspect, 1);
    sp.userData.aspect = aspect;
    if (sp.userData.shadow) {
      sp.userData.shadow.scale.set(width * 0.85, width * 0.38, 1);
    }
  }

  removeSprite(tag) {
    const sp = this.byTag.get(tag);
    if (!sp) return;
    this.scene.remove(sp);
    if (sp.userData.shadow) this.scene.remove(sp.userData.shadow);
    this.clickables = this.clickables.filter(o => o !== sp);
    this.byTag.delete(tag);
    sp.material.dispose();
  }

  getSprite(tag) { return this.byTag.get(tag); }

  // ---------- انتخاب / هایلایت ----------
  showHighlight(x, z, size = 1.6, color = 0x5adc6e) {
    if (!this.highlight) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.ringTex, transparent: true, depthWrite: false, depthTest: false,
      });
      this.highlight = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      this.highlight.rotation.x = -Math.PI / 2;
      this.highlight.renderOrder = 2500;
      this.scene.add(this.highlight);
    }
    this.highlight.visible = true;
    this.highlight.position.set(x, 0.05, z);
    this.highlight.scale.set(size, size, 1);
    this.highlight.material.color.setHex(color);
  }

  hideHighlight() {
    if (this.highlight) this.highlight.visible = false;
  }

  // ---------- سایه/پد جانمایی هنگام درگ‌اندراپ ----------
  showPlacementGhost(x, z, size, valid) {
    if (!this.placementGhost) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.ghostTex, transparent: true, depthWrite: false, depthTest: false,
      });
      this.placementGhost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      this.placementGhost.rotation.x = -Math.PI / 2;
      this.placementGhost.renderOrder = 2600;
      this.scene.add(this.placementGhost);
    }
    this.placementGhost.visible = true;
    this.placementGhost.position.set(x, 0.06, z);
    this.placementGhost.scale.set(size, size * 0.72, 1);
    this.placementGhost.material.color.setHex(valid ? 0x62e57a : 0xff5b52);
    this.placementGhost.material.opacity = 0.85;
  }

  hidePlacementGhost() {
    if (this.placementGhost) this.placementGhost.visible = false;
  }

  // ---------- افکت هاور / لمس ----------
  hoverSprite(tag, on) {
    const sp = this.getSprite(tag);
    if (!sp) return;
    const base = sp.userData.baseScale;
    if (on) {
      sp.userData.hoverT = 0;
      sp.userData.hovering = true;
    } else if (sp.userData) {
      sp.userData.hovering = false;
      sp.scale.copy(base);
      sp.material.rotation = 0;
    }
  }

  shakeSprite(tag, strength = 1) {
    const sp = this.getSprite(tag);
    if (!sp) return;
    sp.userData.shakeT = 0;
    sp.userData.shakeS = strength;
  }

  // ---------- افکت‌ها ----------
  explode(x, y, z, colorHex = 0xffd070) {
    const group = [];
    const colors = [colorHex, 0xffffff, 0xffb347, 0x9be15d];
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.particleTex, color: colors[i % colors.length],
        transparent: true, depthTest: false, depthWrite: false,
      });
      const p = new THREE.Sprite(mat);
      const s = 0.22 + Math.random() * 0.35;
      p.scale.set(s, s, 1);
      p.position.set(x, y, z);
      p.renderOrder = 3000;
      const ang = Math.random() * Math.PI * 2;
      const speed = 1.6 + Math.random() * 2.6;
      this.scene.add(p);
      group.push({
        sprite: p,
        vx: Math.cos(ang) * speed,
        vy: 1.2 + Math.random() * 3.2,
        vz: Math.sin(ang) * speed * 0.55,
        life: 0.75 + Math.random() * 0.5,
        age: 0,
      });
    }
    // موج ضربه
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.ringTex, transparent: true, depthTest: false,
        color: 0xffe28a, opacity: 0.95,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.06, z);
    ring.renderOrder = 2900;
    this.scene.add(ring);
    this.effects.push({
      type: 'ring', mesh: ring, age: 0, life: 0.55,
    });
    this.effects.push({ type: 'particles', items: group, age: 0, life: 1.3 });
  }

  coinBurst(x, y, z) {
    this.explode(x, y, z, 0xffe27a);
  }

  // ---------- ری‌کست ----------
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.clickables, false);
    return hits.length ? hits[0].object : null;
  }

  pickGround(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.ground, false);
    return hits.length ? hits[0].point : null;
  }

  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  // ---------- دوربین ----------
  panBy(dx, dy) {
    // dx, dy در پیکسل → حرکت در صفحه‌ی زمین
    const rect = this.canvas.getBoundingClientRect();
    const worldPerPixel = (VIEW_HEIGHT / this.zoom) / rect.height;
    const right = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize().negate();
    this.panTarget.addScaledVector(right, dx * worldPerPixel);
    this.panTarget.addScaledVector(fwd, -dy * worldPerPixel * 1.35);
    this.panTarget.x = THREE.MathUtils.clamp(this.panTarget.x, MAP.panMinX, MAP.panMaxX);
    this.panTarget.z = THREE.MathUtils.clamp(this.panTarget.z, MAP.panMinZ, MAP.panMaxZ);
  }

  zoomBy(delta) {
    // زوم‌اوت بیشتر برای دیدن کل نقشه‌ی بزرگ
    this.zoom = THREE.MathUtils.clamp(this.zoom * (delta > 0 ? 0.92 : 1.08), 0.5, 1.7);
  }

  focusOn(x, z, zoom = 1.18) {
    this.panTarget.set(
      THREE.MathUtils.clamp(x, MAP.panMinX, MAP.panMaxX),
      0,
      THREE.MathUtils.clamp(z - 1.2, MAP.panMinZ, MAP.panMaxZ)
    );
    this.zoom = zoom;
  }

  // ---------- حلقه‌ی رندر ----------
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    this._updateCamera();
  }

  _updateCamera() {
    const hw = (VIEW_HEIGHT * this.aspect) / 2 / this.zoom;
    const hh = VIEW_HEIGHT / 2 / this.zoom;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      CAM_POS.x + this.panTarget.x - CAM_TARGET.x,
      CAM_POS.y,
      CAM_POS.z + this.panTarget.z - CAM_TARGET.z
    );
    this.camera.lookAt(this.panTarget);
  }

  update(dt) {
    // تکان ملایم و هاور اسپریت‌ها (درخت‌ها و...)
    const t = performance.now() / 1000;
    for (const sp of this.clickables) {
      if (!sp.userData) continue;
      const base = sp.userData.baseScale;
      if (!base) continue;
      if (sp.userData.hovering) {
        // بزرگ‌نمایی ملایم + تکان هنگام هاور/لمس
        sp.userData.hoverT = (sp.userData.hoverT || 0) + dt;
        const k = 1.07 + Math.sin(sp.userData.hoverT * 12) * 0.03;
        sp.scale.set(base.x * k, base.y * k, 1);
        sp.material.rotation = Math.sin(sp.userData.hoverT * 16) * 0.09;
      } else if (sp.userData.type === 'tree' || sp.userData.sway) {
        // تکان طبیعی درخت‌ها در حالت عادی
        const phase = (sp.userData.swayPhase = sp.userData.swayPhase ?? Math.random() * Math.PI * 2);
        sp.material.rotation = Math.sin(t * 1.4 + phase) * 0.028;
      }
      if (sp.userData.shakeT !== undefined) {
        sp.userData.shakeT += dt;
        const st = sp.userData.shakeT;
        if (st < 0.55) {
          sp.material.rotation = Math.sin(st * 34) * 0.16 * (1 - st / 0.55) * (sp.userData.shakeS || 1);
        } else {
          delete sp.userData.shakeT;
          sp.material.rotation = 0;
        }
      }
    }

    // انیمیشن افکت‌ها
    for (const fx of this.effects) {
      fx.age += dt;
      const t = Math.min(1, fx.age / fx.life);
      if (fx.type === 'particles') {
        for (const p of fx.items) {
          p.age += dt;
          if (p.age >= p.life) { p.sprite.visible = false; continue; }
          p.vy -= 6.5 * dt;
          p.sprite.position.x += p.vx * dt;
          p.sprite.position.y = Math.max(0.05, p.sprite.position.y + p.vy * dt);
          p.sprite.position.z += p.vz * dt;
          const k = 1 - p.age / p.life;
          p.sprite.material.opacity = k;
          const sc = (0.5 + k) * p.sprite.scale.x;
          p.sprite.scale.setScalar(Math.max(0.05, sc * 0.35));
        }
      } else if (fx.type === 'ring') {
        fx.mesh.scale.setScalar(1 + t * 3.2);
        fx.mesh.material.opacity = 0.95 * (1 - t);
      }
    }
    this.effects = this.effects.filter(fx => {
      if (fx.age < fx.life) return true;
      if (fx.type === 'particles') fx.items.forEach(p => this.scene.remove(p.sprite));
      if (fx.type === 'ring') this.scene.remove(fx.mesh);
      return false;
    });

    // نرم شدن حرکت دوربین
    this.camera.position.x += ((CAM_POS.x + this.panTarget.x - CAM_TARGET.x) - this.camera.position.x) * Math.min(1, dt * 6);
    this.camera.position.z += ((CAM_POS.z + this.panTarget.z - CAM_TARGET.z) - this.camera.position.z) * Math.min(1, dt * 6);
    this._updateCamera();

    this.renderer.render(this.scene, this.camera);
  }
}
