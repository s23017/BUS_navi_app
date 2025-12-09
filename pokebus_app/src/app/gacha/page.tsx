"use client";

import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { Timestamp, collection, doc, limit, onSnapshot, orderBy, query, runTransaction } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import styles from "./gacha.module.css";
import SearchHeader from "../search/components/Header";
import { auth, db } from "../../../lib/firebase";
import { GachaCharacter, Rarity, characters } from "./characters";

const GACHA_COST_SINGLE = 10;
const GACHA_COST_TEN = 100;

type RollMode = "single" | "ten";
type ActiveSection = "gacha" | "collection" | "history";

type HistoryItem = {
  id: string;
  characterId: string;
  characterName: string;
  rarity: Rarity;
  image: string;
  rolledAt: Timestamp;
};

const rarityLabels: Record<string, string> = {
  SSR: "SSR",
  SR: "SR",
  R: "R",
  N: "N",
  EXR: "EXR",
};

const raritySound: Record<string, string> = {
  SSR: "✨",
  SR: "🌟",
  R: "🔹",
  N: "🔸",
  EXR: "🔰",
};

const rarityColors: Record<string, string> = {
  SSR: "linear-gradient(140deg, #fbbf24 0%, #f97316 50%, #facc15 100%)",
  SR: "linear-gradient(140deg, #38bdf8 0%, #0ea5e9 100%)",
  R: "linear-gradient(140deg, #a855f7 0%, #7c3aed 100%)",
  N: "linear-gradient(140deg, #6b7280 0%, #4b5563 100%)",
  EXR: "linear-gradient(140deg, #9ca3af 0%, #6b7280 100%)",
};

const rarityOrder: Record<string, number> = {
  SSR: 0,
  SR: 1,
  R: 2,
  N: 3,
  EXR: 4,
};

type CollectionEntry = {
  character: GachaCharacter;
  count: number;
  lastObtained: Timestamp | null;
};
const pickRandomCharacter = (list: GachaCharacter[]) => {
  const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
  const random = Math.random() * totalWeight;
  let cumulative = 0;
  for (const character of list) {
    cumulative += character.weight;
    if (random <= cumulative) {
      return character;
    }
  }
  return list[list.length - 1];
};

const formatTimestamp = (value: Timestamp) => {
  try {
    return value.toDate().toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return "--/--";
  }
};

export default function GachaPage() {
  const router = useRouter();
  const charactersById = useMemo(() => {
    const map: Record<string, GachaCharacter> = {};
    characters.forEach((item) => {
      map[item.id] = item;
    });
    return map;
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [availablePoints, setAvailablePoints] = useState<number>(0);
  const [loadingPoints, setLoadingPoints] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeSection, setActiveSection] = useState<ActiveSection>("gacha");
  const [rollMode, setRollMode] = useState<RollMode>("single");
  const [error, setError] = useState<string | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [hasGlow, setHasGlow] = useState(false);
  const [results, setResults] = useState<Array<{ character: GachaCharacter; rolledAt: Date }>>([]);
  const [animationKey, setAnimationKey] = useState(0);
  const [collectionEntries, setCollectionEntries] = useState<CollectionEntry[]>([]);
  const [pendingCharacters, setPendingCharacters] = useState<GachaCharacter[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAvailablePoints(0);
        setHistory([]);
        setCollectionEntries([]);
        setResults([]);
        setActiveSection("gacha");
        setPendingCharacters([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setLoadingPoints(false);
      setCollectionEntries([]);
      return;
    }

    const statsRef = doc(db, "userStats", user.uid);
    const unsubscribe = onSnapshot(statsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setAvailablePoints(0);
        setCollectionEntries([]);
        setLoadingPoints(false);
        return;
      }
      const data = snapshot.data();
      const total = typeof data.totalPoints === "number" ? data.totalPoints : 0;
      const spent = typeof data.gachaPointsSpent === "number" ? data.gachaPointsSpent : 0;
      const remaining = Math.max(0, total - spent);
      setAvailablePoints(remaining);
      setLoadingPoints(false);

      const rawCollection = data?.gachaCollection && typeof data.gachaCollection === "object"
        ? data.gachaCollection
        : null;
      if (rawCollection) {
        const parsed: CollectionEntry[] = Object.entries(rawCollection)
          .map(([characterId, value]) => {
            const entry = (value as { count?: unknown; lastObtained?: unknown }) || {};
            const count = typeof entry.count === "number" ? entry.count : 0;
            if (count <= 0) {
              return null;
            }
            const rarity = charactersById[characterId]?.rarity ?? "N";
            const baseInfo: GachaCharacter = charactersById[characterId] ?? {
              id: characterId,
              name: characterId,
              rarity,
              weight: 0,
              image: "/pokebus_icon.png",
              description: "未登録キャラクター",
            };
            const lastObtained = entry.lastObtained instanceof Timestamp
              ? entry.lastObtained
              : null;
            return {
              character: baseInfo,
              count,
              lastObtained,
            };
          })
          .filter((item): item is CollectionEntry => item !== null)
          .sort((a, b) => {
            const rarityCompare = rarityOrder[a.character.rarity] - rarityOrder[b.character.rarity];
            if (rarityCompare !== 0) return rarityCompare;
            if (b.count !== a.count) return b.count - a.count;
            return a.character.name.localeCompare(b.character.name, "ja");
          });
        setCollectionEntries(parsed);
      } else {
        setCollectionEntries([]);
      }
    });

    return () => unsubscribe();
  }, [user, charactersById]);

  useEffect(() => {
    if (!user) return;
    const historyQuery = query(
      collection(db, "userStats", user.uid, "gachaRolls"),
      orderBy("rolledAt", "desc"),
      limit(30)
    );
    const unsubscribe = onSnapshot(historyQuery, (snapshot) => {
      const items: HistoryItem[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          characterId: data.characterId,
          characterName: data.characterName,
          rarity: data.rarity || "N",
          image: typeof data.image === "string" && data.image ? data.image : "/pokebus_icon.png",
          rolledAt: data.rolledAt instanceof Timestamp ? data.rolledAt : Timestamp.now(),
        };
      });
      setHistory(items);
    });
    return () => unsubscribe();
  }, [user]);

  const costLabels = useMemo(
    () => ({
      single: `${GACHA_COST_SINGLE.toLocaleString()} pt`,
      ten: `${GACHA_COST_TEN.toLocaleString()} pt`,
    }),
    []
  );

  const currentCost = rollMode === "ten" ? GACHA_COST_TEN : GACHA_COST_SINGLE;

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.src = "/pokebus_icon.png";
  };

  const handleRoll = async (mode: RollMode) => {
    if (!user) {
      setError("ガチャを引くにはログインが必要です。");
      return;
    }
    if (isRolling) return;

    const cost = mode === "ten" ? GACHA_COST_TEN : GACHA_COST_SINGLE;
    const rollCount = mode === "ten" ? 10 : 1;
    const modeLabel = mode === "ten" ? "10連" : "単発";

    if (!loadingPoints && availablePoints < cost) {
      setError(`${modeLabel}を引くポイントが不足しています（${cost}pt必要です）。`);
      return;
    }

    const selections = Array.from({ length: rollCount }, () => pickRandomCharacter(characters));
    const baseMillis = Date.now();

    try {
      setIsRolling(true);
      setHasGlow(true);
      setResults([]);
      setPendingCharacters(selections);
      setError(null);

      await runTransaction(db, async (transaction) => {
        const statsRef = doc(db, "userStats", user.uid);
        const snapshot = await transaction.get(statsRef);
        if (!snapshot.exists()) {
          transaction.set(
            statsRef,
            {
              uid: user.uid,
              totalPoints: 0,
              weeklyPoints: 0,
              monthlyPoints: 0,
              gachaPointsSpent: 0,
              lastGachaAt: null,
            },
            { merge: true }
          );
          throw new Error(`${modeLabel}を引くポイントが不足しています（${cost}pt必要です）。`);
        }

        const data = snapshot.data();
        const total = typeof data.totalPoints === "number" ? data.totalPoints : 0;
        const spent = typeof data.gachaPointsSpent === "number" ? data.gachaPointsSpent : 0;
        const remaining = total - spent;
        if (remaining < cost) {
          throw new Error(`${modeLabel}を引くポイントが不足しています（${cost}pt必要です）。`);
        }

        const rawCollection = data?.gachaCollection && typeof data.gachaCollection === "object"
          ? (data.gachaCollection as Record<string, { count?: unknown; lastObtained?: unknown }>)
          : {};
        const nextCollection: Record<string, { count: number; lastObtained: Timestamp | null }> = {};
        Object.entries(rawCollection).forEach(([id, value]) => {
          const entryValue = value || {};
          const countValue = typeof entryValue.count === "number" ? entryValue.count : 0;
          if (countValue <= 0) return;
          const lastValue = entryValue.lastObtained instanceof Timestamp ? entryValue.lastObtained : null;
          nextCollection[id] = {
            count: countValue,
            lastObtained: lastValue,
          };
        });

        selections.forEach((character, index) => {
          const entryTimestamp = Timestamp.fromMillis(baseMillis + index);
          const existingEntry = nextCollection[character.id];
          const currentCount = existingEntry ? existingEntry.count : 0;
          nextCollection[character.id] = {
            count: currentCount + 1,
            lastObtained: entryTimestamp,
          };

          const historyRef = doc(collection(statsRef, "gachaRolls"));
          transaction.set(historyRef, {
            characterId: character.id,
            characterName: character.name,
            rarity: character.rarity,
            image: character.image,
            rolledAt: entryTimestamp,
          });
        });

        transaction.update(statsRef, {
          gachaPointsSpent: spent + cost,
          lastGachaAt: Timestamp.fromMillis(baseMillis + selections.length - 1),
          lastGachaResultId: selections[selections.length - 1]?.id ?? null,
          gachaCollection: nextCollection,
        });
      });

      const finalResults = selections.map((character, index) => ({
        character,
        rolledAt: new Date(baseMillis + index),
      }));

      setAnimationKey((prev) => prev + 1);

      setTimeout(() => {
        setHasGlow(false);
        setResults(finalResults);
        setIsRolling(false);
        setPendingCharacters([]);
      }, 3600);
    } catch (transactionError) {
      setHasGlow(false);
      setIsRolling(false);
      setPendingCharacters([]);
      if (transactionError instanceof Error) {
        setError(transactionError.message);
      } else {
        setError("ガチャを引けませんでした。");
      }
    }
  };

  const renderAnimation = () => {
    if (isRolling) {
      return (
        <div key={animationKey} className={styles.busScene}>
          <div className={styles.busRoad} />
          <div className={styles.busWrapper}>
            <div className={styles.busBody}>
              <div className={styles.busStripe} />
              <div className={styles.busWindows}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`window-${index}`} className={styles.busWindow} />
                ))}
              </div>
              <div className={styles.busDoor}>
                <div className={`${styles.busDoorPanel} ${styles.busDoorPanelLeft}`} />
                <div className={`${styles.busDoorPanel} ${styles.busDoorPanelRight}`} />
              </div>
              <div className={styles.busWheelRow}>
                <div className={styles.busWheel} />
                <div className={styles.busWheel} />
              </div>
            </div>
            <div className={styles.busFrontLight} />
            <div className={styles.busRearLight} />
          </div>
          <div className={styles.busCharacters}>
            {pendingCharacters.length === 0 ? (
              <div className={styles.busWaitingText}>バスが到着しています...</div>
            ) : (
              pendingCharacters.map((item, index) => (
                <div
                  key={`${animationKey}-${item.id}-${index}`}
                  className={styles.busCharacter}
                  style={{ animationDelay: `${1.5 + index * 0.18}s` }}
                >
                  <div className={styles.busCharacterImageWrap}>
                    <img src={item.image} alt={item.name} className={styles.busCharacterImage} onError={handleImageError} />
                  </div>
                  <div className={styles.busCharacterName}>{item.name}</div>
                  <div className={styles.busCharacterRarity}>{raritySound[item.rarity]} {rarityLabels[item.rarity]}</div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    if (results.length > 0) {
      if (results.length > 1) {
        return (
          <div className={styles.resultsGrid}>
            {results.map((entry, index) => (
              <div key={`${entry.character.id}-${index}`} className={styles.resultMiniCard}>
                <div className={styles.resultMiniImageWrap}>
                  <img
                    src={entry.character.image}
                    alt={entry.character.name}
                    className={styles.resultMiniImage}
                    onError={handleImageError}
                  />
                </div>
                <div className={styles.resultMiniName}>{entry.character.name}</div>
                <div className={styles.resultMiniRarity}>{raritySound[entry.character.rarity]} {rarityLabels[entry.character.rarity]}</div>
              </div>
            ))}
          </div>
        );
      }

      const single = results[0];
      return (
        <div className={styles.characterCard} style={{ background: rarityColors[single.character.rarity] }}>
          <img src={single.character.image} alt={single.character.name} className={styles.characterImage} onError={handleImageError} />
          <div className={styles.characterName}>{single.character.name}</div>
          <div className={styles.characterRarity}>{raritySound[single.character.rarity]} {rarityLabels[single.character.rarity]}</div>
          <div className={styles.characterDesc}>{single.character.description}</div>
        </div>
      );
    }

    return <div className={styles.animationText}>Tap to Start!</div>;
  };

  const handleLogin = () => {
    router.push("/profile");
  };

  const showScrollableResults = !isRolling && results.length > 1;

  return (
    <div className={styles.gachaPage}>
      <SearchHeader
        menuOpen={menuOpen}
        toggleMenu={() => setMenuOpen((prev) => !prev)}
        onGoProfile={() => router.push("/profile")}
      />
      <div className={styles.content}>
        <div className={styles.titleBlock}>
          <h1>バスポイントガチャ</h1>
          <p className={styles.subtitle}>貯めたポイントを使って限定キャラクターをゲットしよう！</p>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusHeader}>
            <div>
              <div className={styles.pointLabel}>所持バスポイント</div>
              <div className={styles.pointValue}>
                {loadingPoints ? "---" : `${availablePoints.toLocaleString()} pt`}
              </div>
            </div>
            <div className={styles.sectionNav}>
              <button
                type="button"
                className={`${styles.sectionButton} ${activeSection === "gacha" ? styles.sectionButtonActive : ""}`}
                onClick={() => setActiveSection("gacha")}
              >
                ガチャ
              </button>
              <button
                type="button"
                className={`${styles.sectionButton} ${activeSection === "collection" ? styles.sectionButtonActive : ""}`}
                onClick={() => setActiveSection("collection")}
              >
                キャラBOX
              </button>
              <button
                type="button"
                className={`${styles.sectionButton} ${activeSection === "history" ? styles.sectionButtonActive : ""}`}
                onClick={() => setActiveSection("history")}
              >
                ガチャ履歴
              </button>
            </div>
          </div>
          {activeSection === "gacha" && (
            <>
              <div className={styles.costLabel}>
                単発: {costLabels.single} / 10連: {costLabels.ten}
              </div>
              <div className={styles.rollModeToggle}>
                <button
                  type="button"
                  className={`${styles.rollModeButton} ${rollMode === "single" ? styles.rollModeActive : ""}`}
                  onClick={() => setRollMode("single")}
                >
                  単発
                </button>
                <button
                  type="button"
                  className={`${styles.rollModeButton} ${rollMode === "ten" ? styles.rollModeActive : ""}`}
                  onClick={() => setRollMode("ten")}
                >
                  10連
                </button>
              </div>
              {error && <div className={styles.error}>⚠️ {error}</div>}
            </>
          )}
        </div>
        {activeSection === "gacha" && (
          <div className={styles.gachaMachine}>
            <div className={`${styles.machineGlow} ${hasGlow ? styles.machineGlowActive : ""}`} />
            <div className={styles.machineInner}>
              <div
                className={`${styles.animationWindow} ${isRolling ? styles.animationWindowRolling : ""} ${showScrollableResults ? styles.animationWindowScrollable : ""}`}
              >
                {renderAnimation()}
              </div>
              <button
                type="button"
                className={styles.rollButton}
                onClick={() => handleRoll(rollMode)}
                disabled={isRolling || loadingPoints || availablePoints < currentCost}
              >
                {isRolling
                  ? "ガチャ演出中..."
                  : availablePoints < currentCost
                    ? `ポイント不足（${currentCost}pt必要）`
                    : rollMode === "ten"
                      ? `10連ガチャを引く（${GACHA_COST_TEN}pt）`
                      : `単発ガチャを引く（${GACHA_COST_SINGLE}pt）`}
              </button>
            </div>
          </div>
        )}

        {activeSection === "collection" && (
          <div className={styles.collection}>
            <div className={styles.collectionTitle}>キャラBOX</div>
            {collectionEntries.length === 0 ? (
              <div className={styles.emptyState}>まだ入手済みのキャラクターがありません。</div>
            ) : (
              <div className={styles.collectionGrid}>
                {collectionEntries.map((entry) => (
                  <div key={entry.character.id} className={styles.collectionItem}>
                    <div className={styles.collectionImageWrap}>
                      <img
                        src={entry.character.image}
                        alt={entry.character.name}
                        className={styles.collectionImage}
                        onError={handleImageError}
                      />
                    </div>
                    <div className={styles.collectionName}>{entry.character.name}</div>
                    <div className={styles.collectionRarity}>{raritySound[entry.character.rarity]} {rarityLabels[entry.character.rarity]}</div>
                    <div className={styles.collectionCount}>所持数: {entry.count}</div>
                    {entry.lastObtained && (
                      <div className={styles.collectionTime}>最新: {formatTimestamp(entry.lastObtained)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === "history" && (
          <div className={styles.history}>
            <div className={styles.historyTitle}>直近のガチャ結果</div>
            {history.length === 0 ? (
              <div className={styles.emptyState}>まだガチャ結果はありません。</div>
            ) : (
              <div className={styles.historyList}>
                {history.map((item) => (
                  <div key={item.id} className={styles.historyItem}>
                    <div className={styles.historyMeta}>
                      <img src={item.image} alt={item.characterName} className={styles.historyThumb} onError={handleImageError} />
                      <div>
                        <div className={styles.historyName}>{item.characterName}</div>
                        <div className={styles.historyRarity}>{rarityLabels[item.rarity]}</div>
                      </div>
                    </div>
                    <div className={styles.historyTime}>{formatTimestamp(item.rolledAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!user && (
          <div className={styles.loginPrompt}>
            <p>ログインするとバスポイントでガチャを楽しめます。</p>
            <button type="button" className={styles.loginButton} onClick={handleLogin}>
              ログイン / 会員登録
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
