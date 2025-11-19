// page.tsx - リファクタリング済みメインファイル
"use client";
import React, { useState, useEffect } from "react";
import Script from "next/script";
import styles from "./search.module.css";

// カスタムフック
import { useAuth } from './auth';
import { useGoogleMaps } from './hooks/useGoogleMaps';
import { useLocationState } from './hooks/useLocationState';
import { useBusRoute, processBusRoute } from './bus';
import { useLocationSharing, useBusStopPassages } from './sharing';
import { useUIState, useViewport } from './ui';

// コンポーネント
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SearchForm } from './components/SearchForm';
import { MapComponent } from './components/MapComponent';
import { BusStopsList } from './components/BusStopsList';
import { Notification } from './components/Notification';

// ユーティリティ
import { validateLocationForSharing } from './location';
import { inferPreviousPassedStops } from './bus';

// データローダー
const loadTrips = async () => {
  const res = await fetch('/data/trips.txt');
  const text = await res.text();
  return text.trim().split('\n').slice(1).map(line => {
    const [routeId, serviceId, tripId, tripHeadsign, directionId, blockId, shapeId] = line.split(',');
    return { route_id: routeId, service_id: serviceId, trip_id: tripId, trip_headsign: tripHeadsign };
  });
};

const loadStopTimes = async () => {
  const res = await fetch('/data/stop_times.txt');
  const text = await res.text();
  return text.trim().split('\n').slice(1).map(line => {
    const [tripId, arrivalTime, departureTime, stopId, stopSequence] = line.split(',');
    return { trip_id: tripId, arrival_time: arrivalTime, departure_time: departureTime, stop_id: stopId, seq: parseInt(stopSequence) };
  });
};

const loadStops = async () => {
  const res = await fetch('/data/stops.txt');
  const text = await res.text();
  return text.trim().split('\n').slice(1).map(line => {
    const [stopId, stopCode, stopName, stopDesc, stopLat, stopLon] = line.split(',');
    return { stop_id: stopId, stop_name: stopName, stop_lat: parseFloat(stopLat), stop_lon: parseFloat(stopLon) };
  });
};

export default function BusSearch() {
  // カスタムフックの使用
  const { currentUser, getEffectiveUserId, ensureSessionUserId } = useAuth();
  
  const { 
    mapLoaded, 
    setMapLoaded, 
    mapRef, 
    mapInstance, 
    currentLocationMarkerRef,
    initializeMap, 
    addBusStopMarkers 
  } = useGoogleMaps();
  
  const { 
    currentLocation, 
    locationError, 
    isLocationLoading, 
    currentLocationRef, 
    getCurrentPosition 
  } = useLocationState();
  
  const { 
    routeStops, 
    setRouteStops, 
    selectedTripId, 
    setSelectedTripId, 
    getActiveTripId 
  } = useBusRoute();
  
  const { 
    isLocationSharing, 
    startLocationSharing, 
    stopLocationSharing 
  } = useLocationSharing(getEffectiveUserId, currentUser);
  
  const { 
    busPassedStops, 
    setBusPassedStops, 
    listenToBusStopPassages 
  } = useBusStopPassages();
  
  const { 
    notification, 
    isNotificationVisible, 
    showNotification 
  } = useUIState();
  
  const { viewportHeight } = useViewport();

  // ローカル状態
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startSearchQuery, setStartSearchQuery] = useState("");
  const [selectedStart, setSelectedStart] = useState<any | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<any | null>(null);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [startPredictions, setStartPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [showStartPredictions, setShowStartPredictions] = useState(false);

  // 初期化
  useEffect(() => {
    ensureSessionUserId();
  }, [ensureSessionUserId]);

  // バス選択処理（簡略化版）
  const handleSelectBus = async (tripId: string) => {
    try {
      console.log('バス選択:', tripId);
      const [trips, stopTimes, stops] = await Promise.all([
        loadTrips(), 
        loadStopTimes(), 
        loadStops()
      ]);
      
      const tripStops = stopTimes
        .filter(st => st.trip_id === tripId)
        .sort((a, b) => a.seq - b.seq);
      
      if (tripStops.length === 0) {
        showNotification('このバスの停車情報が見つかりませんでした。');
        return;
      }
      
      // デフォルトのインデックス設定
      const startIdx = 0;
      const endIdx = tripStops.length - 1;
      
      // バス路線データ処理
      const { routeStopsFull, fullRouteStops } = processBusRoute(
        tripStops, 
        stops, 
        startIdx, 
        endIdx
      );
      
      setRouteStops(routeStopsFull);
      (window as any).fullRouteStops = fullRouteStops;
      setSelectedTripId(tripId);
      
      // 地図に描画
      addBusStopMarkers(routeStopsFull);
      
      // Firebase監視開始
      listenToBusStopPassages(tripId);
      
      showNotification('バス路線を読み込みました。');
      
    } catch (error) {
      console.error('バス選択エラー:', error);
      showNotification('バス情報の読み込みに失敗しました。');
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
      }

      startLocationSharing(tripId, currentPos);
      showNotification('位置情報の共有を開始しました。');
      
    } catch (error) {
      showNotification('位置情報の取得に失敗しました。');
    }
  };

  // 位置情報共有停止
  const handleStopLocationSharing = async () => {
    const tripId = getActiveTripId();
    await stopLocationSharing(tripId);
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
          showNotification('Google Mapsの読み込みに失敗しました。');
        }}
      />

      <Header
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onLocationClick={handleGetCurrentLocation}
        isLocationLoading={isLocationLoading}
      />

      <Sidebar
        menuOpen={menuOpen}
        currentUser={currentUser}
        onClose={() => setMenuOpen(false)}
      />

      <main className={styles.main}>
        <SearchForm
          startSearchQuery={startSearchQuery}
          setStartSearchQuery={setStartSearchQuery}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          startPredictions={startPredictions}
          predictions={predictions}
          showStartPredictions={showStartPredictions}
          showPredictions={showPredictions}
        />

        <MapComponent
          mapRef={mapRef}
          mapLoaded={mapLoaded}
        />

        <BusStopsList
          routeStops={routeStops}
          busPassedStops={busPassedStops}
          selectedTripId={selectedTripId}
          isLocationSharing={isLocationSharing}
          onStartSharing={handleStartLocationSharing}
          onStopSharing={handleStopLocationSharing}
        />

        {locationError && (
          <div className={styles.errorMessage}>
            {locationError}
          </div>
        )}
      </main>

      <Notification
        message={notification}
        isVisible={isNotificationVisible}
      />
    </div>
  );
}
