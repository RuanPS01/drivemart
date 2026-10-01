/** Identificador de cidade suportada pelo jogo. */
export type CityId = 'rio';

/** Situação de um lote. Sem documento no Firestore, o lote está disponível para compra da plataforma. */
export type ParcelStatus = 'available' | 'reserved' | 'owned' | 'for_sale';

export type FacadeKind = 'image' | 'gif';
export type FacadeFit = 'cover' | 'contain';
/** Área coberta pela imagem: fachada inteira ou só o térreo (letreiro). */
export type FacadeRegion = 'full' | 'ground';
export type ModerationState = 'ok' | 'blocked';

export interface ParcelFacade {
  /** Caminho no Storage (facades/<lote>/<arquivo>). */
  path: string;
  /** URL pública de download. */
  url: string;
  kind: FacadeKind;
  fit: FacadeFit;
  region: FacadeRegion;
  /** Pixelar e reduzir cores como no PS1. */
  ps1: boolean;
  /** Cor de fundo (hex) usada no modo "conter". */
  background: string;
  width: number;
  height: number;
  moderation: ModerationState;
  updatedAt: number;
}

export interface ParcelReservation {
  orderId: string;
  uid: string;
  /** Validade em milissegundos desde a época. */
  until: number;
}

/** Documento `parcels/{id}`. Campos de catálogo vêm do seed; o resto só as functions escrevem. */
export interface ParcelDoc {
  cityId: CityId;
  basePrice: number;
  area: number;
  floors: number;
  height: number;
  sector: string;
  orla: boolean;
  region: string;
  purchasable: boolean;
  status?: ParcelStatus;
  ownerUid?: string | null;
  ownerName?: string | null;
  reservation?: ParcelReservation | null;
  displayName?: string | null;
  linkUrl?: string | null;
  facade?: ParcelFacade | null;
  /** Preço de revenda (centavos) quando `status` é `for_sale`. */
  salePrice?: number | null;
  purchasedAt?: number | null;
  updatedAt?: number;
}

/** Resumo público de um lote não disponível, guardado em `cityState/{região}`. */
export interface CityStateEntry {
  s: Exclude<ParcelStatus, 'available'>;
  /** Uid do dono. */
  ou?: string;
  /** Nome público do dono. */
  o?: string;
  /** Nome do estabelecimento. */
  n?: string;
  /** Link de entrada. */
  l?: string;
  /** Preço de revenda (centavos). */
  p?: number;
  f?: {
    u: string;
    k: FacadeKind;
    fit: FacadeFit;
    r: FacadeRegion;
    ps1: boolean;
    bg: string;
    v: number;
  };
}

export interface CityStateDoc {
  cityId: CityId;
  parcels: Record<string, CityStateEntry>;
}

/** Monta o resumo público a partir do documento do lote (usado pelas functions e nos testes). */
export function toCityStateEntry(p: ParcelDoc): CityStateEntry | null {
  const status = p.status ?? 'available';
  if (status === 'available') return null;
  const e: CityStateEntry = { s: status };
  if (p.ownerUid) e.ou = p.ownerUid;
  if (p.ownerName) e.o = p.ownerName;
  if (p.displayName) e.n = p.displayName;
  if (p.linkUrl) e.l = p.linkUrl;
  if (status === 'for_sale' && p.salePrice) e.p = p.salePrice;
  if (p.facade && p.facade.moderation === 'ok') {
    e.f = {
      u: p.facade.url,
      k: p.facade.kind,
      fit: p.facade.fit,
      r: p.facade.region,
      ps1: p.facade.ps1,
      bg: p.facade.background,
      v: p.facade.updatedAt,
    };
  }
  return e;
}
