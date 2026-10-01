import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/app', () => ({ getApps: () => [{}], initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}), FieldValue: {} }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({}) }));
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({ bucket: () => ({}) }) }));

const { validSignature } = await import('../src/webhooks/mercadopago');
const { mapOrderStatus } = await import('../src/payments/mercadopago');

function signedRequest(
  dataId: string,
  secret: string,
  requestId = 'req-1',
  ts = Math.floor(Date.now() / 1000).toString(),
) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  const headers: Record<string, string> = { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
  return { header: (name: string) => headers[name.toLowerCase()], query: { 'data.id': dataId } };
}

describe('assinatura do webhook do Mercado Pago', () => {
  it('aceita assinatura válida (data.id alfanumérico em minúsculas no manifesto)', () => {
    const req = signedRequest('ORD01ABCDEF', 'segredo');
    expect(validSignature(req as never, 'ORD01ABCDEF', 'segredo')).toBe(true);
  });

  it('rejeita segredo errado, cabeçalho ausente ou segredo vazio', () => {
    const req = signedRequest('ORD01ABCDEF', 'segredo');
    expect(validSignature(req as never, 'ORD01ABCDEF', 'outro')).toBe(false);
    expect(validSignature({ header: () => undefined, query: {} } as never, 'ORD01ABCDEF', 'segredo')).toBe(
      false,
    );
    expect(validSignature(req as never, 'ORD01ABCDEF', '')).toBe(false);
  });

  it('rejeita notificação antiga (replay)', () => {
    const old = (Math.floor(Date.now() / 1000) - 3600).toString();
    const req = signedRequest('ORD01ABCDEF', 'segredo', 'req-2', old);
    expect(validSignature(req as never, 'ORD01ABCDEF', 'segredo')).toBe(false);
  });
});

describe('status dos pedidos do Mercado Pago', () => {
  it('converte para o estado interno', () => {
    expect(mapOrderStatus('processed', 'accredited')).toBe('paid');
    expect(mapOrderStatus('action_required', 'waiting_transfer')).toBe('pending');
    expect(mapOrderStatus('expired', 'expired')).toBe('expired');
    expect(mapOrderStatus('canceled', 'canceled')).toBe('canceled');
    expect(mapOrderStatus('refunded', 'refunded')).toBe('refunded');
  });
});
