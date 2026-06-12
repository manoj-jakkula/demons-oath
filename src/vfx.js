// ============================================================================
// VFX — pooled particles (single Points draw call), slash trails, ground
// rings, impact light, screen flash. Zero allocations in the per-frame path.
// ============================================================================
import * as THREE from 'three';

const VERT = `
attribute float psize; attribute float palpha; attribute vec3 pcolor;
varying float vA; varying vec3 vC;
void main(){
  vA = palpha; vC = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * (220.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vA; varying vec3 vC;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.08, d));
}`;

export class VFX {
  constructor(G) {
    this.G = G;
    const N = this.N = G.cfg.vfx.maxParticles;
    this.count = 0;
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.size = new Float32Array(N);
    this.alpha = new Float32Array(N);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N);
    this.grav = new Float32Array(N);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    G.scene.add(this.points);

    this._tmpColor = new THREE.Color();

    // slash trails pool
    this.trails = [];
    const trailGeo = new THREE.RingGeometry(1.1, 2.1, 22, 1, 0, 2.4);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      G.scene.add(m);
      this.trails.push({ mesh: m, life: 0, max: 0.2 });
    }

    // ground rings pool (telegraphs / shockwaves)
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.86, 1.0, 36);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      G.scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, mode: 'expand', r: 1 });
    }

    // single reusable impact light
    this.light = new THREE.PointLight(0xffffff, 0, 12, 2);
    G.scene.add(this.light);

    this.flashEl = document.getElementById('flash');
    this.flashA = 0; this.flashFade = 3;
  }

  // ---- particles ------------------------------------------------------------
  burst(p, { count = 12, color = 0xffffff, color2 = null, speed = 4, up = 2,
             size = 0.12, life = 0.5, gravity = 9, spread = 1 } = {}) {
    const c1 = this._tmpColor.set(color);
    const r1 = c1.r, g1 = c1.g, b1 = c1.b;
    let r2 = r1, g2 = g1, b2 = b1;
    if (color2 !== null) { const c2 = this._tmpColor.set(color2); r2 = c2.r; g2 = c2.g; b2 = c2.b; }
    for (let n = 0; n < count; n++) {
      if (this.count >= this.N) break;
      const i = this.count++;
      const i3 = i * 3;
      this.pos[i3] = p.x + (Math.random() - 0.5) * spread * 0.4;
      this.pos[i3 + 1] = p.y + (Math.random() - 0.5) * spread * 0.4;
      this.pos[i3 + 2] = p.z + (Math.random() - 0.5) * spread * 0.4;
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.35) * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i3] = Math.cos(a) * s;
      this.vel[i3 + 1] = up * (0.3 + Math.random() * 0.9) + e;
      this.vel[i3 + 2] = Math.sin(a) * s;
      const t = Math.random();
      this.col[i3] = r1 + (r2 - r1) * t;
      this.col[i3 + 1] = g1 + (g2 - g1) * t;
      this.col[i3 + 2] = b1 + (b2 - b1) * t;
      this.size[i] = size * (0.6 + Math.random() * 0.9);
      this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.8);
      this.alpha[i] = 1;
      this.grav[i] = gravity;
    }
  }

  // ---- presets ----------------------------------------------------------------
  blood(p, big = false) {
    this.burst(p, { count: big ? 26 : 12, color: 0x9e1212, color2: 0x4a0505,
      speed: big ? 6 : 3.5, up: 3, size: big ? 0.17 : 0.12, life: 0.55, gravity: 14 });
  }
  sparks(p) {
    this.burst(p, { count: 14, color: 0xffd970, color2: 0xfff6dd, speed: 7, up: 2.5,
      size: 0.07, life: 0.35, gravity: 10 });
    this.impactLight(p, 0xffd070, 3);
  }
  parryFlash(p) {
    this.burst(p, { count: 30, color: 0xbfe8ff, color2: 0xffffff, speed: 9, up: 3,
      size: 0.1, life: 0.4, gravity: 4 });
    this.impactLight(p, 0xbfe8ff, 8);
    this.ring(p, 2.6, 0xbfe8ff, 0.35, 'expand');
    this.flash('#cfeaff', 0.22, 5);
  }
  rageBlast(p, radius) {
    this.burst(p, { count: 90, color: 0xff7a20, color2: 0xffd040, speed: 12, up: 6,
      size: 0.22, life: 0.8, gravity: 6, spread: 2 });
    this.ring(p, radius, 0xff8c30, 0.5, 'expand');
    this.impactLight(p, 0xff7a20, 14);
    this.flash('#ffb24d', 0.4, 3);
    this.G.shake += 0.5;
  }
  soulBurst(p, colorHex) {
    this.burst(p, { count: 22, color: colorHex, color2: 0xffffff, speed: 2.2, up: 4,
      size: 0.13, life: 0.9, gravity: -2 });
  }
  bossExplosion(p) {
    this.burst(p, { count: 160, color: 0xff5a10, color2: 0xffe080, speed: 14, up: 9,
      size: 0.3, life: 1.4, gravity: 7, spread: 3 });
    this.burst(p, { count: 60, color: 0x222222, color2: 0x663311, speed: 5, up: 6,
      size: 0.4, life: 1.8, gravity: 2, spread: 2 });
    this.ring(p, 9, 0xff8030, 0.9, 'expand');
    this.impactLight(p, 0xff6020, 20);
    this.flash('#ffd9a0', 0.6, 1.6);
    this.G.shake += 1.2;
  }
  heal(p) {
    this.burst(p, { count: 18, color: 0x4ade62, color2: 0xc8ffd0, speed: 1.4, up: 3.2,
      size: 0.11, life: 0.9, gravity: -3 });
  }
  levelup(p) {
    this.burst(p, { count: 40, color: 0xffd040, color2: 0xfff0b0, speed: 3, up: 5,
      size: 0.13, life: 1.1, gravity: -4 });
    this.impactLight(p, 0xffd040, 8);
  }
  dust(p) {
    this.burst(p, { count: 8, color: 0x6b6354, color2: 0x3d382f, speed: 2, up: 1,
      size: 0.16, life: 0.45, gravity: 3 });
  }

  // ---- slash trail ------------------------------------------------------------
  slash(p, facing, tiltUp, color = 0xdfe8ff) {
    for (const t of this.trails) {
      if (t.life > 0) continue;
      t.life = t.max = 0.18;
      const m = t.mesh;
      m.visible = true;
      m.material.color.set(color);
      m.material.opacity = 0.75;
      m.position.set(p.x, p.y + 1.1, p.z);
      m.rotation.set(0, 0, 0);
      m.rotateY(-facing + Math.PI / 2);
      m.rotateX(tiltUp ? -1.2 : -0.5 - Math.random() * 0.8);
      m.scale.setScalar(0.8);
      return;
    }
  }

  // ---- ground rings -------------------------------------------------------------
  ring(p, radius, color, dur, mode = 'expand') {
    for (const r of this.rings) {
      if (r.life > 0) continue;
      r.life = r.max = dur; r.mode = mode; r.r = radius;
      const m = r.mesh;
      m.visible = true;
      m.material.color.set(color);
      m.material.opacity = mode === 'telegraph' ? 0.55 : 0.8;
      m.position.set(p.x, 0.06, p.z);
      m.scale.setScalar(mode === 'expand' ? radius * 0.2 : radius);
      return;
    }
  }

  impactLight(p, color, intensity) {
    this.light.color.set(color);
    this.light.intensity = Math.max(this.light.intensity, intensity);
    this.light.position.set(p.x, p.y + 1.2, p.z);
  }

  flash(cssColor, alpha, fade) {
    this.flashEl.style.background = cssColor;
    this.flashA = Math.max(this.flashA, alpha);
    this.flashFade = fade;
  }

  // ---- update -------------------------------------------------------------------
  update(dt) {
    // particles
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.count;
        if (i !== last) {
          const i3 = i * 3, l3 = last * 3;
          for (let k = 0; k < 3; k++) {
            this.pos[i3 + k] = this.pos[l3 + k];
            this.vel[i3 + k] = this.vel[l3 + k];
            this.col[i3 + k] = this.col[l3 + k];
          }
          this.size[i] = this.size[last]; this.alpha[i] = this.alpha[last];
          this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
          this.grav[i] = this.grav[last];
        }
        continue;
      }
      const i3 = i * 3;
      this.vel[i3 + 1] -= this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.03 && this.grav[i] > 0) { this.pos[i3 + 1] = 0.03; this.vel[i3 + 1] *= -0.3; }
      this.alpha[i] = this.life[i] / this.maxLife[i];
      i++;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.pcolor.needsUpdate = true;
    g.attributes.psize.needsUpdate = true;
    g.attributes.palpha.needsUpdate = true;
    g.setDrawRange(0, this.count);

    // trails
    for (const t of this.trails) {
      if (t.life <= 0) continue;
      t.life -= dt;
      const k = 1 - t.life / t.max;
      t.mesh.material.opacity = 0.75 * (1 - k);
      t.mesh.scale.setScalar(0.8 + k * 0.5);
      if (t.life <= 0) t.mesh.visible = false;
    }

    // rings
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - r.life / r.max;
      if (r.mode === 'expand') {
        r.mesh.scale.setScalar(0.2 * r.r + k * r.r * 0.9);
        r.mesh.material.opacity = 0.8 * (1 - k);
      } else {
        r.mesh.material.opacity = 0.3 + 0.35 * Math.abs(Math.sin(k * 12));
      }
      if (r.life <= 0) r.mesh.visible = false;
    }

    // impact light decay
    this.light.intensity = Math.max(0, this.light.intensity - dt * 40);

    // screen flash decay
    if (this.flashA > 0) {
      this.flashA = Math.max(0, this.flashA - dt * this.flashFade);
      this.flashEl.style.opacity = this.flashA.toFixed(3);
    }
  }
}
