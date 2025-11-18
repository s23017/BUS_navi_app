'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import styles from './profile.module.css';

interface UserStats {
  totalShares: number;
  busStopReports: number;
  joinDate: string;
  lastActive: string;
  totalDistance: number;
  favoriteRoute: string;
}

interface UserProfile {
  username: string;
  email: string;
  profileImage?: string;
  stats: UserStats;
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedUsername, setEditedUsername] = useState('');
  const [isOtherUser, setIsOtherUser] = useState(false); // 他のユーザーのプロフィールかどうか
  const [targetUserId, setTargetUserId] = useState<string | null>(null); // 表示対象のユーザーID
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // URLパラメータから他のユーザーの情報を取得
    const userId = searchParams.get('userId');
    const username = searchParams.get('username');
    
    if (userId && userId !== user?.uid) {
      setIsOtherUser(true);
      setTargetUserId(userId);
      console.log('他のユーザーのプロフィール表示:', { userId, username });
    } else {
      setIsOtherUser(false);
      setTargetUserId(null);
    }
  }, [searchParams, user]);

  useEffect(() => {
    if (loading) return;
    
    if (!user && !isOtherUser) {
      router.push('/');
      return;
    }

    fetchUserProfile();
  }, [user, loading, isOtherUser, targetUserId, router]);

  const fetchUserProfile = async () => {
    try {
      setIsLoading(true);

      let targetUser: User | null = null;
      let userId: string;
      
      if (isOtherUser && targetUserId) {
        // 他のユーザーのプロフィールを取得
        userId = targetUserId;
        console.log('他のユーザーのプロフィール取得開始:', userId);
      } else if (user) {
        // 自分のプロフィールを取得
        targetUser = user;
        userId = user.uid;
      } else {
        return;
      }

      // ユーザーの基本プロフィール情報を取得（エラーが発生してもフォールバック）
      let username = targetUser?.displayName || searchParams.get('username') || 'ユーザー';
      let joinDate = targetUser?.metadata.creationTime || new Date().toISOString();

      try {
        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          username = userData.username || username;
          joinDate = userData.createdAt || joinDate;
        }
      } catch (firestoreError) {
        console.warn('ユーザードキュメント取得エラー（基本情報を使用）:', firestoreError);
      }

      // 統計情報を取得（エラーが発生してもフォールバック）
      const stats = await fetchUserStats(userId);

      const profile: UserProfile = {
        username,
        email: isOtherUser ? '非公開' : (targetUser?.email || ''),
        stats: {
          ...stats,
          joinDate: new Date(joinDate).toLocaleDateString('ja-JP'),
        }
      };

      setUserProfile(profile);
      setEditedUsername(username);
    } catch (error) {
      console.error('プロフィール取得エラー:', error);
      // フォールバックプロフィールを作成
      const fallbackProfile: UserProfile = {
        username: isOtherUser ? (searchParams.get('username') || 'ユーザー') : (user?.displayName || 'ユーザー'),
        email: isOtherUser ? '非公開' : (user?.email || ''),
        stats: {
          totalShares: 0,
          busStopReports: 0,
          joinDate: new Date(isOtherUser ? new Date().toISOString() : (user?.metadata.creationTime || new Date().toISOString())).toLocaleDateString('ja-JP'),
          lastActive: '未記録',
          totalDistance: 0,
          favoriteRoute: '未記録'
        }
      };
      setUserProfile(fallbackProfile);
      setEditedUsername(fallbackProfile.username);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserStats = async (userId: string): Promise<Omit<UserStats, 'joinDate'>> => {
    const defaultStats = {
      totalShares: 0,
      busStopReports: 0,
      lastActive: '未記録',
      totalDistance: 0,
      favoriteRoute: '未記録'
    };

    try {
      let totalShares = 0;
      let busStopReports = 0;
      let lastActive = '未記録';
      let favoriteRoute = '未記録';

      // 位置共有回数を取得（エラー処理付き）
      try {
        const locationSharesQuery = query(
          collection(db, 'busRiderLocations'),
          where('userId', '==', userId)
        );
        const locationSharesSnapshot = await getDocs(locationSharesQuery);
        totalShares = locationSharesSnapshot.size;
      } catch (error) {
        console.warn('位置共有データ取得エラー:', error);
      }

      // バス停通過報告数を取得（エラー処理付き）
      try {
        const busStopReportsQuery = query(
          collection(db, 'busStopPassages'),
          where('userId', '==', userId)
        );
        const busStopReportsSnapshot = await getDocs(busStopReportsQuery);
        busStopReports = busStopReportsSnapshot.size;

        // よく利用するルートを取得
        const routeUsageMap = new Map<string, number>();
        busStopReportsSnapshot.docs.forEach(doc => {
          const tripId = doc.data().tripId;
          if (tripId) {
            routeUsageMap.set(tripId, (routeUsageMap.get(tripId) || 0) + 1);
          }
        });

        let maxUsage = 0;
        for (const [tripId, usage] of routeUsageMap.entries()) {
          if (usage > maxUsage) {
            maxUsage = usage;
            favoriteRoute = `便ID: ${tripId.substring(0, 8)}...`;
          }
        }
      } catch (error) {
        console.warn('バス停通過データ取得エラー:', error);
      }

      // 最後のアクティビティを取得（エラー処理付き）
      try {
        const lastActivityQuery = query(
          collection(db, 'busRiderLocations'),
          where('userId', '==', userId),
          orderBy('timestamp', 'desc'),
          limit(1)
        );
        const lastActivitySnapshot = await getDocs(lastActivityQuery);
        
        if (!lastActivitySnapshot.empty) {
          const lastDoc = lastActivitySnapshot.docs[0];
          const lastTimestamp = lastDoc.data().timestamp;
          if (lastTimestamp && lastTimestamp.toDate) {
            lastActive = lastTimestamp.toDate().toLocaleDateString('ja-JP');
          }
        }
      } catch (error) {
        console.warn('最終アクティビティ取得エラー:', error);
      }

      return {
        totalShares,
        busStopReports,
        lastActive,
        totalDistance: Math.floor(Math.random() * 1000), // 仮の実装
        favoriteRoute
      };
    } catch (error) {
      console.error('統計情報取得エラー:', error);
      return defaultStats;
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !editedUsername.trim()) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        username: editedUsername.trim(),
        email: user.email,
        updatedAt: new Date(),
        createdAt: userProfile?.stats.joinDate || new Date().toISOString()
      }, { merge: true });

      setUserProfile(prev => prev ? {
        ...prev,
        username: editedUsername.trim()
      } : null);

      setIsEditing(false);
      alert('プロフィールを更新しました');
    } catch (error) {
      console.error('プロフィール更新エラー:', error);
      alert('プロフィールの更新に失敗しました');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  if (loading || isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>プロフィールを読み込んでいます...</p>
        </div>
      </div>
    );
  }

  if (!user || !userProfile) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>プロフィール情報を読み込めませんでした</p>
          <button onClick={() => router.push('/')} className={styles.button}>
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button 
          onClick={() => router.back()} 
          className={styles.backButton}
          aria-label="戻る"
        >
          ←
        </button>
        <h1 className={styles.title}>
          {isOtherUser ? `${userProfile.username}のプロフィール` : 'プロフィール'}
        </h1>
      </div>

      <div className={styles.profileCard}>
        <div className={styles.avatarSection}>
          <div className={styles.avatar}>
            {userProfile.username.charAt(0).toUpperCase()}
          </div>
          <div className={styles.userInfo}>
            {isEditing && !isOtherUser ? (
              <div className={styles.editSection}>
                <input
                  type="text"
                  value={editedUsername}
                  onChange={(e) => setEditedUsername(e.target.value)}
                  className={styles.usernameInput}
                  placeholder="ユーザー名"
                />
                <div className={styles.editButtons}>
                  <button 
                    onClick={handleSaveProfile} 
                    className={`${styles.button} ${styles.saveButton}`}
                  >
                    保存
                  </button>
                  <button 
                    onClick={() => {
                      setIsEditing(false);
                      setEditedUsername(userProfile.username);
                    }}
                    className={`${styles.button} ${styles.cancelButton}`}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.userDetails}>
                <h2 className={styles.username}>{userProfile.username}</h2>
                <p className={styles.email}>{userProfile.email}</p>
                {!isOtherUser && (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className={styles.editButton}
                  >
                    編集
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.statsSection}>
        <h3 className={styles.sectionTitle}>利用統計</h3>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statNumber}>{userProfile.stats.totalShares}</div>
            <div className={styles.statLabel}>位置共有回数</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statNumber}>{userProfile.stats.busStopReports}</div>
            <div className={styles.statLabel}>バス停通過報告</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statNumber}>{userProfile.stats.totalDistance}km</div>
            <div className={styles.statLabel}>累計移動距離</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statText}>{userProfile.stats.favoriteRoute}</div>
            <div className={styles.statLabel}>よく利用するルート</div>
          </div>
        </div>
      </div>

      <div className={styles.infoSection}>
        <h3 className={styles.sectionTitle}>アカウント情報</h3>
        <div className={styles.infoList}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>登録日</span>
            <span className={styles.infoValue}>{userProfile.stats.joinDate}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>最終利用日</span>
            <span className={styles.infoValue}>{userProfile.stats.lastActive}</span>
          </div>
        </div>
      </div>

      {!isOtherUser && (
        <div className={styles.actions}>
          <button 
            onClick={() => router.push('/settings')}
            className={`${styles.button} ${styles.secondaryButton}`}
          >
            設定
          </button>
          <button 
            onClick={handleSignOut}
            className={`${styles.button} ${styles.signOutButton}`}
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
