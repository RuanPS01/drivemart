import { useEffect, useMemo, useState } from 'react';
import { formatBRL, type FacadeFit, type FacadeRegion, type LayoutLot } from '@drivemart/shared';
import { callableError, referencePrice } from '../../services/orders';
import {
  ACCEPTED_TYPES,
  MAX_UPLOAD,
  publishFacade,
  removeFacade,
  updateFacadeOptions,
  updateParcelInfo,
  uploadFacade,
  watchMyParcels,
  type OwnedParcel,
} from '../../services/parcels';
import { useAuth } from '../../state/authStore';
import { useGame } from '../../state/gameStore';
import { useUi } from '../../state/uiStore';
import { SHOP_HEIGHT } from '../../game/world/cityGen';
import { lotSubtitle, lotTitle } from '../hud/ZoneCard';
import { Modal } from './Modal';
import { PendingOrders } from './PendingOrders';
import { SaleTab } from './SaleTab';

type Tab = 'facade' | 'info' | 'place' | 'sale';

/** "Meus imóveis": lista e gestão de cada imóvel (fachada, nome e link, localização, venda). */
export function ManageModal({ lotId }: { lotId?: string }) {
  const user = useAuth((s) => s.user);
  const engine = useGame((s) => s.engine);
  const [list, setList] = useState<OwnedParcel[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(lotId);
  const [tab, setTab] = useState<Tab>('facade');

  useEffect(() => {
    if (!user) return;
    return watchMyParcels(user.uid, setList);
  }, [user]);

  useEffect(() => {
    if (!selectedId && list?.length) setSelectedId(list[0]!.id);
  }, [list, selectedId]);

  const parcel = list?.find((p) => p.id === selectedId);
  const lot = selectedId ? engine?.parcels.byId.get(selectedId) : undefined;

  return (
    <Modal title="Meus imóveis" wide>
      <PendingOrders />
      {!list ? (
        <p className="muted">Carregando...</p>
      ) : !list.length ? (
        <p className="muted">
          Você ainda não tem imóveis. Dirija pela cidade, pare numa vaga verde em frente a um prédio e compre
          o seu.
        </p>
      ) : (
        <div className="manage">
          <ul className="manage-list">
            {list.map((p) => {
              const l = engine?.parcels.byId.get(p.id);
              return (
                <li key={p.id}>
                  <button className={p.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(p.id)}>
                    {p.facade && <img src={p.facade.url} alt="" />}
                    <span>
                      <strong>{p.displayName || (l ? lotTitle(l) : p.id)}</strong>
                      <small>
                        Setor {p.sector}
                        {p.status === 'for_sale'
                          ? ' · à venda'
                          : p.status === 'reserved'
                            ? ' · venda em andamento'
                            : ''}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {parcel && lot && (
            <section className="manage-detail">
              <h3>{parcel.displayName || lotTitle(lot)}</h3>
              <p className="muted">{lotSubtitle(lot)}</p>
              <nav className="tabs" role="tablist">
                {(
                  [
                    ['facade', 'Fachada'],
                    ['info', 'Nome e link'],
                    ['place', 'Localização'],
                    ['sale', 'Venda'],
                  ] as [Tab, string][]
                ).map(([k, label]) => (
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
              {tab === 'facade' && <FacadeTab parcel={parcel} lot={lot} />}
              {tab === 'info' && <InfoTab parcel={parcel} />}
              {tab === 'place' && <PlaceTab lot={lot} />}
              {tab === 'sale' && <SaleTab parcel={parcel} lot={lot} />}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

function facadeAspect(lot: LayoutLot, region: FacadeRegion): number {
  const w = Math.hypot(lot.f[2] - lot.f[0], lot.f[3] - lot.f[1]);
  const h = region === 'ground' && lot.h > 6 ? SHOP_HEIGHT : lot.h;
  return w / Math.max(1, h);
}

function FacadeTab({ parcel, lot }: { parcel: OwnedParcel; lot: LayoutLot }) {
  const toast = useUi((s) => s.toast);
  const current = parcel.facade;
  const [file, setFile] = useState<File | null>(null);
  const [fit, setFit] = useState<FacadeFit>(current?.fit ?? 'cover');
  const [region, setRegion] = useState<FacadeRegion>(current?.region ?? 'full');
  const [ps1, setPs1] = useState(current?.ps1 ?? false);
  const [background, setBackground] = useState(current?.background ?? '#000000');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : (current?.url ?? null)),
    [file, current?.url],
  );

  useEffect(
    () => () => {
      if (file && preview) URL.revokeObjectURL(preview);
    },
    [file, preview],
  );

  const aspect = facadeAspect(lot, region);
  const opts = { fit, region, ps1, background };

  const save = async () => {
    setError(null);
    try {
      if (file) {
        setProgress(0);
        const path = await uploadFacade(parcel.id, file, setProgress);
        setProgress(1);
        await publishFacade(parcel.id, path, opts);
        setFile(null);
        toast('Fachada publicada! Ela já aparece para todo mundo na cidade.', 'ok');
      } else if (current) {
        await updateFacadeOptions(parcel.id, opts);
        toast('Ajustes da fachada salvos.', 'ok');
      }
    } catch (err) {
      setError(err instanceof Error && !('code' in err) ? err.message : callableError(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="facade-tab">
      <div
        className="facade-preview"
        style={{ aspectRatio: String(Math.min(4, Math.max(0.25, aspect))), background }}
      >
        {preview ? (
          <img
            src={preview}
            alt="Prévia da fachada"
            style={{ objectFit: fit, imageRendering: ps1 ? 'pixelated' : 'auto' }}
          />
        ) : (
          <span className="muted">Sem imagem</span>
        )}
      </div>
      <p className="muted small">
        Proporção da {region === 'ground' ? 'área do térreo' : 'fachada'}: {aspect.toFixed(2)} : 1. Imagens
        PNG, JPG, WebP ou GIF animado de até 8 MB.
      </p>
      <div className="form">
        <label>
          Imagem ou GIF
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && f.size > MAX_UPLOAD) {
                setError('A imagem pode ter até 8 MB.');
                return;
              }
              setError(null);
              setFile(f);
            }}
          />
        </label>
        <div className="form-row">
          <label>
            Ajuste
            <select value={fit} onChange={(e) => setFit(e.target.value as FacadeFit)}>
              <option value="cover">Cobrir (corta as bordas)</option>
              <option value="contain">Conter (mostra tudo)</option>
            </select>
          </label>
          <label>
            Área
            <select value={region} onChange={(e) => setRegion(e.target.value as FacadeRegion)}>
              <option value="full">Fachada inteira</option>
              <option value="ground">Só o térreo (letreiro)</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label className="check">
            <input type="checkbox" checked={ps1} onChange={(e) => setPs1(e.target.checked)} /> Estilo PS1
            (pixelado)
          </label>
          <label>
            Fundo
            <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
          </label>
        </div>
        {progress !== null && (
          <div className="loading-bar">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="row">
          <button className="btn primary" onClick={save} disabled={progress !== null || (!file && !current)}>
            {progress !== null ? 'Enviando...' : file ? 'Publicar fachada' : 'Salvar ajustes'}
          </button>
          {current && (
            <button
              className="btn"
              disabled={progress !== null}
              onClick={() =>
                void removeFacade(parcel.id).then(
                  () => toast('Fachada removida.'),
                  (e) => setError(callableError(e)),
                )
              }
            >
              Remover fachada
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoTab({ parcel }: { parcel: OwnedParcel }) {
  const toast = useUi((s) => s.toast);
  const [name, setName] = useState(parcel.displayName ?? '');
  const [link, setLink] = useState(parcel.linkUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await updateParcelInfo(parcel.id, name, link);
          toast('Nome e link salvos.', 'ok');
        } catch (err) {
          setError(callableError(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Nome do estabelecimento
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Ex.: Padaria do Zé"
        />
      </label>
      <label>
        Link de entrada
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://sualoja.com.br"
          inputMode="url"
        />
      </label>
      <p className="muted small">
        Quem parar na vaga em frente ao seu prédio vê o botão "Entrar na loja", que abre este link numa nova
        aba.
      </p>
      {error && <p className="form-error">{error}</p>}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? 'Salvando...' : 'Salvar'}
      </button>
    </form>
  );
}

function PlaceTab({ lot }: { lot: LayoutLot }) {
  const engine = useGame((s) => s.engine);
  const close = useUi((s) => s.close);
  const toast = useUi((s) => s.toast);
  if (!engine) return null;
  return (
    <div>
      <p className="muted">Setor {lot.s}. Vá até o seu imóvel na hora ou siga as setas pela cidade.</p>
      <div className="row">
        <button
          className="btn primary"
          onClick={() => {
            engine.teleportToLot(lot.id);
            close();
          }}
        >
          Teleportar até lá
        </button>
        <button
          className="btn"
          onClick={() => {
            if (engine.setRoute(lot.id)) {
              toast('Rota traçada. Siga as setas.', 'ok');
              close();
            } else toast('Não encontramos um caminho até lá.', 'error');
          }}
        >
          Traçar rota
        </button>
      </div>
      <p className="muted small">Preço de compra pela plataforma: {formatBRL(referencePrice(lot))}.</p>
    </div>
  );
}
