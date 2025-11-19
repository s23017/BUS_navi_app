// hooks/useAuth.ts - 認証管理フック
import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

export const useAuth = (auth: any) => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const sessionUserIdRef = useRef<string | null>(null);

  const generateGuestUserId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `guest_${crypto.randomUUID()}`;
    }
    return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  };

  const ensureSessionUserId = () => {
    if (currentUser?.uid) {
      sessionUserIdRef.current = currentUser.uid;
      return currentUser.uid;
    }
    if (!sessionUserIdRef.current) {
      sessionUserIdRef.current = generateGuestUserId();
    }
    return sessionUserIdRef.current;
  };

  const getEffectiveUserId = () => currentUser?.uid || sessionUserIdRef.current;

  useEffect(() => {
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user?.uid) {
        sessionUserIdRef.current = user.uid;
      }
    });

    return () => unsubscribe();
  }, [auth]);

  return {
    currentUser,
    sessionUserIdRef,
    ensureSessionUserId,
    getEffectiveUserId
  };
};
