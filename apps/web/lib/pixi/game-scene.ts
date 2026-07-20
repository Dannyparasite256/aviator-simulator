import {
  Application,
  Container,
  Graphics,
  Ticker,
} from 'pixi.js';

export interface SceneState {
  phase: 'WAITING' | 'COUNTDOWN' | 'FLYING' | 'CRASHED';
  multiplier: number;
  countdownRemainingMs: number;
  crashPoint: number | null;
  growthRate?: number;
}

/**
 * Aviator-style flight stage: dark sky, pink/red trail curve, plane sprite.
 */
export class GameScene {
  private app: Application | null = null;
  private root = new Container();
  private grid = new Graphics();
  private fill = new Graphics();
  private line = new Graphics();
  private aircraft = new Graphics();
  private particles: Array<{ g: Graphics; vx: number; vy: number; life: number }> = [];
  private particleLayer = new Container();
  private state: SceneState = {
    phase: 'WAITING',
    multiplier: 1,
    countdownRemainingMs: 0,
    crashPoint: null,
  };
  private points: Array<{ x: number; y: number }> = [];
  private flyElapsed = 0;
  private crashAnim = 0;
  private mounted = false;
  private bob = 0;

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
    // Ensure canvas fills host
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.appendChild(canvas);
    this.app = app;
    this.mounted = true;

    app.stage.addChild(this.root);
    this.root.addChild(this.grid);
    this.root.addChild(this.fill);
    this.root.addChild(this.line);
    this.root.addChild(this.particleLayer);
    this.root.addChild(this.aircraft);

    Ticker.shared.maxFPS = targetFps;
    app.ticker.maxFPS = targetFps;
    app.ticker.add((ticker) => this.update(ticker.deltaMS));

    this.drawPlane();
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
  }

  setState(partial: Partial<SceneState>) {
    const prev = this.state.phase;
    this.state = { ...this.state, ...partial };
    if (this.state.phase === 'FLYING' && prev !== 'FLYING') {
      this.points = [];
      this.flyElapsed = 0;
      this.crashAnim = 0;
      this.aircraft.alpha = 1;
      this.aircraft.rotation = -0.35;
    }
    if (this.state.phase === 'CRASHED' && prev !== 'CRASHED') {
      this.crashAnim = 1;
      this.burst(32);
    }
    if (this.state.phase === 'WAITING' || this.state.phase === 'COUNTDOWN') {
      this.points = [];
      this.flyElapsed = 0;
      this.aircraft.alpha = 1;
    }
  }

  private drawPlane() {
    const g = this.aircraft;
    g.clear();
    // Body
    g.roundRect(-16, -5, 34, 10, 4);
    g.fill({ color: 0xe31c3d });
    // Wing
    g.moveTo(-2, 0);
    g.lineTo(10, 12);
    g.lineTo(16, 12);
    g.lineTo(6, 0);
    g.fill({ color: 0xff2d55 });
    // Tail
    g.moveTo(-14, -4);
    g.lineTo(-20, -12);
    g.lineTo(-10, -4);
    g.fill({ color: 0xffffff });
    // Nose
    g.moveTo(18, -4);
    g.lineTo(28, 0);
    g.lineTo(18, 4);
    g.fill({ color: 0xffffff });
    // Window
    g.circle(8, -1, 2.5);
    g.fill({ color: 0x7dd3fc });
  }

  private update(deltaMs: number) {
    if (!this.app) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const { phase, multiplier } = this.state;
    this.bob += deltaMs * 0.004;

    // Subtle grid
    this.grid.clear();
    this.grid.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.04 });
    for (let i = 1; i < 6; i++) {
      const y = h * 0.15 + i * (h * 0.12);
      this.grid.moveTo(0, y);
      this.grid.lineTo(w, y);
    }
    this.grid.stroke();

    let ax = w * 0.14;
    let ay = h * 0.72;

    this.fill.clear();
    this.line.clear();

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
        const col = crashed ? 0xe31c3d : 0xff2d55;

        // Under curve fill
        this.fill.moveTo(this.points[0].x, h);
        for (const p of this.points) this.fill.lineTo(p.x, p.y);
        this.fill.lineTo(this.points[this.points.length - 1].x, h);
        this.fill.closePath();
        this.fill.fill({ color: col, alpha: crashed ? 0.18 : 0.14 });

        // Main stroke
        this.line.setStrokeStyle({ width: 3.5, color: col, alpha: 1 });
        this.line.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
          this.line.lineTo(this.points[i].x, this.points[i].y);
        }
        this.line.stroke();
      }

      if (phase === 'FLYING' && Math.random() < 0.5) {
        this.spawnParticle(ax - 14, ay, -2 - Math.random(), (Math.random() - 0.5) * 1.4, 0xff6b8a);
      }
    } else {
      ax = w * 0.16;
      ay = h * 0.7 + Math.sin(this.bob) * 5;
    }

    if (phase === 'CRASHED' && this.crashAnim > 0) {
      this.crashAnim = Math.max(0, this.crashAnim - deltaMs / 700);
      ax += (Math.random() - 0.5) * 10;
      ay += this.crashAnim * 50;
      this.aircraft.rotation = this.crashAnim * 1.4;
      this.aircraft.alpha = 0.25 + this.crashAnim * 0.75;
    } else if (phase === 'FLYING') {
      this.aircraft.rotation = -0.4 - Math.min(0.35, (multiplier - 1) * 0.04);
      this.aircraft.alpha = 1;
    } else {
      this.aircraft.rotation = Math.sin(this.bob) * 0.06;
      this.aircraft.alpha = 1;
    }

    this.aircraft.x = ax;
    this.aircraft.y = ay;
    this.aircraft.scale.set(phase === 'FLYING' ? 1.15 : 1);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaMs;
      p.g.x += p.vx * (deltaMs / 16);
      p.g.y += p.vy * (deltaMs / 16);
      p.g.alpha = Math.max(0, p.life / 500);
      if (p.life <= 0) {
        this.particleLayer.removeChild(p.g);
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  private spawnParticle(x: number, y: number, vx: number, vy: number, color: number) {
    const g = new Graphics();
    g.circle(0, 0, 1.2 + Math.random() * 2);
    g.fill({ color });
    g.x = x;
    g.y = y;
    this.particleLayer.addChild(g);
    this.particles.push({ g, vx, vy, life: 350 + Math.random() * 350 });
  }

  private burst(n: number) {
    const x = this.aircraft.x;
    const y = this.aircraft.y;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      this.spawnParticle(
        x,
        y,
        Math.cos(a) * (2 + Math.random() * 4),
        Math.sin(a) * (2 + Math.random() * 4),
        Math.random() > 0.5 ? 0xe31c3d : 0xffc857,
      );
    }
  }
}
