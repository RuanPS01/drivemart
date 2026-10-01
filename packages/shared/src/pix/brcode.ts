/**
 * BR Code do Pix (QR estático), padrão EMV QRCPS-MPM do Banco Central.
 * Usado na revenda: o comprador paga o vendedor diretamente pela chave Pix dele.
 */

export interface BrCodeInput {
  /** Chave Pix (CPF, CNPJ, e-mail, telefone +55... ou chave aleatória). */
  key: string;
  /** Nome do recebedor (até 25 caracteres, sem acentos). */
  name: string;
  /** Cidade do recebedor (até 15 caracteres, sem acentos). */
  city: string;
  /** Valor em centavos (opcional no padrão; obrigatório aqui). */
  amountCents?: number;
  /** Identificador da transação (até 25 caracteres alfanuméricos). */
  txid?: string;
  /** Mensagem opcional para o pagador. */
  description?: string;
}

function field(id: string, value: string): string {
  const len = value.length;
  if (len > 99) throw new Error(`Campo ${id} longo demais`);
  return `${id}${String(len).padStart(2, '0')}${value}`;
}

/** Remove acentos e caracteres fora do conjunto permitido. */
export function normalizeText(s: string, max: number): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,\-/@+]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

/** CRC16-CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF), como pede o padrão. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildBrCode(input: BrCodeInput): string {
  const gui = field('00', 'br.gov.bcb.pix');
  const key = field('01', input.key.trim());
  const desc = input.description ? field('02', normalizeText(input.description, 40)) : '';
  const merchantAccount = field('26', gui + key + desc);
  const txid = (input.txid ?? '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***';
  let payload =
    field('00', '01') +
    merchantAccount +
    field('52', '0000') +
    field('53', '986') +
    (input.amountCents !== undefined ? field('54', (input.amountCents / 100).toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', normalizeText(input.name, 25) || 'RECEBEDOR') +
    field('60', normalizeText(input.city, 15) || 'BRASIL') +
    field('62', field('05', txid));
  payload += '6304';
  return payload + crc16(payload);
}

/** Lê os campos de primeiro nível de um BR Code (útil em testes e conferências). */
export function parseBrCode(code: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= code.length) {
    const id = code.slice(i, i + 2);
    const len = Number(code.slice(i + 2, i + 4));
    out[id] = code.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}
