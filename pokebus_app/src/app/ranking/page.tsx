"use client";

import React, { useEffect, useState } from "react";
import { Trophy, TrendingUp, Award, Users } from "lucide-react";

type RankItem = {
  uid: string;
  displayName: string;
  avatarUrl?: string;
  weeklyPoints: number;
  monthlyPoints: number;
  totalPoints: number;
  busPasses: number;
};

type Period = "weekly" | "monthly" | "overall";

const SAMPLE_USER: RankItem = {
  uid: "me",
  displayName: "あなた",
  avatarUrl: undefined,
  weeklyPoints: 120,
  monthlyPoints: 480,
  totalPoints: 3240,
  busPasses: 34,
};

const SAMPLE_RANKING: RankItem[] = [
  { uid: "u1", displayName: "Alice", weeklyPoints: 220, monthlyPoints: 900, totalPoints: 5400, busPasses: 78 },
  { uid: "u2", displayName: "Bob", weeklyPoints: 200, monthlyPoints: 760, totalPoints: 4800, busPasses: 64 },
  { uid: "u3", displayName: "Carol", weeklyPoints: 170, monthlyPoints: 620, totalPoints: 4120, busPasses: 58 },
  { uid: "me", displayName: "あなた", weeklyPoints: 120, monthlyPoints: 480, totalPoints: 3240, busPasses: 34 },
  { uid: "u5", displayName: "Eve", weeklyPoints: 80, monthlyPoints: 300, totalPoints: 2100, busPasses: 20 },
];

export default function RankingPage() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [ranking, setRanking] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<RankItem | null>(null);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      const list = [...SAMPLE_RANKING];
      if (period === "weekly") {
        list.sort((a, b) => b.weeklyPoints - a.weeklyPoints);
      } else if (period === "monthly") {
        list.sort((a, b) => b.monthlyPoints - a.monthlyPoints);
      } else {
        list.sort((a, b) => b.totalPoints - a.totalPoints);
      }
      setRanking(list);
      const me = list.find((r) => r.uid === SAMPLE_USER.uid) ?? SAMPLE_USER;
      setUser(me);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [period]);

  const renderPointsFor = (item: RankItem) => {
    if (period === "weekly") return item.weeklyPoints;
    if (period === "monthly") return item.monthlyPoints;
    return item.totalPoints;
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return null;
  };

  const userRank = ranking.findIndex((r) => r.uid === user?.uid) + 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full mb-4 shadow-lg">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">ランキング</h1>
          <p className="text-gray-600">あなたの順位と実績を確認しましょう</p>
        </div>

        {/* ユーザーカード */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl shadow-xl p-6 mb-6 text-white">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-bold text-2xl border-2 border-white/30">
                {user?.displayName?.[0] ?? "あ"}
              </div>
              <div>
                <div className="text-sm opacity-90">あなたの現在順位</div>
                <div className="text-4xl font-bold flex items-center gap-2">
                  #{userRank || "-"}
                  {getRankBadge(userRank) && <span className="text-3xl">{getRankBadge(userRank)}</span>}
                </div>
              </div>
            </div>
            <TrendingUp className="w-8 h-8 opacity-50" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
              <div className="text-xs opacity-90 mb-1">週間</div>
              <div className="text-2xl font-bold">{user?.weeklyPoints ?? "-"}</div>
              <div className="text-xs opacity-75">ポイント</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
              <div className="text-xs opacity-90 mb-1">月間</div>
              <div className="text-2xl font-bold">{user?.monthlyPoints ?? "-"}</div>
              <div className="text-xs opacity-75">ポイント</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/20">
              <div className="text-xs opacity-90 mb-1">バス</div>
              <div className="text-2xl font-bold">{user?.busPasses ?? "-"}</div>
              <div className="text-xs opacity-75">通過数</div>
            </div>
          </div>
        </div>

        {/* 期間切替 */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <button
            className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              period === "weekly"
                ? "bg-white text-indigo-600 shadow-md scale-105"
                : "bg-white/60 text-gray-600 hover:bg-white/80"
            }`}
            onClick={() => setPeriod("weekly")}
          >
            週間
          </button>
          <button
            className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              period === "monthly"
                ? "bg-white text-indigo-600 shadow-md scale-105"
                : "bg-white/60 text-gray-600 hover:bg-white/80"
            }`}
            onClick={() => setPeriod("monthly")}
          >
            月間
          </button>
          <button
            className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              period === "overall"
                ? "bg-white text-indigo-600 shadow-md scale-105"
                : "bg-white/60 text-gray-600 hover:bg-white/80"
            }`}
            onClick={() => setPeriod("overall")}
          >
            総合
          </button>
        </div>

        {/* ランキングリスト */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 flex items-center gap-2 border-b">
            <Users className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-gray-800">ランキング一覧</h2>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-gray-400 mt-4">読み込み中...</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {ranking.map((r, idx) => {
                const isMe = r.uid === user?.uid;
                const rank = idx + 1;
                const badge = getRankBadge(rank);
                
                return (
                  <div
                    key={r.uid}
                    className={`p-4 sm:p-5 transition-all duration-200 ${
                      isMe
                        ? "bg-gradient-to-r from-indigo-50 to-purple-50 border-l-4 border-indigo-500"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* 順位 */}
                      <div className="flex-shrink-0 w-12 text-center">
                        {badge ? (
                          <div className="text-3xl">{badge}</div>
                        ) : (
                          <div className={`text-lg font-bold ${isMe ? "text-indigo-600" : "text-gray-400"}`}>
                            #{rank}
                          </div>
                        )}
                      </div>

                      {/* アバター */}
                      <div
                        className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold ${
                          isMe
                            ? "bg-gradient-to-br from-indigo-500 to-purple-500 text-white"
                            : "bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700"
                        }`}
                      >
                        {r.displayName[0]}
                      </div>

                      {/* 名前 */}
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold truncate ${isMe ? "text-indigo-700" : "text-gray-800"}`}>
                          {r.displayName}
                        </div>
                        <div className="text-xs text-gray-400 truncate">{r.uid}</div>
                      </div>

                      {/* ポイント */}
                      <div className="flex-shrink-0 text-right">
                        <div className={`text-xl font-bold ${isMe ? "text-indigo-600" : "text-gray-800"}`}>
                          {renderPointsFor(r).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">ポイント</div>
                      </div>

                      {/* バス通過 */}
                      <div className="flex-shrink-0 w-16 text-right">
                        <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full">
                          <Award className="w-3 h-3 text-gray-600" />
                          <span className="text-sm font-medium text-gray-700">{r.busPasses}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          ※ データはサンプルです。実際の運用時はFirestore / APIと連携してください。
        </p>
      </div>
    </div>
  );
}