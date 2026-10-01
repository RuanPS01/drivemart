/** Ícones desenhados em SVG (sem caracteres especiais no texto). */

export function TriangleIcon({ dir, size = 28 }: { dir: 'left' | 'right'; size?: number }) {
  const points = dir === 'left' ? '17,4 5,12 17,20' : '7,4 19,12 7,20';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

export function GearIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.3 2h3.4l.5 2.6a8 8 0 0 1 2 1.1l2.5-.9 1.7 2.9-2 1.8a8 8 0 0 1 0 2.4l2 1.8-1.7 2.9-2.5-.9a8 8 0 0 1-2 1.1l-.5 2.6h-3.4l-.5-2.6a8 8 0 0 1-2-1.1l-2.5.9-1.7-2.9 2-1.8a8 8 0 0 1 0-2.4l-2-1.8 1.7-2.9 2.5.9a8 8 0 0 1 2-1.1zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
      />
    </svg>
  );
}

export function CaretIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" className="caret">
      <polygon points="1,3 9,3 5,8" fill="currentColor" />
    </svg>
  );
}
