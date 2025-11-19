
"use client";

import React, { useState, useEffect, useRef } from "react";
import { Menu, X, Trophy, TrendingUp, Award, Users, ArrowLeft, Star } from "lucide-react";
import { db, auth } from "../../../lib/firebase";
import { collection, query, where, orderBy, limit, onSnapshot, doc, setDoc, getDoc, updateDoc, getDocs, Timestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import styles from './ranking.module.css';

type RankItem = {
  uid: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  weeklyPoints: number;
  monthlyPoints: number;
  totalPoints: number;
  busPasses: number;
  lastUpdated: Timestamp;
  rank?: number;
};

type Period = "weekly" | "monthly" | "overall";

// ポイント計算設定
const POINTS_PER_BUS_STOP = 10;

// ヘッダーコンポーネント
function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  const navigateTo = (path: string) => {
    window.location.href = path;
  };

  return (
    <>
      {/* ヘッダー */}
      <div className={styles.appHeader}>
        <div className={styles.headerContent}>
          {/* 左側：戻るボタンとタイトル */}
          <div className={styles.headerLeft}>
            <button 
              className={styles.backButton}
              onClick={() => navigateTo('/search')}
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className={styles.headerTitle}>
              🏆 ランキング
            </div>
          </div>

          {/* 右側：メニューボタン */}
          <button 
            className={styles.menuButton}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* ドロップダウンメニュー */}
        {menuOpen && (
          <div className={styles.dropdown}>
            <div className={styles.dropdownContent}>
              <ul className={styles.dropdownList}>
                <li 
                  className={`${styles.dropdownItem} ${styles.dropdownItemOther}`}
                  onClick={() => navigateTo('/search')}
                >
                  <span className={styles.dropdownItemIcon}>🏠</span>
                  <span className={styles.dropdownItemText}>ホーム</span>
                </li>
                <li className={`${styles.dropdownItem} ${styles.dropdownItemActive}`}>
                  <span className={styles.dropdownItemIcon}>🏆</span>
                  <span className={styles.dropdownItemTextActive}>ランキング</span>
                </li>
                <li 
                  className={`${styles.dropdownItem} ${styles.dropdownItemOther}`}
                  onClick={() => navigateTo('/search')}
                >
                  <span className={styles.dropdownItemIcon}>📍</span>
                  <span className={styles.dropdownItemText}>バス停検索</span>
                </li>
                <li className={`${styles.dropdownItem} ${styles.dropdownItemOther}`}>
                  <span className={styles.dropdownItemIcon}>⚙️</span>
                  <span className={styles.dropdownItemText}>設定</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ポイント計算関数
const calculatePointsFromBusPasses = (busPasses: number): number => {
  return busPasses * POINTS_PER_BUS_STOP;
};

// 週間・月間の期間判定
const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(d.setDate(diff));
};

const getMonthStart = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

// ランキングページコンポーネント
function RankingPage() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [ranking, setRanking] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userStats, setUserStats] = useState<RankItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('🔐 認証状態変更:', user ? `${user.uid} (${user.email})` : 'ログアウト');
      setCurrentUser(user);
      
      if (!user) {
        console.warn('⚠️ ユーザーがログインしていません');
        setError('ランキングを表示するにはログインが必要です');
        setLoading(false);
        return;
      }
    });

    return () => unsubscribe();
  }, []);

  // ユーザーの統計データを更新/取得
  const updateUserStats = async (userId: string) => {
    try {
      console.log('📊 ユーザー統計データ更新開始:', userId);

      const now = new Date();
      const weekStart = getWeekStart(now);
      const monthStart = getMonthStart(now);

      // 全期間のバス停通過数を取得
      const totalPassagesQuery = query(
        collection(db, 'busStopPassages'),
        where('userId', '==', userId)
      );

      // 週間のバス停通過数を取得
      const weeklyPassagesQuery = query(
        collection(db, 'busStopPassages'),
        where('userId', '==', userId),
        where('passTime', '>=', Timestamp.fromDate(weekStart))
      );

      // 月間のバス停通過数を取得
      const monthlyPassagesQuery = query(
        collection(db, 'busStopPassages'),
        where('userId', '==', userId),
        where('passTime', '>=', Timestamp.fromDate(monthStart))
      );

      const [totalSnapshot, weeklySnapshot, monthlySnapshot] = await Promise.all([
        getDocs(totalPassagesQuery),
        getDocs(weeklyPassagesQuery),
        getDocs(monthlyPassagesQuery)
      ]);

      const totalPasses = totalSnapshot.docs.length;
      const weeklyPasses = weeklySnapshot.docs.length;
      const monthlyPasses = monthlySnapshot.docs.length;

      // ポイント計算
      const userStats = {
        uid: userId,
        displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'ゲスト',
        email: currentUser?.email || '',
        weeklyPoints: calculatePointsFromBusPasses(weeklyPasses),
        monthlyPoints: calculatePointsFromBusPasses(monthlyPasses),
        totalPoints: calculatePointsFromBusPasses(totalPasses),
        busPasses: totalPasses,
        lastUpdated: Timestamp.now()
      };

      // Firestoreに統計データを保存
      const userStatsRef = doc(db, 'userStats', userId);
      await setDoc(userStatsRef, userStats, { merge: true });

      console.log('✅ ユーザー統計データ更新完了:', {
        totalPasses,
        weeklyPasses,
        monthlyPasses,
        totalPoints: userStats.totalPoints,
        weeklyPoints: userStats.weeklyPoints,
        monthlyPoints: userStats.monthlyPoints
      });
      
      return userStats;

    } catch (error) {
      console.error('❌ ユーザー統計データ更新エラー:', error);
      throw error;
    }
  };

  // リアルタイムでバス停通過を監視してランキングを更新
  const listenToBusStopPassagesForRanking = () => {
    try {
      if (!currentUser) return null;
      
      const q = query(
        collection(db, 'busStopPassages'),
        where('userId', '==', currentUser.uid),
        orderBy('passTime', 'desc'),
        limit(1) // 最新の1件のみ監視
      );
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        console.log('🚏 新しいバス停通過情報を検出:', querySnapshot.docs.length, '件');
        
        if (!querySnapshot.empty) {
          const latestPassage = querySnapshot.docs[0].data();
          console.log('📊 最新のバス停通過:', latestPassage.stopName, 'at', latestPassage.passTime.toDate());
          
          // 統計を再計算（少し遅延させてFirestoreの整合性を保つ）
          setTimeout(() => {
            updateUserStats(currentUser.uid)
              .then(() => {
                console.log('✅ ランキング統計更新完了');
              })
              .catch((error) => {
                console.error('❌ ランキング統計更新失敗:', error);
              });
          }, 1000);
        }
        
      }, (error: any) => {
        console.error('❌ バス停通過監視エラー:', error);
      });
      
      return unsubscribe;
    } catch (error: any) {
      console.error('❌ バス停通過監視の開始に失敗:', error);
      return null;
    }
  };

  // ランキングデータの取得
  const fetchRanking = (period: Period) => {
    try {
      console.log('📊 ランキングデータ取得開始:', period);
      
      if (!currentUser) {
        console.warn('⚠️ ユーザーがログインしていません');
        setError('ランキングを表示するにはログインが必要です');
        setLoading(false);
        return null;
      }
      
      setLoading(true);
      setError(null);

      let orderField = 'totalPoints';
      if (period === 'weekly') orderField = 'weeklyPoints';
      if (period === 'monthly') orderField = 'monthlyPoints';

      const rankingQuery = query(
        collection(db, 'userStats'),
        orderBy(orderField, 'desc'),
        limit(50)
      );

      console.log('🔍 Firestoreクエリ実行中...', { orderField });

      const unsubscribe = onSnapshot(rankingQuery, (snapshot) => {
        console.log('📊 ランキングデータ受信:', snapshot.docs.length, '件');
        
        const rankingData: RankItem[] = snapshot.docs.map((doc, index) => {
          const data = doc.data();
          return {
            uid: doc.id,
            displayName: data.displayName || 'ゲスト',
            email: data.email || '',
            weeklyPoints: data.weeklyPoints || 0,
            monthlyPoints: data.monthlyPoints || 0,
            totalPoints: data.totalPoints || 0,
            busPasses: data.busPasses || 0,
            lastUpdated: data.lastUpdated || Timestamp.now(),
            rank: index + 1 // 順位を追加
          };
        });

        setRanking(rankingData);
        
        // 現在のユーザーの統計を抽出
        if (currentUser) {
          const currentUserStats = rankingData.find(item => item.uid === currentUser.uid);
          if (currentUserStats) {
            setUserStats(currentUserStats);
          }
        }

        setLoading(false);
        console.log('✅ ランキングデータ設定完了');
      }, (error: any) => {
        console.error('❌ ランキングデータ取得エラー:', error);
        
        if (error.code === 'permission-denied') {
          setError('Firestoreのセキュリティルール設定に問題があります');
        } else if (error.code === 'unauthenticated') {
          setError('認証エラー: 再ログインしてください');
        } else {
          setError(`データベースエラー: ${error.message}`);
        }
        setLoading(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error('❌ ランキング取得エラー:', error);
      setError('データベース接続エラー');
      setLoading(false);
      return null;
    }
  };

  // バス停通過監視のリスナー管理
  const busStopPassageListenerRef = useRef<(() => void) | null>(null);

  // 現在のユーザーの統計データとバス停通過を監視
  useEffect(() => {
    if (currentUser) {
      console.log('🔄 現在のユーザーの統計データとバス停通過監視を開始:', currentUser.uid);
      
      // 統計データの初期更新
      updateUserStats(currentUser.uid)
        .then(() => {
          console.log('✅ ユーザー統計データ初期更新完了');
        })
        .catch((error) => {
          console.error('❌ ユーザー統計データ初期更新失敗:', error);
        });

      // バス停通過のリアルタイム監視開始
      const busStopUnsubscribe = listenToBusStopPassagesForRanking();
      busStopPassageListenerRef.current = busStopUnsubscribe;

      return () => {
        if (busStopPassageListenerRef.current) {
          busStopPassageListenerRef.current();
          busStopPassageListenerRef.current = null;
        }
      };
    }
  }, [currentUser]);

  // ランキング期間変更時にデータを再取得
  useEffect(() => {
    if (currentUser) {
      const unsubscribe = fetchRanking(period);
      return unsubscribe || undefined;
    }
  }, [period, currentUser]);

  const renderPointsFor = (item: RankItem) => {
    if (period === "weekly") return item.weeklyPoints;
    if (period === "monthly") return item.monthlyPoints;
    return item.totalPoints;
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    if (rank <= 10) return "🏆";
    return null;
  };

  const userRank = userStats?.rank || 0;

  return (
    <div className={styles.rankingContainer}>
      <Header />

      <div className={styles.main}>
        <div className={styles.content}>
          {/* ページタイトル */}
          <div className={styles.pageTitle}>
            <div className={styles.titleIcon}>
              <Trophy className={styles.trophy} />
            </div>
            <h1 className={styles.titleText}>ランキング</h1>
            <p className={styles.titleSubtext}>バス停通過でポイントを貯めて上位を目指そう！</p>
          </div>

          {error && (
            <div className={styles.error}>
              <p className={styles.errorText}>⚠️ {error}</p>
            </div>
          )}

          {currentUser ? (
            <>
              {/* ユーザーカード */}
              {userStats && (
                <div className={styles.userCard}>
                  <div className={styles.userCardHeader}>
                    <div className={styles.userCardLeft}>
                      <div className={styles.userAvatar}>
                        {userStats.displayName[0]}
                      </div>
                      <div>
                        <div className={styles.rankLabel}>あなたの現在順位</div>
                        <div className={styles.rankValue}>
                          #{userRank || "-"}
                          {getRankBadge(userRank) && (
                            <span className={styles.rankBadge}>{getRankBadge(userRank)}</span>
                          )}
                        </div>
                        <div className={styles.userName}>{userStats.displayName}</div>
                      </div>
                    </div>
                    <TrendingUp className={styles.trendingIcon} />
                  </div>

                  <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                      <div className={styles.statLabel}>週間ポイント</div>
                      <div className={styles.statValue}>{userStats.weeklyPoints.toLocaleString()}</div>
                      <div className={styles.statSubtext}>{Math.floor(userStats.weeklyPoints / POINTS_PER_BUS_STOP)}回通過</div>
                    </div>
                    <div className={styles.statCard}>
                      <div className={styles.statLabel}>月間ポイント</div>
                      <div className={styles.statValue}>{userStats.monthlyPoints.toLocaleString()}</div>
                      <div className={styles.statSubtext}>{Math.floor(userStats.monthlyPoints / POINTS_PER_BUS_STOP)}回通過</div>
                    </div>
                    <div className={styles.statCard}>
                      <div className={styles.statLabel}>総合ポイント</div>
                      <div className={styles.statValue}>{userStats.totalPoints.toLocaleString()}</div>
                      <div className={styles.statSubtext}>{userStats.busPasses}回通過</div>
                    </div>
                  </div>
                  
                  <div className={styles.pointsInfo}>
                    <div className={styles.pointsTitle}>🎯 ポイント獲得方法</div>
                    <div className={styles.pointsText}>
                      • バス停通過: <span className={styles.pointsHighlight}>+{POINTS_PER_BUS_STOP}ポイント</span><br/>
                      • 「乗車中」状態でバス停付近を通過すると自動獲得<br/>
                      • リアルタイム位置共有で他のユーザーと競い合おう！
                    </div>
                  </div>
                </div>
              )}

              {/* 期間切替 */}
              <div className={styles.periodTabs}>
                <button
                  className={`${styles.periodTab} ${
                    period === "weekly" ? styles.periodTabActive : styles.periodTabInactive
                  }`}
                  onClick={() => setPeriod("weekly")}
                >
                  週間ランキング
                </button>
                <button
                  className={`${styles.periodTab} ${
                    period === "monthly" ? styles.periodTabActive : styles.periodTabInactive
                  }`}
                  onClick={() => setPeriod("monthly")}
                >
                  月間ランキング
                </button>
                <button
                  className={`${styles.periodTab} ${
                    period === "overall" ? styles.periodTabActive : styles.periodTabInactive
                  }`}
                  onClick={() => setPeriod("overall")}
                >
                  総合ランキング
                </button>
              </div>

              {/* ランキングリスト */}
              <div className={styles.rankingList}>
                <div className={styles.rankingHeader}>
                  <Users className="w-5 h-5" />
                  <h2 className={styles.rankingTitle}>ランキング一覧</h2>
                  <div className={styles.periodLabel}>
                    {period === 'weekly' && '今週の獲得ポイント'}
                    {period === 'monthly' && '今月の獲得ポイント'}
                    {period === 'overall' && '総合獲得ポイント'}
                  </div>
                </div>

                {loading ? (
                  <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                    <p className={styles.loadingText}>読み込み中...</p>
                  </div>
                ) : ranking.length === 0 ? (
                  <div className={styles.noData}>
                    <p className={styles.noDataText}>まだランキングデータがありません</p>
                    <p className={styles.noDataSubtext}>バス停を通過してポイントを貯めましょう！</p>
                  </div>
                ) : (
                  <div className={styles.rankingItems}>
                    {ranking.map((r, idx) => {
                      const isMe = currentUser && r.uid === currentUser.uid;
                      const rank = r.rank || idx + 1;
                      const badge = getRankBadge(rank);
                      const points = renderPointsFor(r);
                      
                      return (
                        <div
                          key={r.uid}
                          className={`${styles.rankingItem} ${
                            isMe ? styles.rankingItemMe : styles.rankingItemOther
                          }`}
                        >
                          <div className={styles.rankingItemContent}>
                            {/* 順位 */}
                            <div className={styles.rankPosition}>
                              {badge ? (
                                <div className={styles.rankBadgeLarge}>{badge}</div>
                              ) : (
                                <div className={`${styles.rankNumber} ${isMe ? styles.rankNumberMe : styles.rankNumberOther}`}>
                                  #{rank}
                                </div>
                              )}
                            </div>

                            {/* アバター */}
                            <div
                              className={`${styles.itemAvatar} ${
                                isMe ? styles.itemAvatarMe : styles.itemAvatarOther
                              }`}
                            >
                              {r.displayName[0]}
                            </div>

                            {/* 名前とメール */}
                            <div className={styles.itemInfo}>
                              <div className={`${styles.itemName} ${isMe ? styles.itemNameMe : styles.itemNameOther}`}>
                                {r.displayName}
                                {isMe && <span className={styles.itemNameBadge}>(あなた)</span>}
                              </div>
                              <div className={styles.itemEmail}>{r.email}</div>
                            </div>

                            {/* ポイントとバス通過回数 */}
                            <div className={styles.itemStats}>
                              <div className={`${styles.itemPoints} ${isMe ? styles.itemPointsMe : styles.itemPointsOther}`}>
                                {points.toLocaleString()}
                              </div>
                              <div className={styles.itemPointsLabel}>ポイント</div>
                              <div className={styles.itemBadge}>
                                <Award className={styles.itemBadgeIcon} />
                                <span className={styles.itemBadgeText}>{r.busPasses}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className={styles.footer}>
                <p className={styles.footerText}>
                  🎯 バス停通過1回につき{POINTS_PER_BUS_STOP}ポイント自動獲得
                </p>
                <p className={styles.footerText}>
                  ✨ Firebase連携済み - リアルタイム更新
                </p>
                <p className={styles.footerText}>
                  🚌 「乗車中」状態でバス停付近を通過すると自動でポイント獲得
                </p>
              </div>
            </>
          ) : (
            <div className={styles.loginRequired}>
              <div className={styles.loginIcon}>🔒</div>
              <h3 className={styles.loginTitle}>
                ログインが必要です
              </h3>
              <p className={styles.loginText}>
                ランキング機能を利用するには認証が必要です
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RankingPageMain() {
  return <RankingPage />;
}