import { useEffect, useMemo, useState } from 'react';
import {
  centsToInput,
  DEFAULT_PLATFORM,
  formatBRL,
  normalizePixKey,
  parseBRL,
  PIX_KEY_LABELS,
  splitResale,
  type LayoutLot,
  type PixKeyType,
  type PlatformConfig,
} from '@drivemart/shared';
import { callableError } from '../../services/orders';
import type { OwnedParcel } from '../../services/parcels';
import { listForSale, loadSalePrivate, platformSettings, unlistParcel } from '../../services/resale';
import { useOrders } from '../../state/orderStore';
import { useUi } from '../../state/uiStore';
import { SellerOrderCard } from './PendingOrders';

const KEY_HINTS: Record<PixKeyType, string> = {
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
  email: 'voce@exemplo.com',
  phone: '(21) 99999-9999',
  random: '123e4567-e89b-12d3-a456-426614174000',
};

/** Venda do imóvel: o dono define o preço e a chave Pix para receber a parte dele. */
export function SaleTab({ parcel }: { parcel: OwnedParcel; lot: LayoutLot }) {
  const toast = useUi((s) => s.toast);
  const allSelling = useOrders((s) => s.selling);
  const selling = useMemo(() => allSelling.filter((o) => o.parcelId === parcel.id), [allSelling, parcel.id]);
  const [platform, setPlatform] = useState<PlatformConfig>(DEFAULT_PLATFORM);
  const [price, setPrice] = useState(parcel.salePrice ? centsToInput(parcel.salePrice) : '');
  const [keyType, setKeyType] = useState<PixKeyType>('cpf');
  const [pixKey, setPixKey] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverCity, setReceiverCity] = useState('Rio de Janeiro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void platformSettings().then((p) => alive && setPlatform(p));
    void loadSalePrivate(parcel.id).then((p) => {
      if (!alive || !p) return;
      setKeyType(p.pixKeyType);
      setPixKey(p.pixKey);
      setReceiverName(p.receiverName);
      setReceiverCity(p.receiverCity);
    });
    return () => {
      alive = false;
    };
  }, [parcel.id]);

  if (parcel.status === 'reserved') {
    return (
      <div className="sale-tab">
        {selling.length ? (
          selling.map((o) => <SellerOrderCard key={o.id} order={o} />)
        ) : (
          <p className="muted">
            Alguém começou a comprar este imóvel e está pagando a taxa da plataforma. Se o pagamento não for
            feito no prazo, ele volta a ficar à venda automaticamente.
          </p>
        )}
      </div>
    );
  }

  const cents = parseBRL(price);
  const split = cents ? splitResale(cents, platform.resaleFeeBps) : null;
  const feePct = platform.resaleFeeBps / 100;
  const keyOk = normalizePixKey(keyType, pixKey) !== null;
  const priceOk = cents !== null && cents >= platform.minResaleCents && cents <= platform.maxResaleCents;
  const forSale = parcel.status === 'for_sale';

  const submit = async () => {
    if (!cents) return;
    setBusy(true);
    setError(null);
    try {
      await listForSale({
        parcelId: parcel.id,
        price: cents,
        pixKeyType: keyType,
        pixKey,
        receiverName,
        receiverCity,
      });
      toast(forSale ? 'Anúncio atualizado.' : 'Seu imóvel está à venda.', 'ok');
    } catch (err) {
      setError(callableError(err));
    } finally {
      setBusy(false);
    }
  };

  const unlist = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlistParcel(parcel.id);
      toast('Imóvel retirado da venda.');
    } catch (err) {
      setError(callableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="form sale-tab"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {forSale && parcel.salePrice && (
        <p className="form-info">
          À venda por <strong>{formatBRL(parcel.salePrice)}</strong>. Quem parar na vaga em frente ao prédio
          vê o botão de compra.
        </p>
      )}
      <label>
        Preço de venda (R$)
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="Ex.: 1.500,00"
          required
        />
      </label>
      {split && (
        <div className="sale-split">
          <span>
            Você recebe <strong>{formatBRL(split.seller)}</strong> ({100 - feePct}%) direto na sua chave Pix
          </span>
          <span className="muted small">
            Taxa da plataforma: {formatBRL(split.fee)} ({feePct}%), paga pelo comprador ao DriveMart
          </span>
        </div>
      )}
      {cents !== null && !priceOk && (
        <p className="form-error">
          O preço deve ficar entre {formatBRL(platform.minResaleCents)} e {formatBRL(platform.maxResaleCents)}
          .
        </p>
      )}
      <div className="form-row">
        <label>
          Tipo de chave Pix
          <select value={keyType} onChange={(e) => setKeyType(e.target.value as PixKeyType)}>
            {(Object.keys(PIX_KEY_LABELS) as PixKeyType[]).map((k) => (
              <option key={k} value={k}>
                {PIX_KEY_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chave Pix
          <input
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder={KEY_HINTS[keyType]}
            autoComplete="off"
            required
          />
        </label>
      </div>
      {pixKey && !keyOk && (
        <p className="form-error">Chave inválida para o tipo {PIX_KEY_LABELS[keyType]}.</p>
      )}
      <div className="form-row">
        <label>
          Nome de quem recebe
          <input
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            maxLength={25}
            placeholder="Como aparece no banco"
            required
          />
        </label>
        <label>
          Cidade de quem recebe
          <input
            value={receiverCity}
            onChange={(e) => setReceiverCity(e.target.value)}
            maxLength={15}
            required
          />
        </label>
      </div>
      <p className="muted small">
        O comprador paga a taxa ao DriveMart e depois paga você por um QR Code gerado com a sua chave. Você
        confirma aqui quando o dinheiro cair e o imóvel passa para o nome dele. Sua chave fica visível só para
        você; o comprador vê apenas parte dela e o seu nome.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="row">
        <button
          className="btn primary"
          type="submit"
          disabled={busy || !priceOk || !keyOk || receiverName.trim().length < 3}
        >
          {busy ? 'Salvando...' : forSale ? 'Atualizar anúncio' : 'Colocar à venda'}
        </button>
        {forSale && (
          <button className="btn" type="button" onClick={unlist} disabled={busy}>
            Retirar da venda
          </button>
        )}
      </div>
    </form>
  );
}
