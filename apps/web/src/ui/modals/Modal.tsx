import { useEffect, useRef, type ReactNode } from 'react';
import { useUi } from '../../state/uiStore';

/** Janela sobreposta ao jogo. Esc ou clique fora fecham (quando `dismissable`). */
export function Modal({
  title,
  children,
  wide,
  dismissable = true,
  onClose,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
  dismissable?: boolean;
  onClose?: () => void;
}) {
  const close = useUi((s) => s.close);
  const ref = useRef<HTMLDivElement>(null);
  const doClose = onClose ?? close;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) doClose();
    };
    window.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, button, select, textarea');
    first?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissable, doClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && dismissable && doClose()}
    >
      <div
        ref={ref}
        className={`modal panel${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          {dismissable && (
            <button className="modal-close" onClick={doClose} aria-label="Fechar">
              ×
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
