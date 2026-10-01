import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/https';

/** Erro de negócio com mensagem em português (exibida ao usuário). */
export function fail(code: FunctionsErrorCode, message: string): never {
  throw new HttpsError(code, message);
}
