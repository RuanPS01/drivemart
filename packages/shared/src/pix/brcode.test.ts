import { describe, expect, it } from 'vitest';
import { buildBrCode, crc16, normalizeText, parseBrCode } from './brcode';
import { isValidCnpj, isValidCpf, maskPixKey, normalizePixKey } from './pixKey';

describe('crc16', () => {
  it('bate com o vetor de teste do CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});

describe('buildBrCode', () => {
  it('reproduz o exemplo de QR estático do manual do Banco Central', () => {
    // Exemplo do Manual de Padrões para Iniciação do Pix (chave aleatória, sem valor).
    const code = buildBrCode({
      key: '123e4567-e12b-12d1-a456-426655440000',
      name: 'Fulano de Tal',
      city: 'BRASILIA',
      txid: '***',
    });
    expect(code).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000' +
        '5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    );
  });

  it('monta os campos e termina com CRC válido', () => {
    const code = buildBrCode({
      key: 'maria@exemplo.com',
      name: 'Maria José da Conceição Ferreira Lima',
      city: 'São Gonçalo do Amarante',
      amountCents: 90000,
      txid: 'DM-ord_123',
      description: 'Revenda rio-abc123',
    });
    const f = parseBrCode(code);
    expect(f['53']).toBe('986');
    expect(f['54']).toBe('900.00');
    expect(f['59']).toBe('Maria Jose da Conceicao F');
    expect(f['60']).toBe('Sao Goncalo do');
    expect(f['62']).toBe('0508DMord123');
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)));
  });

  it('normaliza textos sem acentos e com limite', () => {
    expect(normalizeText('Açaí & Cia', 25)).toBe('Acai Cia');
  });
});

describe('chaves Pix', () => {
  it('valida CPF e CNPJ pelos dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
  });

  it('normaliza cada tipo de chave', () => {
    expect(normalizePixKey('cpf', '529.982.247-25')).toBe('52998224725');
    expect(normalizePixKey('phone', '(21) 99876-5432')).toBe('+5521998765432');
    expect(normalizePixKey('phone', '+55 21 99876-5432')).toBe('+5521998765432');
    expect(normalizePixKey('email', ' Maria@Exemplo.com ')).toBe('maria@exemplo.com');
    expect(normalizePixKey('random', '123E4567-E12B-12D1-A456-426655440000')).toBe(
      '123e4567-e12b-12d1-a456-426655440000',
    );
    expect(normalizePixKey('email', 'sem-arroba')).toBeNull();
    expect(normalizePixKey('phone', '123')).toBeNull();
  });

  it('oculta parte da chave', () => {
    expect(maskPixKey('email', 'maria@exemplo.com')).toBe('ma***@exemplo.com');
    expect(maskPixKey('cpf', '52998224725')).toBe('529***725');
  });
});
