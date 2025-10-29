"use client";
import { useState, useEffect, useRef } from "react";
import { Menu, X, MapPin } from "lucide-react";
import Script from "next/script";
import styles from "./search.module.css";
import { useRouter } from "next/navigation";

// Google Maps API の型定義を追加
declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}

export default function BusSearch() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const directionsService = useRef<google.maps.DirectionsService | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const currentLocationRef = useRef<google.maps.LatLng | null>(null);
"use client";

import React, { useEffect, useState } from "react";

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

// ダミーデータ — 実運用時は Firestore / API から取得してください
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
    // ここで実データを取得する（Firestore / REST API 呼び出し等）
    // 例: fetch(`/api/ranking?period=${period}`).then(...)
    setLoading(true);
    const timer = setTimeout(() => {
      // サンプルデータを期間でソートしてセット
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 p-6">
      <div className="max-w-3xl mx-auto">
        {/* ヘッダー / ユーザー概要 */}
        <div className="bg-white rounded-xl shadow p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">あなたのランキング</h2>
              <p className="text-sm text-gray-500">今日の集計と最近の成績を表示します</p>
            </div>
            <div className="text-right">
              <button
                className="text-xs px-3 py-1 rounded-full bg-indigo-600 text-white"
                onClick={() => window.scrollTo({ top: 400, behavior: "smooth" })}
              >
                詳細を見る
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="col-span-1 sm:col-span-2 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl">
                {user?.displayName?.[0] ?? "あ"}
              </div>
              <div>
                <div className="text-sm text-gray-500">あなたの現在順位</div>
                <div className="text-2xl font-bold">#{ranking.findIndex((r) => r.uid === user?.uid) + 1 || "-"}</div>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">週間ポイント</div>
              <div className="text-xl font-semibold">{user?.weeklyPoints ?? "-"}</div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">バス通過数</div>
              <div className="text-xl font-semibold">{user?.busPasses ?? "-"}</div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">総合ポイント</div>
              <div className="text-xl font-semibold">{user?.totalPoints ?? "-"}</div>
            </div>
          </div>
        </div>

        {/* 期間切替ボタン */}
        <div className="flex items-center gap-3 mb-4">
          <button
            className={`px-4 py-2 rounded-full text-sm font-medium ${period === "weekly" ? "bg-indigo-600 text-white" : "bg-white border"}`}
            onClick={() => setPeriod("weekly")}
            aria-pressed={period === "weekly"}
          >
            週間
          </button>
          <button
            className={`px-4 py-2 rounded-full text-sm font-medium ${period === "monthly" ? "bg-indigo-600 text-white" : "bg-white border"}`}
            onClick={() => setPeriod("monthly")}
            aria-pressed={period === "monthly"}
          >
            月間
          </button>
          <button
            className={`px-4 py-2 rounded-full text-sm font-medium ${period === "overall" ? "bg-indigo-600 text-white" : "bg-white border"}`}
            onClick={() => setPeriod("overall")}
            aria-pressed={period === "overall"}
          >
            総合
          </button>
        </div>

        {/* ランキングリスト */}
        <div className="bg-white rounded-xl shadow divide-y">
          <div className="p-4 grid grid-cols-12 gap-2 text-xs text-gray-500">
            <div className="col-span-1 text-center">順位</div>
            <div className="col-span-6">ユーザー</div>
            <div className="col-span-3 text-right">ポイント</div>
            <div className="col-span-2 text-right">バス通過</div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">読み込み中...</div>
          ) : (
            ranking.map((r, idx) => {
              const isMe = r.uid === user?.uid;
              return (
                <div key={r.uid} className={`p-4 grid grid-cols-12 items-center gap-2 ${isMe ? "bg-indigo-50" : ""}`}>
                  <div className="col-span-1 text-center font-medium">#{idx + 1}</div>
                  <div className="col-span-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700">
                      {r.displayName[0]}
                    </div>
                    <div>
                      <div className={`text-sm ${isMe ? "font-semibold text-indigo-700" : "font-medium"}`}>{r.displayName}</div>
                      <div className="text-xs text-gray-400">{r.uid}</div>
                    </div>
                  </div>
                  <div className="col-span-3 text-right font-semibold">{renderPointsFor(r)}</div>
                  <div className="col-span-2 text-right text-sm text-gray-500">{r.busPasses}</div>
                </div>
              );
            })
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">※ データはサンプルです。Firestore / API と連携して実データを表示してください。</p>
      </div>
    </div>
  );
}
  // Google Maps APIが読み込まれた後にマップを初期化
  const initializeMap = () => {
    if (!mapRef.current || !window.google) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 26.2125, lng: 127.6811 }, // 那覇市
      zoom: 14,
    });
    mapInstance.current = map;

    // Places APIサービスを初期化
    autocompleteService.current = new window.google.maps.places.AutocompleteService();
    placesService.current = new window.google.maps.places.PlacesService(map);
    
    // Directions APIサービスを初期化
    directionsService.current = new window.google.maps.DirectionsService();
    directionsRenderer.current = new window.google.maps.DirectionsRenderer({
      suppressMarkers: false, // マーカーを表示
      polylineOptions: {
        strokeColor: '#4285F4', // Google Blueの色
        strokeWeight: 5,
        strokeOpacity: 0.8,
      },
    });
    directionsRenderer.current.setMap(map);

    // 現在地をマップに表示
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const current = new window.google.maps.LatLng(latitude, longitude);
          currentLocationRef.current = current; // 現在地を保存
          
          // 現在地マーカーを表示（ルート表示時は自動的に隠される）
          new window.google.maps.Marker({
            position: current,
            map,
            icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            title: "現在地",
          });
          map.setCenter(current);
        },
        (err) => console.error(err)
      );
    }
  };

  // 検索予測を取得
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    
    if (value.length > 0 && autocompleteService.current) {
      const request = {
        input: value,
        location: new window.google.maps.LatLng(26.2125, 127.6811), // 沖縄中心
        radius: 50000, // 50km
        componentRestrictions: { country: 'jp' }, // 日本限定
      };

      autocompleteService.current.getPlacePredictions(request, (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setPredictions(predictions);
          setShowPredictions(true);
        } else {
          setPredictions([]);
          setShowPredictions(false);
        }
      });
    } else {
      setPredictions([]);
      setShowPredictions(false);
    }
  };

  // 予測候補をクリックした時の処理
  const handlePredictionClick = (prediction: google.maps.places.AutocompletePrediction) => {
    setSearchQuery(prediction.description);
    setShowPredictions(false);
    searchPlace(prediction.place_id);
  };

  // ルートを計算して表示（複数の交通手段を試行）
  const calculateAndDisplayRoute = (destination: google.maps.LatLng, destinationName: string) => {
    if (!directionsService.current || !directionsRenderer.current || !currentLocationRef.current) {
      console.error('Directions service not initialized or current location not available');
      return;
    }

    // 複数の交通手段を順番に試行
    const travelModes = [
      {
        mode: google.maps.TravelMode.TRANSIT,
        options: {
          transitOptions: {
            modes: [google.maps.TransitMode.BUS, google.maps.TransitMode.RAIL],
          },
        },
        name: '公共交通機関'
      },
      {
        mode: google.maps.TravelMode.DRIVING,
        options: {},
        name: '車'
      },
      {
        mode: google.maps.TravelMode.WALKING,
        options: {},
        name: '徒歩'
      }
    ];

    const tryRoute = (modeIndex: number) => {
      if (modeIndex >= travelModes.length) {
        // すべての交通手段で失敗した場合
        console.log('すべての交通手段でルートが見つかりませんでした。マーカーのみ表示します。');
        
        // 目的地マーカーを表示
        new window.google.maps.Marker({
          position: destination,
          map: mapInstance.current,
          title: destinationName,
          icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
        });
        
        // 現在地と目的地の両方が見えるようにマップを調整
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(currentLocationRef.current!);
        bounds.extend(destination);
        mapInstance.current!.fitBounds(bounds);
        return;
      }

      const currentMode = travelModes[modeIndex];
      const request: google.maps.DirectionsRequest = {
        origin: currentLocationRef.current!,
        destination: destination,
        travelMode: currentMode.mode,
        region: 'JP',
        ...currentMode.options,
      };

      directionsService.current!.route(request, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          console.log(`${currentMode.name}でのルートが見つかりました`);
          directionsRenderer.current!.setDirections(result);
          
          // ルート全体が見えるようにマップを調整
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend(currentLocationRef.current!);
          bounds.extend(destination);
          mapInstance.current!.fitBounds(bounds);
        } else {
          console.log(`${currentMode.name}でのルートが見つかりません: ${status}`);
          // 次の交通手段を試行
          tryRoute(modeIndex + 1);
        }
      });
    };

    // 最初の交通手段から試行開始
    tryRoute(0);
  };

  // 場所を検索してマップに表示
  const searchPlace = (placeId: string) => {
    if (!placesService.current || !mapInstance.current) return;

    placesService.current.getDetails(
      { placeId, fields: ['geometry', 'name', 'formatted_address'] },
      (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place && place.geometry) {
          const location = place.geometry.location;
          if (location) {
            // ルートを計算して表示
            calculateAndDisplayRoute(location, place.name || '目的地');
          }
        }
      }
    );
  };

  // 検索ボタンクリック時の処理
  const handleSearch = () => {
    if (searchQuery && predictions.length > 0) {
      handlePredictionClick(predictions[0]);
    }
  };

  // ルートをクリア
  const clearRoute = () => {
    // ルートをクリア
    if (directionsRenderer.current) {
      directionsRenderer.current.setDirections({ routes: [] } as any);
    }
    
    // 検索バーをクリア
    setSearchQuery("");
    setPredictions([]);
    setShowPredictions(false);
    
    // マップをリセット（現在地マーカーは残す）
    if (mapInstance.current) {
      // 既存のマーカー（現在地以外）をクリア
      // 新しいマップインスタンスを作成せず、現在地を中心に戻す
      if (currentLocationRef.current) {
        mapInstance.current.setCenter(currentLocationRef.current);
        mapInstance.current.setZoom(14);
      }
    }
  };

  useEffect(() => {
    if (mapLoaded) {
      initializeMap();
    }
  }, [mapLoaded]);

  return (
    <>
      {/* Google Maps API Script */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=geometry,places`}
        onLoad={() => setMapLoaded(true)}
        strategy="lazyOnload"
      />
      
      <div className={styles.container}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <img src="/logo.png" alt="logo" className={styles.logo} />
          <button 
            className={styles.menuButton}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>

        {/* ドロップダウンメニュー */}
        {menuOpen && (
          <div className={styles.dropdown}>
            <ul className={styles.dropdownList}>
              <li
                className={styles.dropdownItem}
                role="button"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/ranking");
                }}
              >
                🏆 ランキング
              </li>
              <li className={styles.dropdownItem}>⚙ 設定</li>
            </ul>
          </div>
        )}

        {/* 検索バー */}
        <div className={styles.searchBar}>
          <input
            type="text"
            placeholder="目的地を入力またはタップ"
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => searchQuery && setShowPredictions(true)}
            onBlur={() => setTimeout(() => setShowPredictions(false), 150)}
          />
          <button 
            className={styles.searchButton}
            onClick={handleSearch}
          >
            検索
          </button>
          <button 
            className={styles.clearButton}
            onClick={clearRoute}
            title="ルートをクリア"
          >
            クリア
          </button>
          
          {/* 検索予測 */}
          {showPredictions && predictions.length > 0 && (
            <div className={styles.predictions}>
              {predictions.map((prediction) => (
                <div
                  key={prediction.place_id}
                  className={styles.predictionItem}
                  onClick={() => handlePredictionClick(prediction)}
                >
                  <MapPin size={16} className={styles.predictionIcon} />
                  <div className={styles.predictionText}>
                    <div className={styles.predictionMain}>
                      {prediction.structured_formatting.main_text}
                    </div>
                    <div className={styles.predictionSub}>
                      {prediction.structured_formatting.secondary_text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Googleマップ */}
        <div ref={mapRef} className={styles.mapContainer}>
          {!mapLoaded && (
            <div className={styles.loadingContainer}>
              <div className={styles.loadingText}>マップを読み込んでいます...</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
