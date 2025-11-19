"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Menu, X, MapPin, Crosshair } from "lucide-react";
import Script from "next/script";
import styles from "./search.module.css";
import Header from "./components/Header";
import SearchBar from "./components/SearchBar";
import StopCandidatesModal from "./components/StopCandidatesModal";
import BusRoutesModal from "./components/BusRoutesModal";
import RouteDetailSheet from "./components/RouteDetailSheet";
import { db, auth } from "../../../lib/firebase";
import { loadStops, loadStopTimes, loadTrips, loadRoutes } from "../../../lib/gtfs";
import { collection, addDoc, query, where, onSnapshot, Timestamp, orderBy, limit, getDocs, deleteDoc, updateDoc, QueryConstraint } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

  // Google Maps API の型定義を追加
declare global {
  interface Window {
    google: typeof google;
  }
}

const GEO_TIMEOUT_CODE = 3;
const GEO_PERMISSION_DENIED_CODE = 1;
const MIN_SHARE_INTERVAL_MS = 30000; // Firestore共有は30秒間隔を基本とする
const MIN_MOVEMENT_METERS = 15; // 小刻みな揺れによる書き込みを防ぐ最小移動距離
const generateGuestUserId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `guest_${crypto.randomUUID()}`;
  }
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
};

export default function BusSearch() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [startSearchQuery, setStartSearchQuery] = useState("");
  const [startPredictions, setStartPredictions] = useState<any[]>([]);
  const [showStartPredictions, setShowStartPredictions] = useState(false);
  const [selectedStart, setSelectedStart] = useState<any | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const directionsService = useRef<google.maps.DirectionsService | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const currentLocationRef = useRef<google.maps.LatLng | null>(null);
  const currentLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const busMarkerRef = useRef<google.maps.Marker | null>(null);
  const lastPositionTimestampRef = useRef<number>(0);
  const lastSharedPositionRef = useRef<google.maps.LatLng | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);
  const routeMarkersRef = useRef<google.maps.Marker[]>([]);
  const otherRidersMarkersRef = useRef<google.maps.Marker[]>([]); // 他のライダーのマーカー管理用
  const ridersMarkersMapRef = useRef<Map<string, google.maps.Marker>>(new Map()); // ライダーID → マーカーのマップ
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const tripStopsRef = useRef<Record<string, any[]> | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [ridingTripId, setRidingTripId] = useState<string | null>(null);
  const [tripDelays, setTripDelays] = useState<Record<string, number | null>>({});
  
  // リアルタイムバス追跡用のステート
  const [busLocation, setBusLocation] = useState<google.maps.LatLng | null>(null);
  // ユーザー認証状態
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  type PassedStopRecord = {
    stopId: string;
    stopName: string;
    passTime: Date;
    scheduledTime?: string;
    delay: number;
    username?: string;
    userId?: string;
    inferred?: boolean;
  };

  const [ridersLocations, setRidersLocations] = useState<Array<{
    id: string, 
    position: google.maps.LatLng, 
    timestamp: Date,
    username: string,
    userId?: string, // ユーザーIDを追加
    email?: string,
    lastActive?: Date
  }>>([]);
  const [busPassedStops, setBusPassedStops] = useState<PassedStopRecord[]>([]);
  const [estimatedArrivalTimes, setEstimatedArrivalTimes] = useState<Record<string, string>>({});
  const [isLocationSharing, setIsLocationSharing] = useState<boolean>(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  // Bottom sheet touch handling state
  const sheetTouchStartY = useRef<number | null>(null);
  const [sheetTranslateY, setSheetTranslateY] = useState<number>(0);
  const sheetTranslateYRef = useRef<number>(0);
  const sheetDraggingRef = useRef(false);
  const [isSheetMinimized, setIsSheetMinimized] = useState<boolean>(false);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(true);

  const getEffectiveUserId = () => currentUser?.uid || sessionUserIdRef.current;
  const ensureSessionUserId = () => {
    if (currentUser?.uid) {
      sessionUserIdRef.current = currentUser.uid;
      return currentUser.uid;
    }
    if (!sessionUserIdRef.current) {
      sessionUserIdRef.current = generateGuestUserId();
    }
    return sessionUserIdRef.current;
  };

  // Google Maps APIが読み込まれた後にマップを初期化
  // ユーザー認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser?.uid) {
      sessionUserIdRef.current = currentUser.uid;
    }
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  // クライアントサイド遷移で Script が既に読み込まれている場合に備え、
  // マウント時に window.google が存在すれば mapLoaded を true にする
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if ((window as any).google && (window as any).google.maps) {
        setMapLoaded(true);
      }
    } catch (e) {
      // noop
    }
  }, []);

  // ユーザー名取得関数
  const getUserDisplayName = (user: any) => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split('@')[0];
    return 'ゲスト';
  };

  const getActiveTripId = () => ridingTripId || selectedTripId;

  // バスルート上にいるかどうかをチェック
  const isUserOnBusRoute = (userPosition: google.maps.LatLng, tripId: string): boolean => {
    if (routeStops.length === 0) return false;
    
    // バス停から500m以内にいるかチェック（バス停付近）
    const stopProximity = 500; // メートル
    // バスルート線上から離れすぎていないかチェック（バス停間移動用）
    const routeProximity = 1000; // メートル（より緩い制限）
    
    // 1. バス停から500m以内にいる場合は有効
    const isNearBusStop = routeStops.some(stop => {
      const stopLat = parseFloat(stop.stop_lat);
      const stopLon = parseFloat(stop.stop_lon);
      
      if (isNaN(stopLat) || isNaN(stopLon)) return false;
      
      const distance = getDistance(
        userPosition.lat(), userPosition.lng(),
        stopLat, stopLon
      );
      
      return distance <= stopProximity;
    });
    
    if (isNearBusStop) {
      return true;
    }
    
    // 2. バス停から離れている場合、バスルート線から1000m以内なら有効
    // （バス停間を移動中のバスの場合）
    const isNearRouteCorridoor = routeStops.some(stop => {
      const stopLat = parseFloat(stop.stop_lat);
      const stopLon = parseFloat(stop.stop_lon);
      
      if (isNaN(stopLat) || isNaN(stopLon)) return false;
      
      const distance = getDistance(
        userPosition.lat(), userPosition.lng(),
        stopLat, stopLon
      );
      
      return distance <= routeProximity;
    });
    
    return isNearRouteCorridoor;
  };

  // 位置情報が有効かどうかを検証
  const validateLocationForSharing = (position: google.maps.LatLng, tripId: string): { valid: boolean; reason?: string } => {
    // 全バス停リストを使って、同じtripId上の任意の位置からの共有を許可
    const fullRouteStops = (window as any).fullRouteStops || routeStops;
    
    if (fullRouteStops.length === 0) {
      return { valid: false, reason: 'バス停情報が見つかりません' };
    }
    
    // 全バス停のいずれかから500m以内であれば共有可能
    let isNearAnyStop = false;
    let nearestDistance = Infinity;
    let nearestStopName = '';
    
    fullRouteStops.forEach((stop: any) => {
      const stopLat = parseFloat(stop.stop_lat);
      const stopLon = parseFloat(stop.stop_lon);
      
      if (isNaN(stopLat) || isNaN(stopLon)) return;
      
      const distance = getDistance(
        position.lat(), position.lng(),
        stopLat, stopLon
      );
      
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestStopName = stop.stop_name;
      }
      
      if (distance <= 500) {
        isNearAnyStop = true;
      }
    });
    
    console.log(`validateLocationForSharing: 最寄りバス停 ${nearestStopName} から ${nearestDistance.toFixed(0)}m, 共有可能: ${isNearAnyStop}`);
    
    if (!isNearAnyStop) {
      return { valid: false, reason: `最寄りバス停から${nearestDistance.toFixed(0)}m離れています（500m以内の範囲で共有可能）` };
    }

    return { valid: true };
  };

  const getRouteSequenceInfo = () => {
    const sequence: { stopId: string; stopName: string; seq: number; scheduledTime?: string }[] = [];
    // 共有用の全バス停リストを使用
    const fullRouteStops = (window as any).fullRouteStops || routeStops;
    console.log(`getRouteSequenceInfo: 使用するバス停リスト数 = ${fullRouteStops.length}`);
    
    fullRouteStops.forEach((stop: any, index: number) => {
      const stopId = stop?.stop_id;
      if (!stopId) return;
      const rawSeq = Number(stop?.seq);
      const seqValue = Number.isFinite(rawSeq) ? rawSeq : index;
      sequence.push({
        stopId,
        stopName: stop?.stop_name || stopId,
        seq: seqValue,
        scheduledTime: stop?.arrival_time || stop?.departure_time || undefined,
      });
    });
    sequence.sort((a, b) => a.seq - b.seq);
    return sequence;
  };

  const inferPassedStopsForRoute = (passages: PassedStopRecord[]): PassedStopRecord[] => {
    const sequenceInfo = getRouteSequenceInfo();
    if (sequenceInfo.length === 0 || passages.length === 0) {
      return passages;
    }

    const seqMap = new Map(sequenceInfo.map(info => [info.stopId, info]));
    const normalizedMap = new Map<string, PassedStopRecord>();

    passages.forEach(record => {
      normalizedMap.set(record.stopId, { ...record, inferred: record.inferred ?? false });
    });

    let highestSeq = -1;
    passages.forEach(record => {
      const seq = seqMap.get(record.stopId)?.seq;
      if (typeof seq === 'number' && seq > highestSeq) {
        highestSeq = seq;
      }
    });

    if (highestSeq < 0) {
      return passages;
    }

    const referenceRecord = passages.reduce<PassedStopRecord | null>((current, candidate) => {
      const candidateSeq = seqMap.get(candidate.stopId)?.seq;
      if (typeof candidateSeq !== 'number') return current;
      if (!current) return candidate;
      const currentSeq = seqMap.get(current.stopId)?.seq ?? -1;
      return candidateSeq >= currentSeq ? candidate : current;
    }, null);

    sequenceInfo
      .filter(info => info.seq <= highestSeq)
      .forEach(info => {
        if (!normalizedMap.has(info.stopId)) {
          normalizedMap.set(info.stopId, {
            stopId: info.stopId,
            stopName: info.stopName,
            passTime: referenceRecord?.passTime
              ? new Date(referenceRecord.passTime.getTime())
              : new Date(),
            scheduledTime: info.scheduledTime,
            delay: referenceRecord?.delay ?? 0,
            username: referenceRecord?.username,
            userId: referenceRecord?.userId,
            inferred: true,
          });
        }
      });

    return Array.from(normalizedMap.values()).sort((a, b) => {
      const seqA = seqMap.get(a.stopId)?.seq ?? 0;
      const seqB = seqMap.get(b.stopId)?.seq ?? 0;
      return seqA - seqB;
    });
  };

  const mergePassedStopRecords = (existing: PassedStopRecord[], additions: PassedStopRecord[]) => {
    if (additions.length === 0) return inferPassedStopsForRoute(existing);
    const mergedMap = new Map<string, PassedStopRecord>();
    existing.forEach(record => {
      mergedMap.set(record.stopId, { ...record });
    });
    additions.forEach(record => {
      mergedMap.set(record.stopId, { ...record, inferred: record.inferred ?? false });
    });
    return inferPassedStopsForRoute(Array.from(mergedMap.values()));
  };

  // アプリ終了時にFirestoreから自分の位置情報を削除
  const removeUserLocationFromFirestore = async (tripId?: string) => {
    const effectiveUserId = getEffectiveUserId();
    if (!effectiveUserId) return;
    
    try {
      // 自分の位置情報ドキュメントを検索して削除
      const constraints: QueryConstraint[] = [where('userId', '==', effectiveUserId)];
      if (tripId) {
        constraints.push(where('tripId', '==', tripId));
      }
      const q = query(collection(db, 'busRiderLocations'), ...constraints);
      
      const querySnapshot = await getDocs(q);
      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
    } catch (error) {

      // 削除に失敗した場合は、lastActiveを古い時刻に更新
      try {
        const updateData = {
          lastActive: Timestamp.fromMillis(Date.now() - 300000) // 5分前
        };
        const cleanupConstraints: QueryConstraint[] = [where('userId', '==', effectiveUserId)];
        if (tripId) {
          cleanupConstraints.push(where('tripId', '==', tripId));
        }
        const q = query(collection(db, 'busRiderLocations'), ...cleanupConstraints);
        const querySnapshot = await getDocs(q);
        const updatePromises = querySnapshot.docs.map(doc => 
          updateDoc(doc.ref, updateData)
        );
        await Promise.all(updatePromises);

      } catch (updateError) {

      }
    }
  };

  // バス停通過データをFirestoreに保存
  const saveBusStopPassage = async (tripId: string, stopData: any) => {
    try {
      const passageData = {
        tripId,
        stopId: stopData.stopId,
        stopName: stopData.stopName,
        userId: getEffectiveUserId() || 'anonymous',
        username: getUserDisplayName(currentUser),
        passTime: Timestamp.now(),
        delay: stopData.delay,
        scheduledTime: stopData.scheduledTime || null,
        actualTime: Timestamp.now()
      };

      await addDoc(collection(db, 'busStopPassages'), passageData);

    } catch (error: any) {

      if (error?.code === 'permission-denied') {
      }
    }
  };

  // 他のユーザーのバス停通過情報を監視
  const listenToBusStopPassages = (tripId: string) => {
    try {
      // 一時的に簡略化したクエリ（インデックス作成まで）
      const q = query(
        collection(db, 'busStopPassages'),
        where('tripId', '==', tripId),
        limit(20)
      );
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const passages = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            stopId: data.stopId,
            stopName: data.stopName,
            passTime: data.passTime.toDate(),
            delay: data.delay,
            scheduledTime: data.scheduledTime || undefined,
            username: data.username || 'ゲスト',
            userId: data.userId
          };
        });
        
        // クライアント側で時間フィルタリング（1時間以内）
        const cutoffTime = new Date(Date.now() - 3600000);
        const recentPassages = passages.filter(passage => 
          passage.passTime > cutoffTime
        );
        
        // 最新のユニークな停留所通過情報のみ保持
        const uniquePassages = recentPassages.filter((passage, index, self) => 
          index === self.findIndex(p => p.stopId === passage.stopId)
        );
        
        // 新しい通過情報があるかチェック（他のユーザーによるもの）
        const currentUserId = currentUser?.uid;
        const newPassages = uniquePassages.filter(passage => {
          const isFromOtherUser = passage.userId !== currentUserId;
          const isNewPassage = !busPassedStops.some(existing => 
            existing.stopId === passage.stopId && existing.userId === passage.userId
          );
          return isFromOtherUser && isNewPassage;
        });

        // 新しい通過情報があれば通知
        newPassages.forEach(passage => {

          showBusStopNotificationFromOtherUser(passage);
        });
        
        const normalizedPassages: PassedStopRecord[] = uniquePassages.map(passage => ({
          ...passage,
          inferred: false
        }));
        setBusPassedStops(inferPassedStopsForRoute(normalizedPassages));

      }, (error: any) => {

        if (error?.code === 'failed-precondition') {
        }
      });
      
      return unsubscribe;
    } catch (error: any) {

      return null;
    }
  };

  // 他のユーザーのバス停通過通知を表示
  const showBusStopNotificationFromOtherUser = (passedStop: any) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🚌 同じバスのライダーがバス停を通過`, {
        body: `${passedStop.stopName} - ${passedStop.delay > 0 ? `${passedStop.delay}分遅れ` : passedStop.delay < 0 ? `${Math.abs(passedStop.delay)}分早く` : '定刻'} (by ${passedStop.username})`,
        icon: '/bus-icon.png',
        tag: `other-user-bus-stop-${passedStop.stopId}`,
        requireInteraction: false
      });
    }
    
    // アプリ内通知も表示（画面上部にトースト表示）

  };

  const initializeMap = () => {
    if (!mapRef.current || !window.google || !window.google.maps || !window.google.maps.Map) {

      return;
    }

    let map;
    try {
      map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 26.2125, lng: 127.6811 }, // 那覇市
        zoom: 14,
      });
      mapInstance.current = map;
    } catch (error) {

      return;
    }

    // Places APIサービスを初期化
    try {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      placesService.current = new window.google.maps.places.PlacesService(map);
    } catch (error) {

    }
    
    // Directions APIサービスを初期化
    try {
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
    } catch (error) {

    }

    // 現在地をマップに表示
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const current = new window.google.maps.LatLng(latitude, longitude);
            currentLocationRef.current = current; // 現在地を保存
            
            // 現在地マーカーを表示（ルート表示時は自動的に隠される）
            if (currentLocationMarkerRef.current) {
              currentLocationMarkerRef.current.setPosition(current);
            } else {
              currentLocationMarkerRef.current = new window.google.maps.Marker({
                position: current,
                map,
                icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                title: "現在地",
              });
            }
            map.setCenter(current);
          } catch (error) {

          }
        },
        (err) => console.error('Geolocation error:', err)
      );
    }
  };

  // ユーザーが特定の便（trip）を選んだとき、その便の停車順のみを表示して地図に描画する
  const handleSelectBus = async (tripId: string) => {

    setRouteError(null);
    setLoadingRoute(true);
    try {
      const stops = await loadStops();
      let tripStops: any[] | undefined = tripStopsRef.current ? tripStopsRef.current[tripId] : undefined;
      if (!tripStops) {
        const stopTimes = await loadStopTimes();
        const _tripStops: Record<string, any[]> = {};
        for (const st of stopTimes) {
          if (!_tripStops[st.trip_id]) _tripStops[st.trip_id] = [];
          _tripStops[st.trip_id].push({ stop_id: st.stop_id, seq: Number(st.stop_sequence), arrival_time: st.arrival_time, departure_time: st.departure_time });
        }
        for (const k of Object.keys(_tripStops)) _tripStops[k].sort((a,b)=>a.seq-b.seq);
        tripStopsRef.current = _tripStops;
        tripStops = _tripStops[tripId];
      }

      if (!tripStops || tripStops.length === 0) throw new Error('選択した便の停車情報が見つかりません');

      // 目的地IDsがある場合は start->dest の区間だけを抜き出す。なければ全停車順を表示
      const destIdsArr = selectedDestIds.length > 0 ? selectedDestIds : [];
      // Default indices
      let startIdx = 0;
      let endIdx = tripStops.length - 1;

      // Determine endIdx by first destination stop found on this trip
      if (destIdsArr.length > 0) {
        const destIdx = tripStops.findIndex(s => destIdsArr.includes(s.stop_id));
        if (destIdx !== -1) endIdx = destIdx;
      }

      // If user selected a boarding stop (selectedStart), try to find its index on this trip.
      if (selectedStart) {
        // exact match by stop_id first
        const idxById = tripStops.findIndex(s => s.stop_id === selectedStart.stop_id);
        if (idxById !== -1) {
          startIdx = idxById;
        } else if (selectedStart.stop_lat && selectedStart.stop_lon) {
          // If selectedStart is a place (with coords), find the nearest stop along this trip
          try {
            const selLat = parseFloat(selectedStart.stop_lat);
            const selLon = parseFloat(selectedStart.stop_lon);
            let bestIdx = -1;
            let bestDist = Infinity;
            for (let i = 0; i < tripStops.length; i++) {
              const sId = tripStops[i].stop_id;
              const stopDef = (await loadStops()).find((st: any) => st.stop_id === sId);
              if (!stopDef) continue;
              const lat = parseFloat(stopDef.stop_lat);
              const lon = parseFloat(stopDef.stop_lon);
              if (isNaN(lat) || isNaN(lon)) continue;
              const d = getDistance(selLat, selLon, lat, lon);
              if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            // only accept nearest stop if reasonably close (e.g., within 800m)
            if (bestIdx !== -1 && bestDist < 800) startIdx = bestIdx;
          } catch (e) {
            // ignore and keep default startIdx
          }
        }
      }

      // Ensure startIdx <= endIdx
      if (startIdx > endIdx) {
        throw new Error('選択した出発停留所から目的地へ向かう経路ではありません');
      }

      // 表示用：出発地点の前のバス停を3つ表示するために、startIdxを調整
      const desiredStartIdx = startIdx - 3;
      const adjustedStartIdx = Math.max(0, desiredStartIdx);
      const actualPreviousCount = startIdx - adjustedStartIdx;

      // 表示用の限定範囲
      const displaySlice = tripStops.slice(adjustedStartIdx, endIdx + 1);
      
      // 位置情報共有用：バス路線全体を対象にする
      const fullRouteSlice = tripStops.slice(0, tripStops.length);
      
      // 重複するstop_idを除去（表示用）
      const uniqueDisplaySlice = displaySlice.filter((stop, index, self) => 
        index === self.findIndex(s => s.stop_id === stop.stop_id)
      );
      
      // 重複するstop_idを除去（共有用・全路線）
      const uniqueFullRouteSlice = fullRouteSlice.filter((stop, index, self) => 
        index === self.findIndex(s => s.stop_id === stop.stop_id)
      );
      
      // デバッグ情報
      console.log(`Debug: startIdx=${startIdx}, desiredStartIdx=${desiredStartIdx}, adjustedStartIdx=${adjustedStartIdx}, actualPreviousCount=${actualPreviousCount}`);
      console.log(`displaySlice.length=${displaySlice.length}, uniqueDisplaySlice.length=${uniqueDisplaySlice.length}`);
      console.log(`fullRouteSlice.length=${fullRouteSlice.length}, uniqueFullRouteSlice.length=${uniqueFullRouteSlice.length}`);
      console.log('Display slice stop names:', uniqueDisplaySlice.map(s => s.stop_id));
      console.log('Full route slice stop names:', uniqueFullRouteSlice.map(s => s.stop_id));
      
      // 表示用のバス停データ
      const routeStopsFull = uniqueDisplaySlice.map((s: any, sliceIndex: number) => {
        const stopDef = stops.find((st: any) => st.stop_id === s.stop_id) || { stop_name: s.stop_id, stop_lat: 0, stop_lon: 0 };
        const isBeforeStart = sliceIndex < actualPreviousCount;
        
        console.log(`Display Stop ${sliceIndex}: ${s.stop_id} (${stopDef.stop_name}), isBeforeStart: ${isBeforeStart}, isStartPoint: ${sliceIndex === actualPreviousCount}`);
        
        return { 
          ...stopDef, 
          seq: s.seq, 
          arrival_time: s.arrival_time, 
          departure_time: s.departure_time,
          isBeforeStart: isBeforeStart
        };
      });
      
      // 位置情報共有用のバス停データ（グローバル変数に保存）
      const fullRouteStops = uniqueFullRouteSlice.map((s: any) => {
        const stopDef = stops.find((st: any) => st.stop_id === s.stop_id) || { stop_name: s.stop_id, stop_lat: 0, stop_lon: 0 };
        return { 
          ...stopDef, 
          seq: s.seq, 
          arrival_time: s.arrival_time, 
          departure_time: s.departure_time,
          isBeforeStart: false // 共有用では全て通常バス停として扱う
        };
      });

      // 21番バス用の特別処理: 停車順序を再確認
      const isRoute21 = tripId.includes('naha_trip_') && tripId.includes('21');
      if (isRoute21) {

        // 停車順序でソート（念のため）
        routeStopsFull.sort((a, b) => (a.seq || 0) - (b.seq || 0));
        
        // 座標データの妥当性チェック
        const validStops = routeStopsFull.filter(rs => {
          const lat = parseFloat(rs.stop_lat);
          const lon = parseFloat(rs.stop_lon);
          return !isNaN(lat) && !isNaN(lon) && lat >= 24 && lat <= 27 && lon >= 122 && lon <= 132;
        });

      }

      setRouteStops(routeStopsFull);
      // 位置情報共有用：バス路線全体をグローバル変数に保存
      (window as any).fullRouteStops = fullRouteStops;
      setSelectedTripId(tripId);
      setIsSheetMinimized(false);
      setSheetTranslateY(0);

      // fetch realtime delay info (mock/fallback)
      try {
        const d = await fetchRealtimeDelayMock(tripId);
        setTripDelays(prev => ({ ...prev, [tripId]: d }));
      } catch (e) {
        setTripDelays(prev => ({ ...prev, [tripId]: null }));
      }

      // 地図に描画（マーカーとポリライン）
      if (mapInstance.current && window.google) {
        routeMarkersRef.current.forEach(m => m.setMap(null));
        routeMarkersRef.current = [];
        if (routePolylineRef.current) {
          routePolylineRef.current.setMap(null);
          routePolylineRef.current = null;
        }

        const path: google.maps.LatLngLiteral[] = [];

        // 21番バス特別処理
        const isRoute21 = tripId.includes('naha_trip_') && routeStopsFull.some(rs => 
          tripId.includes('21') || (rs.stop_id && rs.stop_id.includes('naha_'))
        );
        
        if (isRoute21) {

        }
        
        for (const rs of routeStopsFull) {
          const lat = parseFloat(rs.stop_lat);
          const lon = parseFloat(rs.stop_lon);
          
          if (isNaN(lat) || isNaN(lon)) {
            
            // 21番バスの場合、フォールバック座標を試行
            if (isRoute21) {

              // 沖縄の主要停留所の概算座標を使用
              const fallbackLat = 26.2125 + (Math.random() - 0.5) * 0.1; // 那覇市中心部付近
              const fallbackLon = 127.6811 + (Math.random() - 0.5) * 0.1;

              const fallbackPos = { lat: fallbackLat, lng: fallbackLon };
              path.push(fallbackPos);
              
              const marker = new window.google.maps.Marker({ 
                position: fallbackPos, 
                map: mapInstance.current!, 
                title: `${rs.stop_name} (座標推定) (${rs.arrival_time || rs.departure_time || ''})`,
                icon: 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png' // 推定座標用の色
              });
              routeMarkersRef.current.push(marker);
            }
            
            continue;
          }
          
          const pos = { lat, lng: lon };
          path.push(pos);
          
          // 出発地点と到着地点のマーカーを区別して表示
          let markerIcon = 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png';
          if (rs === routeStopsFull[0]) {
            markerIcon = 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'; // 出発地
          } else if (rs === routeStopsFull[routeStopsFull.length - 1]) {
            markerIcon = 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'; // 到着地
          }
          
          const marker = new window.google.maps.Marker({ 
            position: pos, 
            map: mapInstance.current!, 
            title: `${rs.stop_name} (${rs.arrival_time || rs.departure_time || ''})`,
            icon: markerIcon
          });
          routeMarkersRef.current.push(marker);
        }

        if (path.length > 0) {
          const poly = new window.google.maps.Polyline({ 
            path, 
            strokeColor: isRoute21 ? '#FF9800' : '#FF5722', // 21番バスは特別な色
            strokeWeight: isRoute21 ? 6 : 4, // 21番バスは太い線
            map: mapInstance.current! 
          });
          routePolylineRef.current = poly;
          const bounds = new window.google.maps.LatLngBounds();
          if (currentLocationRef.current) bounds.extend(currentLocationRef.current);
          path.forEach(p => bounds.extend(new window.google.maps.LatLng(p.lat, p.lng)));
          mapInstance.current!.fitBounds(bounds);

          if (isRoute21) {

          }
        } else {

          // 21番バスの場合、停留所マーカーだけでも表示を試行
          if (isRoute21 && routeStopsFull.length > 0) {

            routeStopsFull.forEach((rs, index) => {
              const estimatedLat = 26.2125 + (index * 0.01); // 概算の等間隔配置
              const estimatedLon = 127.6811 + (index * 0.01);
              
              const marker = new window.google.maps.Marker({ 
                position: { lat: estimatedLat, lng: estimatedLon }, 
                map: mapInstance.current!, 
                title: `${rs.stop_name} (推定位置) (${rs.arrival_time || rs.departure_time || ''})`,
                icon: 'http://maps.google.com/mapfiles/ms/icons/purple-dot.png'
              });
              routeMarkersRef.current.push(marker);
            });
            
            // 推定マーカーが表示されるようにマップを調整
            const bounds = new window.google.maps.LatLngBounds();
            bounds.extend(new window.google.maps.LatLng(26.2125, 127.6811));
            bounds.extend(new window.google.maps.LatLng(26.2125 + routeStopsFull.length * 0.01, 127.6811 + routeStopsFull.length * 0.01));
            mapInstance.current!.fitBounds(bounds);
          }
        }
      }

      // バス選択後はモーダルを閉じる

      setShowBusRoutes(false);

      // 選択したバスの他のライダーの位置情報を監視開始
      // 既存のリスナーを停止
      if (unsubscribeRiderListener.current) {
        unsubscribeRiderListener.current();
        unsubscribeRiderListener.current = null;
      }
      
      // すべてのユーザー（ゲストも含む）が他のライダーの位置を見ることができる

      const unsubscribe = listenToOtherRiders(tripId);
      unsubscribeRiderListener.current = unsubscribe;
      // バス停通過情報のリスナーも開始（視聴者側も通過情報を受け取れるようにする）
      try {
        if (unsubscribeStopPassageListener.current) {
          unsubscribeStopPassageListener.current();
          unsubscribeStopPassageListener.current = null;
        }
        const stopUnsub = listenToBusStopPassages(tripId);
        unsubscribeStopPassageListener.current = stopUnsub;

      } catch (e) {
      }
    } catch (e: any) {
      setRouteError(e.message || '便選択でエラーが発生しました');
    } finally {
      setLoadingRoute(false);
    }
  };

  // シンプルな検索入力ハンドラ（GTFSベースの検索を行う）
  const [loadingStops, setLoadingStops] = useState(false);
  const [stopsError, setStopsError] = useState<string | null>(null);
  const [selectedDest, setSelectedDest] = useState<any | null>(null);
  const [selectedDestIds, setSelectedDestIds] = useState<string[]>([]);

  // GTFS データは外部ユーティリティに切り出しました
  const [nearbyStops, setNearbyStops] = useState<any[]>([]);
  const [routeStops, setRouteStops] = useState<any[]>([]);
  const [routeBuses, setRouteBuses] = useState<any[]>([]);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [showStopCandidates, setShowStopCandidates] = useState(false);
  const [showBusRoutes, setShowBusRoutes] = useState(false);

  function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  

  // Realtime delay fetcher (mock). Replace with GTFS-RT or API integration later.
  async function fetchRealtimeDelayMock(tripId: string): Promise<number | null> {
    // Currently no GTFS-RT available in the repo; return null to indicate no realtime info.
    // You can replace this function to fetch from a GTFS-RT feed and parse delay (sec/min) when available.
    return null;
  }

  // リアルタイムデータベース（Firestore）への位置情報送信
  const shareLocationToFirestore = async (tripId: string, position: google.maps.LatLng) => {

    try {
      // より一意なユーザーIDを生成
      const userId = ensureSessionUserId();
      const username = getUserDisplayName(currentUser);
      
      const locationData = {
        tripId,
        userId,
        username,
        email: currentUser?.email || null,
        latitude: position.lat(),
        longitude: position.lng(),
        timestamp: Timestamp.now(),
        lastActive: Timestamp.now()
      };

      // 既存のドキュメントを検索

      const q = query(
        collection(db, 'busRiderLocations'),
        where('userId', '==', userId),
        where('tripId', '==', tripId)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docsWithData = querySnapshot.docs.map(docSnap => ({
          snap: docSnap,
          ts: (() => {
            const data = docSnap.data();
            return data?.timestamp?.toMillis?.() ?? 0;
          })()
        }));
        docsWithData.sort((a, b) => b.ts - a.ts);

        const [latestEntry, ...staleDocs] = docsWithData;

        await updateDoc(latestEntry.snap.ref, {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          timestamp: locationData.timestamp,
          lastActive: locationData.lastActive
        });

        if (staleDocs.length > 0) {

          await Promise.all(
            staleDocs.map(({ snap }) =>
              deleteDoc(snap.ref).catch((cleanupError) => {
              })
            )
          );
        }
      } else {
        // 新規ドキュメントを作成

        const docRef = await addDoc(collection(db, 'busRiderLocations'), locationData);

      }
      
      const newEntry = {
        id: userId,
        position,
        timestamp: new Date(),
        username,
        userId: userId, // userIdを明示的に追加
        email: currentUser?.email || undefined,
        lastActive: new Date()
      };
      setRidersLocations(prev => {
        const filtered = prev.filter(r => r.id !== userId);
        const updated = [...filtered, newEntry];
        updateBusLocation(tripId, updated);
        return updated;
      });
      
    } catch (error: any) {

      if (error?.code === 'permission-denied') {

        // 権限エラーの場合はローカル状態のみ更新
        const localUserId = ensureSessionUserId();
        const localRider = {
          id: localUserId,
          position: position,
          timestamp: new Date(),
          username: getUserDisplayName(currentUser),
          email: currentUser?.email,
          lastActive: new Date()
        };
        setRidersLocations(prev => [...prev.filter(r => r.id !== localUserId), localRider]);
      } else if (error?.code === 'unavailable') {

        throw error;
      } else {
        throw error;
      }
    }
  };

  // Firestoreから他のライダーの位置情報を取得
  const listenToOtherRiders = (tripId: string) => {
    try {
      // 一時的に簡略化したクエリ（インデックス作成まで）
      const q = query(
        collection(db, 'busRiderLocations'),
        where('tripId', '==', tripId),
        limit(50)
      );
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {

        const locations = querySnapshot.docs.map(doc => {
          const data = doc.data();
          
          return {
            id: data.userId,
            position: new window.google.maps.LatLng(data.latitude, data.longitude),
            timestamp: data.timestamp.toDate(),
            username: data.username || 'ゲスト',
            userId: data.userId, // userIdを明示的に追加
            email: data.email || undefined,
            lastActive: data.lastActive.toDate()
          };
        });
        
        // クライアント側で時間フィルタリング（3分以内に延長）
        const cutoffTime = new Date(Date.now() - 180000); // 3分 = 180秒
        const recentLocations = locations.filter(location => {
          const isRecent = location.lastActive > cutoffTime;
          const timeDiff = Math.round((Date.now() - location.lastActive.getTime()) / 1000);
          
          if (!isRecent) {
            
            // タイムアウトしたドキュメントを非同期で削除
            const timeoutDoc = querySnapshot.docs.find(doc => doc.data().userId === location.id);
            if (timeoutDoc) {
              deleteDoc(timeoutDoc.ref).then(() => {
              }).catch((error) => {
              });
            }
          }
          
          return isRecent;
        });
        
        // 重複するユーザーIDを削除（最新のもののみ保持）
        const uniqueLocations = recentLocations.filter((location, index, self) => 
          index === self.findIndex(l => l.id === location.id)
        );
        
        uniqueLocations.forEach((loc, idx) => {
        });
        
        setRidersLocations(uniqueLocations);

      }, (error: any) => {

        if (error?.code === 'permission-denied') {
          alert('位置情報の共有機能を利用するにはFirebaseの権限設定が必要です。\n開発者にお問い合わせください。');
        } else if (error?.code === 'failed-precondition') {
        }
      });
      
      return unsubscribe;
    } catch (error) {

      return null;
    }
  };

  // 位置情報更新のタイマー用ref
  const locationTimerRef = useRef<
    | NodeJS.Timeout
    | (() => void)
    | {
        locationTimer?: NodeJS.Timeout;
        fallbackTimer?: NodeJS.Timeout;
        heartbeatTimer?: NodeJS.Timeout;
        clearAll: () => void;
      }
    | null
  >(null);
  // Firestoreリスナー管理用のref
  const unsubscribeRiderListener = useRef<(() => void) | null>(null);
  const unsubscribeStopPassageListener = useRef<(() => void) | null>(null);

  // 位置情報共有開始（1分間隔での更新）
  const startLocationSharing = (tripId: string) => {

    ensureSessionUserId();
    
    if (!navigator.geolocation) {

      alert('このデバイスでは位置情報を取得できません');
      return;
    }

    // 位置情報権限の確認
    navigator.permissions.query({name: 'geolocation'}).then((permissionStatus) => {

    }).catch((error) => {

    });

    // 他のライダーの位置情報をリッスン開始

    const unsubscribe = listenToOtherRiders(tripId);
    unsubscribeRiderListener.current = unsubscribe;

    // バス停通過情報のリッスン開始

    const stopPassageUnsubscribe = listenToBusStopPassages(tripId);
    unsubscribeStopPassageListener.current = stopPassageUnsubscribe;

    const handlePositionUpdate = async (position: GeolocationPosition, skipStateCheck = false): Promise<boolean> => {

      if (!skipStateCheck && !isLocationSharing) {
        return false;
      }

      const { latitude, longitude } = position.coords;
      const currentPos = new window.google.maps.LatLng(latitude, longitude);

      const now = Date.now();
      const lastSharedAt = lastPositionTimestampRef.current || 0;
      let movedDistance = Number.POSITIVE_INFINITY;
      if (lastSharedPositionRef.current && window.google?.maps?.geometry) {
        movedDistance = window.google.maps.geometry.spherical.computeDistanceBetween(
          lastSharedPositionRef.current,
          currentPos
        );
      }

      const timeElapsed = now - lastSharedAt;
      const timeElapsedInfo = lastSharedAt ? `${timeElapsed}ms` : '初回送信';
      const movedEnough = Number.isFinite(movedDistance) && movedDistance >= MIN_MOVEMENT_METERS;
      const intervalReached = !lastSharedAt || timeElapsed >= MIN_SHARE_INTERVAL_MS;

      if (!intervalReached && !movedEnough) {
        const distanceInfo = Number.isFinite(movedDistance) ? `${movedDistance.toFixed(1)}m` : '未計測';

        return false;
      }

      currentLocationRef.current = currentPos;
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.setPosition(currentPos);
      } else if (mapInstance.current) {
        currentLocationMarkerRef.current = new window.google.maps.Marker({
          position: currentPos,
          map: mapInstance.current,
          icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
          title: "現在地",
        });
      }

      const validation = validateLocationForSharing(currentPos, tripId);
      if (!validation.valid) {
        alert(`位置情報の共有を停止しました: ${validation.reason}`);
  await stopLocationSharing(tripId);
        return false;
      }

      try {

        await shareLocationToFirestore(tripId, currentPos);

  lastPositionTimestampRef.current = now;
        lastSharedPositionRef.current = currentPos;

        if (!isLocationSharing) {

          setIsLocationSharing(true);
        }
      } catch (error) {

        return false;
      }

      checkPassedStops(currentPos, tripId);

      return true;
    };

    const updateLocation = (skipStateCheck = false) => {

      const now = Date.now();
  const minInterval = skipStateCheck ? MIN_SHARE_INTERVAL_MS : 0;
      if (lastPositionTimestampRef.current && now - lastPositionTimestampRef.current < minInterval) {
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handlePositionUpdate(position, skipStateCheck)
            .then((success) => {
              if (!success) {
              }
            })
            .catch((error) => {

            });
        },
        (error) => {

          const timeoutCode = (error as GeolocationPositionError).TIMEOUT ?? 3;
          if (error.code === timeoutCode && currentLocationRef.current) {
            lastPositionTimestampRef.current = Date.now();
          }
          if (!skipStateCheck) {
            setIsLocationSharing(false);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 15000
        }
      );
    };

    navigator.geolocation.getCurrentPosition(
      async (initialPosition) => {

        const { latitude, longitude } = initialPosition.coords;
        const initialPos = new window.google.maps.LatLng(latitude, longitude);

        const initialValidation = validateLocationForSharing(initialPos, tripId);

        if (!initialValidation.valid) {

          alert(`乗車位置が不適切です: ${initialValidation.reason}\n\nバス停付近で再度お試しください。`);
          setIsLocationSharing(false);
          return;
        }

        if (locationTimerRef.current) {

          if (typeof locationTimerRef.current === 'object' && 'clearAll' in locationTimerRef.current) {
            locationTimerRef.current.clearAll();
          } else if (typeof locationTimerRef.current === 'function') {
            locationTimerRef.current();
          } else {
            clearInterval(locationTimerRef.current);
          }
          locationTimerRef.current = null;
        }

        setIsLocationSharing(true);

        let initialUpdateSuccess = false;
        try {
          initialUpdateSuccess = await handlePositionUpdate(initialPosition, true);
        } catch (error) {

        }

        if (!initialUpdateSuccess) {
          return;
        }

        // 乗車開始時に前のバス停の通過判定を自動推論
        inferPreviousPassedStops(initialPos, tripId);

        const watchIdentifier = navigator.geolocation.watchPosition(
          async (pos) => {

            try {
              const success = await handlePositionUpdate(pos, true);
              if (!success) {
              }
            } catch (error) {

            }
          },
          (watchError) => {

          },
          {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 15000
          }
        );
        setWatchId(watchIdentifier);

        const fallbackTimer = setInterval(() => {
          // watchPositionが静止した際のバックアップとして定期的に現在地を取得

          updateLocation(true);
        }, MIN_SHARE_INTERVAL_MS);

        const heartbeatTimer = setInterval(() => {

          if (currentUser?.uid) {
            const isBackground = document.hidden;
            const statusText = isBackground ? 'バックグラウンド' : 'フォアグラウンド';

            const updateHeartbeat = async () => {
              try {
                const q = query(
                  collection(db, 'busRiderLocations'),
                  where('userId', '==', currentUser.uid),
                  where('tripId', '==', tripId)
                );
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                  return;
                }

                const updatePromises = querySnapshot.docs.map(doc => {
                  return updateDoc(doc.ref, { lastActive: Timestamp.now() });
                });

                await Promise.all(updatePromises);
              } catch (error: any) {

                if (error?.code === 'permission-denied' || error?.code === 'unavailable') {
                }
              }
            };
            updateHeartbeat();
          } else {
          }
        }, 30000);

        locationTimerRef.current = {
          fallbackTimer,
          heartbeatTimer,
          clearAll: () => {

            clearInterval(fallbackTimer);
            clearInterval(heartbeatTimer);
          }
        };

      },
      (error) => {
        
        let errorMessage = '位置情報の取得に失敗しました。';
        switch (error.code) {
          case 1: // PERMISSION_DENIED
            errorMessage = '位置情報の許可が拒否されています。ブラウザの設定を確認してください。';
            break;
          case 2: // POSITION_UNAVAILABLE
            errorMessage = '位置情報を取得できません。GPSが利用できない環境の可能性があります。';
            break;
          case 3: // TIMEOUT
            errorMessage = '位置情報の取得がタイムアウトしました。再度お試しください。';
            break;
        }
        
        alert(errorMessage);
        setIsLocationSharing(false);

      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );
  };

  // 位置情報共有停止
  const stopLocationSharing = async (tripId?: string) => {
    // タイマーの停止
    if (locationTimerRef.current) {
      if (typeof locationTimerRef.current === 'function') {
        locationTimerRef.current(); // 複数のタイマーをクリアする関数
      } else if (typeof locationTimerRef.current === 'object' && 'clearAll' in locationTimerRef.current) {
        // 新しい形式のタイマーオブジェクト
        locationTimerRef.current.clearAll();
      } else {
        // 従来のタイマーID
        clearInterval(locationTimerRef.current);
      }
      locationTimerRef.current = null;
    }

    // watchPositionの停止
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);

    }
    
    // Firestoreから自分の位置情報を削除
    await removeUserLocationFromFirestore(tripId);
    
    // Firestoreリスナーの停止
    if (unsubscribeRiderListener.current) {
      unsubscribeRiderListener.current();
      unsubscribeRiderListener.current = null;
    }
    
    if (unsubscribeStopPassageListener.current) {
      unsubscribeStopPassageListener.current();
      unsubscribeStopPassageListener.current = null;
    }
    
    setIsLocationSharing(false);
    setRidersLocations([]);
    
    // 他のライダーのマーカーもクリア
    otherRidersMarkersRef.current.forEach(marker => marker.setMap(null));
    otherRidersMarkersRef.current = [];
    
    // マーカーマップもクリア
    ridersMarkersMapRef.current.forEach(marker => marker.setMap(null));
    ridersMarkersMapRef.current.clear();
    if (busMarkerRef.current) {
      busMarkerRef.current.setMap(null);
      busMarkerRef.current = null;
    }

    lastSharedPositionRef.current = null;
    lastPositionTimestampRef.current = 0;
    
  };

  // バスの推定位置を更新
  const updateBusLocation = (tripId: string, overrideLocations?: typeof ridersLocations) => {
    if (!mapInstance.current || !window.google) return;

    if (routeMarkersRef.current.length > 0) {
      const keptMarkers: google.maps.Marker[] = [];
      routeMarkersRef.current.forEach(marker => {
        const title = marker.getTitle() || '';
        if (title.includes('🚌 バス現在位置')) {
          marker.setMap(null);
        } else {
          keptMarkers.push(marker);
        }
      });
      routeMarkersRef.current = keptMarkers;
    }

    const sourceLocations = overrideLocations ?? ridersLocations;

    if (sourceLocations.length === 0) {
      if (busMarkerRef.current) {
        busMarkerRef.current.setMap(null);
        busMarkerRef.current = null;
      }
      setBusLocation(null);
      return;
    }
    
    // 最新の位置情報から平均位置を計算（簡易的な実装）
    let totalLat = 0;
    let totalLng = 0;
    let count = 0;
    
    sourceLocations.forEach(rider => {
      totalLat += rider.position.lat();
      totalLng += rider.position.lng();
      count++;
    });
    
    if (count > 0) {
      const avgLat = totalLat / count;
      const avgLng = totalLng / count;
      const busPos = new window.google.maps.LatLng(avgLat, avgLng);
      setBusLocation(busPos);
      
      if (busMarkerRef.current) {
        busMarkerRef.current.setPosition(busPos);
      } else {
        busMarkerRef.current = new window.google.maps.Marker({
          position: busPos,
          map: mapInstance.current,
          title: '🚌 バス現在位置 (推定)',
          icon: {
            url: 'http://maps.google.com/mapfiles/ms/icons/bus.png',
            scaledSize: new window.google.maps.Size(40, 40)
          }
        });
      }
    }
  };

  // 他のライダーのマーカーを地図上に表示・更新
  const updateOtherRidersMarkers = () => {
    if (!mapInstance.current || !window.google) return;
    
    // 現在のユーザーIDを正確に取得
    const currentUserId = currentUser?.uid;

    // 現在表示中のライダーIDを取得
    const currentMarkerIds = Array.from(ridersMarkersMapRef.current.keys());
    const newRiderIds = ridersLocations.map(rider => rider.id);

    currentMarkerIds.forEach(riderId => {
      if (!newRiderIds.includes(riderId)) {
        const marker = ridersMarkersMapRef.current.get(riderId);
        if (marker) {

          marker.setMap(null);
          ridersMarkersMapRef.current.delete(riderId);

          const index = otherRidersMarkersRef.current.indexOf(marker);
          if (index > -1) {
            otherRidersMarkersRef.current.splice(index, 1);
          }
        }
      }
    });

    if (ridersLocations.length === 0) {

      otherRidersMarkersRef.current.forEach(marker => marker.setMap(null));
      otherRidersMarkersRef.current = [];
      ridersMarkersMapRef.current.clear();
    }

    // 各ライダーのマーカーを更新または新規作成
    ridersLocations.forEach((rider, index) => {

      const isCurrentUser = rider.id === currentUserId || rider.id === 'current_user';
      
      // 既存のマーカーがあるかチェック
      let existingMarker = ridersMarkersMapRef.current.get(rider.id);
      
      if (existingMarker) {
        // 既存マーカーの位置をスムーズに更新

        // 現在のマーカー位置を取得
        const currentPosition = existingMarker.getPosition();
        
        // 移動距離を計算（メートル単位）
        if (currentPosition && window.google?.maps?.geometry) {
          const distance = window.google.maps.geometry.spherical.computeDistanceBetween(
            currentPosition,
            rider.position
          );
          
          if (distance < 0.5) {
          } else if (distance < 5) {
          } else {
          }
        }
        
        // 新しい位置オブジェクトを確実に作成
        const newLatLng = new window.google.maps.LatLng(
          rider.position.lat(), 
          rider.position.lng()
        );
        
        // 位置を強制更新
        existingMarker.setPosition(newLatLng);
        
        // マーカーがマップに表示されているか確認
        const markerMap = existingMarker.getMap();
        if (!markerMap) {

          existingMarker.setMap(mapInstance.current);
        }
        
        // マーカーの可視性を確保
        existingMarker.setVisible(true);
        
        // マーカーが確実に見える位置に表示されているかチェック
        const updatedPosition = existingMarker.getPosition();
        
        existingMarker.setTitle(isCurrentUser ? 
          `🚌 ${rider.username} (あなた - 位置情報共有中)` : 
          `🚌 ${rider.username} (同乗者)`);
        
        // 情報ウィンドウの内容も更新（パフォーマンス向上のため簡略化）
        
      } else {
        // 新規マーカーを作成

        if (isCurrentUser) {

          const selfMarker = new window.google.maps.Marker({
            position: rider.position,
            map: mapInstance.current,
            title: `🚌 ${rider.username} (あなた - 位置情報共有中)`,
            icon: {
              url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
              scaledSize: new window.google.maps.Size(44, 44)
            },
            zIndex: 2000
          });

          const selfInfoWindow = new window.google.maps.InfoWindow({
            content: `
              <div style="padding: 12px; min-width: 180px;">
                <h4 style="margin: 0 0 8px 0; color: #007BFF;">� あなたの位置</h4>
                <p style="margin: 4px 0; color: #666;"><strong>ユーザー名:</strong> ${rider.username}</p>
                <p style="margin: 4px 0; color: #666;"><strong>位置:</strong> ${rider.position.lat().toFixed(6)}, ${rider.position.lng().toFixed(6)}</p>
                <p style="margin: 4px 0; color: #666;"><strong>最終更新:</strong> ${rider.timestamp.toLocaleTimeString()}</p>
                <p style="margin: 8px 0 4px 0; color: #007BFF; font-size: 12px;">🔄 位置情報を共有中</p>
              </div>
            `
          });

          selfMarker.addListener('click', () => {
            selfInfoWindow.open(mapInstance.current, selfMarker);
          });

          ridersMarkersMapRef.current.set(rider.id, selfMarker);
          otherRidersMarkersRef.current.push(selfMarker);

        } else {

          const createBlinkingIcon = (color: string) => ({
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
              <svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="15" fill="${color}" stroke="white" stroke-width="3" opacity="0.8">
                  <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite"/>
                  <animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite"/>
                </circle>
                <text x="20" y="25" text-anchor="middle" font-family="Arial" font-size="14" fill="white">🚌</text>
              </svg>
            `)}`,
            scaledSize: new window.google.maps.Size(40, 40),
            anchor: new window.google.maps.Point(20, 20)
          });

          const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
          const riderColor = colors[index % colors.length];

          const marker = new window.google.maps.Marker({
            position: rider.position,
            map: mapInstance.current,
            title: `🚌 ${rider.username} (同乗者)`,
            icon: createBlinkingIcon(riderColor),
            zIndex: 1000 + index
          });

          const infoWindow = new window.google.maps.InfoWindow({
            content: `
              <div style="padding: 10px; min-width: 150px;">
                <h4 style="margin: 0 0 8px 0; color: #333;">🚌 同乗者情報</h4>
                <p style="margin: 4px 0;"><strong>ユーザー:</strong> ${rider.username}</p>
                <p style="margin: 4px 0;"><strong>最終更新:</strong> ${rider.timestamp.toLocaleTimeString('ja-JP')}</p>
                <p style="margin: 4px 0; font-size: 12px; color: #666;">リアルタイム位置情報</p>
              </div>
            `
          });

          marker.addListener('click', () => {
            infoWindow.open(mapInstance.current, marker);
          });

          ridersMarkersMapRef.current.set(rider.id, marker);
          otherRidersMarkersRef.current.push(marker);
        }
      }
    });

    // テスト用ライダーは実データが0件の場合のみ追加（既存のロジックを保持）
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (isDevelopment && ridersLocations.length === 0) {
      const currentPos = currentLocationRef.current;
      if (currentPos) {

        // テスト用ライダーのロジックはそのまま保持...
      }
    } else if (ridersLocations.length > 0) {
    }

    // マップの表示をリフレッシュ（マーカーの表示更新を強制）
    if (mapInstance.current && ridersLocations.length > 0) {
      // 短い遅延後にマップの再描画をトリガー
      setTimeout(() => {
        if (mapInstance.current) {
          window.google.maps.event.trigger(mapInstance.current, 'resize');
        }
      }, 100);
    }
  };

  // 通過した停留所をチェック
  const checkPassedStops = (currentPos: google.maps.LatLng, tripId: string) => {
    if (routeStops.length === 0) return;
    
    const proximityRadius = 50; // 50m以内で通過と判定
    
    routeStops.forEach(stop => {
      const stopLat = parseFloat(stop.stop_lat);
      const stopLon = parseFloat(stop.stop_lon);
      
      if (isNaN(stopLat) || isNaN(stopLon)) return;
      
      const stopPos = new window.google.maps.LatLng(stopLat, stopLon);
      const distance = getDistance(
        currentPos.lat(), currentPos.lng(),
        stopLat, stopLon
      );
      
      if (distance <= proximityRadius) {
        // まだ通過記録がない停留所のみ記録
        const alreadyPassed = busPassedStops.some(passed => passed.stopId === stop.stop_id);
        if (!alreadyPassed) {
          const currentTime = new Date();
          const scheduledTime = stop.arrival_time || stop.departure_time || '';
          const delay = calculateDelay(currentTime, scheduledTime);
          
          const passedStop = {
            stopId: stop.stop_id,
            stopName: stop.stop_name,
            passTime: currentTime,
            scheduledTime: scheduledTime || undefined,
            delay: delay,
            username: getUserDisplayName(currentUser),
            userId: currentUser?.uid || 'anonymous'
          };
          
          setBusPassedStops(prev => mergePassedStopRecords(prev, [{ ...passedStop, inferred: false }]));
          
          // Firestoreに通過情報を保存（他のユーザーにも通知）
          saveBusStopPassageToFirestore(tripId, passedStop);
          
          // ブラウザ通知を表示（許可されている場合）
          showBusStopNotification(passedStop);
          
          // 残りの停留所の到着予定時刻を再計算
          updateEstimatedArrivalTimes(delay, stop.seq);
          
        }
      }
    });
  };

  // 乗車開始時に現在位置より前のバス停の通過判定を自動推論
  const inferPreviousPassedStops = (currentPos: google.maps.LatLng, tripId: string) => {
    // 通過済み判定は表示範囲内のバス停のみを対象にする
    // （位置情報共有は全路線対象だが、通過済み判定は表示範囲のみ）
    console.log(`inferPreviousPassedStops: 使用するバス停リスト数 = ${routeStops.length} (表示範囲のみ)`);
    
    if (routeStops.length === 0) return;
    
    // 現在位置から最も近いバス停を特定
    let nearestStopIndex = -1;
    let nearestDistance = Infinity;
    
    routeStops.forEach((stop: any, index: number) => {
      const stopLat = parseFloat(stop.stop_lat);
      const stopLon = parseFloat(stop.stop_lon);
      
      if (isNaN(stopLat) || isNaN(stopLon)) return;
      
      const distance = getDistance(
        currentPos.lat(), currentPos.lng(),
        stopLat, stopLon
      );
      
      console.log(`バス停 ${index}: ${stop.stop_name} (${stop.stop_id}) - 距離: ${distance.toFixed(0)}m`);
      
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestStopIndex = index;
      }
    });
    
    if (nearestStopIndex === -1) {
      console.log('inferPreviousPassedStops: 最寄りバス停が見つかりませんでした');
      return;
    }
    
    const nearestStop = routeStops[nearestStopIndex];
    
    // 乗車判定の条件：最寄りバス停から500m以内（2つ前のバス停からも共有可能にする）
    if (nearestDistance > 500) {
      console.log(`乗車判定失敗: 最寄りバス停 ${nearestStop.stop_name} から ${nearestDistance.toFixed(0)}m離れています（500m以上）`);
      return;
    }
    
    console.log(`最寄りバス停: ${nearestStop.stop_name} (${nearestDistance.toFixed(0)}m) - インデックス: ${nearestStopIndex}`);
    
    // 現在のバス停より前のバス停を通過済みとして推論
    const currentTime = new Date();
    const newPassedStops: PassedStopRecord[] = [];
    
    for (let i = 0; i < nearestStopIndex; i++) {
      const stop = routeStops[i];
      newPassedStops.push({
        stopId: stop.stop_id,
        stopName: stop.stop_name,
        passTime: currentTime,
        delay: 0,
        inferred: true
      });
      console.log(`推論で追加: ${stop.stop_name} (${stop.stop_id}) - seq: ${stop.seq}`);
    }
    
    for (let i = 0; i < nearestStopIndex; i++) {
      const previousStop = routeStops[i];
      
      // 既に通過記録があるかチェック
      const alreadyPassed = busPassedStops.some(passed => passed.stopId === previousStop.stop_id);
      if (!alreadyPassed) {
        const scheduledTime = previousStop.arrival_time || previousStop.departure_time || '';
        const estimatedPassTime = new Date(currentTime.getTime() - (nearestStopIndex - i) * 2 * 60 * 1000); // 各バス停2分前と仮定
        const delay = calculateDelay(estimatedPassTime, scheduledTime);
        
        const inferredPassedStop: PassedStopRecord = {
          stopId: previousStop.stop_id,
          stopName: previousStop.stop_name,
          passTime: estimatedPassTime,
          scheduledTime: scheduledTime || undefined,
          delay: delay,
          username: getUserDisplayName(currentUser),
          userId: currentUser?.uid || 'anonymous',
          inferred: true // 推論による通過判定であることを明示
        };
        
        newPassedStops.push(inferredPassedStop);
        
        // Firestoreに推論による通過情報を保存
        saveBusStopPassageToFirestore(tripId, inferredPassedStop);
        
      }
    }
    
    if (newPassedStops.length > 0) {
      setBusPassedStops(prev => mergePassedStopRecords(prev, newPassedStops));

    } else {

    }
  };

  // バス停通過をFirestoreに保存（他のユーザーにリアルタイム通知）
  const saveBusStopPassageToFirestore = async (tripId: string, passedStop: any) => {
    try {
      const passageData = {
        tripId,
        stopId: passedStop.stopId,
        stopName: passedStop.stopName,
        passTime: Timestamp.now(),
        scheduledTime: passedStop.scheduledTime,
        delay: passedStop.delay,
        username: passedStop.username,
        userId: currentUser?.uid || 'anonymous',
        timestamp: Timestamp.now(),
        inferred: passedStop.inferred || false // 推論による通過判定かどうかを記録
      };

      await addDoc(collection(db, 'busStopPassages'), passageData);

    } catch (error) {

    }
  };

  // ブラウザ通知を表示
  const showBusStopNotification = (passedStop: any) => {
    // 通知権限をチェック
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(`🚏 バス停通過: ${passedStop.stopName}`, {
          body: `${passedStop.delay > 0 ? `${passedStop.delay}分遅れ` : passedStop.delay < 0 ? `${Math.abs(passedStop.delay)}分早く` : '定刻'} by ${passedStop.username}`,
          icon: '/bus-icon.png',
          tag: `bus-stop-${passedStop.stopId}`,
          requireInteraction: false
        });
      } else if (Notification.permission === 'default') {
        // 通知許可を求める
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(`🚏 バス停通過: ${passedStop.stopName}`, {
              body: `${passedStop.delay > 0 ? `${passedStop.delay}分遅れ` : passedStop.delay < 0 ? `${Math.abs(passedStop.delay)}分早く` : '定刻'} by ${passedStop.username}`,
              icon: '/bus-icon.png'
            });
          }
        });
      }
    }
  };

  // 遅延時間を計算
  const calculateDelay = (actualTime: Date, scheduledTimeStr: string): number => {
    if (!scheduledTimeStr) return 0;
    
    try {
      const today = new Date();
      const [hours, minutes] = scheduledTimeStr.split(':').map(Number);
      const scheduledTime = new Date(today);
      scheduledTime.setHours(hours, minutes, 0, 0);
      
      return Math.round((actualTime.getTime() - scheduledTime.getTime()) / 60000); // 分単位
    } catch (e) {
      return 0;
    }
  };

  // scheduled time (HH:MM or HH:MM:SS, possibly HH>=24) を今日の Date に変換
  const parseScheduledTimeToDate = (timeStr?: string): Date | null => {
    if (!timeStr) return null;
    const parts = timeStr.split(":");
    if (parts.length < 2) return null;
    let hh = parseInt(parts[0]);
    const mm = parseInt(parts[1]) || 0;
    const ss = parts[2] ? parseInt(parts[2]) : 0;
    if (isNaN(hh) || isNaN(mm)) return null;
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const extraDays = Math.floor(hh / 24);
    hh = hh % 24;
    base.setHours(hh, mm, ss, 0);
    if (extraDays > 0) base.setDate(base.getDate() + extraDays);
    return base;
  };

  // 指定した時刻が「現在時刻から見て過去N時間以内」であれば true を返す
  const isWithinPastHours = (timeStr?: string, hours = 2) => {
    const d = parseScheduledTimeToDate(timeStr);
    if (!d) return true; // 時刻が存在しない場合は表示を継続
    const cutoff = Date.now() - hours * 3600 * 1000;
    return d.getTime() >= cutoff;
  };

  // 残りの停留所の到着予定時刻を更新
  const updateEstimatedArrivalTimes = (currentDelay: number, currentStopSeq: number) => {
    const newEstimates: Record<string, string> = {};
    
    routeStops.forEach(stop => {
      if (stop.seq > currentStopSeq) {
        const originalTime = stop.arrival_time || stop.departure_time;
        if (originalTime) {
          try {
            const [hours, minutes] = originalTime.split(':').map(Number);
            const today = new Date();
            const estimatedTime = new Date(today);
            estimatedTime.setHours(hours, minutes + currentDelay, 0, 0);
            
            newEstimates[stop.stop_id] = estimatedTime.toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit'
            });
          } catch (e) {
            newEstimates[stop.stop_id] = originalTime;
          }
        }
      }
    });
    
    setEstimatedArrivalTimes(newEstimates);
  };

  // 目的地検索入力ハンドラ
  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    setShowPredictions(false);
    setPredictions([]);
    try {
      const q = value.trim().toLowerCase();
      if (!q) return;
      
      const predictions: any[] = [];
      
      // 1. 停留所名での検索
      const stops = await loadStops();
      let userLat: number | null = null;
      let userLon: number | null = null;
      if (currentLocationRef.current && (window.google && typeof window.google.maps.LatLng === 'function')) {
        try {
          userLat = (currentLocationRef.current as google.maps.LatLng).lat();
          userLon = (currentLocationRef.current as google.maps.LatLng).lng();
        } catch (e) {
          userLat = null; userLon = null;
        }
      }

      const stopMatches = stops
        .filter((s: any) => (s.stop_name || '').toLowerCase().includes(q))
        .map((s: any, index: number) => {
          let secondary = '🚏 停留所';
          if (userLat !== null && userLon !== null) {
            const d = Math.round(getDistance(userLat, userLon, parseFloat(s.stop_lat), parseFloat(s.stop_lon)));
            secondary = `🚏 停留所 • ${d}m`;
          }
          return { 
            place_id: s.stop_id, 
            unique_key: `stop_${s.stop_id}_${index}`,
            type: 'stop',
            structured_formatting: { main_text: s.stop_name, secondary_text: secondary } 
          };
        })
        .sort((a: any, b: any) => {
          const ad = a.structured_formatting.secondary_text.includes('•') ? 
            parseInt(a.structured_formatting.secondary_text.split('•')[1]) : Infinity;
          const bd = b.structured_formatting.secondary_text.includes('•') ? 
            parseInt(b.structured_formatting.secondary_text.split('•')[1]) : Infinity;
          return ad - bd;
        })
        .slice(0, 5);

      predictions.push(...stopMatches);

      // 2. Google Places APIでの地名検索
      if (autocompleteService.current && q.length >= 2) {
        try {
          const placesRequest = {
            input: q,
            componentRestrictions: { country: 'jp' },
            locationBias: userLat && userLon ? {
              center: new window.google.maps.LatLng(userLat, userLon),
              radius: 50000 // 50km範囲
            } : undefined,
            types: ['establishment', 'geocode']
          };
          
          const placesResults: any = await new Promise((resolve) => {
            autocompleteService.current!.getPlacePredictions(placesRequest, (results, status) => {
              if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
                resolve(results);
              } else {
                resolve([]);
              }
            });
          });

          const placeMatches = placesResults
            .filter((p: any) => p.description.includes('沖縄') || p.description.includes('那覇') || 
              p.description.includes('宜野湾') || p.description.includes('浦添') || p.description.includes('具志川'))
            .slice(0, 3)
            .map((p: any, index: number) => ({
              place_id: p.place_id,
              unique_key: `place_${p.place_id}_${index}`,
              type: 'place',
              structured_formatting: {
                main_text: p.structured_formatting.main_text,
                secondary_text: `📍 ${p.structured_formatting.secondary_text}`
              }
            }));

          predictions.push(...placeMatches);
        } catch (e) {
        }
      }

      if (predictions.length > 0) {
        setPredictions(predictions.slice(0, 8));
        setShowPredictions(true);
      }
    } catch (e) {
      // ignore prediction errors
    }
  };

  // 出発地点検索入力ハンドラ
  const handleStartSearchChange = async (value: string) => {
    setStartSearchQuery(value);
    setShowStartPredictions(false);
    setStartPredictions([]);
    try {
      const q = value.trim().toLowerCase();
      if (!q) return;
      
      const predictions: any[] = [];
      
      // 1. 停留所名での検索
      const stops = await loadStops();
      let userLat: number | null = null;
      let userLon: number | null = null;
      if (currentLocationRef.current && (window.google && typeof window.google.maps.LatLng === 'function')) {
        try {
          userLat = (currentLocationRef.current as google.maps.LatLng).lat();
          userLon = (currentLocationRef.current as google.maps.LatLng).lng();
        } catch (e) {
          userLat = null; userLon = null;
        }
      }

      const stopMatches = stops
        .filter((s: any) => (s.stop_name || '').toLowerCase().includes(q))
        .map((s: any, index: number) => {
          let secondary = '🚏 停留所';
          if (userLat !== null && userLon !== null) {
            const d = Math.round(getDistance(userLat, userLon, parseFloat(s.stop_lat), parseFloat(s.stop_lon)));
            secondary = `🚏 停留所 • ${d}m`;
          }
          return { 
            place_id: s.stop_id, 
            unique_key: `start_stop_${s.stop_id}_${index}`,
            type: 'stop',
            structured_formatting: { main_text: s.stop_name, secondary_text: secondary } 
          };
        })
        .sort((a: any, b: any) => {
          const ad = a.structured_formatting.secondary_text.includes('•') ? 
            parseInt(a.structured_formatting.secondary_text.split('•')[1]) : Infinity;
          const bd = b.structured_formatting.secondary_text.includes('•') ? 
            parseInt(b.structured_formatting.secondary_text.split('•')[1]) : Infinity;
          return ad - bd;
        })
        .slice(0, 5);

      predictions.push(...stopMatches);

      // 2. Google Places APIでの地名検索（沖縄県内に制限）
      if (autocompleteService.current && q.length >= 2) {
        try {
          const okinawaBounds = new window.google.maps.LatLngBounds(
            new window.google.maps.LatLng(24.0, 122.0), // 沖縄県南西端  
            new window.google.maps.LatLng(27.0, 131.0)  // 沖縄県北東端
          );
          
          const placesRequest = {
            input: `${q} 沖縄県`,
            componentRestrictions: { country: 'jp' },
            locationBias: okinawaBounds,
            types: ['establishment', 'geocode']
          };
          
          const placesResults: any = await new Promise((resolve) => {
            autocompleteService.current!.getPlacePredictions(placesRequest, (results, status) => {
              if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
                resolve(results);
              } else {
                resolve([]);
              }
            });
          });

          const placeMatches = placesResults
            .filter((p: any) => p.description.includes('沖縄') || p.description.includes('那覇') || 
              p.description.includes('宜野湾') || p.description.includes('浦添') || p.description.includes('具志川'))
            .slice(0, 3)
            .map((p: any, index: number) => ({
              place_id: p.place_id,
              unique_key: `start_place_${p.place_id}_${index}`,
              type: 'place',
              structured_formatting: {
                main_text: p.structured_formatting.main_text,
                secondary_text: `📍 ${p.structured_formatting.secondary_text}`
              }
            }));

          predictions.push(...placeMatches);
        } catch (e) {
        }
      }

      if (predictions.length > 0) {
        setStartPredictions(predictions.slice(0, 8));
        setShowStartPredictions(true);
      }
    } catch (e) {
      // ignore prediction errors
    }
  };

  // 目的地名で検索し、現在地から近くて目的地に行くバスがある停留所のみを nearbyStops に入れる
  const handleSearch = async () => {
    setStopsError(null);
    setNearbyStops([]);
    setSelectedDest(null);
    setSelectedDestIds([]);
    setLoadingStops(true);
    try {
      if (!searchQuery.trim()) throw new Error('目的地名を入力してください');

      // 出発地点の処理：ユーザーが地名を入力したが selectedStart が未設定の場合の処理
      let geocodedStart: {lat: number, lon: number, name: string} | null = null;
      
      if (startSearchQuery.trim() && !selectedStart && startSearchQuery !== '現在地' && startSearchQuery !== '現在地を取得中...') {
        try {
          // 出発地点をジオコーディング（沖縄県内に制限）
          if (window.google && window.google.maps && window.google.maps.Geocoder) {
            const geocoder = new window.google.maps.Geocoder();
            const startGeoRes: any = await new Promise(resolve => {
              geocoder.geocode({ 
                address: `${startSearchQuery.trim()} 沖縄県`,
                componentRestrictions: { country: 'JP' },
                bounds: new window.google.maps.LatLngBounds(
                  new window.google.maps.LatLng(24.0, 122.0), // 沖縄県南西端
                  new window.google.maps.LatLng(27.0, 131.0)  // 沖縄県北東端
                )
              }, (results: any, status: any) => {
                resolve({ results, status });
              });
            });
            if (startGeoRes && startGeoRes.status === window.google.maps.GeocoderStatus.OK && startGeoRes.results && startGeoRes.results[0]) {
              const loc = startGeoRes.results[0].geometry.location;
              const lat = loc.lat();
              const lon = loc.lng();
              // 沖縄県内の座標かチェック
              if (lat >= 24.0 && lat <= 27.0 && lon >= 122.0 && lon <= 131.0) {
                geocodedStart = { lat, lon, name: startSearchQuery.trim() };
                setSelectedStart({
                  stop_id: `geocoded_start_${Date.now()}`,
                  stop_name: startSearchQuery.trim(),
                  stop_lat: lat.toString(),
                  stop_lon: lon.toString()
                });
                console.log(`出発地点をジオコーディング（沖縄県内）: ${startSearchQuery} -> (${lat}, ${lon})`);
                console.log(`selectedStartを設定しました: ${JSON.stringify({name: startSearchQuery.trim(), lat: lat.toString(), lon: lon.toString()})}`);
              } else {
                console.warn(`指定された場所「${startSearchQuery}」は沖縄県外です: (${lat}, ${lon})`);
              }
            }
          }
        } catch (e) {
          console.warn('出発地点のジオコーディングに失敗:', e);
        }
      }

      const stops = await loadStops();
      let geocodedLocation: { lat: number; lon: number } | null = null;
      
      // 座標が含まれている場合の処理（地名選択時）
      const coordMatch = searchQuery.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
      if (coordMatch) {
        geocodedLocation = {
          lat: parseFloat(coordMatch[1]),
          lon: parseFloat(coordMatch[2])
        };
      }
      
      // 目的地をstops.txtから見つける（部分一致, 大文字小文字無視）
      const q = searchQuery.replace(/\s*\([^)]*\)/, '').trim().toLowerCase(); // 座標部分を削除
      const matchedByName = stops.filter((s: any) => (s.stop_name || '').toLowerCase().includes(q));

      // 座標がない場合はジオコーディングを試行（沖縄県内に制限）
      if (!geocodedLocation && matchedByName.length === 0) {
        try {
          if (window.google && window.google.maps && window.google.maps.Geocoder) {
            const geocoder = new window.google.maps.Geocoder();
            const geoRes: any = await new Promise(resolve => {
              geocoder.geocode({ 
                address: `${q} 沖縄県`,
                componentRestrictions: { country: 'JP' },
                bounds: new window.google.maps.LatLngBounds(
                  new window.google.maps.LatLng(24.0, 122.0), // 沖縄県南西端
                  new window.google.maps.LatLng(27.0, 131.0)  // 沖縄県北東端
                )
              }, (results: any, status: any) => {
                resolve({ results, status });
              });
            });
            if (geoRes && geoRes.status === window.google.maps.GeocoderStatus.OK && geoRes.results && geoRes.results[0]) {
              const loc = geoRes.results[0].geometry.location;
              const lat = loc.lat();
              const lon = loc.lng();
              // 沖縄県内の座標かチェック
              if (lat >= 24.0 && lat <= 27.0 && lon >= 122.0 && lon <= 131.0) {
                geocodedLocation = { lat, lon };
              }
            }
          }
        } catch (e) {
        }
      }

      // Build list of destination stop_ids: by name matches and by proximity to geocoded location
      const destIdsSet = new Set<string>();
      for (const s of matchedByName) destIdsSet.add(s.stop_id);
      if (geocodedLocation) {
        const geoRadius = 200; // meters: consider stops within 200m of geocoded location as destination stops
        for (const s of stops) {
          const lat = parseFloat(s.stop_lat);
          const lon = parseFloat(s.stop_lon);
          if (isNaN(lat) || isNaN(lon)) continue;
          const d = getDistance(geocodedLocation.lat, geocodedLocation.lon, lat, lon);
          if (d <= geoRadius) destIdsSet.add(s.stop_id);
        }
      }

      const destIds = Array.from(destIdsSet);
      if (destIds.length === 0) throw new Error('目的地が見つかりません');

      // choose a representative dest for display (prefer exact name match)
      const cleanQuery = searchQuery.replace(/\s*\([^)]*\)/, '').trim(); // 座標部分を削除
      const repDest = matchedByName.length > 0 ? matchedByName[0] : (stops.find((s:any)=>s.stop_id === destIds[0]) || { stop_name: cleanQuery, stop_id: destIds[0] });
      setSelectedDest(repDest);
      setSelectedDestIds(destIds);

      // 出発地点取得（指定されていれば優先、空欄なら現在地）
      let pos: {lat: number, lon: number};
      console.log(`handleSearch: selectedStart = ${selectedStart ? JSON.stringify({name: selectedStart.stop_name, lat: selectedStart.stop_lat, lon: selectedStart.stop_lon}) : 'null'}`);
      console.log(`handleSearch: startSearchQuery = "${startSearchQuery}"`);
      console.log(`handleSearch: geocodedStart = ${geocodedStart ? JSON.stringify(geocodedStart) : 'null'}`);
      
      if (geocodedStart) {
        // ジオコーディングで取得した座標を使用（最優先）
        pos = { lat: geocodedStart.lat, lon: geocodedStart.lon };
        console.log(`ジオコーディング結果を使用: ${geocodedStart.name} (${geocodedStart.lat}, ${geocodedStart.lon})`);
      } else if (selectedStart && startSearchQuery.trim() !== '' && startSearchQuery !== '現在地を取得中...') {
        // 事前に選択された出発地点を使用
        const lat = parseFloat(selectedStart.stop_lat);
        const lon = parseFloat(selectedStart.stop_lon);
        if (!isNaN(lat) && !isNaN(lon)) {
          pos = { lat, lon };
          console.log(`出発地点として指定された場所を使用: ${selectedStart.stop_name} (${lat}, ${lon})`);
        } else {
          throw new Error('指定された出発地点の座標が不正です');
        }
      } else {
        // 出発地点が空欄または「現在地」の場合は現在地を使用
        console.log(`現在地を出発地点として使用 (理由: selectedStart=${!!selectedStart}, startSearchQuery="${startSearchQuery}", geocodedStart=${!!geocodedStart})`);
        pos = await new Promise<{lat:number, lon:number}>((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('位置情報が取得できません'));
          navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), () => reject(new Error('位置情報の取得に失敗しました')));
        });
      }

      // 距離算出
      const withDist = stops.map((s: any) => ({ ...s, distance: getDistance(pos.lat, pos.lon, parseFloat(s.stop_lat), parseFloat(s.stop_lon)) }));
      const candidates = withDist.filter((s:any) => s.distance < 3000).sort((a:any,b:any)=>a.distance-b.distance).slice(0,100);

      // stop_times をロードして trip ごとの停車順を作る
      const stopTimes = await loadStopTimes();
      const tripStops: Record<string, { stop_id: string; seq: number }[]> = {};
      for (const st of stopTimes) {
        if (!tripStops[st.trip_id]) tripStops[st.trip_id] = [];
        tripStops[st.trip_id].push({ stop_id: st.stop_id, seq: Number(st.stop_sequence) });
      }

      // 各 trip の停車順をソート
      for (const k of Object.keys(tripStops)) tripStops[k].sort((a,b)=>a.seq-b.seq);

  const destIdsArr = destIds;
      const filtered: any[] = [];
      for (const c of candidates) {
        const cid = c.stop_id;
        // tripStops を走査して cid -> destId の順に通る trip があるかチェック
        let ok = false;
        for (const [tripId, stopsArr] of Object.entries(tripStops)) {
          const idxStart = stopsArr.findIndex((x:any)=>x.stop_id === cid);
          if (idxStart === -1) continue;
          // check for any destination id that appears after start
          for (const did of destIdsArr) {
            const idxDest = stopsArr.findIndex((x:any)=>x.stop_id === did);
            if (idxDest !== -1 && idxStart < idxDest) { ok = true; break; }
          }
          if (ok) break;
        }
        if (ok) filtered.push(c);
      }

      setNearbyStops(filtered.slice(0,20));
      setShowStopCandidates(true);

      setShowBusRoutes(false);
    } catch (e:any) {
      setStopsError(e.message || '検索でエラーが発生しました');
    } finally {
      setLoadingStops(false);
    }
  };

  // 目的地予測候補クリック
  const handlePredictionClick = async (p: any) => {
    if (!p) return;
    const name = p.structured_formatting?.main_text || '';
    setSearchQuery(name);
    setShowPredictions(false);
    setPredictions([]);
    
    // 停留所の場合は直接検索、地名の場合は座標を取得してから検索
    if (p.type === 'place') {
      // Google Places APIで詳細な座標を取得
      if (placesService.current) {
        placesService.current.getDetails(
          { placeId: p.place_id, fields: ['geometry', 'name'] },
          async (place, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK && place && place.geometry) {
              const location = place.geometry.location;
              if (location) {
                // 座標を検索クエリとして保存
                setSearchQuery(`${name} (${location.lat()}, ${location.lng()})`);
                await handleSearch();
              }
            } else {
              // フォールバック：通常の検索を実行
              await handleSearch();
            }
          }
        );
      } else {
        await handleSearch();
      }
    } else {
      // 停留所の場合は直接検索
      await handleSearch();
    }
  };

  // 出発地点予測候補クリック
  const handleStartPredictionClick = async (p: any) => {
    if (!p) return;
    const name = p.structured_formatting?.main_text || '';
    setStartSearchQuery(name);
    setShowStartPredictions(false);
    setStartPredictions([]);
    
    if (p.type === 'stop') {
      // 停留所の場合は直接選択
      const stops = await loadStops();
      const selectedStop = stops.find((s: any) => s.stop_id === p.place_id);
      if (selectedStop) {
        setSelectedStart(selectedStop);
      }
    } else if (p.type === 'place') {
      // 地名の場合は座標を取得して最寄りの停留所を探す
      if (placesService.current) {
        placesService.current.getDetails(
          { placeId: p.place_id, fields: ['geometry', 'name'] },
          async (place, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK && place && place.geometry) {
              const location = place.geometry.location;
              if (location) {
                const lat = location.lat();
                const lon = location.lng();
                
                // 最寄りの停留所を検索
                const stops = await loadStops();
                const nearestStop = stops
                  .map((s: any) => ({
                    ...s,
                    distance: getDistance(lat, lon, parseFloat(s.stop_lat), parseFloat(s.stop_lon))
                  }))
                  .filter((s: any) => s.distance < 1000) // 1km以内
                  .sort((a: any, b: any) => a.distance - b.distance)[0];
                
                if (nearestStop) {
                  setSelectedStart(nearestStop);
                  setStartSearchQuery(`${name} (最寄り: ${nearestStop.stop_name})`);
                } else {
                  // 最寄りの停留所が見つからない場合は座標を保存
                  setSelectedStart({
                    stop_id: `place_${p.place_id}`,
                    stop_name: name,
                    stop_lat: lat.toString(),
                    stop_lon: lon.toString()
                  });
                }
              }
            }
          }
        );
      }
    }
  };

  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      alert('この端末では現在地を取得できません');
      return;
    }

    setShowStartPredictions(false);
    setStartPredictions([]);
  setStartSearchQuery('現在地を取得中...');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000,
        });
      });

      const { latitude, longitude } = position.coords;

      setSelectedStart({
        stop_id: 'current_location',
        stop_name: '現在地',
        stop_lat: latitude.toString(),
        stop_lon: longitude.toString(),
      });
      setStartSearchQuery('現在地');

      if (typeof window !== 'undefined' && window.google?.maps?.LatLng) {
        const latLng = new window.google.maps.LatLng(latitude, longitude);
        currentLocationRef.current = latLng;
        if (mapInstance.current) {
          mapInstance.current.setCenter(latLng);
          mapInstance.current.setZoom(15);
          if (currentLocationMarkerRef.current) {
            currentLocationMarkerRef.current.setPosition(latLng);
          } else {
            currentLocationMarkerRef.current = new window.google.maps.Marker({
              position: latLng,
              map: mapInstance.current,
              icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
              title: "現在地",
            });
          }
        }
      }
    } catch (error: any) {

      alert('現在地を取得できませんでした。位置情報の許可をご確認ください。');
      setStartSearchQuery('');
    }
  };

  // start 停留所を選択したときに、その停留所から selectedDest まで行くルート（停車順）と該当する便を算出して表示する
  const handleSelectStartStop = async (startStop: any) => {
    // 選択された出発地点を保存
    setSelectedStart(startStop);
    setRouteError(null);
    setLoadingRoute(true);
    // 古いモーダル状態をクリア

    setShowBusRoutes(false);

    try {
      if (!selectedDest) throw new Error('目的地が選択されていません');

      const stops = await loadStops();
      const stopTimes = await loadStopTimes();
      const trips = await loadTrips();
      const routes = await loadRoutes();
      
      // trip_id -> ordered stop sequence
      const tripStops: Record<string, { stop_id: string; seq: number; arrival_time?: string; departure_time?: string }[]> = {};
      for (const st of stopTimes) {
        if (!tripStops[st.trip_id]) tripStops[st.trip_id] = [];
        tripStops[st.trip_id].push({ stop_id: st.stop_id, seq: Number(st.stop_sequence), arrival_time: st.arrival_time, departure_time: st.departure_time });
      }
      for (const k of Object.keys(tripStops)) tripStops[k].sort((a,b)=>a.seq-b.seq);

      const destIds = selectedDestIds.length > 0 ? selectedDestIds : [selectedDest.stop_id];
      const startId = startStop.stop_id;
      
      const matchingTrips: { tripId: string; stopsSeq: any[]; routeId?: string; routeInfo?: any; startDeparture?: string }[] = [];

      for (const trip of Object.keys(tripStops)) {
        const seq = tripStops[trip];
        const idxStart = seq.findIndex(s => s.stop_id === startId);
        // 複数の目的地候補をチェック
        const idxDest = seq.findIndex(s => destIds.includes(s.stop_id));
        if (idxStart !== -1 && idxDest !== -1 && idxStart < idxDest) {
          // 該当する停車順を切り出す
          const slice = seq.slice(idxStart, idxDest + 1);
          const tripDef = trips.find((t: any) => t.trip_id === trip);
          const routeDef = tripDef ? routes.find((r: any) => r.route_id === tripDef.route_id) : null;
          const startDeparture = slice[0]?.departure_time || slice[0]?.arrival_time || undefined;
          matchingTrips.push({ tripId: trip, stopsSeq: slice, routeId: tripDef?.route_id, routeInfo: routeDef, startDeparture });
        }
      }

      if (matchingTrips.length === 0) {
        throw new Error('該当する便が見つかりませんでした');
      }
      
      // routeBuses はマッチした便一覧（ID, route 名, 出発時刻、到着時刻）
      const buses = matchingTrips.map(m => {
        const lastStop = m.stopsSeq[m.stopsSeq.length - 1];
        const busInfo = {
          trip_id: m.tripId,
          route_id: m.routeId,
          route_short_name: m.routeInfo?.route_short_name,
          route_long_name: m.routeInfo?.route_long_name,
          departure: m.startDeparture,
          arrival: lastStop?.arrival_time,
          stops_count: m.stopsSeq.length
        };

        return busInfo;
      });

      // 出発時刻でソート
      buses.sort((a, b) => {
        if (!a.departure || !b.departure) return 0;
        return a.departure.localeCompare(b.departure);
      });

      // 出発時刻が現在時刻から見て過去2時間より古いものは表示しない
      const filteredBuses = buses.filter(b => {
        if (!b.departure) return true;
        return isWithinPastHours(b.departure, 2);
      });

      // キャッシュとしてこの時点で tripStops を保存しておく（便選択時に再利用）
      tripStopsRef.current = tripStops;

    setRouteStops([]);
    setRouteBuses(filteredBuses);
    setSelectedTripId(null);
    setIsSheetMinimized(false);
    setSheetTranslateY(0);
    setShowStopCandidates(false);

      setShowBusRoutes(true);
      
    } catch (e: any) {

      setRouteError(e.message || 'ルート取得でエラーが発生しました');
    } finally {

      setLoadingRoute(false);
    }
  };

  // ルートを計算して表示（複数の交通手段を試行）
  const calculateAndDisplayRoute = (destination: google.maps.LatLng, destinationName: string) => {
    if (!directionsService.current || !directionsRenderer.current || !currentLocationRef.current) {

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

          directionsRenderer.current!.setDirections(result);
          
          // ルート全体が見えるようにマップを調整
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend(currentLocationRef.current!);
          bounds.extend(destination);
          mapInstance.current!.fitBounds(bounds);
        } else {

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

  // 検索ボタンクリック時の処理は GTFS ベースの handleSearch を使う

  // ルートをクリア
  const clearRoute = () => {
    // リアルタイム追跡をクリア
  stopLocationSharing(getActiveTripId() || undefined);
    setBusLocation(null);
    setBusPassedStops([]);
    setEstimatedArrivalTimes({});
    setRidingTripId(null);
    setIsSheetMinimized(false);
    setSheetTranslateY(0);
    if (busMarkerRef.current) {
      busMarkerRef.current.setMap(null);
      busMarkerRef.current = null;
    }
    
    // Google Directionsのルートをクリア
    if (directionsRenderer.current) {
      directionsRenderer.current.setDirections({ routes: [] } as any);
    }
    
    // 検索バーをクリア
    setSearchQuery("");
    setPredictions([]);
    setShowPredictions(false);
    setStartSearchQuery("");
    setStartPredictions([]);
    setShowStartPredictions(false);
    
    // 検索結果をクリア
    setNearbyStops([]);
    setRouteStops([]);
    setRouteBuses([]);
    setSelectedDest(null);
    setSelectedDestIds([]);
    setSelectedTripId(null);
    setSelectedStart(null);
    setShowStopCandidates(false);

    setShowBusRoutes(false);
    
    // 地図上のマーカーをクリア
    routeMarkersRef.current.forEach(m => m.setMap(null));
    routeMarkersRef.current = [];
    otherRidersMarkersRef.current.forEach(m => m.setMap(null));
    otherRidersMarkersRef.current = [];
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }
    
    // マップを現在地に戻す（現在地マーカーは残す）
    if (mapInstance.current && currentLocationRef.current) {
      mapInstance.current.setCenter(currentLocationRef.current);
      mapInstance.current.setZoom(14);
    }
  };

  useEffect(() => {
    if (mapLoaded) {
      // Google Maps APIの完全な読み込みを待つ
      const checkGoogleMapsReady = () => {
        if (window.google && window.google.maps && window.google.maps.Map) {
          initializeMap();
        } else {
          // 100ms後に再試行
          setTimeout(checkGoogleMapsReady, 100);
        }
      };
      checkGoogleMapsReady();
    }
  }, [mapLoaded]);

  // デバッグ用: stateの変更を追跡
  useEffect(() => {

  }, [showBusRoutes]);

  useEffect(() => {

  }, [routeBuses]);

  useEffect(() => {

  }, [loadingRoute]);

  useEffect(() => {

  }, [ridersLocations]);

  // isLocationSharing状態の変化を監視
  useEffect(() => {

  }, [isLocationSharing]);

  useEffect(() => {
    if (!mapLoaded || typeof window === 'undefined' || !navigator.geolocation) {
      return;
    }

    const intervalId = setInterval(() => {
      const now = Date.now();
      if (lastPositionTimestampRef.current && now - lastPositionTimestampRef.current < 45000) {

        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!window.google?.maps?.LatLng) return;
          const { latitude, longitude } = position.coords;
          const latLng = new window.google.maps.LatLng(latitude, longitude);
          currentLocationRef.current = latLng;
          if (currentLocationMarkerRef.current) {
            currentLocationMarkerRef.current.setPosition(latLng);
          } else if (mapInstance.current) {
            currentLocationMarkerRef.current = new window.google.maps.Marker({
              position: latLng,
              map: mapInstance.current,
              icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
              title: "現在地",
            });
          }
          lastPositionTimestampRef.current = Date.now();
        },
        (error) => {

          const timeoutCode = (error as GeolocationPositionError).TIMEOUT ?? 3;
          if (error.code === timeoutCode && currentLocationRef.current) {
            lastPositionTimestampRef.current = Date.now();
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 15000,
        }
      );
    }, 60000);

    return () => {

      clearInterval(intervalId);
    };
  }, [mapLoaded]);

  // ridersLocationsの変更を監視してマーカーを更新
  useEffect(() => {
    if (mapLoaded && mapInstance.current) {

      updateOtherRidersMarkers();
      const activeTripId = getActiveTripId();
      if (activeTripId) {
        updateBusLocation(activeTripId);
      }
    } else {

    }
  }, [ridersLocations, selectedTripId, ridingTripId, mapLoaded]);

  // コンポーネントのクリーンアップ
  useEffect(() => {
    // ページアンロード時の処理（アプリが閉じられた時）
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isLocationSharing) {
        // 位置情報共有を停止
        const activeTripId = getActiveTripId();
        stopLocationSharing(activeTripId || undefined);
        
        // ブラウザによってはここで同期的にFirestoreからデータを削除
        if (currentUser?.uid) {
          // navigator.sendBeaconを使用して確実にデータを送信
          const deleteUrl = `https://firestore.googleapis.com/v1/projects/busnaviapp-1ceba/databases/(default)/documents/busRiderLocations`;
          // 実際の削除は難しいので、lastActiveを古い時刻に更新
          const updateData = {
            lastActive: new Date(Date.now() - 300000).toISOString() // 5分前に設定
          };
          navigator.sendBeacon(deleteUrl, JSON.stringify(updateData));
        }
      }
    };

    // ページ非表示時の処理（実際にタブを閉じた時のみ）
    const handleVisibilityChange = () => {
      if (document.hidden && isLocationSharing) {

        // スマホの場合、アプリ切り替えでもhiddenになるため、
        // 即座に停止せず、一定時間後にページが表示されない場合のみ停止
        const backgroundTimeout = setTimeout(() => {
          if (document.hidden && isLocationSharing) {

            const activeTripId = getActiveTripId();
            stopLocationSharing(activeTripId || undefined);
          }
        }, 300000); // 5分後に停止
        
        // ページが再表示された時にタイマーをクリア
        const handleVisibilityShow = () => {
          if (!document.hidden) {

            clearTimeout(backgroundTimeout);
            document.removeEventListener('visibilitychange', handleVisibilityShow);
          }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityShow);
      } else if (!document.hidden && isLocationSharing) {

      }
    };

    // イベントリスナーを追加
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // Firestoreリスナーのクリーンアップ
      if (unsubscribeRiderListener.current) {
        unsubscribeRiderListener.current();
      }
      if (unsubscribeStopPassageListener.current) {
        unsubscribeStopPassageListener.current();
      }
      
      // マーカーのクリーンアップ
      otherRidersMarkersRef.current.forEach(marker => marker.setMap(null));
      otherRidersMarkersRef.current = [];

      // イベントリスナーを削除
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLocationSharing, currentUser]);

  return (
    <>
      {/* CSS Animations */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      
      {/* Google Maps API Script */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=geometry,places&loading=async`}
        onLoad={() => {
          // Google Maps API読み込み完了後の処理
          console.log('Google Maps API loaded');
          // 少し遅延してからmapLoadedを設定（完全な初期化を待つ）
          setTimeout(() => setMapLoaded(true), 100);
        }}
        strategy="lazyOnload"
      />
      
      <div className={styles.container}>
        {/* Header / SearchBar を分離したコンポーネントで表示 */}
        {/* Header */}
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore */}
        <Header
          menuOpen={menuOpen}
          toggleMenu={() => setMenuOpen(!menuOpen)}
          onGoProfile={() => router.push('/profile')}
        />

        {/* SearchBar */}
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore */}
        <SearchBar
          startSearchQuery={startSearchQuery}
          searchQuery={searchQuery}
          handleStartSearchChange={handleStartSearchChange}
          handleSearchChange={handleSearchChange}
          handleUseCurrentLocation={handleUseCurrentLocation}
          handleSearch={handleSearch}
          clearRoute={clearRoute}
          showStartPredictions={showStartPredictions}
          startPredictions={startPredictions}
          showPredictions={showPredictions}
          predictions={predictions}
          handleStartPredictionClick={handleStartPredictionClick}
          handlePredictionClick={handlePredictionClick}
          setShowStartPredictions={setShowStartPredictions}
          setShowPredictions={setShowPredictions}
        />

        {/* 出発地点候補選択モーダル（コンポーネント化） */}
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore */}
        <StopCandidatesModal
          visible={showStopCandidates}
          setVisible={setShowStopCandidates}
          loadingStops={loadingStops}
          stopsError={stopsError}
          nearbyStops={nearbyStops}
          selectedDest={selectedDest}
          handleSelectStartStop={handleSelectStartStop}
        />

        {/* バス便選択モーダル（コンポーネント化） */}
        <BusRoutesModal
          visible={showBusRoutes}
          onClose={() => setShowBusRoutes(false)}
          selectedStart={selectedStart}
          selectedDest={selectedDest}
          loadingRoute={loadingRoute}
          routeError={routeError}
          routeBuses={routeBuses}
          selectedTripId={selectedTripId}
          handleSelectBus={handleSelectBus}
        />

        {/* 選択された便の詳細シート（コンポーネント化） */}
        <RouteDetailSheet
          selectedTripId={selectedTripId}
          routeStops={routeStops}
          isMobileViewport={isMobileViewport}
          sheetTouchStartYRef={sheetTouchStartY}
          sheetDraggingRef={sheetDraggingRef}
          sheetTranslateYRef={sheetTranslateYRef}
          sheetTranslateY={sheetTranslateY}
          setSheetTranslateY={setSheetTranslateY}
          isSheetMinimized={isSheetMinimized}
          setIsSheetMinimized={setIsSheetMinimized}
          routeBuses={routeBuses}
          tripDelays={tripDelays}
          ridersLocations={ridersLocations}
          isLocationSharing={isLocationSharing}
          currentUser={currentUser}
          updateOtherRidersMarkers={updateOtherRidersMarkers}
          busLocation={busLocation}
          busPassedStops={busPassedStops}
          estimatedArrivalTimes={estimatedArrivalTimes}
          ridingTripId={ridingTripId}
          setRidingTripId={setRidingTripId}
          getActiveTripId={getActiveTripId}
          stopLocationSharing={stopLocationSharing}
          startLocationSharing={startLocationSharing}
          mapInstance={mapInstance}
          currentLocationRef={currentLocationRef}
          setSelectedTripId={setSelectedTripId}
          setRouteStops={setRouteStops}
          routeMarkersRef={routeMarkersRef}
          routePolylineRef={routePolylineRef}
          getDistance={getDistance}
          isWithinPastHours={isWithinPastHours}
        />

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