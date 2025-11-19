// 基本的なリファクタリング：元ファイルのバックアップと新規作成
"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Menu, X, MapPin, Crosshair } from "lucide-react";
import Script from "next/script";
import styles from "./search.module.css";

// 分割したモジュールをインポート
import { generateGuestUserId, getDistance, getUserDisplayName, mergePassedStopRecords } from './utils';
import { GEO_TIMEOUT_CODE, GEO_PERMISSION_DENIED_CODE, MIN_SHARE_INTERVAL_MS, MIN_MOVEMENT_METERS } from './constants';
import { PassedStopRecord } from './types';
import { useAuth } from './auth';

export default function BusSearchRefactored() {
  const router = useRouter();
  const { currentUser, authLoading, getEffectiveUserId } = useAuth();

  // UI状態
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [notification, setNotification] = useState<string>('');
  const [isNotificationVisible, setIsNotificationVisible] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);

  // 地図関連
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLng | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const currentLocationRef = useRef<google.maps.LatLng | null>(null);
  const currentLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const routeMarkersRef = useRef<google.maps.Marker[]>([]);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);

  // バス関連
  const [routeStops, setRouteStops] = useState<any[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [ridingTripId, setRidingTripId] = useState<string>('');
  const [busPassedStops, setBusPassedStops] = useState<PassedStopRecord[]>([]);

  // 位置情報共有
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [ridersLocations, setRidersLocations] = useState<any[]>([]);

  // 検索関連
  const [searchQuery, setSearchQuery] = useState("");
  const [startSearchQuery, setStartSearchQuery] = useState("");
  const [selectedStart, setSelectedStart] = useState<any | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<any | null>(null);
  const [availableBuses, setAvailableBuses] = useState<any[]>([]);

  // 通知表示
  const showNotification = (message: string, duration: number = 3000) => {
    setNotification(message);
    setIsNotificationVisible(true);

    setTimeout(() => {
      setIsNotificationVisible(false);
      setTimeout(() => setNotification(''), 300);
    }, duration);
  };

  // ビューポート設定
  useEffect(() => {
    const updateViewport = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      setViewportHeight(window.innerHeight);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  // Google Maps初期化
  const initializeMap = () => {
    if (!window.google || !mapRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 26.2124, lng: 127.6792 }, // 沖縄県那覇市
      zoom: 13,
      zoomControl: true,
      mapTypeControl: false,
      scaleControl: true,
      streetViewControl: false,
      rotateControl: false,
      fullscreenControl: false
    });

    mapInstance.current = map;
    console.log('地図初期化完了');
  };

  // 現在地取得
  const getCurrentPosition = (): Promise<google.maps.LatLng> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('このデバイスでは位置情報がサポートされていません'));
        return;
      }

      setIsLocationLoading(true);
      setLocationError('');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const latLng = new google.maps.LatLng(latitude, longitude);
          
          setCurrentLocation(latLng);
          currentLocationRef.current = latLng;
          setIsLocationLoading(false);
          
          console.log(`現在位置取得成功: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          resolve(latLng);
        },
        (error) => {
          let errorMessage = '位置情報の取得に失敗しました';
          
          if (error.code === GEO_PERMISSION_DENIED_CODE) {
            errorMessage = '位置情報の使用が許可されていません。';
          } else if (error.code === GEO_TIMEOUT_CODE) {
            errorMessage = '位置情報の取得がタイムアウトしました。';
          }
          
          console.error('位置情報取得エラー:', error.message);
          setLocationError(errorMessage);
          setIsLocationLoading(false);
          reject(new Error(errorMessage));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000
        }
      );
    });
  };

  // 現在地取得ボタン
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
          initializeMap();
        }}
        onError={() => {
          setLocationError('Google Mapsの読み込みに失敗しました。');
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
              <p>ログイン中: {getUserDisplayName(currentUser)}</p>
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

        {/* エラー表示 */}
        {locationError && (
          <div className={styles.errorMessage}>
            {locationError}
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
    </div>
  );
}
