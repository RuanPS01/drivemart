/** Ações de disparo único (tecla pressionada uma vez). */
export type InputAction = 'camera' | 'reset' | 'interact' | 'map' | 'menu' | 'lookBack';

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  lookBack: boolean;
}

const KEYS: Record<string, keyof DriveInput | InputAction> = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'steer',
  ArrowLeft: 'steer',
  KeyD: 'steer',
  ArrowRight: 'steer',
  Space: 'handbrake',
  KeyV: 'lookBack',
  KeyC: 'camera',
  KeyR: 'reset',
  KeyE: 'interact',
  Enter: 'interact',
  KeyM: 'map',
  Escape: 'menu',
};

/**
 * Junta teclado, gamepad e controles de toque num único estado de direção.
 * Quando desativado (modal aberto), zera os comandos e ignora teclas.
 */
export class Input {
  private keys = new Set<string>();
  private touch: Partial<DriveInput> = {};
  private listeners = new Set<(a: InputAction) => void>();
  private prevPad: boolean[] = [];
  enabled = true;

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  onAction(cb: (a: InputAction) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(a: InputAction): void {
    for (const l of this.listeners) l(a);
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return (
      !!t &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    );
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return;
    const mapped = KEYS[e.code];
    if (!mapped) return;
    // Esc e o mapa funcionam mesmo com o carro bloqueado (para fechar modais).
    if (!this.enabled && mapped !== 'menu') return;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (
      !e.repeat &&
      (mapped === 'camera' ||
        mapped === 'reset' ||
        mapped === 'interact' ||
        mapped === 'map' ||
        mapped === 'menu')
    ) {
      this.emit(mapped);
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
  };

  /** Controles de toque (chamado pela interface React). */
  setTouch(state: Partial<DriveInput>): void {
    this.touch = { ...this.touch, ...state };
  }

  /** Lê o estado atual (inclui o gamepad, consultado a cada quadro). */
  read(): DriveInput {
    const out: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, lookBack: false };
    if (!this.enabled) return out;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) out.throttle = 1;
    if (k.has('KeyS') || k.has('ArrowDown')) out.brake = 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) out.steer += 1;
    if (k.has('KeyD') || k.has('ArrowRight')) out.steer -= 1;
    out.handbrake = k.has('Space');
    out.lookBack = k.has('KeyV');

    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const b = (i: number) => pad.buttons[i]?.value ?? 0;
      out.throttle = Math.max(out.throttle, b(7));
      out.brake = Math.max(out.brake, b(6));
      const sx = pad.axes[0] ?? 0;
      if (Math.abs(sx) > 0.15) out.steer = -sx;
      out.handbrake ||= b(0) > 0.5;
      out.lookBack ||= b(4) > 0.5;
      const pressed = [b(3) > 0.5, b(1) > 0.5, b(2) > 0.5, b(9) > 0.5, b(8) > 0.5];
      const actions: InputAction[] = ['camera', 'interact', 'reset', 'menu', 'map'];
      pressed.forEach((p, i) => {
        if (p && !this.prevPad[i]) this.emit(actions[i]!);
      });
      this.prevPad = pressed;
      break;
    }

    const t = this.touch;
    if (t.throttle) out.throttle = Math.max(out.throttle, t.throttle);
    if (t.brake) out.brake = Math.max(out.brake, t.brake);
    if (t.steer) out.steer = t.steer;
    if (t.handbrake) out.handbrake = true;
    return out;
  }
}
