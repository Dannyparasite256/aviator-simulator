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
  /** Auto cash-out markers (multipliers) */
  autoMarkers?: number[];
  /** Ghost marker for last personal cash-out */
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

/**
 * Aviator-style flight stage: dark sky, trail curve, orb/plane/rocket hero.
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
  private mounted = false;
  private bob = 0;
  private ambientT = 0;
  private milestonesHit = new Set<number>();
  private returnProgress = 1;
  private lastAx = 0;
  private lastAy = 0;
  private returnFrom = { x: 0, y: 0 };

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
    /* resizeTo handles canvas; redraw next frame */
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
      this.hero.alpha = 1;
      this.hero.rotation = 0;
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
      this.returnFrom = { x: this.lastAx, y: this.lastAy };
      this.returnProgress = 0;
      this.points = [];
      this.flyElapsed = 0;
      this.hero.alpha = 1;
      this.hero.rotation = 0;
    }
  }

  private pal(): ThemePalette {
    return THEMES[this.state.colorTheme ?? 'classic'];
  }

  private drawHero() {
    const g = this.hero;
    g.clear();
    const visual = this.state.flightVisual ?? 'orb';
    const pal = this.pal();

    if (visual === 'plane') {
      g.roundRect(-16, -5, 34, 10, 4);
      g.fill({ color: pal.accentHot });
      g.moveTo(-2, 0);
      g.lineTo(10, 12);
      g.lineTo(16, 12);
      g.lineTo(6, 0);
      g.fill({ color: pal.accent });
      g.moveTo(-14, -4);
      g.lineTo(-20, -12);
      g.lineTo(-10, -4);
      g.fill({ color: 0xffffff });
      g.moveTo(18, -4);
      g.lineTo(28, 0);
      g.lineTo(18, 4);
      g.fill({ color: 0xffffff });
      g.circle(8, -1, 2.5);
      g.fill({ color: pal.ice });
    } else if (visual === 'rocket') {
      // Body
      g.roundRect(-8, -18, 16, 30, 6);
      g.fill({ color: 0xf8fafc });
      // Nose
      g.moveTo(-8, -18);
      g.lineTo(0, -30);
      g.lineTo(8, -18);
      g.fill({ color: pal.accentHot });
      // Fins
      g.moveTo(-8, 8);
      g.lineTo(-16, 16);
      g.lineTo(-8, 12);
      g.fill({ color: pal.accent });
      g.moveTo(8, 8);
      g.lineTo(16, 16);
      g.lineTo(8, 12);
      g.fill({ color: pal.accent });
      // Window
      g.circle(0, -8, 4);
      g.fill({ color: pal.ice });
      // Flame base
      g.moveTo(-4, 12);
      g.lineTo(0, 22);
      g.lineTo(4, 12);
      g.fill({ color: pal.gold });
    } else {
      // Orb / energy ball — core + rings
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
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const { phase, multiplier, countdownRemainingMs, reducedMotion } = this.state;
    const pal = this.pal();
    this.bob += deltaMs * 0.004;
    this.ambientT += deltaMs;

    // Soft gradient sky
    this.sky.clear();
    this.sky.rect(0, 0, w, h);
    this.sky.fill({ color: pal.bg });
    // Upper wash
    this.sky.ellipse(w * 0.5, h * 0.85, w * 0.7, h * 0.45);
    this.sky.fill({ color: pal.accent, alpha: phase === 'CRASHED' ? 0.12 : 0.06 });
    if (phase === 'FLYING') {
      this.sky.ellipse(w * 0.55, h * 0.35, w * 0.35, h * 0.25);
      this.sky.fill({ color: riskColor(multiplier, pal), alpha: 0.05 });
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
    // Parallax star dots
    if (!reducedMotion) {
      const drift = (this.ambientT * 0.02) % 40;
      for (let i = 0; i < 18; i++) {
        const sx = ((i * 97 + drift * (i % 3 === 0 ? 1 : -0.5)) % (w + 20)) - 10;
        const sy = ((i * 53) % (h * 0.7)) + 10;
        this.grid.circle(sx, sy, 0.8 + (i % 3) * 0.4);
        this.grid.fill({ color: 0xffffff, alpha: 0.08 + (i % 4) * 0.03 });
      }
    }

    // Home / rest position
    let homeX = w * 0.16;
    let homeY = h * 0.7 + Math.sin(this.bob) * (reducedMotion ? 0 : 5);
    let ax = homeX;
    let ay = homeY;

    this.fill.clear();
    this.line.clear();
    this.markers.clear();
    this.countdownRing.clear();

    // Smooth return after crash
    if (this.returnProgress < 1 && (phase === 'WAITING' || phase === 'COUNTDOWN')) {
      this.returnProgress = Math.min(1, this.returnProgress + deltaMs / 550);
      const e = 1 - Math.pow(1 - this.returnProgress, 3);
      ax = this.returnFrom.x + (homeX - this.returnFrom.x) * e;
      ay = this.returnFrom.y + (homeY - this.returnFrom.y) * e;
    }

    if (phase === 'COUNTDOWN' && countdownRemainingMs > 0) {
      const total = 5000; // approximate; ring uses remaining
      const frac = Math.min(1, Math.max(0, countdownRemainingMs / total));
      const cx = w * 0.5;
      const cy = h * 0.42;
      const r = Math.min(w, h) * 0.12;
      this.countdownRing.circle(cx, cy, r);
      this.countdownRing.stroke({ width: 3, color: 0xffffff, alpha: 0.08 });
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * frac;
      this.countdownRing.moveTo(cx + Math.cos(start) * r, cy + Math.sin(start) * r);
      this.countdownRing.arc(cx, cy, r, start, end, false);
      this.countdownRing.stroke({ width: 4, color: pal.accent, alpha: 0.9 });
    }

    if (phase === 'FLYING' || phase === 'CRASHED') {
      this.flyElapsed += deltaMs;
      const progress = Math.min(1, this.flyElapsed / 14000);
      const logM = Math.log(Math.max(1, multiplier)) / Math.log(50);
      const px = 24 + progress * (w - 60) * Math.min(1, 0.4 + logM * 0.85);
      const py =
        h * 0.78 -
        Math.min(h * 0.55, (multiplier - 1) * (h * 0.07) + progress * h * 0.28);
      this.points.push({ x: px, y: py });
      if (this.points.length > 500) this.points.shift();
      ax = px;
      ay = py;

      if (this.points.length > 1) {
        const crashed = phase === 'CRASHED';
        const col = crashed ? pal.accentHot : riskColor(multiplier, pal);

        this.fill.moveTo(this.points[0].x, h);
        for (const p of this.points) this.fill.lineTo(p.x, p.y);
        this.fill.lineTo(this.points[this.points.length - 1].x, h);
        this.fill.closePath();
        this.fill.fill({ color: col, alpha: crashed ? 0.2 : 0.14 });

        this.line.setStrokeStyle({ width: 3.5, color: col, alpha: 1 });
        this.line.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
          this.line.lineTo(this.points[i].x, this.points[i].y);
        }
        this.line.stroke();

        // Soft outer glow trail
        this.line.setStrokeStyle({ width: 10, color: col, alpha: 0.12 });
        this.line.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
          this.line.lineTo(this.points[i].x, this.points[i].y);
        }
        this.line.stroke();
      }

      // Auto cash-out horizontal markers
      const autos = this.state.autoMarkers ?? [];
      for (const am of autos) {
        if (am <= 1) continue;
        const my =
          h * 0.78 -
          Math.min(h * 0.55, (am - 1) * (h * 0.07) + Math.min(1, this.flyElapsed / 14000) * h * 0.28);
        this.markers.setStrokeStyle({
          width: 1,
          color: 0x28a909,
          alpha: multiplier >= am ? 0.15 : 0.45,
        });
        this.markers.moveTo(20, my);
        this.markers.lineTo(w - 20, my);
        this.markers.stroke();
        // small dash label marker
        this.markers.circle(28, my, 3);
        this.markers.fill({ color: 0x28a909, alpha: 0.8 });
      }

      // Ghost last cash-out
      const ghost = this.state.ghostCashOutAt;
      if (ghost != null && ghost > 1) {
        const gy =
          h * 0.78 -
          Math.min(
            h * 0.55,
            (ghost - 1) * (h * 0.07) + Math.min(1, this.flyElapsed / 14000) * h * 0.28,
          );
        this.markers.setStrokeStyle({ width: 1.5, color: pal.gold, alpha: 0.35 });
        this.markers.moveTo(20, gy);
        this.markers.lineTo(w - 20, gy);
        this.markers.stroke();
        this.markers.circle(w - 36, gy, 5);
        this.markers.fill({ color: pal.gold, alpha: 0.35 });
        this.markers.circle(w - 36, gy, 2.5);
        this.markers.fill({ color: pal.gold, alpha: 0.7 });
      }

      // Milestone fireworks
      if (phase === 'FLYING' && !reducedMotion) {
        for (const ms of [2, 5, 10, 50]) {
          if (multiplier >= ms && !this.milestonesHit.has(ms)) {
            this.milestonesHit.add(ms);
            this.burst(ms >= 10 ? 28 : 16, riskColor(ms, pal));
          }
        }
      }

      if (phase === 'FLYING' && !reducedMotion && Math.random() < 0.55) {
        this.spawnParticle(
          ax - 10,
          ay,
          -2 - Math.random() * 2,
          (Math.random() - 0.5) * 1.6,
          riskColor(multiplier, pal),
          280 + Math.random() * 200,
        );
      }

      // Afterimages for orb
      if (
        phase === 'FLYING' &&
        !reducedMotion &&
        (this.state.flightVisual ?? 'orb') === 'orb' &&
        Math.random() < 0.35
      ) {
        this.spawnAfterimage(ax, ay, riskColor(multiplier, pal));
      }
    } else if (this.returnProgress >= 1) {
      ax = homeX;
      ay = homeY;
      // Ambient idle particles
      if (!reducedMotion && Math.random() < 0.08) {
        this.spawnParticle(
          Math.random() * w,
          h + 4,
          (Math.random() - 0.5) * 0.4,
          -0.4 - Math.random() * 0.6,
          pal.accent,
          900 + Math.random() * 600,
        );
      }
    }

    // Crash animation
    if (phase === 'CRASHED' && this.crashAnim > 0) {
      this.crashAnim = Math.max(0, this.crashAnim - deltaMs / 700);
      if (!reducedMotion) {
        ax += (Math.random() - 0.5) * 12;
        ay += this.crashAnim * 55;
        this.hero.rotation = this.crashAnim * 1.5;
      }
      this.hero.alpha = 0.2 + this.crashAnim * 0.8;
    } else if (phase === 'FLYING') {
      const visual = this.state.flightVisual ?? 'orb';
      if (visual === 'plane') {
        this.hero.rotation = -0.4 - Math.min(0.35, (multiplier - 1) * 0.04);
      } else if (visual === 'rocket') {
        this.hero.rotation = -0.15 - Math.min(0.2, (multiplier - 1) * 0.02);
      } else {
        this.hero.rotation = this.bob * 0.4;
      }
      this.hero.alpha = 1;
    } else {
      this.hero.rotation =
        (this.state.flightVisual ?? 'orb') === 'orb'
          ? this.bob * 0.5
          : Math.sin(this.bob) * 0.06;
      this.hero.alpha = 1;
    }

    // Screen shake
    if (this.shake > 0 && !reducedMotion) {
      this.shake = Math.max(0, this.shake - deltaMs / 280);
      this.shakeLayer.x = (Math.random() - 0.5) * 14 * this.shake;
      this.shakeLayer.y = (Math.random() - 0.5) * 10 * this.shake;
    } else {
      this.shakeLayer.x = 0;
      this.shakeLayer.y = 0;
    }

    this.lastAx = ax;
    this.lastAy = ay;
    this.hero.x = ax;
    this.hero.y = ay;

    // Scale by multiplier for orb
    const visual = this.state.flightVisual ?? 'orb';
    let scale = 1;
    if (phase === 'FLYING') {
      if (visual === 'orb') {
        scale = 1 + Math.min(0.85, Math.log(multiplier) * 0.22);
      } else {
        scale = 1.12;
      }
    } else if (phase === 'COUNTDOWN') {
      scale = 1 + Math.sin(this.bob * 2) * 0.06;
    }
    this.hero.scale.set(scale);

    // Glow under hero
    this.heroGlow.clear();
    const glowCol =
      phase === 'CRASHED'
        ? pal.accentHot
        : phase === 'FLYING'
          ? riskColor(multiplier, pal)
          : pal.accent;
    const glowR = 18 * scale + (phase === 'FLYING' ? Math.min(20, multiplier) : 0);
    this.heroGlow.circle(ax, ay, glowR);
    this.heroGlow.fill({ color: glowCol, alpha: phase === 'FLYING' ? 0.22 : 0.12 });
    this.heroGlow.circle(ax, ay, glowR * 1.6);
    this.heroGlow.fill({ color: glowCol, alpha: 0.06 });

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaMs;
      p.g.x += p.vx * (deltaMs / 16);
      p.g.y += p.vy * (deltaMs / 16);
      p.g.alpha = Math.max(0, p.life / p.max);
      if (p.life <= 0) {
        this.particleLayer.removeChild(p.g);
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }

    // Afterimages
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i];
      a.life -= deltaMs;
      a.g.alpha = Math.max(0, a.life / 280);
      a.g.scale.set(1 + (1 - a.g.alpha) * 0.4);
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
    const g = new Graphics();
    g.circle(0, 0, 1.2 + Math.random() * 2.2);
    g.fill({ color });
    g.x = x;
    g.y = y;
    this.particleLayer.addChild(g);
    this.particles.push({ g, vx, vy, life, max: life });
  }

  private spawnAfterimage(x: number, y: number, color: number) {
    const g = new Graphics();
    g.circle(0, 0, 8);
    g.fill({ color, alpha: 0.35 });
    g.x = x;
    g.y = y;
    this.afterimageLayer.addChild(g);
    this.afterimages.push({ g, life: 280 });
  }

  private burst(n: number, color?: number) {
    const x = this.hero.x;
    const y = this.hero.y;
    const pal = this.pal();
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const c =
        color ??
        (Math.random() > 0.5 ? pal.accentHot : pal.gold);
      this.spawnParticle(
        x,
        y,
        Math.cos(a) * (2 + Math.random() * 5),
        Math.sin(a) * (2 + Math.random() * 5),
        c,
        350 + Math.random() * 400,
      );
    }
  }
}
