/** Tipos de chave Pix aceitos para receber na revenda. */
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export const PIX_KEY_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  phone: 'Celular',
  random: 'Chave aleatória',
};

const digits = (s: string) => s.replace(/\D/g, '');

export function isValidCpf(value: string): boolean {
  const d = digits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(value: string): boolean {
  const d = digits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/**
 * Valida e normaliza a chave no formato usado no Pix:
 * CPF e CNPJ só dígitos, celular em +55DDDNUMERO, e-mail em minúsculas, aleatória (EVP) em minúsculas.
 * Retorna nulo se for inválida.
 */
export function normalizePixKey(type: PixKeyType, raw: string): string | null {
  const v = raw.trim();
  switch (type) {
    case 'cpf':
      return isValidCpf(v) ? digits(v) : null;
    case 'cnpj':
      return isValidCnpj(v) ? digits(v) : null;
    case 'email': {
      const e = v.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 77 ? e : null;
    }
    case 'phone': {
      let d = digits(v);
      if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
      return d.length === 10 || d.length === 11 ? `+55${d}` : null;
    }
    case 'random': {
      const k = v.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k) ? k : null;
    }
  }
}

/** Oculta parte da chave para exibição. */
export function maskPixKey(type: PixKeyType, key: string): string {
  if (type === 'email') {
    const [user = '', domain = ''] = key.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  }
  if (key.length <= 6) return '***';
  return `${key.slice(0, 3)}***${key.slice(-3)}`;
}
