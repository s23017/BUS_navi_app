// hooks/useLocationState.ts - 位置情報関連のstate管理
import { useState, useRef } from 'react';
import { GEO_TIMEOUT_CODE, GEO_PERMISSION_DENIED_CODE } from '../constants';

export const useLocationState = () => {
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLng | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const currentLocationRef = useRef<google.maps.LatLng | null>(null);

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
  };

  return {
    currentLocation,
    setCurrentLocation,
    locationError,
    setLocationError,
    isLocationLoading,
    setIsLocationLoading,
    currentLocationRef,
    getCurrentPosition
  };
};
