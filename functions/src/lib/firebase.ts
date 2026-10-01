import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const adminAuth = getAuth();
export const bucket = () => getStorage().bucket();

export const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
