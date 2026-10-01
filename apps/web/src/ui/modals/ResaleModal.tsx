import { useEffect, useState } from 'react';
import {
  DEFAULT_PLATFORM,
  formatBRL,
  splitResale,
  type OrderDoc,
  type PlatformConfig,
} from '@drivemart/shared';
import { canPurchase } from '../../services/auth';
import { firebase } from '../../services/firebase';
import { callableError, cancelOrder, devSimulatePayment, watchOrder } from '../../services/orders';
import {
  markResalePaid,
  MAX_RECEIPT,
  platformSettings,
  RECEIPT_TYPES,
  startResale,
  uploadReceipt,
} from '../../services/resale';
import { useAuth } from '../../state/authStore';
import { useGame } from '../../state/gameStore';
import { useOrders } from '../../state/orderStore';
import { useParcels } from '../../state/parcelStore';
import { useUi } from '../../state/uiStore';
import { lotSubtitle, lotTitle } from '../hud/ZoneCard';
import { VerifyEmail } from './CheckoutModal';
import { Modal } from './Modal';
import { formatDeadline } from './PendingOrders';
import { PixQr } from './PixQr';

/**
 * Compra de um imóvel anunciado por outro jogador, em dois Pix:
 * 1) a taxa da plataforma pelo Mercado Pago; 2) o valor do vendedor direto na chave dele.
 */
export function ResaleModal({ lotId, orderId: initialOrderId }: { lotId: string; orderId?: string }) {
  const engine = useGame((s) => s.engine);
  const user = useAuth((s) => s.user);
  const entry = useParcels((s) => s.entries[lotId]);
  const existing = useOrders((s) => s.buying.find((o) => o.parcelId === lotId && o.kind === 'resale'));
  const open = useUi((s) => s.open);
  const close = useUi((s) => s.close);
  const toast = useUi((s) => s.toast);
  const lot = engine?.parcels.byId.get(lotId);
  const [platform, setPlatform] = useState<PlatformConfig>(DEFAULT_PLATFORM);
  const [orderId, setOrderId] = useState<string | undefined>(initialOrderId ?? existing?.id);
  const [order, setOrder] = useState<OrderDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void platformSettings().then(setPlatform);
  }, []);

  useEffect(() => {
    if (!orderId && existing) setOrderId(existing.id);
  }, [existing, orderId]);

  useEffect(() => {
    if (!orderId) return;
    const unsub = watchOrder(orderId, setOrder);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [orderId]);

  if (!lot) return null;
  const title = lotTitle(lot, entry);
  const price = order?.price ?? entry?.p ?? null;
  const split = order
    ? { fee: order.fee, seller: order.sellerAmount }
    : price
      ? splitResale(price, platform.resaleFeeBps)
      : null;
  const sellerName = order?.sellerName ?? entry?.o ?? 'o dono';
  const status = order?.status;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error && !('code' in err) ? err.message : callableError(err));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const r = await startResale(lotId);
      setOrderId(r.orderId);
    });

  const giveUp = () =>
    run(async () => {
      if (orderId) await cancelOrder(orderId);
      toast(status === 'fee_paid' ? 'Compra cancelada. A taxa será devolvida.' : 'Compra cancelada.');
      close();
    });

  const markPaid = () =>
    run(async () => {
      if (!orderId) return;
      const path = receipt ? await uploadReceipt(orderId, receipt) : undefined;
      await markResalePaid(orderId, path);
      toast('Avisamos o vendedor. Agora é só aguardar a confirmação.', 'ok');
    });

  if (status === 'completed') {
    return (
      <Modal title="Imóvel comprado!">
        <div className="success">
          <p className="success-big">O imóvel é seu.</p>
          <p>
            {sellerName} confirmou o recebimento e <strong>{title}</strong> agora está no seu nome. Troque a
            fachada e coloque o link da sua loja.
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => open({ name: 'manage', lotId })}>
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

  const remaining = order ? Math.max(0, Math.floor((order.expiresAt - now) / 1000)) : 0;

  return (
    <Modal title="Comprar de outro jogador" dismissable={!busy} wide={status === 'fee_paid'}>
      <div className="checkout-head">
        <h3>{title}</h3>
        <p className="muted">{lotSubtitle(lot)}</p>
        <p className="zone-price">{price !== null ? formatBRL(price) : '...'}</p>
      </div>

      {split && (
        <ol className="steps">
          <li className={stepClass(status, 1)}>
            <strong>Taxa da plataforma: {formatBRL(split.fee)}</strong>
            <span>Pix pelo Mercado Pago, confirmado na hora</span>
          </li>
          <li className={stepClass(status, 2)}>
            <strong>
              Pagamento a {sellerName}: {formatBRL(split.seller)}
            </strong>
            <span>Pix direto para a chave do vendedor</span>
          </li>
          <li className={stepClass(status, 3)}>
            <strong>O vendedor confirma</strong>
            <span>e o imóvel passa para o seu nome</span>
          </li>
        </ol>
      )}

      {!user ? null : !canPurchase(user) ? (
        <VerifyEmail />
      ) : !orderId ? (
        entry?.s !== 'for_sale' || !price ? (
          <p className="form-error">Este imóvel não está à venda no momento.</p>
        ) : (
          <>
            <p className="muted">
              O imóvel fica reservado para você enquanto o Pix da taxa estiver válido. Depois de pagar a taxa,
              você tem até {platform.buyerConfirmHours} horas para pagar o vendedor. Se o vendedor não
              receber, a equipe do DriveMart analisa o caso.
            </p>
            {error && <p className="form-error">{error}</p>}
            <button className="btn primary wide" onClick={start} disabled={busy}>
              {busy ? 'Gerando Pix...' : 'Pagar a taxa com Pix'}
            </button>
          </>
        )
      ) : !order ? (
        <p className="muted">Carregando pedido...</p>
      ) : status === 'pending_payment' && order.payment.qrCode ? (
        <>
          <PixQr
            code={order.payment.qrCode}
            base64={order.payment.qrCodeBase64}
            label={`Passo 1: pague a taxa de ${formatBRL(order.fee)}`}
          />
          <p className="pix-wait">
            <span className="spinner" /> Aguardando pagamento... {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, '0')}
          </p>
          {error && <p className="form-error">{error}</p>}
          <div className="row">
            <button className="btn" onClick={giveUp} disabled={busy}>
              Cancelar compra
            </button>
            {firebase()?.emulators && (
              <button
                className="btn"
                onClick={() => void devSimulatePayment(orderId).catch((e) => setError(callableError(e)))}
              >
                Simular pagamento (teste)
              </button>
            )}
          </div>
        </>
      ) : status === 'pending_payment' ? (
        <p className="muted">
          <span className="spinner" /> Gerando o Pix...
        </p>
      ) : status === 'fee_paid' && order.resale ? (
        <div className="resale-pay">
          {order.resale.brCode ? (
            <PixQr
              code={order.resale.brCode}
              label={`Passo 2: pague ${formatBRL(order.sellerAmount)} a ${order.resale.receiverName}`}
            />
          ) : (
            <p className="form-error">
              Não conseguimos gerar o QR do vendedor. Cancele a compra para receber a taxa de volta.
            </p>
          )}
          <div className="resale-info">
            <p>
              Recebedor: <strong>{order.resale.receiverName}</strong>
              <br />
              Chave Pix: {order.resale.pixKeyMasked}
              <br />
              Valor: <strong>{formatBRL(order.sellerAmount)}</strong>
            </p>
            <p className="muted small">
              Confira o nome do recebedor no app do banco antes de confirmar. Pague até{' '}
              {formatDeadline(order.resale.stageDeadline)}; depois disso a compra é cancelada e a taxa
              devolvida.
            </p>
            <label className="file-label">
              Comprovante (opcional)
              <input
                type="file"
                accept={RECEIPT_TYPES.join(',')}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > MAX_RECEIPT) {
                    setError('O comprovante pode ter até 5 MB.');
                    return;
                  }
                  setError(null);
                  setReceipt(f);
                }}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="row">
              <button className="btn primary" onClick={markPaid} disabled={busy}>
                {busy ? 'Enviando...' : 'Já paguei o vendedor'}
              </button>
              <button className="btn" onClick={giveUp} disabled={busy}>
                Desistir (taxa devolvida)
              </button>
            </div>
          </div>
        </div>
      ) : status === 'buyer_marked_paid' ? (
        <div className="verify">
          <p>
            <span className="spinner" /> Aguardando {sellerName} confirmar o recebimento. O prazo vai até{' '}
            {formatDeadline(order.resale?.stageDeadline)}. Você pode fechar esta janela e continuar dirigindo:
            o imóvel aparece em Meus imóveis assim que for confirmado.
          </p>
          <button className="btn" onClick={close}>
            Continuar dirigindo
          </button>
        </div>
      ) : status === 'disputed' ? (
        <p className="form-info">
          A equipe do DriveMart está analisando esta compra
          {order.resale?.disputeReason ? ` (${order.resale.disputeReason})` : ''}. Se você tiver o comprovante
          do Pix, guarde-o: ele pode ser pedido.
        </p>
      ) : (
        <>
          <p className="form-error">
            {status === 'refunded'
              ? 'O pagamento chegou fora do prazo. A taxa será devolvida.'
              : status === 'canceled' || status === 'expired'
                ? `Esta compra foi encerrada${order.refund ? '. A taxa paga será devolvida' : ''}.`
                : 'Não foi possível concluir esta compra.'}
          </p>
          {entry?.s === 'for_sale' && (
            <button
              className="btn primary wide"
              onClick={() => {
                setOrderId(undefined);
                setOrder(null);
              }}
            >
              Tentar de novo
            </button>
          )}
        </>
      )}
    </Modal>
  );
}

function stepClass(status: OrderDoc['status'] | undefined, step: number): string {
  const current = status === 'fee_paid' ? 2 : status === 'buyer_marked_paid' || status === 'disputed' ? 3 : 1;
  if (status === 'completed' || step < current) return 'done';
  return step === current ? 'current' : '';
}
