"use client";

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import styles from './profile.module.css';
import searchStyles from '../search/search.module.css';
import { Menu, X, Users as UsersIcon } from 'lucide-react';

interface UserStats {
  totalShares: number;
  busStopReports: number;
  joinDate: string;
  lastActive: string;
  totalPoints: number;
  favoriteRoute: string;
}

interface UserProfile {
  username: string;
  email: string;
  profileImage?: string;
  instagramUrl?: string;
  stats: UserStats;
}

// useSearchParamsを使用するコンポーネントを分離
function ProfileContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedUsername, setEditedUsername] = useState('');
  const [editedInstagramUrl, setEditedInstagramUrl] = useState('');
  const [isOtherUser, setIsOtherUser] = useState(false); // 他のユーザーのプロフィールかどうか
  const [targetUserId, setTargetUserId] = useState<string | null>(null); // 表示対象のユーザーID
  const [menuOpen, setMenuOpen] = useState(false);
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
      } else if (user) {
        // 自分のプロフィールを取得
        targetUser = user;
        userId = user.uid;
      } else {
        // ユーザーがログインしていない場合はリダイレクト
        router.push('/');
        return;
      }

      // ユーザーの基本プロフィール情報を取得（エラーが発生してもフォールバック）
      let username = targetUser?.displayName || searchParams.get('username') || 'ユーザー';
      let joinDate = targetUser?.metadata.creationTime || new Date().toISOString();
      let instagramUrl = '';

      try {
        // 他のユーザーの場合でもFirestoreからInstagramのデータを取得
        const userDocRef = doc(db, 'Users', userId);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          username = userData.username || username;
          joinDate = userData.createdAt || joinDate;
          instagramUrl = userData.instagramUrl || '';
        }
      } catch (firestoreError) {
        console.warn('ユーザードキュメント取得エラー（基本情報を使用）:', firestoreError);
        
        // 権限エラーの場合は特別な処理
        if (firestoreError instanceof Error && firestoreError.message.includes('permission')) {
          // 他のユーザーの場合は権限エラーでもアプリを続行
          if (!isOtherUser) {
            alert('プロフィール情報にアクセスする権限がありません。ログインし直してください。');
            await signOut(auth);
            router.push('/');
            return;
          }
        }
      }

      // 統計情報を取得（エラーが発生してもフォールバック）
      const stats = await fetchUserStats(userId);

      const profile: UserProfile = {
        username,
        email: isOtherUser ? '非公開' : (targetUser?.email || ''),
        instagramUrl,
        stats: {
          ...stats,
          joinDate: new Date(joinDate).toLocaleDateString('ja-JP'),
        }
      };

      // デバッグ用ログ
      if (isOtherUser) {
        console.log('他のユーザーのプロフィール情報:', {
          username,
          instagramUrl,
          isOtherUser,
          targetUserId
        });
      }

      setUserProfile(profile);
      setEditedUsername(username);
      setEditedInstagramUrl(instagramUrl);
    } catch (error) {
      console.error('プロフィール取得エラー:', error);
      // フォールバックプロフィールを作成
      const fallbackProfile: UserProfile = {
        username: isOtherUser ? (searchParams.get('username') || 'ユーザー') : (user?.displayName || 'ユーザー'),
        email: isOtherUser ? '非公開' : (user?.email || ''),
        instagramUrl: '',
        stats: {
          totalShares: 0,
          busStopReports: 0,
          joinDate: new Date(isOtherUser ? new Date().toISOString() : (user?.metadata.creationTime || new Date().toISOString())).toLocaleDateString('ja-JP'),
          lastActive: '未記録',
          totalPoints: 0,
          favoriteRoute: '未記録'
        }
      };
      setUserProfile(fallbackProfile);
      setEditedUsername(fallbackProfile.username);
      setEditedInstagramUrl(fallbackProfile.instagramUrl || '');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserStats = async (userId: string): Promise<Omit<UserStats, 'joinDate'>> => {
    const defaultStats = {
      totalShares: 0,
      busStopReports: 0,
      lastActive: '未記録',
      totalPoints: 0,
      favoriteRoute: '未記録'
    };

    try {
      // 認証状態を確認
      if (!auth.currentUser && !isOtherUser) {
        return defaultStats;
      }

      let totalShares = 0;
      let busStopReports = 0;
      let lastActive = '未記録';
      let favoriteRoute = '未記録';
      let totalPoints = 0;

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
        
        // 権限エラーの場合は特別な処理
        if (error instanceof Error && error.message.includes('permission')) {
          console.warn('位置共有データの読み取り権限がありません');
        }
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
        
        // 権限エラーの場合は特別な処理
        if (error instanceof Error && error.message.includes('permission')) {
          console.warn('バス停通過データの読み取り権限がありません');
        }
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
        
        // 権限エラーの場合は特別な処理
        if (error instanceof Error && error.message.includes('permission')) {
          console.warn('最終アクティビティデータの読み取り権限がありません');
        }
      }

      try {
        const statsDoc = await getDoc(doc(db, 'userStats', userId));
        if (statsDoc.exists()) {
          const data = statsDoc.data();
          if (typeof data.totalPoints === 'number') {
            totalPoints = data.totalPoints;
          }
        }
      } catch (error) {
        console.warn('総合ポイント取得エラー:', error);
      }

      return {
        totalShares,
        busStopReports,
        lastActive,
        totalPoints,
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
      // 認証状態を確認
      if (!auth.currentUser) {
        alert('プロフィールを更新するにはログインが必要です');
        router.push('/');
        return;
      }

      const userDocRef = doc(db, 'Users', user.uid);
      await setDoc(userDocRef, {
        username: editedUsername.trim(),
        email: user.email,
        instagramUrl: editedInstagramUrl.trim(),
        updatedAt: new Date(),
        createdAt: userProfile?.stats.joinDate || new Date().toISOString()
      }, { merge: true });

      setUserProfile(prev => prev ? {
        ...prev,
        username: editedUsername.trim(),
        instagramUrl: editedInstagramUrl.trim()
      } : null);

      setIsEditing(false);
      alert('プロフィールを更新しました');
    } catch (error) {
      console.error('プロフィール更新エラー:', error);
      
      // 権限エラーの場合の特別な処理
      if (error instanceof Error && error.message.includes('permission')) {
        alert('プロフィール更新の権限がありません。ログインし直してください。');
        await signOut(auth);
        router.push('/');
      } else {
        alert('プロフィールの更新に失敗しました');
      }
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
      <div className={styles.profileContainer}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingMessage}>プロフィールを読み込んでいます...</p>
        </div>
      </div>
    );
  }

  if (!user || !userProfile) {
    return (
      <div className={styles.profileContainer}>
        <div className={styles.error}>
          <p className={styles.errorMessage}>プロフィール情報を読み込めませんでした</p>
          <button onClick={() => router.push('/')} className={`${styles.button} ${styles.primaryButton}`}>
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.profileContainer}>
      <div className={`${searchStyles.header} ${styles.headerBar}`}>
        <img
          src="/pokebus_icon.png"
          alt="logo"
          className={searchStyles.logo}
          onClick={() => router.push('/search')}
          style={{ cursor: 'pointer' }}
        />
        <button
          className={searchStyles.menuButton}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="メニュー"
        >
          {menuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>
      {menuOpen && (
        <div className={searchStyles.dropdown}>
          <ul className={searchStyles.dropdownList}>
            <li
              className={searchStyles.dropdownItem}
              onClick={() => {
                setMenuOpen(false);
                router.push('/ranking');
              }}
            >
              🏆 ランキング
            </li>
            <li
              className={searchStyles.dropdownItem}
              onClick={() => {
                setMenuOpen(false);
                router.push('/profile');
              }}
            >
              👤 プロフィール
            </li>
          </ul>
        </div>
      )}

      <div className={searchStyles.headerPlaceholder} aria-hidden="true" />

      <div className={styles.main}>
        <div className={styles.content}>
          <div className={styles.pageTitle}>
            <div className={styles.titleIcon}>
              <UsersIcon className={styles.titleIconSvg} />
            </div>
            <h1 className={styles.titleText}>プロフィール</h1>
            <p className={styles.titleSubtext}>乗車の履歴やアクティビティはここでチェックできます。</p>
          </div>

          <div className={styles.userCard}>
            <div className={styles.userCardHeader}>
              <div className={styles.userCardLeft}>
                <div className={styles.avatar}>
                  {userProfile.username.charAt(0).toUpperCase()}
                </div>
                <div className={styles.userInfo}>
                  {isEditing && !isOtherUser ? (
                    <div className={styles.editForm}>
                      <label className={styles.inputLabel} htmlFor="profile-username">表示名</label>
                      <input
                        id="profile-username"
                        type="text"
                        value={editedUsername}
                        onChange={(e) => setEditedUsername(e.target.value)}
                        className={styles.input}
                        placeholder="ユーザー名"
                      />
                      <label className={styles.inputLabel} htmlFor="profile-instagram">Instagram</label>
                      <input
                        id="profile-instagram"
                        type="url"
                        value={editedInstagramUrl}
                        onChange={(e) => setEditedInstagramUrl(e.target.value)}
                        className={styles.input}
                        placeholder="https://instagram.com/username"
                      />
                      <div className={styles.formActions}>
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          className={`${styles.button} ${styles.primaryButton}`}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditing(false);
                            setEditedUsername(userProfile.username);
                            setEditedInstagramUrl(userProfile.instagramUrl || '');
                          }}
                          className={`${styles.button} ${styles.ghostButton}`}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.userDetails}>
                      <h2 className={styles.userName}>{userProfile.username}</h2>
                      <p className={styles.userEmail}>{userProfile.email}</p>
                      {userProfile.instagramUrl ? (
                        <a
                          href={userProfile.instagramUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.instagramLink}
                        >
                          📸 Instagram
                        </a>
                      ) : (
                        !isOtherUser && (
                          <p className={styles.placeholderText}>Instagramのリンクは未登録です</p>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
              {!isOtherUser && !isEditing && (
                <button
                  type="button"
                  className={`${styles.button} ${styles.primaryButton}`}
                  onClick={() => setIsEditing(true)}
                >
                  プロフィールを編集
                </button>
              )}
            </div>

            {!isEditing && (
              <div className={styles.userMetaGrid}>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>登録日</span>
                  <span className={styles.metaValue}>{userProfile.stats.joinDate}</span>
                </div>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>最終利用日</span>
                  <span className={styles.metaValue}>{userProfile.stats.lastActive}</span>
                </div>
              </div>
            )}
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>利用統計</h3>
              <span className={styles.sectionHint}>最新のアクティビティに応じてリアルタイム更新</span>
            </div>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>位置共有回数</span>
                <span className={styles.statValue}>{userProfile.stats.totalShares.toLocaleString()}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>バス停通過報告</span>
                <span className={styles.statValue}>{userProfile.stats.busStopReports.toLocaleString()}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>総獲得ポイント</span>
                <span className={styles.statValue}>{userProfile.stats.totalPoints.toLocaleString()}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>よく利用するルート</span>
                <span className={styles.statValueAlt}>{userProfile.stats.favoriteRoute || '未記録'}</span>
              </div>
            </div>
          </section>

          {!isOtherUser && (
            <section className={`${styles.section} ${styles.actionsSection}`}>
              <div className={styles.actionsStack}>
                <button
                  type="button"
                  onClick={() => router.push('/settings')}
                  className={`${styles.button} ${styles.secondaryButton}`}
                >
                  設定
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className={`${styles.button} ${styles.dangerButton}`}
                >
                  ログアウト
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// メインのプロフィールページコンポーネント（Suspenseでラップ）
export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>プロフィールを読み込んでいます...</p>
        </div>
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
}
