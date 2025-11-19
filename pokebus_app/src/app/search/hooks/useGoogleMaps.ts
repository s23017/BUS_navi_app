// hooks/useGoogleMaps.ts - Google Maps関連のカスタムフック
import { useState, useRef, useCallback } from 'react';
import { MAP_CONFIG } from '../constants';

export const useGoogleMaps = () => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const routeMarkersRef = useRef<google.maps.Marker[]>([]);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const currentLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const directionsService = useRef<google.maps.DirectionsService | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);

  const initializeMap = useCallback(() => {
    if (!window.google || !mapRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: MAP_CONFIG.DEFAULT_CENTER,
      zoom: MAP_CONFIG.DEFAULT_ZOOM,
      minZoom: MAP_CONFIG.MIN_ZOOM,
      maxZoom: MAP_CONFIG.MAX_ZOOM,
      zoomControl: true,
      mapTypeControl: false,
      scaleControl: true,
      streetViewControl: false,
      rotateControl: false,
      fullscreenControl: false
    });

    mapInstance.current = map;
    
    // サービスを初期化
    autocompleteService.current = new google.maps.places.AutocompleteService();
    placesService.current = new google.maps.places.PlacesService(map);
    directionsService.current = new google.maps.DirectionsService();
    directionsRenderer.current = new google.maps.DirectionsRenderer();
    directionsRenderer.current.setMap(map);

    // 地図の表示を確実にするためのリサイズトリガー
    setTimeout(() => {
      google.maps.event.trigger(map, 'resize');
      map.setCenter(MAP_CONFIG.DEFAULT_CENTER);
    }, 100);

    setMapLoaded(true);
    console.log('地図とサービス初期化完了');
  }, []);

  const clearMapElements = useCallback(() => {
    routeMarkersRef.current.forEach(marker => marker.setMap(null));
    routeMarkersRef.current = [];

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }
  }, []);

  const addBusStopMarkers = useCallback((stops: any[]) => {
    if (!mapInstance.current || !window.google) return;

    clearMapElements();
    const path: google.maps.LatLngLiteral[] = [];

    stops.forEach((stop) => {
      const lat = parseFloat(String(stop.stop_lat));
      const lng = parseFloat(String(stop.stop_lon));

      if (isNaN(lat) || isNaN(lng)) return;

      path.push({ lat, lng });

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: mapInstance.current!,
        title: stop.stop_name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: stop.isBeforeStart ? 8 : 6,
          fillColor: stop.isBeforeStart ? '#ff6b6b' : '#4ecdc4',
          fillOpacity: 0.8,
          strokeWeight: 2,
          strokeColor: '#ffffff'
        }
      });

      routeMarkersRef.current.push(marker);
    });

    if (path.length > 1) {
      const polyline = new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: '#2196F3',
        strokeOpacity: 1.0,
        strokeWeight: 4
      });

      polyline.setMap(mapInstance.current!);
      routePolylineRef.current = polyline;

      const bounds = new google.maps.LatLngBounds();
      path.forEach(point => bounds.extend(point));
      mapInstance.current!.fitBounds(bounds);
    }
  }, [clearMapElements]);

  // 現在地を取得して地図に表示
  const getCurrentLocationAndShow = useCallback(async (
    showNotification: (message: string) => void
  ): Promise<google.maps.LatLng | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.error('Geolocation is not supported by this browser');
        showNotification('このブラウザでは位置情報がサポートされていません。');
        resolve(null);
        return;
      }

      const options = {
        enableHighAccuracy: true,
        timeout: 20000, // さらに長くして精度向上を優先
        maximumAge: 30000 // キャッシュ時間を短縮
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = new google.maps.LatLng(
            position.coords.latitude,
            position.coords.longitude
          );

          console.log(`位置情報取得成功: 精度 ${position.coords.accuracy}m`);
          
          if (position.coords.accuracy && position.coords.accuracy > 100) {
            showNotification(`位置情報の精度が低いです（${Math.round(position.coords.accuracy)}m）。より正確な位置情報のため、Wi-Fiを有効にしてください。`);
          }

          if (mapInstance.current) {
            // より詳細な地図表示のためズームレベルを上げる
            mapInstance.current.setCenter(pos);
            mapInstance.current.setZoom(17);

            if (currentLocationMarkerRef.current) {
              currentLocationMarkerRef.current.setMap(null);
            }

            // より目立つマーカーに変更
            currentLocationMarkerRef.current = new google.maps.Marker({
              position: pos,
              map: mapInstance.current,
              title: '現在地',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: '#4285f4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
              }
            });

            // 現在地周辺に精度円を表示
            if (position.coords.accuracy) {
              const accuracyCircle = new google.maps.Circle({
                center: pos,
                radius: position.coords.accuracy,
                strokeColor: '#4285f4',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: '#4285f4',
                fillOpacity: 0.1,
              });
              accuracyCircle.setMap(mapInstance.current);
              
              // 5秒後に精度円を消去
              setTimeout(() => accuracyCircle.setMap(null), 5000);
            }
          }
          resolve(pos);
        },
        (error) => {
          console.error('位置情報の取得に失敗:', error);
          let errorMessage = '位置情報の取得に失敗しました。';
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = '位置情報の許可を確認してください。ブラウザの設定で位置情報を許可してください。';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = '位置情報が利用できません。Wi-Fiまたはモバイルデータ接続を確認してください。';
              break;
            case error.TIMEOUT:
              errorMessage = '位置情報の取得がタイムアウトしました。再度お試しください。';
              break;
          }
          showNotification(errorMessage);
          resolve(null);
        },
        options
      );
    });
  }, []);

  return {
    mapLoaded,
    setMapLoaded,
    mapRef,
    mapInstance,
    routeMarkersRef,
    routePolylineRef,
    currentLocationMarkerRef,
    autocompleteService,
    placesService,
    directionsService,
    directionsRenderer,
    initializeMap,
    clearMapElements,
    addBusStopMarkers,
    getCurrentLocationAndShow
  };
};
