import {
  Application,
  Container,
  Graphics,
  Ticker,
} from 'pixi.js';

export type FlightVisual = 'orb' | 'plane' | 'rocket';
export type ColorTheme = 'classic' | 'neon' | 'ice' | 'gold';

export interface SceneState {
  phase: 'WAITING' | 'COUNTDOWN' | 'FLYING' | 'CRASHED';
  multiplier: number;
  countdownRemainingMs: number;
  crashPoint: number | null;
  growthRate?: number;
  flightVisual?: FlightVisual;
  colorTheme?: ColorTheme;
  reducedMotion?: boolean;
  autoMarkers?: number[];
  ghostCashOutAt?: number | null;
}

interface ThemePalette {
  bg: number;
  accent: number;
  accentHot: number;
  trail: number;
  gold: number;
  ice: number;
  grid: number;
}

const THEMES: Record<ColorTheme, ThemePalette> = {
  classic: {
    bg: 0x0e1118,
    accent: 0xff2d55,
    accentHot: 0xe31c3d,
    trail: 0xff2d55,
    gold: 0xf5a623,
    ice: 0x7dd3fc,
    grid: 0xffffff,
  },
  neon: {
    bg: 0x0a0614,
    accent: 0xd946ef,
    accentHot: 0x22d3ee,
    trail: 0xa855f7,
    gold: 0xf0abfc,
    ice: 0x67e8f9,
    grid: 0xe879f9,
  },
  ice: {
    bg: 0x0a1218,
    accent: 0x38bdf8,
    accentHot: 0x0ea5e9,
    trail: 0x7dd3fc,
    gold: 0xa5f3fc,
    ice: 0xe0f2fe,
    grid: 0xbae6fd,
  },
  gold: {
    bg: 0x12100a,
    accent: 0xf5a623,
    accentHot: 0xe31c3d,
    trail: 0xfbbf24,
    gold: 0xfde68a,
    ice: 0xfef3c7,
    grid: 0xfcd34d,
  },
};

function riskColor(m: number, pal: ThemePalette): number {
  if (m < 1.5) return pal.ice;
  if (m < 2) return 0x34d399;
  if (m < 5) return pal.trail;
  if (m < 10) return pal.gold;
  return pal.accentHot;
}

/** Frame-rate independent exponential ease toward target (higher k = snappier). */
function damp(current: number, target: number, k: number, dtMs: number): number {
  const t = 1 - Math.exp(-k * (dtMs / 1000));
  return current + (target - current) * t;
}

function dampAngle(current: number, target: number, k: number, dtMs: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-k * (dtMs / 1000)));
}

/**
 * Aviator-style flight stage with smoothed hero motion.
 */
export class GameScene {
  private app: Application | null = null;
  private root = new Container();
  private shakeLayer = new Container();
  private sky = new Graphics();
  private grid = new Graphics();
  private fill = new Graphics();
  private line = new Graphics();
  private markers = new Graphics();
  private hero = new Graphics();
  private heroGlow = new Graphics();
  private countdownRing = new Graphics();
  private particles: Array<{
    g: Graphics;
    vx: number;
    vy: number;
    life: number;
    max: number;
  }> = [];
  private particleLayer = new Container();
  private afterimages: Array<{ g: Graphics; life: number }> = [];
  private afterimageLayer = new Container();
  private state: SceneState = {
    phase: 'WAITING',
    multiplier: 1,
    countdownRemainingMs: 0,
    crashPoint: null,
    flightVisual: 'orb',
    colorTheme: 'classic',
    reducedMotion: false,
    autoMarkers: [],
    ghostCashOutAt: null,
  };
  private points: Array<{ x: number; y: number }> = [];
  private flyElapsed = 0;
  private crashAnim = 0;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private mounted = false;
  private bob = 0;
  private ambientT = 0;
  private milestonesHit = new Set<number>();
  private returnProgress = 1;
  private returnFrom = { x: 0, y: 0 };

  // Smoothed display state (prevents jittery plane/orb)
  private smoothMult = 1;
  private displayX = 0;
  private displayY = 0;
  private displayRot = 0;
  private displayScale = 1;
  private displayAlpha = 1;
  private prevDisplayX = 0;
  private prevDisplayY = 0;
  private posInitialized = false;
  private particleAccum = 0;
  private afterimageAccum = 0;

  async mount(host: HTMLElement, targetFps = 144) {
    if (this.mounted) return;
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: '#0e1118',
      backgroundAlpha: 1,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.appendChild(canvas);
    this.app = app;
    this.mounted = true;

    app.stage.addChild(this.shakeLayer);
    this.shakeLayer.addChild(this.root);
    this.root.addChild(this.sky);
    this.root.addChild(this.grid);
    this.root.addChild(this.fill);
    this.root.addChild(this.line);
    this.root.addChild(this.markers);
    this.root.addChild(this.afterimageLayer);
    this.root.addChild(this.particleLayer);
    this.root.addChild(this.countdownRing);
    this.root.addChild(this.heroGlow);
    this.root.addChild(this.hero);

    Ticker.shared.maxFPS = targetFps;
    app.ticker.maxFPS = targetFps;
    app.ticker.add((ticker) => this.update(ticker.deltaMS));

    this.drawHero();
    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    this.posInitialized = false;
  };

  unmount() {
    window.removeEventListener('resize', this.onResize);
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.mounted = false;
    this.particles = [];
    this.afterimages = [];
    this.posInitialized = false;
  }

  setState(partial: Partial<SceneState>) {
    const prev = this.state.phase;
    const visualChanged =
      partial.flightVisual != null && partial.flightVisual !== this.state.flightVisual;
    const themeChanged =
      partial.colorTheme != null && partial.colorTheme !== this.state.colorTheme;
    this.state = { ...this.state, ...partial };

    if (visualChanged || themeChanged) {
      this.drawHero();
    }

    if (this.state.phase === 'FLYING' && prev !== 'FLYING') {
      this.points = [];
      this.flyElapsed = 0;
      this.crashAnim = 0;
      this.shake = 0;
      this.milestonesHit = new Set();
      this.returnProgress = 1;
      this.smoothMult = Math.max(1, this.state.multiplier);
      this.displayAlpha = 1;
      this.displayRot = -0.35;
      this.displayScale = 1.1;
    }
    if (this.state.phase === 'CRASHED' && prev !== 'CRASHED') {
      this.crashAnim = 1;
      if (!this.state.reducedMotion) {
        this.shake = 1;
        this.burst(36);
      } else {
        this.burst(12);
      }
    }
    if (
      (this.state.phase === 'WAITING' || this.state.phase === 'COUNTDOWN') &&
      (prev === 'CRASHED' || prev === 'FLYING')
    ) {
      this.returnFrom = { x: this.displayX, y: this.displayY };
      this.returnProgress = 0;
      this.points = [];
      this.flyElapsed = 0;
      this.smoothMult = 1;
      this.displayAlpha = 1;
    }
  }

  private pal(): ThemePalette {
    return THEMES[this.state.colorTheme ?? 'classic'];
  }

  private flightPos(w: number, h: number, mult: number, flyElapsed: number) {
    const progress = Math.min(1, flyElapsed / 14000);
    const logM = Math.log(Math.max(1, mult)) / Math.log(50);
    const x = 24 + progress * (w - 60) * Math.min(1, 0.4 + logM * 0.85);
    const y =
      h * 0.78 -
      Math.min(h * 0.55, (mult - 1) * (h * 0.07) + progress * h * 0.28);
    return { x, y };
  }

  private drawHero() {
    const g = this.hero;
    g.clear();
    const visual = this.state.flightVisual ?? 'orb';
    const pal = this.pal();

    if (visual === 'plane') {
      // Slightly larger, cleaner silhouette for mobile readability
      g.roundRect(-18, -6, 38, 12, 5);
      g.fill({ color: pal.accentHot });
      g.moveTo(-2, 0);
      g.lineTo(12, 14);
      g.lineTo(18, 14);
      g.lineTo(8, 0);
      g.fill({ color: pal.accent });
      g.moveTo(-2, 0);
      g.lineTo(12, -14);
      g.lineTo(18, -14);
      g.lineTo(8, 0);
      g.fill({ color: pal.accent, alpha: 0.85 });
      g.moveTo(-16, -5);
      g.lineTo(-22, -14);
      g.lineTo(-10, -5);
      g.fill({ color: 0xffffff });
      g.moveTo(20, -5);
      g.lineTo(32, 0);
      g.lineTo(20, 5);
      g.fill({ color: 0xffffff });
      g.circle(10, -1, 3);
      g.fill({ color: pal.ice });
      // soft engine glow
      g.circle(-18, 0, 4);
      g.fill({ color: pal.gold, alpha: 0.55 });
    } else if (visual === 'rocket') {
      g.roundRect(-8, -18, 16, 30, 6);
      g.fill({ color: 0xf8fafc });
      g.moveTo(-8, -18);
      g.lineTo(0, -30);
      g.lineTo(8, -18);
      g.fill({ color: pal.accentHot });
      g.moveTo(-8, 8);
      g.lineTo(-16, 16);
      g.lineTo(-8, 12);
      g.fill({ color: pal.accent });
      g.moveTo(8, 8);
      g.lineTo(16, 16);
      g.lineTo(8, 12);
      g.fill({ color: pal.accent });
      g.circle(0, -8, 4);
      g.fill({ color: pal.ice });
      g.moveTo(-4, 12);
      g.lineTo(0, 22);
      g.lineTo(4, 12);
      g.fill({ color: pal.gold });
    } else {
      g.circle(0, 0, 14);
      g.fill({ color: pal.accent, alpha: 0.25 });
      g.circle(0, 0, 9);
      g.fill({ color: pal.accent });
      g.circle(-2, -2, 3.5);
      g.fill({ color: 0xffffff, alpha: 0.85 });
      g.circle(0, 0, 16);
      g.stroke({ width: 2, color: pal.gold, alpha: 0.5 });
    }
  }

  private update(deltaMs: number) {
    if (!this.app) return;
    // Clamp delta to avoid huge jumps after tab blur
    const dt = Math.min(40, Math.max(0, deltaMs));
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const { phase, multiplier, countdownRemainingMs, reducedMotion } = this.state;
    const pal = this.pal();
    this.bob += dt * 0.0035;
    this.ambientT += dt;

    // Smooth multiplier for path (removes stair-step jitter from server ticks)
    const multK = reducedMotion ? 18 : 10;
    this.smoothMult = damp(this.smoothMult, Math.max(1, multiplier), multK, dt);

    // Soft gradient sky
    this.sky.clear();
    this.sky.rect(0, 0, w, h);
    this.sky.fill({ color: pal.bg });
    this.sky.ellipse(w * 0.5, h * 0.85, w * 0.7, h * 0.45);
    this.sky.fill({ color: pal.accent, alpha: phase === 'CRASHED' ? 0.12 : 0.06 });
    if (phase === 'FLYING') {
      this.sky.ellipse(w * 0.55, h * 0.35, w * 0.35, h * 0.25);
      this.sky.fill({ color: riskColor(this.smoothMult, pal), alpha: 0.05 });
    }

    // Subtle grid / stars
    this.grid.clear();
    this.grid.setStrokeStyle({ width: 1, color: pal.grid, alpha: 0.04 });
    for (let i = 1; i < 6; i++) {
      const y = h * 0.15 + i * (h * 0.12);
      this.grid.moveTo(0, y);
      this.grid.lineTo(w, y);
    }
    this.grid.stroke();
    if (!reducedMotion) {
      const drift = (this.ambientT * 0.015) % 40;
      for (let i = 0; i < 14; i++) {
        const sx = ((i * 97 + drift * (i % 3 === 0 ? 1 : -0.5)) % (w + 20)) - 10;
        const sy = ((i * 53) % (h * 0.7)) + 10;
        this.grid.circle(sx, sy, 0.8 + (i % 3) * 0.4);
        this.grid.fill({ color: 0xffffff, alpha: 0.08 + (i % 4) * 0.03 });
      }
    }

    const homeX = w * 0.16;
    const homeY = h * 0.72 + Math.sin(this.bob) * (reducedMotion ? 0 : 4);

    let targetX = homeX;
    let targetY = homeY;
    let targetRot = Math.sin(this.bob) * 0.05;
    let targetScale = 1;
    let targetAlpha = 1;
    let posK = 12;
    let rotK = 8;
    let scaleK = 10;

    this.fill.clear();
    this.line.clear();
    this.markers.clear();
    this.countdownRing.clear();

    if (this.returnProgress < 1 && (phase === 'WAITING' || phase === 'COUNTDOWN')) {
      this.returnProgress = Math.min(1, this.returnProgress + dt / 650);
      const e = 1 - Math.pow(1 - this.returnProgress, 3);
      targetX = this.returnFrom.x + (homeX - this.returnFrom.x) * e;
      targetY = this.returnFrom.y + (homeY - this.returnFrom.y) * e;
      posK = 14;
      targetRot = 0;
      targetScale = 1;
    }

    if (phase === 'COUNTDOWN' && countdownRemainingMs > 0) {
      const total = 5000;
      const frac = Math.min(1, Math.max(0, countdownRemainingMs / total));
      const cx = w * 0.5;
      const cy = h * 0.42;
      const r = Math.min(w, h) * 0.1;
      this.countdownRing.circle(cx, cy, r);
      this.countdownRing.stroke({ width: 3, color: 0xffffff, alpha: 0.08 });
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * frac;
      this.countdownRing.moveTo(cx + Math.cos(start) * r, cy + Math.sin(start) * r);
      this.countdownRing.arc(cx, cy, r, start, end, false);
      this.countdownRing.stroke({ width: 4, color: pal.accent, alpha: 0.9 });
      targetScale = 1 + Math.sin(this.bob * 2.2) * 0.05;
    }

    if (phase === 'FLYING' || phase === 'CRASHED') {
      this.flyElapsed += dt;
      const pos = this.flightPos(w, h, this.smoothMult, this.flyElapsed);
      targetX = pos.x;
      targetY = pos.y;
      // Very smooth follow while flying
      posK = reducedMotion ? 20 : 11;
      rotK = 9;
      scaleK = 8;

      // Build path from smoothed positions only (stable curve)
      const last = this.points[this.points.length - 1];
      if (
        !last ||
        Math.hypot(pos.x - last.x, pos.y - last.y) > 1.8 ||
        this.points.length < 2
      ) {
        this.points.push({ x: pos.x, y: pos.y });
        if (this.points.length > 420) this.points.shift();
      }

      if (this.points.length > 1) {
        const crashed = phase === 'CRASHED';
        const col = crashed ? pal.accentHot : riskColor(this.smoothMult, pal);

        this.fill.moveTo(this.points[0].x, h);
        for (const p of this.points) this.fill.lineTo(p.x, p.y);
        this.fill.lineTo(this.points[this.points.length - 1].x, h);
        this.fill.closePath();
        this.fill.fill({ color: col, alpha: crashed ? 0.2 : 0.14 });

        // Smooth-looking stroke via dense points
        this.line.setStrokeStyle({ width: 3.5, color: col, alpha: 1 });
        this.line.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
          this.line.lineTo(this.points[i].x, this.points[i].y);
        }
        this.line.stroke();

        this.line.setStrokeStyle({ width: 10, color: col, alpha: 0.12 });
        this.line.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
          this.line.lineTo(this.points[i].x, this.points[i].y);
        }
        this.line.stroke();
      }

      // Auto cash-out markers
      const autos = this.state.autoMarkers ?? [];
      for (const am of autos) {
        if (am <= 1) continue;
        const my = this.flightPos(w, h, am, this.flyElapsed).y;
        this.markers.setStrokeStyle({
          width: 1,
          color: 0x28a909,
          alpha: this.smoothMult >= am ? 0.15 : 0.45,
        });
        this.markers.moveTo(20, my);
        this.markers.lineTo(w - 20, my);
        this.markers.stroke();
        this.markers.circle(28, my, 3);
        this.markers.fill({ color: 0x28a909, alpha: 0.8 });
      }

      const ghost = this.state.ghostCashOutAt;
      if (ghost != null && ghost > 1) {
        const gy = this.flightPos(w, h, ghost, this.flyElapsed).y;
        this.markers.setStrokeStyle({ width: 1.5, color: pal.gold, alpha: 0.35 });
        this.markers.moveTo(20, gy);
        this.markers.lineTo(w - 20, gy);
        this.markers.stroke();
        this.markers.circle(w - 36, gy, 5);
        this.markers.fill({ color: pal.gold, alpha: 0.35 });
        this.markers.circle(w - 36, gy, 2.5);
        this.markers.fill({ color: pal.gold, alpha: 0.7 });
      }

      if (phase === 'FLYING' && !reducedMotion) {
        for (const ms of [2, 5, 10, 50]) {
          if (multiplier >= ms && !this.milestonesHit.has(ms)) {
            this.milestonesHit.add(ms);
            this.burst(ms >= 10 ? 24 : 14, riskColor(ms, pal));
          }
        }
      }

      const visual = this.state.flightVisual ?? 'orb';
      if (phase === 'FLYING') {
        if (visual === 'orb') {
          targetScale = 1 + Math.min(0.75, Math.log(this.smoothMult) * 0.2);
          targetRot = this.bob * 0.35;
        } else if (visual === 'rocket') {
          targetScale = 1.08;
          // Point along velocity
          const vx = this.displayX - this.prevDisplayX;
          const vy = this.displayY - this.prevDisplayY;
          if (Math.hypot(vx, vy) > 0.05) {
            targetRot = Math.atan2(vy, vx) + Math.PI / 2;
          } else {
            targetRot = -0.2 - Math.min(0.15, (this.smoothMult - 1) * 0.015);
          }
        } else {
          // Plane: nose follows flight path smoothly
          targetScale = 1.12;
          const vx = this.displayX - this.prevDisplayX;
          const vy = this.displayY - this.prevDisplayY;
          if (Math.hypot(vx, vy) > 0.08) {
            targetRot = Math.atan2(vy, vx);
          } else {
            targetRot = -0.35 - Math.min(0.28, (this.smoothMult - 1) * 0.03);
          }
        }
      }

      // Time-based particle emission (no Math.random spam jitter)
      if (phase === 'FLYING' && !reducedMotion) {
        this.particleAccum += dt;
        const interval = visual === 'plane' ? 28 : 36;
        while (this.particleAccum >= interval) {
          this.particleAccum -= interval;
          const backX = Math.cos(this.displayRot) * -14;
          const backY = Math.sin(this.displayRot) * -14;
          this.spawnParticle(
            this.displayX + backX,
            this.displayY + backY,
            -1.6 - Math.random() * 1.2,
            (Math.random() - 0.5) * 1.1,
            riskColor(this.smoothMult, pal),
            260 + Math.random() * 180,
          );
        }
        if (visual === 'orb') {
          this.afterimageAccum += dt;
          if (this.afterimageAccum >= 42) {
            this.afterimageAccum = 0;
            this.spawnAfterimage(this.displayX, this.displayY, riskColor(this.smoothMult, pal));
          }
        }
      }
    } else if (this.returnProgress >= 1) {
      targetX = homeX;
      targetY = homeY;
      posK = 10;
      const visual = this.state.flightVisual ?? 'orb';
      if (visual === 'orb') {
        targetRot = this.bob * 0.45;
      } else if (visual === 'plane') {
        targetRot = Math.sin(this.bob) * 0.08;
      } else {
        targetRot = Math.sin(this.bob) * 0.05;
      }
      if (!reducedMotion) {
        this.particleAccum += dt;
        if (this.particleAccum >= 180) {
          this.particleAccum = 0;
          this.spawnParticle(
            Math.random() * w,
            h + 4,
            (Math.random() - 0.5) * 0.35,
            -0.35 - Math.random() * 0.5,
            pal.accent,
            800 + Math.random() * 500,
          );
        }
      }
    }

    // Crash: smooth dive away (no per-frame random jump)
    if (phase === 'CRASHED' && this.crashAnim > 0) {
      this.crashAnim = Math.max(0, this.crashAnim - dt / 780);
      const t = this.crashAnim;
      targetX += Math.sin(this.ambientT * 0.04) * 6 * t;
      targetY += (1 - t) * 70 + t * 20;
      targetRot = t * 1.15 + 0.2;
      targetAlpha = 0.18 + t * 0.82;
      targetScale = 0.85 + t * 0.2;
      posK = 7;
      rotK = 6;
    }

    // Initialize display position once we know screen size
    if (!this.posInitialized || !Number.isFinite(this.displayX)) {
      this.displayX = targetX;
      this.displayY = targetY;
      this.prevDisplayX = targetX;
      this.prevDisplayY = targetY;
      this.displayRot = targetRot;
      this.displayScale = targetScale;
      this.displayAlpha = targetAlpha;
      this.posInitialized = true;
    }

    this.prevDisplayX = this.displayX;
    this.prevDisplayY = this.displayY;
    this.displayX = damp(this.displayX, targetX, posK, dt);
    this.displayY = damp(this.displayY, targetY, posK, dt);
    this.displayRot = dampAngle(this.displayRot, targetRot, rotK, dt);
    this.displayScale = damp(this.displayScale, targetScale, scaleK, dt);
    this.displayAlpha = damp(this.displayAlpha, targetAlpha, 10, dt);

    // Smooth screen shake (damped random walk, not hard random each frame)
    if (this.shake > 0 && !reducedMotion) {
      this.shake = Math.max(0, this.shake - dt / 320);
      const targetShakeX = (Math.random() - 0.5) * 12 * this.shake;
      const targetShakeY = (Math.random() - 0.5) * 9 * this.shake;
      this.shakeX = damp(this.shakeX, targetShakeX, 28, dt);
      this.shakeY = damp(this.shakeY, targetShakeY, 28, dt);
      this.shakeLayer.x = this.shakeX;
      this.shakeLayer.y = this.shakeY;
    } else {
      this.shakeX = damp(this.shakeX, 0, 20, dt);
      this.shakeY = damp(this.shakeY, 0, 20, dt);
      this.shakeLayer.x = this.shakeX;
      this.shakeLayer.y = this.shakeY;
    }

    this.hero.x = this.displayX;
    this.hero.y = this.displayY;
    this.hero.rotation = this.displayRot;
    this.hero.scale.set(this.displayScale);
    this.hero.alpha = this.displayAlpha;

    // Glow under hero
    this.heroGlow.clear();
    const glowCol =
      phase === 'CRASHED'
        ? pal.accentHot
        : phase === 'FLYING'
          ? riskColor(this.smoothMult, pal)
          : pal.accent;
    const glowR =
      18 * this.displayScale + (phase === 'FLYING' ? Math.min(18, this.smoothMult) : 0);
    this.heroGlow.circle(this.displayX, this.displayY, glowR);
    this.heroGlow.fill({
      color: glowCol,
      alpha: (phase === 'FLYING' ? 0.22 : 0.12) * this.displayAlpha,
    });
    this.heroGlow.circle(this.displayX, this.displayY, glowR * 1.55);
    this.heroGlow.fill({ color: glowCol, alpha: 0.06 * this.displayAlpha });

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.g.x += p.vx * (dt / 16);
      p.g.y += p.vy * (dt / 16);
      p.g.alpha = Math.max(0, p.life / p.max);
      if (p.life <= 0) {
        this.particleLayer.removeChild(p.g);
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i];
      a.life -= dt;
      a.g.alpha = Math.max(0, a.life / 300);
      a.g.scale.set(1 + (1 - a.g.alpha) * 0.35);
      if (a.life <= 0) {
        this.afterimageLayer.removeChild(a.g);
        a.g.destroy();
        this.afterimages.splice(i, 1);
      }
    }
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: number,
    life = 400,
  ) {
    if (this.particles.length > 80) return;
    const g = new Graphics();
    g.circle(0, 0, 1.2 + Math.random() * 2);
    g.fill({ color });
    g.x = x;
    g.y = y;
    this.particleLayer.addChild(g);
    this.particles.push({ g, vx, vy, life, max: life });
  }

  private spawnAfterimage(x: number, y: number, color: number) {
    if (this.afterimages.length > 24) return;
    const g = new Graphics();
    g.circle(0, 0, 8);
    g.fill({ color, alpha: 0.32 });
    g.x = x;
    g.y = y;
    this.afterimageLayer.addChild(g);
    this.afterimages.push({ g, life: 300 });
  }

  private burst(n: number, color?: number) {
    const x = this.displayX || this.hero.x;
    const y = this.displayY || this.hero.y;
    const pal = this.pal();
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.15;
      const c = color ?? (Math.random() > 0.5 ? pal.accentHot : pal.gold);
      this.spawnParticle(
        x,
        y,
        Math.cos(a) * (2 + Math.random() * 4.5),
        Math.sin(a) * (2 + Math.random() * 4.5),
        c,
        320 + Math.random() * 360,
      );
    }
  }
}
