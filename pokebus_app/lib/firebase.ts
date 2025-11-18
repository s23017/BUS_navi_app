import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);

// 認証状態をチェックするヘルパー関数
export const isUserAuthenticated = (): boolean => {
  return !!auth.currentUser;
};

// 現在のユーザーを取得するヘルパー関数
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

// セッションベースのユーザーIDを生成（匿名ユーザー用）
export const ensureSessionUserId = (): string => {
  if (auth.currentUser) {
    return auth.currentUser.uid;
  }
  
  // 匿名ユーザーの場合、ローカルストレージからセッションIDを取得または生成
  let sessionId = localStorage.getItem('anonymousSessionId');
  if (!sessionId) {
    sessionId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('anonymousSessionId', sessionId);
  }
  return sessionId;
};

// ユーザーの表示名を取得するヘルパー関数
export const getUserDisplayName = (user: User | null): string => {
  if (!user) return 'ゲスト';
  return user.displayName || user.email?.split('@')[0] || 'ユーザー';
};

export default app;
