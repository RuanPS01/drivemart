import type { LayoutLot } from '@drivemart/shared';
import type { OwnedParcel } from '../../services/parcels';

/** Venda do imóvel (revenda com chave Pix). */
export function SaleTab(_props: { parcel: OwnedParcel; lot: LayoutLot }) {
  return <p className="muted">Em breve: coloque seu imóvel à venda informando apenas a sua chave Pix.</p>;
}
