import { useEffect, useState } from 'react';
import { formatBRL, type OrderDoc } from '@drivemart/shared';
import { canPurchase, refreshUser, resendVerification } from '../../services/auth';
import { firebase } from '../../services/firebase';
import {
  callableError,
  cancelOrder,
  createPrimaryOrder,
  currentPrice,
  devSimulatePayment,
  watchOrder,
  type PrimaryOrderResult,
} from '../../services/orders';
import { useAuth } from '../../state/authStore';
import { useGame } from '../../state/gameStore';
import { useUi } from '../../state/uiStore';
import { lotSubtitle, lotTitle } from '../hud/ZoneCard';
import { Modal } from './Modal';
import { PixQr } from './PixQr';

/** Compra de um imóvel vendido pela plataforma: resumo, Pix e confirmação em tempo real. */
export function CheckoutModal({ lotId }: { lotId: string }) {
  const engine = useGame((s) => s.engine);
  const user = useAuth((s) => s.user);
  const open = useUi((s) => s.open);
  const close = useUi((s) => s.close);
  const toast = useUi((s) => s.toast);
  const lot = engine?.parcels.byId.get(lotId);
  const [price, setPrice] = useState<number | null>(lot?.pr ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PrimaryOrderResult | null>(null);
  const [order, setOrder] = useState<OrderDoc | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (lot) void currentPrice(lot).then(setPrice);
  }, [lot]);

  useEffect(() => {
    if (!pix) return;
    const unsub = watchOrder(pix.orderId, setOrder);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [pix]);

  if (!lot) return null;
  const status = order?.status;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      setPix(await createPrimaryOrder(lot.id));
    } catch (err) {
      setError(callableError(err));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!pix) return close();
    setBusy(true);
    try {
      await cancelOrder(pix.orderId);
      toast('Compra cancelada.');
      close();
    } catch (err) {
      setError(callableError(err));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'completed') {
    return (
      <Modal title="Imóvel comprado!">
        <div className="success">
          <p className="success-big">O imóvel é seu.</p>
          <p>
            <strong>{lotTitle(lot)}</strong> agora está no seu nome. Troque a fachada por uma imagem ou GIF e
            coloque o link da sua loja.
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => open({ name: 'manage', lotId: lot.id })}>
              Personalizar agora
            </button>
            <button className="btn" onClick={close}>
              Continuar dirigindo
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const remaining = pix ? Math.max(0, Math.floor((pix.expiresAt - now) / 1000)) : 0;

  return (
    <Modal title="Comprar imóvel" dismissable={!busy}>
      <div className="checkout-head">
        <h3>{lotTitle(lot)}</h3>
        <p className="muted">{lotSubtitle(lot)}</p>
        <p className="zone-price">{price !== null ? formatBRL(pix?.amount ?? price) : '...'}</p>
      </div>

      {!canPurchase(user) && user ? (
        <VerifyEmail />
      ) : !pix ? (
        <>
          <p className="muted">
            Pagamento via Pix (Mercado Pago). O imóvel fica reservado para você enquanto o código estiver
            válido e passa para o seu nome assim que o pagamento for confirmado.
          </p>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary wide" onClick={generate} disabled={busy}>
            {busy ? 'Gerando Pix...' : 'Gerar Pix'}
          </button>
        </>
      ) : status === 'expired' || status === 'canceled' || status === 'failed' ? (
        <>
          <p className="form-error">
            O Pix expirou ou foi cancelado. Gere um novo código para tentar de novo.
          </p>
          <button className="btn primary wide" onClick={() => (setPix(null), setOrder(null))}>
            Gerar novo Pix
          </button>
        </>
      ) : status === 'refunded' ? (
        <p className="form-error">
          O pagamento chegou depois do prazo e o imóvel já tinha sido vendido. O valor será devolvido.
        </p>
      ) : (
        <>
          <PixQr
            code={pix.qrCode}
            base64={pix.qrCodeBase64}
            label="Escaneie no app do seu banco ou copie o código"
          />
          <p className="pix-wait">
            <span className="spinner" /> Aguardando pagamento... {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, '0')}
          </p>
          {error && <p className="form-error">{error}</p>}
          <div className="row">
            <button className="btn" onClick={cancel} disabled={busy}>
              Cancelar compra
            </button>
            {firebase()?.emulators && (
              <button
                className="btn"
                onClick={() => void devSimulatePayment(pix.orderId).catch((e) => setError(callableError(e)))}
              >
                Simular pagamento (teste)
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

/** Conta de e-mail e senha sem confirmação: pede para confirmar antes de comprar. */
export function VerifyEmail() {
  const toast = useUi((s) => s.toast);
  const [busy, setBusy] = useState(false);
  return (
    <div className="verify">
      <p>Confirme seu e-mail para comprar. Enviamos um link quando você criou a conta.</p>
      <div className="row">
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await resendVerification().then(
              () => toast('Link de confirmação enviado.', 'ok'),
              () => toast('Não foi possível enviar agora.', 'error'),
            );
            setBusy(false);
          }}
        >
          Reenviar e-mail
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const u = await refreshUser().catch(() => null);
            if (!u?.emailVerified) toast('Ainda não recebemos a confirmação.', 'error');
            setBusy(false);
          }}
        >
          Já confirmei
        </button>
      </div>
    </div>
  );
}
