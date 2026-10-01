import { useState } from 'react';
import { formatBRL } from '@drivemart/shared';
import { callableError } from '../../services/orders';
import {
  confirmResaleReceipt,
  receiptUrl,
  rejectResaleReceipt,
  type OrderWithId,
} from '../../services/resale';
import { useGame } from '../../state/gameStore';
import { useOrders } from '../../state/orderStore';
import { useUi } from '../../state/uiStore';
import { lotTitle } from '../hud/ZoneCard';

export function formatDeadline(ms: number | null | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function useLotName(parcelId: string): string {
  const engine = useGame((s) => s.engine);
  const lot = engine?.parcels.byId.get(parcelId);
  return lot ? lotTitle(lot) : parcelId;
}

async function openReceipt(path: string): Promise<void> {
  // Abre a aba antes do await para não ser barrada pelo bloqueador de pop-up.
  const tab = window.open('', '_blank');
  try {
    const url = await receiptUrl(path);
    if (tab) tab.location.href = url;
  } catch {
    tab?.close();
    useUi.getState().toast('Não foi possível abrir o comprovante.', 'error');
  }
}

/** Venda em andamento vista pelo vendedor, com as ações de confirmar ou recusar o recebimento. */
export function SellerOrderCard({ order }: { order: OrderWithId }) {
  const toast = useUi((s) => s.toast);
  const name = useLotName(order.parcelId);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const r = order.resale;

  const run = async (fn: () => Promise<void>, ok: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast(ok, 'ok');
      return true;
    } catch (err) {
      setError(callableError(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="order-card">
      <div className="order-card-head">
        <strong>{name}</strong>
        <span className={`badge badge-${order.status === 'disputed' ? 'reserved' : 'sale'}`}>
          {order.status === 'fee_paid'
            ? 'Aguardando o Pix do comprador'
            : order.status === 'buyer_marked_paid'
              ? 'Confirme o recebimento'
              : 'Em análise'}
        </span>
      </div>
      <p>
        Comprador: <strong>{order.buyerName}</strong>. Valor para você:{' '}
        <strong>{formatBRL(order.sellerAmount)}</strong> na chave {r?.pixKeyMasked}.
      </p>
      {order.status === 'fee_paid' && (
        <p className="muted small">
          O comprador já pagou a taxa e vai te enviar o Pix até {formatDeadline(r?.stageDeadline)}. Se o
          dinheiro já caiu, você pode confirmar agora.
        </p>
      )}
      {order.status === 'buyer_marked_paid' && (
        <p className="muted small">
          O comprador informou que pagou. Confira o extrato da sua conta e confirme até{' '}
          {formatDeadline(r?.stageDeadline)}. Sem resposta no prazo, a venda vai para análise da equipe.
        </p>
      )}
      {order.status === 'disputed' && (
        <p className="muted small">
          A equipe do DriveMart está analisando esta venda. Motivo: {r?.disputeReason ?? 'não informado'}.
        </p>
      )}
      {r?.receiptPath && (
        <button className="link-button" onClick={() => void openReceipt(r.receiptPath!)}>
          Ver comprovante enviado pelo comprador
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
      {(order.status === 'fee_paid' || order.status === 'buyer_marked_paid') && !rejecting && (
        <div className="row">
          <button
            className="btn primary"
            disabled={busy}
            onClick={() =>
              void run(
                () => confirmResaleReceipt(order.id),
                'Venda concluída. O imóvel passou para o comprador.',
              )
            }
          >
            Recebi o Pix, concluir venda
          </button>
          {order.status === 'buyer_marked_paid' && (
            <button className="btn" disabled={busy} onClick={() => setRejecting(true)}>
              Não recebi
            </button>
          )}
        </div>
      )}
      {rejecting && (
        <div className="form">
          <label>
            O que aconteceu?
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Ex.: nenhum Pix com esse valor chegou na minha conta"
            />
          </label>
          <div className="row">
            <button
              className="btn danger"
              disabled={busy}
              onClick={() =>
                void run(
                  () => rejectResaleReceipt(order.id, reason),
                  'Enviamos para análise. A equipe vai verificar.',
                ).then((ok) => ok && setRejecting(false))
              }
            >
              Enviar para análise
            </button>
            <button className="btn" disabled={busy} onClick={() => setRejecting(false)}>
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const BUYER_STATUS: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  fee_paid: 'Pague o vendedor',
  buyer_marked_paid: 'Aguardando o vendedor',
  disputed: 'Em análise',
};

function BuyerOrderRow({ order }: { order: OrderWithId }) {
  const open = useUi((s) => s.open);
  const name = useLotName(order.parcelId);
  return (
    <div className="order-row">
      <span>
        <strong>{name}</strong>
        <small>
          {BUYER_STATUS[order.status] ?? order.status} · {formatBRL(order.price)}
        </small>
      </span>
      <button
        className="btn"
        onClick={() =>
          open(
            order.kind === 'resale'
              ? { name: 'resale', lotId: order.parcelId, orderId: order.id }
              : { name: 'checkout', lotId: order.parcelId },
          )
        }
      >
        Continuar
      </button>
    </div>
  );
}

/** Compras e vendas em andamento, no topo de "Meus imóveis". */
export function PendingOrders() {
  const buying = useOrders((s) => s.buying);
  const selling = useOrders((s) => s.selling);
  if (!buying.length && !selling.length) return null;
  return (
    <section className="pending">
      <h3>Pendências</h3>
      {selling.map((o) => (
        <SellerOrderCard key={o.id} order={o} />
      ))}
      {buying.map((o) => (
        <BuyerOrderRow key={o.id} order={o} />
      ))}
    </section>
  );
}
