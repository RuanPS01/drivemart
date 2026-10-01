import type { Request } from 'firebase-functions/https';
import { WebhookSignatureValidator } from 'mercadopago';
import { applyChargeStatus } from '../orders/settle';
import { providerByName } from '../payments';

interface WebhookBody {
  type?: string;
  action?: string;
  data?: { id?: string };
}

/** Valida a assinatura `x-signature` (HMAC SHA-256). O manifesto usa o data.id em minúsculas. */
export function validSignature(
  req: Pick<Request, 'header' | 'query'>,
  dataId: string,
  secret: string,
): boolean {
  if (!secret) return false;
  for (const id of [dataId.toLowerCase(), dataId]) {
    try {
      WebhookSignatureValidator.validate({
        xSignature: req.header('x-signature'),
        xRequestId: req.header('x-request-id'),
        dataId: id,
        secret,
        toleranceSeconds: 600,
      });
      return true;
    } catch {
      /* tenta a próxima forma */
    }
  }
  return false;
}

/**
 * Notificações de pedidos do Mercado Pago. Nunca confia no corpo: consulta o pedido na API
 * e aplica o estado. Responde 200 rápido para eventos irrelevantes.
 */
export async function handleMercadoPagoWebhook(
  req: Request,
  secret: string,
): Promise<{ status: number; body: string }> {
  const body = (req.body ?? {}) as WebhookBody;
  const queryId = typeof req.query['data.id'] === 'string' ? (req.query['data.id'] as string) : undefined;
  const dataId = queryId ?? body.data?.id;
  const type = (req.query.type as string | undefined) ?? body.type;
  if (!dataId) return { status: 200, body: 'sem id' };
  if (!validSignature(req, dataId, secret)) return { status: 401, body: 'assinatura inválida' };
  if (type && type !== 'order') return { status: 200, body: `ignorado: ${type}` };

  const st = await providerByName('mercadopago').getStatus(dataId);
  if (!st.externalReference) return { status: 200, body: 'sem referência' };
  const result = await applyChargeStatus(st.externalReference, st);
  return { status: 200, body: result };
}
