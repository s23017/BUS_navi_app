// 認証関連の機能
import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { generateGuestUserId, getUserDisplayName } from './utils';

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const sessionUserIdRef = useRef<string>(generateGuestUserId());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      console.log('認証状態変更:', user ? `ログイン済み: ${getUserDisplayName(user)}` : '未ログイン');
    });

    return () => unsubscribe();
  }, []);

  const getEffectiveUserId = () => currentUser?.uid || sessionUserIdRef.current;
  
  const ensureSessionUserId = () => {
    if (!sessionUserIdRef.current) {
      sessionUserIdRef.current = generateGuestUserId();
    }
    return sessionUserIdRef.current;
  };

  return {
    currentUser,
    authLoading,
    getEffectiveUserId,
    ensureSessionUserId,
    sessionUserIdRef
  };
};
