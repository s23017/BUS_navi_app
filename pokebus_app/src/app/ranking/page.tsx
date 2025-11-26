
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trophy, TrendingUp, Award, Users } from "lucide-react";
import { db, auth } from "../../../lib/firebase";
import { collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, Timestamp, runTransaction } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import styles from './ranking.module.css';
import { POINTS_PER_BUS_STOP, getWeekStart, getMonthStart, getWeekKey, getMonthKey } from "../../lib/points";
import SearchHeader from "../search/components/Header";

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
  lastPassage?: {
    stopId: string;
    stopName: string;
    tripId?: string;
    points?: number;
    awardedAt?: Timestamp;
    delay?: number | null;
    scheduledTime?: string | null;
  };
  weekKey?: string;
  monthKey?: string;
  rank?: number;
};

type Period = "weekly" | "monthly" | "overall";

const TOP_RANK_LIMIT = 5;

const normalizeTimestamp = (value: any, fallback?: Timestamp): Timestamp => {
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (value && typeof value === "object" && typeof value.seconds === "number" && typeof value.nanoseconds === "number") {
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }
  return fallback ?? Timestamp.now();
};

const normalizeLastPassage = (raw: any): RankItem["lastPassage"] => {
  if (!raw || typeof raw !== "object") return undefined;
  const awardedAt = raw.awardedAt ? normalizeTimestamp(raw.awardedAt) : undefined;
  return {
    stopId: raw.stopId || "",
    stopName: raw.stopName || "",
    tripId: raw.tripId || undefined,
    points: typeof raw.points === "number" ? raw.points : undefined,
    awardedAt,
    delay: typeof raw.delay === "number" ? raw.delay : null,
    scheduledTime: raw.scheduledTime ?? null,
  };
};

const toRankItem = (docId: string, data: any, rank?: number): RankItem => {
  const lastUpdated = normalizeTimestamp(data?.lastUpdated, Timestamp.now());
  return {
    uid: docId,
    displayName: data?.displayName || "ゲスト",
    email: data?.email || "",
    avatarUrl: data?.avatarUrl || undefined,
    weeklyPoints: data?.weeklyPoints || 0,
    monthlyPoints: data?.monthlyPoints || 0,
    totalPoints: data?.totalPoints || 0,
    busPasses: data?.busPasses || 0,
    lastUpdated,
    lastPassage: normalizeLastPassage(data?.lastPassage),
    weekKey: data?.weekKey,
    monthKey: data?.monthKey,
    rank,
  };
};

// ランキングページコンポーネント
function RankingPage() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [ranking, setRanking] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userStats, setUserStats] = useState<RankItem | null>(null);
  const [userRankState, setUserRankState] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

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

  // ユーザードキュメントを同期（週・月の区切りをリセット）
  const syncUserStatsDocument = async (userId: string) => {
    try {
      console.log('📊 ユーザー統計ドキュメント同期開始:', userId);

      const statsRef = doc(db, 'userStats', userId);
      const now = new Date();
      const weekKey = getWeekKey(now);
      const monthKey = getMonthKey(now);
      const weekStart = getWeekStart(now);
      const monthStart = getMonthStart(now);
      const nowTimestamp = Timestamp.now();

      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(statsRef);
        const existing = snapshot.exists() ? snapshot.data() : {};

        let weeklyPoints = existing?.weeklyPoints || 0;
        if (existing?.weekKey !== weekKey) {
          weeklyPoints = 0;
        }

        let monthlyPoints = existing?.monthlyPoints || 0;
        if (existing?.monthKey !== monthKey) {
          monthlyPoints = 0;
        }

        transaction.set(statsRef, {
          uid: userId,
          displayName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'ゲスト',
          email: currentUser?.email || '',
          avatarUrl: existing?.avatarUrl || null,
          weeklyPoints,
          monthlyPoints,
          totalPoints: existing?.totalPoints || 0,
          busPasses: existing?.busPasses || 0,
          weekKey,
          monthKey,
          weekStartAt: Timestamp.fromDate(weekStart),
          monthStartAt: Timestamp.fromDate(monthStart),
          lastPassage: existing?.lastPassage || null,
          lastUpdated: nowTimestamp,
        }, { merge: true });
      });

      const latestSnapshot = await getDoc(statsRef);
      if (latestSnapshot.exists()) {
        const normalized = toRankItem(latestSnapshot.id, latestSnapshot.data());
        setUserStats(normalized);
        return normalized;
      }

      return null;

    } catch (error) {
      console.error('❌ ユーザー統計ドキュメント同期エラー:', error);
      throw error;
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
        
        const rankingData: RankItem[] = snapshot.docs.map((docSnap, index) => toRankItem(docSnap.id, docSnap.data(), index + 1));

        setRanking(rankingData);
        
        // 現在のユーザーの統計を抽出
        if (currentUser) {
          const currentUserStats = rankingData.find(item => item.uid === currentUser.uid);
          if (currentUserStats) {
            setUserStats(currentUserStats);
            const indexInSnapshot = rankingData.findIndex(item => item.uid === currentUser.uid);
            const resolvedRank = currentUserStats.rank ?? (indexInSnapshot >= 0 ? indexInSnapshot + 1 : null);
            setUserRankState(resolvedRank);
          } else {
            const statsRef = doc(db, 'userStats', currentUser.uid);
            getDoc(statsRef)
              .then(snapshot => {
                if (snapshot.exists()) {
                  const normalized = toRankItem(snapshot.id, snapshot.data());
                  setUserStats(normalized);
                  setUserRankState(normalized.rank ?? null);
                }
              })
              .catch((fetchError: unknown) => {
                console.error('❌ 自分の統計取得エラー:', fetchError);
              });
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
  // 現在のユーザーの統計データとバス停通過を監視
  useEffect(() => {
    if (currentUser) {
      console.log('🔄 現在のユーザーの統計データとバス停通過監視を開始:', currentUser.uid);
      
      // 統計データの初期更新
      syncUserStatsDocument(currentUser.uid)
        .then(() => {
          console.log('✅ ユーザー統計データ初期更新完了');
        })
        .catch((error: unknown) => {
          console.error('❌ ユーザー統計データ初期更新失敗:', error);
        });

      return () => {
        // no-op cleanup
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

  const userRank = userRankState ?? userStats?.rank ?? null;
  const isUserRankedTop = typeof userRank === "number" && userRank > 0 && userRank <= TOP_RANK_LIMIT;

  const handleUserProfileNavigation = (item: RankItem, isSelf: boolean) => {
    if (!item?.uid) return;

    if (isSelf) {
      router.push('/profile');
      return;
    }

    const params = new URLSearchParams();
    params.set('userId', item.uid);
    if (item.displayName) {
      params.set('username', item.displayName);
    }

    router.push(`/profile?${params.toString()}`);
  };

  return (
    <div className={styles.rankingContainer}>
      <SearchHeader
        menuOpen={menuOpen}
        toggleMenu={() => setMenuOpen(!menuOpen)}
        onGoProfile={() => router.push('/profile')}
      />

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
                          {isUserRankedTop && userRank ? (
                            <>
                              #{userRank}
                              {getRankBadge(userRank) && (
                                <span className={styles.rankBadge}>{getRankBadge(userRank)}</span>
                              )}
                            </>
                          ) : (
                            <span>ランク外</span>
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
                    {userStats.lastPassage && (
                      <div className={styles.lastPassageInfo}>
                        <div className={styles.lastPassageTitle}>最新通過</div>
                        <div className={styles.lastPassageBody}>
                          {userStats.lastPassage.stopName}
                          {userStats.lastPassage.points ? ` (+${userStats.lastPassage.points}pt)` : ''}
                        </div>
                        {userStats.lastPassage.awardedAt && (
                          <div className={styles.lastPassageSubtext}>
                            {userStats.lastPassage.awardedAt.toDate().toLocaleString('ja-JP', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                            {typeof userStats.lastPassage.delay === 'number' && (
                              <span>
                                {' '}• {userStats.lastPassage.delay > 0
                                  ? `${userStats.lastPassage.delay}分遅れ`
                                  : userStats.lastPassage.delay < 0
                                    ? `${Math.abs(userStats.lastPassage.delay)}分早く`
                                    : '定刻'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
                    {ranking
                      .filter((_, index) => index < TOP_RANK_LIMIT)
                      .map((r, idx) => {
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
                            <button
                              type="button"
                              className={`${styles.itemAvatar} ${
                                isMe ? styles.itemAvatarMe : styles.itemAvatarOther
                              } ${styles.itemAvatarButton}`}
                              onClick={() => handleUserProfileNavigation(r, isMe)}
                              aria-label={`${r.displayName}のプロフィールを見る`}
                            >
                              {r.displayName ? r.displayName[0] : '?'}
                            </button>

                            {/* 名前とメール */}
                            <div className={styles.itemInfo}>
                              <div className={`${styles.itemName} ${isMe ? styles.itemNameMe : styles.itemNameOther}`}>
                                {r.displayName}
                                {isMe && <span className={styles.itemNameBadge}>(あなた)</span>}
                              </div>
                              {r.email && (
                                <div className={styles.itemEmail} aria-hidden="true">
                                  {/* メールアドレスはセキュリティのため表示しない */}
                                </div>
                              )}
                              {r.lastPassage && (
                                <div className={styles.itemLastPassage}>
                                  <span className={styles.itemLastPassageStop}>{r.lastPassage.stopName}</span>
                                  {r.lastPassage.points ? (
                                    <span className={styles.itemLastPassagePoints}>+{r.lastPassage.points}pt</span>
                                  ) : null}
                                  {r.lastPassage.awardedAt && (
                                    <span className={styles.itemLastPassageTime}>
                                      {r.lastPassage.awardedAt.toDate().toLocaleTimeString('ja-JP', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  )}
                                </div>
                              )}
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
