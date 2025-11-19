// 位置情報・地図関連の機能
import { useEffect, useRef, useState, useCallback } from 'react';
import { BusStop, ValidationResult } from './types';
import { DISTANCE_THRESHOLDS, MAP_CONFIG, GEO_TIMEOUT_CODE, GEO_PERMISSION_DENIED_CODE } from './constants';
import { getDistance, isValidCoordinate } from './utils';

export const useGeolocation = () => {
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLng | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const currentLocationRef = useRef<google.maps.LatLng | null>(null);

  const getCurrentPosition = useCallback((): Promise<google.maps.LatLng> => {
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
            errorMessage = '位置情報の使用が許可されていません。ブラウザの設定を確認してください。';
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
  }, []);

  return {
    currentLocation,
    currentLocationRef,
    locationError,
    isLocationLoading,
    getCurrentPosition,
    setCurrentLocation,
    setLocationError
  };
};

export const useMapManager = () => {
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const routeMarkersRef = useRef<google.maps.Marker[]>([]);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const currentLocationMarkerRef = useRef<google.maps.Marker | null>(null);

  const initializeMap = useCallback((containerElement: HTMLElement) => {
    if (!window.google || !containerElement) return;

    const map = new google.maps.Map(containerElement, {
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

    setMapInstance(map);
    mapRef.current = map;
    setMapLoaded(true);
    
    console.log('地図初期化完了');
    return map;
  }, []);

  const clearMapElements = useCallback(() => {
    // マーカーをクリア
    routeMarkersRef.current.forEach(marker => marker.setMap(null));
    routeMarkersRef.current = [];

    // ポリラインをクリア
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }
  }, []);

  const addBusStopMarkers = useCallback((busStops: BusStop[]) => {
    if (!mapInstance || !window.google) return;

    clearMapElements();

    const path: google.maps.LatLngLiteral[] = [];

    busStops.forEach((stop, index) => {
      const lat = parseFloat(String(stop.stop_lat));
      const lng = parseFloat(String(stop.stop_lon));

      if (!isValidCoordinate(lat, lng)) return;

      path.push({ lat, lng });

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: mapInstance,
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

    // ポリライン描画
    if (path.length > 1) {
      const polyline = new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: '#2196F3',
        strokeOpacity: 1.0,
        strokeWeight: 4
      });

      polyline.setMap(mapInstance);
      routePolylineRef.current = polyline;

      // ズーム調整
      const bounds = new google.maps.LatLngBounds();
      path.forEach(point => bounds.extend(point));
      mapInstance.fitBounds(bounds);
    }
  }, [mapInstance, clearMapElements]);

  return {
    mapInstance,
    mapRef,
    mapLoaded,
    routeMarkersRef,
    routePolylineRef,
    currentLocationMarkerRef,
    initializeMap,
    clearMapElements,
    addBusStopMarkers
  };
};

/**
 * バス路線上での位置判定
 */
export const isUserOnBusRoute = (userPosition: google.maps.LatLng, routeStops: BusStop[]): boolean => {
  if (!userPosition || routeStops.length === 0) return false;

  // バス停近距離チェック
  const isNearBusStop = routeStops.some(stop => {
    const stopLat = parseFloat(String(stop.stop_lat));
    const stopLng = parseFloat(String(stop.stop_lon));

    if (!isValidCoordinate(stopLat, stopLng)) return false;

    const distance = getDistance(
      userPosition.lat(), userPosition.lng(),
      stopLat, stopLng
    );

    return distance <= DISTANCE_THRESHOLDS.BUS_STOP_PROXIMITY;
  });

  if (isNearBusStop) return true;

  // バス路線沿いチェック
  const isNearRouteCorridoor = routeStops.some(stop => {
    const stopLat = parseFloat(String(stop.stop_lat));
    const stopLng = parseFloat(String(stop.stop_lon));

    if (!isValidCoordinate(stopLat, stopLng)) return false;

    const distance = getDistance(
      userPosition.lat(), userPosition.lng(),
      stopLat, stopLng
    );

    return distance <= DISTANCE_THRESHOLDS.ROUTE_CORRIDOR;
  });

  return isNearRouteCorridoor;
};

/**
 * 位置情報共有の妥当性チェック
 */
export const validateLocationForSharing = (position: google.maps.LatLng, tripId: string): ValidationResult => {
  const fullRouteStops = (window as any).fullRouteStops || [];
  
  if (fullRouteStops.length === 0) {
    return { valid: false, reason: 'バス停情報が見つかりません' };
  }
  
  let isNearAnyStop = false;
  let nearestDistance = Infinity;
  let nearestStopName = '';
  
  fullRouteStops.forEach((stop: any) => {
    const stopLat = parseFloat(stop.stop_lat);
    const stopLon = parseFloat(stop.stop_lon);
    
    if (!isValidCoordinate(stopLat, stopLon)) return;
    
    const distance = getDistance(
      position.lat(), position.lng(),
      stopLat, stopLon
    );
    
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestStopName = stop.stop_name;
    }
    
    if (distance <= DISTANCE_THRESHOLDS.SHARING_LIMIT) {
      isNearAnyStop = true;
    }
  });
  
  console.log(`validateLocationForSharing: 最寄りバス停 ${nearestStopName} から ${nearestDistance.toFixed(0)}m, 共有可能: ${isNearAnyStop}`);
  
  if (!isNearAnyStop) {
    return { 
      valid: false, 
      reason: `最寄りバス停から${nearestDistance.toFixed(0)}m離れています（${DISTANCE_THRESHOLDS.SHARING_LIMIT}m以内の範囲で共有可能）` 
    };
  }

  return { valid: true };
};
