export type Direction = 'down' | 'up' | 'left' | 'right';

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowDown: 'down', KeyS: 'down',
  ArrowUp: 'up', KeyW: 'up',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

const RUN_KEYS = new Set(['ShiftLeft', 'ShiftRight']);
const ACTION_KEYS = new Set(['Space']);

export const DIR_VECTORS: Record<Direction, { dx: number; dy: number }> = {
  down: { dx: 0, dy: 1 },
  up: { dx: 0, dy: -1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export function toWorldStep(
  screenX: number,
  screenY: number,
  cameraYaw: number,
): { dx: number; dy: number } {
  const forward = -screenY;
  const worldX = forward * -Math.sin(cameraYaw) + screenX * Math.cos(cameraYaw);
  const worldY = forward * -Math.cos(cameraYaw) - screenX * Math.sin(cameraYaw);
  return { dx: Math.round(worldX), dy: Math.round(worldY) };
}

export function toScreenDirection(direction: Direction, cameraYaw: number): Direction {
  const { dx: worldX, dy: worldY } = DIR_VECTORS[direction];
  const screenX = worldX * Math.cos(cameraYaw) - worldY * Math.sin(cameraYaw);
  const screenY = worldX * Math.sin(cameraYaw) + worldY * Math.cos(cameraYaw);
  if (Math.abs(screenX) > Math.abs(screenY)) return screenX > 0 ? 'right' : 'left';
  return screenY > 0 ? 'down' : 'up';
}

/**
 * Unified desktop + mobile input.
 * Mobile controls feed the same movement/action state as the keyboard so all
 * collision, encounters, scripted movement and camera-relative movement stay intact.
 */
export class Input {
  private readonly held: Direction[] = [];
  private readonly pressedKeys = new Set<string>();
  private readonly pressedRunKeys = new Set<string>();
  private actionQueued = false;
  private actionHeld = false;

  private mobileX = 0;
  private mobileY = 0;
  private mobileRun = false;
  private mobileActionHeld = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (ACTION_KEYS.has(e.code)) {
        e.preventDefault();
        if (!this.actionHeld) this.actionQueued = true;
        this.actionHeld = true;
        return;
      }
      if (RUN_KEYS.has(e.code)) {
        this.pressedRunKeys.add(e.code);
        return;
      }
      const dir = KEY_TO_DIR[e.code];
      if (!dir || this.pressedKeys.has(e.code)) return;
      this.pressedKeys.add(e.code);
      this.held.push(dir);
    });

    window.addEventListener('keyup', (e) => {
      if (ACTION_KEYS.has(e.code)) {
        e.preventDefault();
        this.actionHeld = false;
        return;
      }
      if (RUN_KEYS.has(e.code)) {
        this.pressedRunKeys.delete(e.code);
        return;
      }
      const dir = KEY_TO_DIR[e.code];
      if (!dir) return;
      this.pressedKeys.delete(e.code);
      const stillHeld = [...this.pressedKeys].some((k) => KEY_TO_DIR[k] === dir);
      if (!stillHeld) {
        const i = this.held.lastIndexOf(dir);
        if (i >= 0) this.held.splice(i, 1);
      }
    });

    window.addEventListener('blur', () => this.reset());
    this.installMobileControls();
  }

  get direction(): Direction | null {
    if (this.held.length) return this.held[this.held.length - 1];
    const { x, y } = this.vector;
    if (Math.abs(x) < 0.18 && Math.abs(y) < 0.18) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }

  get vector(): { x: number; y: number } {
    const isHeld = (direction: Direction) =>
      [...this.pressedKeys].some((key) => KEY_TO_DIR[key] === direction);

    const keyboardX = Number(isHeld('right')) - Number(isHeld('left'));
    const keyboardY = Number(isHeld('down')) - Number(isHeld('up'));

    return {
      x: Math.max(-1, Math.min(1, keyboardX + this.mobileX)),
      y: Math.max(-1, Math.min(1, keyboardY + this.mobileY)),
    };
  }

  get running(): boolean {
    return this.pressedRunKeys.size > 0 || this.mobileRun;
  }

  consumeAction(): boolean {
    const queued = this.actionQueued;
    this.actionQueued = false;
    return queued;
  }

  private reset(): void {
    this.held.length = 0;
    this.pressedKeys.clear();
    this.pressedRunKeys.clear();
    this.actionHeld = false;
    this.actionQueued = false;
    this.mobileX = 0;
    this.mobileY = 0;
    this.mobileRun = false;
    this.mobileActionHeld = false;
  }

  private installMobileControls(): void {
    if (document.querySelector('#meowa-mobile-controls')) return;

    const style = document.createElement('style');
    style.id = 'meowa-mobile-controls-style';
    style.textContent = `
      #meowa-mobile-controls{display:none;position:fixed;inset:0;z-index:45;pointer-events:none;
        font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;user-select:none;-webkit-user-select:none}
      #meowa-mobile-controls .joy-zone{position:absolute;left:max(18px,env(safe-area-inset-left));
        bottom:max(22px,calc(env(safe-area-inset-bottom) + 18px));width:150px;height:150px;pointer-events:auto;
        touch-action:none}
      #meowa-mobile-controls .joy-base{position:absolute;inset:12px;border:2px solid rgba(255,255,255,.38);
        border-radius:50%;background:rgba(10,20,23,.28);box-shadow:inset 0 0 24px rgba(0,0,0,.3),0 5px 22px rgba(0,0,0,.22);
        backdrop-filter:blur(4px)}
      #meowa-mobile-controls .joy-knob{position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px;
        border-radius:50%;border:2px solid rgba(255,255,255,.7);background:rgba(239,255,250,.28);
        box-shadow:0 5px 18px rgba(0,0,0,.32);transform:translate3d(0,0,0);will-change:transform}
      #meowa-mobile-controls .buttons{position:absolute;right:max(18px,env(safe-area-inset-right));
        bottom:max(24px,calc(env(safe-area-inset-bottom) + 18px));width:170px;height:146px;pointer-events:none}
      #meowa-mobile-controls button{position:absolute;border:2px solid rgba(255,255,255,.7);color:#fff;
        background:rgba(18,35,38,.58);box-shadow:0 6px 18px rgba(0,0,0,.3);backdrop-filter:blur(5px);
        font-weight:900;letter-spacing:.04em;pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent}
      #meowa-mobile-controls .action{right:0;bottom:42px;width:78px;height:78px;border-radius:50%;font-size:28px}
      #meowa-mobile-controls .run{right:82px;bottom:0;width:68px;height:68px;border-radius:50%;font-size:22px}
      #meowa-mobile-controls button.active{transform:scale(.92);background:rgba(86,180,151,.62)}
      #meowa-mobile-controls .mobile-hint{position:absolute;left:50%;transform:translateX(-50%);
        bottom:max(10px,env(safe-area-inset-bottom));padding:5px 10px;border-radius:999px;color:rgba(255,255,255,.72);
        background:rgba(0,0,0,.22);font:700 10px/1 monospace;letter-spacing:.08em;pointer-events:none}
      body.battle-active #meowa-mobile-controls{display:none!important}
      @media (pointer:coarse),(max-width:900px){
        #meowa-mobile-controls{display:block}
        body{overscroll-behavior:none}
        canvas{touch-action:none}
      }
      @media (max-height:520px) and (orientation:landscape){
        #meowa-mobile-controls .joy-zone{width:126px;height:126px}
        #meowa-mobile-controls .buttons{transform:scale(.86);transform-origin:right bottom}
        #meowa-mobile-controls .mobile-hint{display:none}
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'meowa-mobile-controls';
    root.setAttribute('aria-label', 'Mobile game controls');
    root.innerHTML = `
      <div class="joy-zone" aria-label="Movement joystick">
        <div class="joy-base"></div>
        <div class="joy-knob"></div>
      </div>
      <div class="buttons">
        <button type="button" class="run" aria-label="Run">B</button>
        <button type="button" class="action" aria-label="Action">A</button>
      </div>
      <div class="mobile-hint">MOVE / RUN / ACTION</div>
    `;
    document.body.appendChild(root);

    const zone = root.querySelector<HTMLElement>('.joy-zone')!;
    const knob = root.querySelector<HTMLElement>('.joy-knob')!;
    const action = root.querySelector<HTMLButtonElement>('.action')!;
    const run = root.querySelector<HTMLButtonElement>('.run')!;

    let joyPointer: number | null = null;
    const updateJoy = (event: PointerEvent) => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = Math.min(rect.width, rect.height) * 0.34;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const length = Math.hypot(dx, dy);
      if (length > radius && length > 0) {
        dx = dx / length * radius;
        dy = dy / length * radius;
      }
      const dead = radius * 0.18;
      const magnitude = Math.hypot(dx, dy);
      if (magnitude < dead) {
        this.mobileX = 0;
        this.mobileY = 0;
      } else {
        const normalized = Math.min(1, (magnitude - dead) / Math.max(1, radius - dead));
        this.mobileX = dx / Math.max(1, magnitude) * normalized;
        this.mobileY = dy / Math.max(1, magnitude) * normalized;
      }
      knob.style.transform = `translate3d(${dx}px,${dy}px,0)`;
    };
    const releaseJoy = (event?: PointerEvent) => {
      if (event && joyPointer !== event.pointerId) return;
      joyPointer = null;
      this.mobileX = 0;
      this.mobileY = 0;
      knob.style.transform = 'translate3d(0,0,0)';
    };

    zone.addEventListener('pointerdown', (event) => {
      joyPointer = event.pointerId;
      zone.setPointerCapture(event.pointerId);
      updateJoy(event);
    });
    zone.addEventListener('pointermove', (event) => {
      if (joyPointer === event.pointerId) updateJoy(event);
    });
    zone.addEventListener('pointerup', releaseJoy);
    zone.addEventListener('pointercancel', releaseJoy);
    zone.addEventListener('contextmenu', (event) => event.preventDefault());

    const pressAction = (event: PointerEvent) => {
      event.preventDefault();
      if (!this.mobileActionHeld) this.actionQueued = true;
      this.mobileActionHeld = true;
      action.classList.add('active');
      action.setPointerCapture(event.pointerId);
    };
    const releaseAction = (event: PointerEvent) => {
      event.preventDefault();
      this.mobileActionHeld = false;
      action.classList.remove('active');
    };
    action.addEventListener('pointerdown', pressAction);
    action.addEventListener('pointerup', releaseAction);
    action.addEventListener('pointercancel', releaseAction);

    const pressRun = (event: PointerEvent) => {
      event.preventDefault();
      this.mobileRun = true;
      run.classList.add('active');
      run.setPointerCapture(event.pointerId);
    };
    const releaseRun = (event: PointerEvent) => {
      event.preventDefault();
      this.mobileRun = false;
      run.classList.remove('active');
    };
    run.addEventListener('pointerdown', pressRun);
    run.addEventListener('pointerup', releaseRun);
    run.addEventListener('pointercancel', releaseRun);
  }
}
