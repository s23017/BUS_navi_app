// hooks/useLocationSharing.ts - リアルタイム位置共有フック
import { useState, useRef, useCallback, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';

interface RiderLocation {
  id: string;
  username: string;
  userId?: string;
  position: google.maps.LatLng;
  timestamp: Date;
  lastActive?: Date;
}

const MIN_SHARE_INTERVAL_MS = 30000;
const MIN_MOVEMENT_METERS = 15;

export const useLocationSharing = (currentUser: any, db: any) => {
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [ridersLocations, setRidersLocations] = useState<RiderLocation[]>([]);
  const [busLocation, setBusLocation] = useState<google.maps.LatLng | null>(null);
  
  const locationTimerRef = useRef<any>(null);
  const unsubscribeRiderListener = useRef<(() => void) | null>(null);
  const lastSharedLocationRef = useRef<google.maps.LatLng | null>(null);
  const lastShareTimeRef = useRef<number>(0);

  // 位置情報をFirestoreに共有
  const shareLocationToFirestore = useCallback(async (tripId: string, position: google.maps.LatLng) => {
    if (!db || !currentUser) return;

    const now = Date.now();
    const timeSinceLastShare = now - lastShareTimeRef.current;
    
    // 最小間隔チェック
    if (timeSinceLastShare < MIN_SHARE_INTERVAL_MS) {
      return;
    }

    // 移動距離チェック
    if (lastSharedLocationRef.current) {
      const distance = google.maps.geometry.spherical.computeDistanceBetween(
        lastSharedLocationRef.current,
        position
      );
      if (distance < MIN_MOVEMENT_METERS) {
        return;
      }
    }

    try {
      const userId = currentUser?.uid || 'anonymous';
      const username = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'ゲスト';

      const locationData = {
        userId,
        username,
        tripId,
        lat: position.lat(),
        lng: position.lng(),
        timestamp: Timestamp.now(),
        lastUpdate: Timestamp.now()
      };

      await setDoc(doc(db, 'busRiderLocations', userId), locationData);
      
      lastSharedLocationRef.current = position;
      lastShareTimeRef.current = now;

    } catch (error) {
      console.error('位置情報共有エラー:', error);
    }
  }, [currentUser, db]);

  // 他のライダーの位置情報を監視
  const listenToOtherRiders = useCallback((tripId: string) => {
    if (!db || !tripId) return;

    const userId = currentUser?.uid || 'anonymous';
    const q = query(
      collection(db, 'busRiderLocations'),
      where('tripId', '==', tripId)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const locations = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.userId,
          username: data.username,
          userId: data.userId,
          position: new google.maps.LatLng(data.lat, data.lng),
          timestamp: data.timestamp?.toDate() || new Date(),
          lastActive: data.lastUpdate?.toDate() || new Date()
        } as RiderLocation;
      });

      // 現在のユーザーを除外し、最近の位置情報のみフィルタ
      const recentLocations = locations.filter(location => {
        if (location.id === userId) return false;
        const timeDiff = Date.now() - (location.lastActive?.getTime() || 0);
        return timeDiff <= 300000; // 5分以内
      });

      setRidersLocations(recentLocations);
    }, (error) => {
      console.error('位置情報監視エラー:', error);
    });

    unsubscribeRiderListener.current = unsubscribe;
    return unsubscribe;
  }, [currentUser, db]);

  // 位置情報共有開始
  const startLocationSharing = useCallback((tripId: string) => {
    if (isLocationSharing) return;

    console.log('位置情報共有を開始します:', tripId);
    setIsLocationSharing(true);

    // 他のユーザーを監視
    listenToOtherRiders(tripId);

    // 定期的な位置更新を開始
    locationTimerRef.current = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const currentPos = new google.maps.LatLng(latitude, longitude);
            shareLocationToFirestore(tripId, currentPos);
          },
          (error) => {
            console.error('位置情報取得エラー:', error);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000
          }
        );
      }
    }, 30000); // 30秒間隔

  }, [isLocationSharing, shareLocationToFirestore, listenToOtherRiders]);

  // 位置情報共有停止
  const stopLocationSharing = useCallback(async (tripId?: string) => {
    console.log('位置情報共有を停止します');
    setIsLocationSharing(false);
    setRidersLocations([]);

    // タイマーをクリア
    if (locationTimerRef.current) {
      if (typeof locationTimerRef.current === 'number' || 'clearAll' in locationTimerRef.current) {
        clearInterval(locationTimerRef.current as number);
      }
      locationTimerRef.current = null;
    }

    // リスナーをクリア
    if (unsubscribeRiderListener.current) {
      unsubscribeRiderListener.current();
      unsubscribeRiderListener.current = null;
    }

    // Firestoreからデータを削除
    if (db && currentUser?.uid) {
      try {
        await deleteDoc(doc(db, 'busRiderLocations', currentUser.uid));
      } catch (error) {
        console.error('位置情報削除エラー:', error);
      }
    }
  }, [currentUser, db]);

  // バスの推定位置を更新
  useEffect(() => {
    if (ridersLocations.length === 0) {
      setBusLocation(null);
      return;
    }
    
    // 最新の位置情報から平均位置を計算
    let totalLat = 0;
    let totalLng = 0;
    let count = 0;
    
    ridersLocations.forEach(rider => {
      if (rider.position) {
        totalLat += rider.position.lat();
        totalLng += rider.position.lng();
        count++;
      }
    });
    
    if (count > 0) {
      const avgLat = totalLat / count;
      const avgLng = totalLng / count;
      setBusLocation(new google.maps.LatLng(avgLat, avgLng));
    }
  }, [ridersLocations]);

  return {
    isLocationSharing,
    ridersLocations,
    busLocation,
    startLocationSharing,
    stopLocationSharing
  };
};
