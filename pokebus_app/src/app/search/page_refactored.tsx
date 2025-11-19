// メインコンポーネント - リファクタリング済み
"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Menu, X, MapPin, Crosshair } from "lucide-react";
import Script from "next/script";
import styles from "./search.module.css";

// 分割したモジュールをインポート
import { useAuth } from './auth';
import { useGeolocation, useMapManager, isUserOnBusRoute, validateLocationForSharing } from './location';
import { useBusRoute, useBusStopPassage, processBusRoute, getRouteSequenceInfo, inferPreviousPassedStops } from './bus';
import { useLocationSharing, useBusStopPassages } from './sharing';
import { useUIState, useViewport, showBusStopNotificationFromOtherUser, useSearch, useBusList, useErrorHandling } from './ui';
import { getDistance } from './utils';
import { BusStop, PassedStopRecord } from './types';
import { MAP_CONFIG } from './constants';

// 外部データローダー（元のコードから抽出）
const loadTrips = async () => {
  const res = await fetch('/data/trips.txt');
  const text = await res.text();
  return text.trim().split('\n').slice(1).map(line => {
    const [routeId, serviceId, tripId, tripHeadsign, directionId, blockId, shapeId, wheelchairAccessible, bikesAllowed] = line.split(',');
    return { route_id: routeId, service_id: serviceId, trip_id: tripId, trip_headsign: tripHeadsign, direction_id: directionId, block_id: blockId, shape_id: shapeId };
  });
};

const loadStopTimes = async () => {
  const res = await fetch('/data/stop_times.txt');
  const text = await res.text();
  return text.trim().split('\n').slice(1).map(line => {
    const [tripId, arrivalTime, departureTime, stopId, stopSequence, stopHeadsign, pickupType, dropOffType, shapeDistTraveled] = line.split(',');
    return { trip_id: tripId, arrival_time: arrivalTime, departure_time: departureTime, stop_id: stopId, seq: parseInt(stopSequence) };
  });
};

const loadStops = async () => {
  const res = await fetch('/data/stops.txt');
  const text = await res.text();
  return text.trim().split('\n').slice(1).map(line => {
    const [stopId, stopCode, stopName, stopDesc, stopLat, stopLon, zoneId, stopUrl, locationType, parentStation, stopTimezone, wheelchairBoarding] = line.split(',');
    return { stop_id: stopId, stop_code: stopCode, stop_name: stopName, stop_desc: stopDesc, stop_lat: parseFloat(stopLat), stop_lon: parseFloat(stopLon) };
  });
};

const loadRoutes = async () => {
  const res = await fetch('/data/routes.txt');
  const text = await res.text();
  return text.trim().split('\n').slice(1).map(line => {
    const [routeId, agencyId, routeShortName, routeLongName, routeDesc, routeType, routeUrl, routeColor, routeTextColor] = line.split(',');
    return { route_id: routeId, agency_id: agencyId, route_short_name: routeShortName, route_long_name: routeLongName, route_desc: routeDesc, route_type: parseInt(routeType) };
  });
};

const fetchRealtimeDelayMock = async (tripId: string) => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return { delay_seconds: Math.floor(Math.random() * 300) - 150 };
};

export default function BusSearch() {
  const router = useRouter();
  
  // カスタムフックを使用
  const { currentUser, authLoading, getEffectiveUserId, ensureSessionUserId, sessionUserIdRef } = useAuth();
  const { 
    currentLocation, 
    currentLocationRef, 
    locationError, 
    isLocationLoading, 
    getCurrentPosition, 
    setCurrentLocation, 
    setLocationError 
  } = useGeolocation();
  
  const { 
    mapInstance, 
    mapRef: mapContainerRef, 
    mapLoaded, 
    setMapLoaded,
    routeMarkersRef, 
    routePolylineRef, 
    currentLocationMarkerRef, 
    initializeMap, 
    clearMapElements, 
    addBusStopMarkers 
  } = useMapManager();
  
  const { 
    routeStops, 
    setRouteStops, 
    selectedTripId, 
    setSelectedTripId, 
    ridingTripId, 
    setRidingTripId, 
    tripDelays, 
    setTripDelays, 
    getActiveTripId 
  } = useBusRoute();
  
  const { busPassedStops, setBusPassedStops, addPassedStop, removePassedStop } = useBusStopPassage();
  
  const { 
    isLocationSharing, 
    ridersLocations, 
    setRidersLocations, 
    startLocationSharing, 
    stopLocationSharing, 
    shareLocationToFirestore, 
    listenToOtherRiders, 
    removeUserLocationFromFirestore, 
    locationTimerRef, 
    ridersUnsubscribeRef 
  } = useLocationSharing(getEffectiveUserId, currentUser);
  
  const { 
    busPassedStops: firestoreBusPassedStops, 
    setBusPassedStops: setFirestoreBusPassedStops, 
    saveBusStopPassage, 
    listenToBusStopPassages, 
    stopBusStopPassagesListener 
  } = useBusStopPassages();
  
  const { 
    isSheetMinimized, 
    setIsSheetMinimized, 
    sheetTranslateY, 
    setSheetTranslateY, 
    isBottomSheetVisible, 
    setIsBottomSheetVisible, 
    notification, 
    isNotificationVisible, 
    showNotification 
  } = useUIState();
  
  const { viewportHeight } = useViewport();
  
  const { 
    searchResults, 
    setSearchResults, 
    destinationResults, 
    setDestinationResults, 
    isSearching, 
    setIsSearching, 
    selectedStart, 
    setSelectedStart, 
    selectedDestination, 
    setSelectedDestination, 
    clearSearch 
  } = useSearch();
  
  const { 
    availableBuses, 
    setAvailableBuses, 
    isLoadingBuses, 
    setIsLoadingBuses, 
    selectedBusInfo, 
    setSelectedBusInfo 
  } = useBusList();
  
  const { errors, addError, clearErrors } = useErrorHandling();

  // その他のローカル状態
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [startSearchQuery, setStartSearchQuery] = useState("");
  const [startPredictions, setStartPredictions] = useState<any[]>([]);
  const [showStartPredictions, setShowStartPredictions] = useState(false);

  // Refs for Google Maps services
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const directionsService = useRef<google.maps.DirectionsService | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const lastPositionTimestampRef = useRef<number>(0);
  const lastSharedPositionRef = useRef<google.maps.LatLng | null>(null);

  // 初期化処理
  useEffect(() => {
    ensureSessionUserId();
  }, [ensureSessionUserId]);

  // Google Maps初期化
  const initializeGoogleMaps = () => {
    if (!window.google || !mapRef.current) return;

    const map = initializeMap(mapRef.current);
    if (map) {
      // サービス初期化
      autocompleteService.current = new google.maps.places.AutocompleteService();
      placesService.current = new google.maps.places.PlacesService(map);
      directionsService.current = new google.maps.DirectionsService();
      directionsRenderer.current = new google.maps.DirectionsRenderer();
      directionsRenderer.current.setMap(map);
    }
  };

  // バス選択処理
  const handleSelectBus = async (tripId: string) => {
    try {
      setIsLoadingBuses(true);
      
      console.log('バス選択:', tripId);
      const [trips, stopTimes, stops] = await Promise.all([loadTrips(), loadStopTimes(), loadStops()]);
      
      const tripStops = stopTimes.filter(st => st.trip_id === tripId).sort((a, b) => a.seq - b.seq);
      
      if (tripStops.length === 0) {
        showNotification('このバスの停車情報が見つかりませんでした。');
        return;
      }
      
      // 出発地・目的地インデックス取得
      const destIdsArr = selectedDestination ? [selectedDestination.stop_id] : 
                        [destinationResults[0]?.stop_id].filter(Boolean);
      const destIdx = tripStops.findIndex(s => destIdsArr.includes(s.stop_id));
      
      let startIdx = 0;
      if (selectedStart && selectedStart.type === 'stop') {
        const idxById = tripStops.findIndex(s => s.stop_id === selectedStart.stop_id);
        startIdx = idxById >= 0 ? idxById : 0;
      }
      
      const endIdx = destIdx >= 0 ? destIdx : tripStops.length - 1;
      
      // バス路線データ処理
      const { routeStopsFull, fullRouteStops } = processBusRoute(tripStops, stops, startIdx, endIdx);
      
      // 有効な座標のバス停のみフィルタ
      const validStops = routeStopsFull.filter(rs => {
        const lat = parseFloat(String(rs.stop_lat));
        const lon = parseFloat(String(rs.stop_lon));
        return !isNaN(lat) && !isNaN(lon) && lat >= 24 && lat <= 27 && lon >= 122 && lon <= 132;
      });

      setRouteStops(validStops);
      // 位置情報共有用：バス路線全体をグローバル変数に保存
      (window as any).fullRouteStops = fullRouteStops;
      setSelectedTripId(tripId);
      setIsSheetMinimized(false);
      setSheetTranslateY(0);

      // 遅延情報取得
      try {
        const delayData = await fetchRealtimeDelayMock(tripId);
        setTripDelays(prev => ({ ...prev, [tripId]: delayData }));
      } catch (e) {
        setTripDelays(prev => ({ ...prev, [tripId]: null }));
      }

      // 地図に描画
      addBusStopMarkers(validStops);

      // Firebase監視開始
      listenToBusStopPassages(tripId);
      
    } catch (error) {
      console.error('バス選択エラー:', error);
      addError('バス情報の読み込みに失敗しました。');
    } finally {
      setIsLoadingBuses(false);
    }
  };

  // 位置情報共有開始
  const handleStartLocationSharing = async () => {
    if (isLocationSharing) return;

    try {
      const currentPos = await getCurrentPosition();
      const tripId = getActiveTripId();
      
      if (!tripId) {
        showNotification('バスを選択してから位置情報共有を開始してください。');
        return;
      }

      const validation = validateLocationForSharing(currentPos, tripId);
      if (!validation.valid) {
        showNotification(validation.reason || '位置情報共有を開始できません。');
        return;
      }

      // 通過済みバス停を推論
      const inferredStops = inferPreviousPassedStops(currentPos, tripId, routeStops);
      if (inferredStops.length > 0) {
        setBusPassedStops(prev => [...prev, ...inferredStops]);
        console.log(`推論で${inferredStops.length}件のバス停を通過済みに追加`);
      }

      startLocationSharing(tripId, currentPos);
      showNotification('位置情報の共有を開始しました。');
      
    } catch (error) {
      console.error('位置情報共有開始エラー:', error);
      showNotification('位置情報の取得に失敗しました。');
    }
  };

  // 位置情報共有停止
  const handleStopLocationSharing = async () => {
    const tripId = getActiveTripId();
    await stopLocationSharing(tripId);
    setRidingTripId('');
    showNotification('位置情報の共有を停止しました。');
  };

  // 現在地取得
  const handleGetCurrentLocation = async () => {
    try {
      const position = await getCurrentPosition();
      
      if (mapInstance.current) {
        mapInstance.current.setCenter({
          lat: position.lat(),
          lng: position.lng()
        });
        mapInstance.current.setZoom(16);

        // 現在地マーカー更新
        if (currentLocationMarkerRef.current) {
          currentLocationMarkerRef.current.setMap(null);
        }

        currentLocationMarkerRef.current = new google.maps.Marker({
          position: { lat: position.lat(), lng: position.lng() },
          map: mapInstance.current,
          title: '現在地',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#4285f4',
            fillOpacity: 1,
            strokeWeight: 3,
            strokeColor: '#ffffff'
          }
        });
      }
      
      showNotification('現在地を取得しました。');
    } catch (error) {
      showNotification('現在地の取得に失敗しました。');
    }
  };

  return (
    <div className={styles.container} style={{ height: `${viewportHeight}px` }}>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places,geometry`}
        onLoad={() => {
          setMapLoaded(true);
          initializeGoogleMaps();
        }}
        onError={() => {
          addError('Google Mapsの読み込みに失敗しました。');
        }}
      />

      {/* ヘッダー */}
      <header className={styles.header}>
        <button
          className={styles.menuButton}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <h1 className={styles.title}>バスナビ</h1>
        <button
          className={styles.locationButton}
          onClick={handleGetCurrentLocation}
          disabled={isLocationLoading}
        >
          <Crosshair />
        </button>
      </header>

      {/* サイドメニュー */}
      <div className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarContent}>
          <h2>メニュー</h2>
          <button 
            onClick={() => router.push('/ranking')}
            className={styles.menuItem}
          >
            ランキング
          </button>
          {currentUser ? (
            <div className={styles.userInfo}>
              <p>ログイン中: {currentUser.email}</p>
            </div>
          ) : (
            <button 
              onClick={() => router.push('/auth')}
              className={styles.menuItem}
            >
              ログイン
            </button>
          )}
        </div>
      </div>

      {/* オーバーレイ */}
      {menuOpen && (
        <div 
          className={styles.overlay} 
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* メインコンテンツ */}
      <main className={styles.main}>
        {/* 検索フォーム */}
        <div className={styles.searchContainer}>
          {/* ここに検索フォームの実装 */}
          <div className={styles.searchForm}>
            <input
              type="text"
              placeholder="出発地を入力"
              value={startSearchQuery}
              onChange={(e) => setStartSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            <input
              type="text"
              placeholder="目的地を入力"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        {/* 地図 */}
        <div className={styles.mapContainer}>
          <div ref={mapRef} className={styles.map} />
          
          {!mapLoaded && (
            <div className={styles.mapLoading}>
              地図を読み込み中...
            </div>
          )}
        </div>

        {/* 位置情報共有ボタン */}
        {selectedTripId && (
          <div className={styles.sharingControls}>
            {!isLocationSharing ? (
              <button
                onClick={handleStartLocationSharing}
                className={styles.shareButton}
              >
                位置情報共有開始
              </button>
            ) : (
              <button
                onClick={handleStopLocationSharing}
                className={styles.stopButton}
              >
                共有停止
              </button>
            )}
          </div>
        )}

        {/* バス停リスト */}
        {routeStops.length > 0 && (
          <div className={styles.busStopsList}>
            <h3>バス停一覧</h3>
            {routeStops.map((stop, index) => (
              <div 
                key={`${stop.stop_id}-${index}`} 
                className={`${styles.busStopItem} ${stop.isBeforeStart ? styles.beforeStart : ''}`}
              >
                <span className={styles.stopName}>{stop.stop_name}</span>
                <span className={styles.stopTime}>
                  {stop.arrival_time || stop.departure_time || '--:--'}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 通知 */}
      {notification && (
        <div className={`${styles.notification} ${isNotificationVisible ? styles.notificationVisible : ''}`}>
          {notification}
        </div>
      )}

      {/* エラー表示 */}
      {errors.length > 0 && (
        <div className={styles.errorContainer}>
          {errors.map((error, index) => (
            <div key={index} className={styles.errorMessage}>
              {error}
              <button 
                onClick={() => clearErrors()}
                className={styles.errorClose}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
