import { useEffect, useState } from 'react';
import {
  formatBRL,
  parseBRL,
  centsToInput,
  type OrderStatus,
  type ParcelDoc,
  type PlatformConfig,
} from '@drivemart/shared';
import {
  getParcel,
  loadConfig,
  moderateParcel,
  resolveDispute,
  resolveReport,
  saveConfig,
  watchOpenReports,
  watchOrders,
  type PricingDoc,
  type ReportDoc,
} from '../services/admin';
import { initAuth, refreshUser, signOut } from '../services/auth';
import { firebase } from '../services/firebase';
import { callableError } from '../services/orders';
import { receiptUrl, REPORT_REASONS, type OrderWithId } from '../services/resale';
import { useAuth } from '../state/authStore';
import { useUi } from '../state/uiStore';
import { Toasts } from '../ui/hud/Toasts';
import { ModalHost } from '../ui/modals/ModalHost';
import { formatDeadline } from '../ui/modals/PendingOrders';
import { appUrl } from '../ui/links';

type Tab = 'disputes' | 'orders' | 'reports' | 'moderation' | 'config';

const TABS: [Tab, string][] = [
  ['disputes', 'Disputas'],
  ['orders', 'Pedidos'],
  ['reports', 'Denúncias'],
  ['moderation', 'Moderação'],
  ['config', 'Preços e taxas'],
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Aguardando pagamento',
  fee_paid: 'Taxa paga',
  buyer_marked_paid: 'Comprador pagou',
  completed: 'Concluído',
  disputed: 'Em disputa',
  expired: 'Expirado',
  canceled: 'Cancelado',
  refunded: 'Devolvido',
  failed: 'Falhou',
};

const REFUND_LABEL = { pending: 'pendente', done: 'feita', failed: 'falhou, refazer no Mercado Pago' };

/** Painel de administração em /admin (exige a custom claim `admin`). */
export function AdminApp() {
  const ready = useAuth((s) => s.ready);
  const user = useAuth((s) => s.user);
  const open = useUi((s) => s.open);
  const [tab, setTab] = useState<Tab>('disputes');

  useEffect(() => initAuth(), []);

  let body;
  if (!firebase()) body = <p className="muted">Firebase não configurado neste ambiente.</p>;
  else if (!ready) body = <p className="muted">Carregando...</p>;
  else if (!user) {
    body = (
      <div className="admin-gate">
        <p>Entre com uma conta de administrador.</p>
        <button className="btn primary" onClick={() => open({ name: 'auth' })}>
          Entrar
        </button>
      </div>
    );
  } else if (!user.admin) {
    body = (
      <div className="admin-gate">
        <p>
          A conta <strong>{user.email}</strong> não tem acesso de administrador. Conceda com{' '}
          <code>npm run admin:grant -- {user.email}</code> e depois atualize o acesso.
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => void refreshUser()}>
            Atualizar acesso
          </button>
          <button className="btn" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <nav className="tabs admin-tabs" role="tablist">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className={tab === k ? 'active' : ''}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === 'disputes' && <Disputes />}
        {tab === 'orders' && <Orders />}
        {tab === 'reports' && <Reports />}
        {tab === 'moderation' && <Moderation />}
        {tab === 'config' && <ConfigTab />}
      </>
    );
  }

  return (
    <div className="admin">
      <header className="admin-head">
        <div className="logo small">
          DRIVE<span>MART</span> <small>admin</small>
        </div>
        <div className="row">
          {user && <span className="muted">{user.email}</span>}
          <a className="btn" href={appUrl()}>
            Voltar ao jogo
          </a>
        </div>
      </header>
      <main className="admin-main">{body}</main>
      <ModalHost />
      <Toasts />
    </div>
  );
}

function useAction() {
  const toast = useUi((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, 'ok');
    } catch (err) {
      toast(callableError(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

async function openReceipt(path: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const url = await receiptUrl(path);
    if (tab) tab.location.href = url;
  } catch {
    tab?.close();
    useUi.getState().toast('Não foi possível abrir o comprovante.', 'error');
  }
}

function OrderSummary({ o }: { o: OrderWithId }) {
  return (
    <div className="admin-order-info">
      <p>
        <strong>{o.parcelId}</strong> · {o.kind === 'resale' ? 'Revenda' : 'Compra da plataforma'} ·{' '}
        {formatBRL(o.price)} · <span className="badge badge-owned">{STATUS_LABEL[o.status]}</span>
      </p>
      <p className="muted small">
        Comprador: {o.buyerName} ({o.buyerEmail ?? o.buyerUid})
        {o.sellerUid ? ` · Vendedor: ${o.sellerName ?? o.sellerUid}` : ''} · Criado em{' '}
        {formatDeadline(o.createdAt)} · Pedido {o.id}
      </p>
      {o.kind === 'resale' && o.resale && (
        <p className="muted small">
          Taxa {formatBRL(o.fee)} ({o.payment.status === 'paid' ? 'paga' : 'não paga'}) · Vendedor{' '}
          {formatBRL(o.sellerAmount)} na chave {o.resale.pixKeyMasked} ({o.resale.receiverName})
          {o.resale.buyerMarkedPaidAt
            ? ` · "Já paguei" em ${formatDeadline(o.resale.buyerMarkedPaidAt)}`
            : ''}
          {o.resale.disputeReason ? ` · Motivo: ${o.resale.disputeReason}` : ''}
        </p>
      )}
      {o.refund && (
        <p className="muted small">
          Devolução: {REFUND_LABEL[o.refund.status]} ({o.refund.reason})
        </p>
      )}
      {o.resale?.receiptPath && (
        <button className="link-button" onClick={() => void openReceipt(o.resale!.receiptPath!)}>
          Ver comprovante
        </button>
      )}
    </div>
  );
}

function Disputes() {
  const [disputed, setDisputed] = useState<OrderWithId[] | null>(null);
  const [waiting, setWaiting] = useState<OrderWithId[]>([]);
  useEffect(() => watchOrders('disputed', setDisputed), []);
  useEffect(() => watchOrders('buyer_marked_paid', setWaiting), []);
  if (!disputed) return <p className="muted">Carregando...</p>;
  return (
    <section>
      <h2>Em disputa</h2>
      {!disputed.length && <p className="muted">Nenhuma disputa aberta.</p>}
      {disputed.map((o) => (
        <DisputeCard key={o.id} o={o} />
      ))}
      <h2>Aguardando o vendedor</h2>
      {!waiting.length && <p className="muted">Nenhuma revenda aguardando confirmação.</p>}
      {waiting.map((o) => (
        <DisputeCard key={o.id} o={o} />
      ))}
    </section>
  );
}

function DisputeCard({ o }: { o: OrderWithId }) {
  const { busy, run } = useAction();
  const [note, setNote] = useState('');
  return (
    <div className="order-card">
      <OrderSummary o={o} />
      <div className="form">
        <label>
          Observação da decisão
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
      </div>
      <div className="row">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() =>
            void run(() => resolveDispute(o.id, 'complete', false, note), 'Imóvel transferido ao comprador.')
          }
        >
          Concluir para o comprador
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(() => resolveDispute(o.id, 'cancel', true, note), 'Venda anulada e taxa devolvida.')
          }
        >
          Anular e devolver a taxa
        </button>
        <button
          className="btn danger"
          disabled={busy}
          onClick={() =>
            void run(() => resolveDispute(o.id, 'cancel', false, note), 'Venda anulada sem devolução.')
          }
        >
          Anular sem devolver
        </button>
      </div>
    </div>
  );
}

function Orders() {
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [list, setList] = useState<OrderWithId[] | null>(null);
  useEffect(() => {
    setList(null);
    return watchOrders(status, setList);
  }, [status]);
  return (
    <section>
      <div className="form admin-filter">
        <label>
          Situação
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | 'all')}>
            <option value="all">Todas</option>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!list ? (
        <p className="muted">Carregando...</p>
      ) : !list.length ? (
        <p className="muted">Nenhum pedido.</p>
      ) : (
        list.map((o) => (
          <div key={o.id} className="order-card">
            <OrderSummary o={o} />
          </div>
        ))
      )}
    </section>
  );
}

function Reports() {
  const [list, setList] = useState<ReportDoc[] | null>(null);
  useEffect(() => watchOpenReports(setList), []);
  if (!list) return <p className="muted">Carregando...</p>;
  return (
    <section>
      {!list.length && <p className="muted">Nenhuma denúncia aberta.</p>}
      {list.map((r) => (
        <ReportCard key={r.id} r={r} />
      ))}
    </section>
  );
}

function ReportCard({ r }: { r: ReportDoc }) {
  const { busy, run } = useAction();
  const [parcel, setParcel] = useState<ParcelDoc | null>(null);
  useEffect(() => {
    void getParcel(r.parcelId).then(setParcel);
  }, [r.parcelId]);
  return (
    <div className="order-card report-card">
      {parcel?.facade && <img src={parcel.facade.url} alt="Fachada denunciada" />}
      <div>
        <p>
          <strong>{r.parcelId}</strong> · {REPORT_REASONS[r.reason] ?? r.reason} ·{' '}
          {formatDeadline(r.createdAt)}
        </p>
        {r.details && <p className="muted small">{r.details}</p>}
        <p className="muted small">
          Dono: {parcel?.ownerName ?? '...'} · Nome: {parcel?.displayName ?? 'sem nome'} · Link:{' '}
          {parcel?.linkUrl ?? 'sem link'}
          {parcel?.facade?.moderation === 'blocked' ? ' · fachada já bloqueada' : ''}
        </p>
        <div className="row">
          <button
            className="btn danger"
            disabled={busy}
            onClick={() => void run(() => resolveReport(r.id, 'block'), 'Fachada bloqueada e link removido.')}
          >
            Bloquear fachada e link
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void run(() => resolveReport(r.id, 'dismiss'), 'Denúncia descartada.')}
          >
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}

function Moderation() {
  const { busy, run } = useAction();
  const [id, setId] = useState('');
  const [parcel, setParcel] = useState<ParcelDoc | null | undefined>(undefined);
  const lookup = async () => setParcel(await getParcel(id.trim()));
  return (
    <section className="form admin-moderation">
      <label>
        Id do imóvel
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="rio-xxxxxx ou sf-xxxxxx" />
      </label>
      <div className="row">
        <button className="btn" onClick={() => void lookup()} disabled={!id.trim()}>
          Buscar
        </button>
      </div>
      {parcel === null && <p className="form-error">Imóvel não encontrado.</p>}
      {parcel && (
        <div className="order-card report-card">
          {parcel.facade && <img src={parcel.facade.url} alt="Fachada" />}
          <div>
            <p>
              Dono: {parcel.ownerName ?? 'plataforma'} · Situação: {parcel.status ?? 'available'} · Fachada:{' '}
              {parcel.facade ? parcel.facade.moderation : 'nenhuma'} · Link: {parcel.linkUrl ?? 'nenhum'}
            </p>
            <div className="row">
              <button
                className="btn danger"
                disabled={busy}
                onClick={() =>
                  void run(() => moderateParcel(id.trim(), true, true), 'Conteúdo bloqueado.').then(lookup)
                }
              >
                Bloquear fachada e link
              </button>
              <button
                className="btn"
                disabled={busy || parcel.facade?.moderation !== 'blocked'}
                onClick={() =>
                  void run(() => moderateParcel(id.trim(), false, false), 'Fachada liberada.').then(lookup)
                }
              >
                Liberar fachada
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ConfigTab() {
  const { busy, run } = useAction();
  const [pricing, setPricing] = useState<PricingDoc | null>(null);
  const [platform, setPlatform] = useState<PlatformConfig | null>(null);
  const [overrides, setOverrides] = useState('');
  useEffect(() => {
    void loadConfig().then((c) => {
      setPricing(c.pricing);
      setPlatform(c.platform);
      setOverrides(
        Object.entries(c.pricing.overrides ?? {})
          .map(([k, v]) => `${k} = ${centsToInput(v)}`)
          .join('\n'),
      );
    });
  }, []);
  if (!pricing || !platform) return <p className="muted">Carregando...</p>;

  const num = (v: string) => Number(v.replace(',', '.'));
  const parsedOverrides = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const line of overrides.split('\n')) {
      const m = line.match(/^\s*([a-z]{2,10}-[0-9a-z]{6})\s*[=:]\s*(.+)$/);
      const cents = m ? parseBRL(m[2]!.trim()) : null;
      if (m && cents) out[m[1]!] = cents;
    }
    return out;
  };

  return (
    <form
      className="form admin-config"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () => saveConfig({ ...pricing, overrides: parsedOverrides() }, platform),
          'Configuração salva.',
        );
      }}
    >
      <h2>Preço dos imóveis da plataforma</h2>
      <label>
        Preço único para todos os imóveis (R$; 0 usa a fórmula abaixo)
        <input
          defaultValue={centsToInput(pricing.flatCents ?? 0)}
          onChange={(e) => setPricing({ ...pricing, flatCents: parseBRL(e.target.value) ?? 0 })}
        />
      </label>
      <div className="form-row">
        <label>
          Preço por m² (R$)
          <input
            defaultValue={centsToInput(pricing.basePerM2Cents)}
            onChange={(e) => setPricing({ ...pricing, basePerM2Cents: parseBRL(e.target.value) ?? 0 })}
          />
        </label>
        <label>
          Acréscimo por andar (0,08 = 8%)
          <input
            defaultValue={String(pricing.floorFactor).replace('.', ',')}
            onChange={(e) => setPricing({ ...pricing, floorFactor: num(e.target.value) || 0 })}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Multiplicador da orla
          <input
            defaultValue={String(pricing.orlaMultiplier).replace('.', ',')}
            onChange={(e) => setPricing({ ...pricing, orlaMultiplier: num(e.target.value) || 1 })}
          />
        </label>
        <label>
          Multiplicador geral
          <input
            defaultValue={String(pricing.multiplier).replace('.', ',')}
            onChange={(e) => setPricing({ ...pricing, multiplier: num(e.target.value) || 1 })}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Preço mínimo (R$)
          <input
            defaultValue={centsToInput(pricing.minCents)}
            onChange={(e) => setPricing({ ...pricing, minCents: parseBRL(e.target.value) ?? 0 })}
          />
        </label>
        <label>
          Preço máximo (R$)
          <input
            defaultValue={centsToInput(pricing.maxCents)}
            onChange={(e) => setPricing({ ...pricing, maxCents: parseBRL(e.target.value) ?? 0 })}
          />
        </label>
      </div>
      <label>
        Preços específicos (um por linha: id = valor em reais)
        <textarea
          value={overrides}
          onChange={(e) => setOverrides(e.target.value)}
          rows={4}
          placeholder="rio-a1b2c3 = 2.500,00"
        />
      </label>

      <h2>Revenda</h2>
      <div className="form-row">
        <label>
          Taxa da plataforma (%)
          <input
            defaultValue={String(platform.resaleFeeBps / 100).replace('.', ',')}
            onChange={(e) =>
              setPlatform({ ...platform, resaleFeeBps: Math.round((num(e.target.value) || 0) * 100) })
            }
          />
        </label>
        <label>
          Validade do Pix (minutos)
          <input
            type="number"
            min={5}
            max={1440}
            value={platform.paymentMinutes}
            onChange={(e) => setPlatform({ ...platform, paymentMinutes: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Prazo para pagar o vendedor (horas)
          <input
            type="number"
            min={1}
            value={platform.buyerConfirmHours}
            onChange={(e) => setPlatform({ ...platform, buyerConfirmHours: Number(e.target.value) })}
          />
        </label>
        <label>
          Prazo para o vendedor confirmar (horas)
          <input
            type="number"
            min={1}
            value={platform.sellerConfirmHours}
            onChange={(e) => setPlatform({ ...platform, sellerConfirmHours: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Revenda mínima (R$)
          <input
            defaultValue={centsToInput(platform.minResaleCents)}
            onChange={(e) => setPlatform({ ...platform, minResaleCents: parseBRL(e.target.value) ?? 0 })}
          />
        </label>
        <label>
          Revenda máxima (R$)
          <input
            defaultValue={centsToInput(platform.maxResaleCents)}
            onChange={(e) => setPlatform({ ...platform, maxResaleCents: parseBRL(e.target.value) ?? 0 })}
          />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={platform.requireVerifiedEmail}
          onChange={(e) => setPlatform({ ...platform, requireVerifiedEmail: e.target.checked })}
        />{' '}
        Exigir e-mail confirmado para comprar (contas de e-mail e senha)
      </label>
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? 'Salvando...' : 'Salvar configuração'}
      </button>
    </form>
  );
}
