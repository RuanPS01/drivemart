import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth, type SessionUser } from '../state/authStore';
import { firebase } from './firebase';

/** Mensagens em português para os erros mais comuns do Firebase Auth. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/missing-email': 'Informe o e-mail.',
    'auth/missing-password': 'Informe a senha.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Tente entrar.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'Não encontramos uma conta com este e-mail.',
    'auth/user-disabled': 'Esta conta foi desativada.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de concluir.',
    'auth/cancelled-popup-request': 'A janela do Google foi fechada antes de concluir.',
    'auth/network-request-failed': 'Sem conexão. Verifique a internet e tente de novo.',
    'auth/operation-not-allowed': 'Este método de login não está ativado no projeto.',
  };
  return map[code] ?? 'Não foi possível concluir. Tente de novo.';
}

async function toSession(user: User): Promise<SessionUser> {
  const admin = await user
    .getIdTokenResult()
    .then((t) => t.claims.admin === true)
    .catch(() => false);
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    google: user.providerData.some((p) => p.providerId === 'google.com'),
    admin,
  };
}

/** Começa a acompanhar a sessão (chamado uma vez no início do app). */
export function initAuth(): () => void {
  const fb = firebase();
  if (!fb) {
    useAuth.getState().set({ ready: true, user: null });
    return () => {};
  }
  getRedirectResult(fb.auth).catch(() => {});
  return onAuthStateChanged(fb.auth, async (user) => {
    useAuth.getState().set({ ready: true, user: user ? await toSession(user) : null });
  });
}

function requireFirebase() {
  const fb = firebase();
  if (!fb) throw Object.assign(new Error('Firebase não configurado'), { code: 'auth/operation-not-allowed' });
  return fb;
}

async function saveProfile(user: User, displayName: string): Promise<void> {
  const fb = requireFirebase();
  await setDoc(
    doc(fb.db, 'users', user.uid),
    {
      displayName: displayName.slice(0, 40),
      photoURL: user.photoURL ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function signInEmail(email: string, password: string): Promise<void> {
  const fb = requireFirebase();
  await signInWithEmailAndPassword(fb.auth, email.trim(), password);
}

export async function signUpEmail(name: string, email: string, password: string): Promise<void> {
  const fb = requireFirebase();
  const cred = await createUserWithEmailAndPassword(fb.auth, email.trim(), password);
  const displayName = name.trim() || email.split('@')[0]!;
  await updateProfile(cred.user, { displayName });
  await saveProfile(cred.user, displayName).catch(() => {});
  await sendEmailVerification(cred.user).catch(() => {});
  useAuth.getState().set({ user: await toSession(cred.user) });
}

export async function signInGoogle(): Promise<void> {
  const fb = requireFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(fb.auth, provider);
    await saveProfile(cred.user, cred.user.displayName ?? 'Motorista').catch(() => {});
  } catch (err) {
    // Bloqueador de pop-up (comum no celular): segue com redirecionamento.
    if ((err as { code?: string }).code === 'auth/popup-blocked') await signInWithRedirect(fb.auth, provider);
    else throw err;
  }
}

export async function resetPassword(email: string): Promise<void> {
  const fb = requireFirebase();
  await sendPasswordResetEmail(fb.auth, email.trim());
}

export async function resendVerification(): Promise<void> {
  const fb = requireFirebase();
  if (fb.auth.currentUser) await sendEmailVerification(fb.auth.currentUser);
}

/** Recarrega o usuário (depois de confirmar o e-mail em outra aba). */
export async function refreshUser(): Promise<SessionUser | null> {
  const fb = requireFirebase();
  const u = fb.auth.currentUser;
  if (!u) return null;
  await reload(u);
  await u.getIdToken(true);
  const s = await toSession(u);
  useAuth.getState().set({ user: s });
  return s;
}

export async function signOut(): Promise<void> {
  const fb = firebase();
  if (fb) await fbSignOut(fb.auth);
}

/** Conta pode comprar? (Google sempre; e-mail e senha só com e-mail confirmado.) */
export function canPurchase(user: SessionUser | null): boolean {
  return !!user && (user.google || user.emailVerified);
}
