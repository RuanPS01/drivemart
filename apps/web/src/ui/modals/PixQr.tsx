import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useUi } from '../../state/uiStore';

/** QR Code do Pix com o botão "copia e cola". */
export function PixQr({ code, base64, label }: { code: string; base64?: string | null; label?: string }) {
  const [src, setSrc] = useState<string | null>(base64 ? `data:image/png;base64,${base64}` : null);
  const toast = useUi((s) => s.toast);

  useEffect(() => {
    if (base64) return;
    let alive = true;
    QRCode.toDataURL(code, { margin: 1, width: 260, errorCorrectionLevel: 'M' })
      .then((url) => alive && setSrc(url))
      .catch(() => setSrc(null));
    return () => {
      alive = false;
    };
  }, [code, base64]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Código Pix copiado.', 'ok');
    } catch {
      toast('Não foi possível copiar. Selecione o código e copie manualmente.', 'error');
    }
  };

  return (
    <div className="pix">
      {label && <p className="pix-label">{label}</p>}
      {src ? (
        <img className="pix-qr" src={src} alt="QR Code do Pix" width={220} height={220} />
      ) : (
        <div className="pix-qr" />
      )}
      <textarea
        className="pix-code"
        readOnly
        value={code}
        rows={3}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button className="btn" onClick={copy}>
        Copiar código Pix
      </button>
    </div>
  );
}
