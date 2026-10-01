import { useState } from 'react';
import { createReport, REPORT_REASONS, type ReportReason } from '../../services/resale';
import { useAuth } from '../../state/authStore';
import { useGame } from '../../state/gameStore';
import { useParcels } from '../../state/parcelStore';
import { useUi } from '../../state/uiStore';
import { lotTitle } from '../hud/ZoneCard';
import { Modal } from './Modal';

/** Denúncia da fachada ou do link de um imóvel. Vai para a fila do painel admin. */
export function ReportModal({ lotId }: { lotId: string }) {
  const engine = useGame((s) => s.engine);
  const user = useAuth((s) => s.user);
  const entry = useParcels((s) => s.entries[lotId]);
  const close = useUi((s) => s.close);
  const toast = useUi((s) => s.toast);
  const lot = engine?.parcels.byId.get(lotId);
  const [reason, setReason] = useState<ReportReason>('ofensivo');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!lot || !user) return null;

  return (
    <Modal title="Denunciar imóvel">
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await createReport(lotId, user.uid, reason, details);
            toast('Denúncia enviada. Obrigado por avisar.', 'ok');
            close();
          } catch {
            setError('Não foi possível enviar agora. Tente de novo.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          {lotTitle(lot, entry)}
          {entry?.o ? `, de ${entry.o}` : ''}. A equipe analisa a fachada e o link e pode bloquear o conteúdo.
        </p>
        <fieldset className="radio-list">
          <legend>Motivo</legend>
          {(Object.keys(REPORT_REASONS) as ReportReason[]).map((k) => (
            <label key={k} className="check">
              <input
                type="radio"
                name="reason"
                value={k}
                checked={reason === k}
                onChange={() => setReason(k)}
              />{' '}
              {REPORT_REASONS[k]}
            </label>
          ))}
        </fieldset>
        <label>
          Detalhes (opcional)
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={3} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="row">
          <button className="btn danger" type="submit" disabled={busy}>
            {busy ? 'Enviando...' : 'Enviar denúncia'}
          </button>
          <button className="btn" type="button" onClick={close}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
