// バス関連のロジック
import { useState, useEffect, useRef } from 'react';
import { BusStop, TripInfo, PassedStopRecord, DelayInfo } from './types';
import { removeDuplicateStops, getDistance, isTimePassed } from './utils';
import { DISTANCE_THRESHOLDS } from './constants';

/**
 * バス路線情報管理
 */
export const useBusRoute = () => {
  const [routeStops, setRouteStops] = useState<BusStop[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [ridingTripId, setRidingTripId] = useState<string>('');
  const [tripDelays, setTripDelays] = useState<Record<string, DelayInfo | null>>({});

  const getActiveTripId = () => ridingTripId || selectedTripId;

  return {
    routeStops,
    setRouteStops,
    selectedTripId,
    setSelectedTripId,
    ridingTripId,
    setRidingTripId,
    tripDelays,
    setTripDelays,
    getActiveTripId
  };
};

/**
 * バス停通過記録管理
 */
export const useBusStopPassage = () => {
  const [busPassedStops, setBusPassedStops] = useState<PassedStopRecord[]>([]);

  const addPassedStop = (stop: PassedStopRecord) => {
    setBusPassedStops(prev => {
      const exists = prev.find(existing => existing.stopId === stop.stopId);
      if (exists) {
        // 既存の記録を更新
        return prev.map(existing => 
          existing.stopId === stop.stopId ? stop : existing
        );
      } else {
        // 新しい記録を追加
        return [...prev, stop].sort((a, b) => a.passTime.getTime() - b.passTime.getTime());
      }
    });
  };

  const removePassedStop = (stopId: string) => {
    setBusPassedStops(prev => prev.filter(stop => stop.stopId !== stopId));
  };

  return {
    busPassedStops,
    setBusPassedStops,
    addPassedStop,
    removePassedStop
  };
};

/**
 * バス路線データ処理
 */
export const processBusRoute = (tripStops: any[], stops: any[], startIdx: number, endIdx: number) => {
  // 表示用：出発地点の前のバス停を3つ表示するために、startIdxを調整
  const desiredStartIdx = startIdx - 3;
  const adjustedStartIdx = Math.max(0, desiredStartIdx);
  const actualPreviousCount = startIdx - adjustedStartIdx;

  // 表示用の限定範囲
  const displaySlice = tripStops.slice(adjustedStartIdx, endIdx + 1);
  
  // 位置情報共有用：バス路線全体を対象にする
  const fullRouteSlice = tripStops.slice(0, tripStops.length);
  
  // 重複するstop_idを除去（表示用）
  const uniqueDisplaySlice = removeDuplicateStops(displaySlice);
  
  // 重複するstop_idを除去（共有用・全路線）
  const uniqueFullRouteSlice = removeDuplicateStops(fullRouteSlice);
  
  console.log(`Debug: startIdx=${startIdx}, desiredStartIdx=${desiredStartIdx}, adjustedStartIdx=${adjustedStartIdx}, actualPreviousCount=${actualPreviousCount}`);
  console.log(`displaySlice.length=${displaySlice.length}, uniqueDisplaySlice.length=${uniqueDisplaySlice.length}`);
  console.log(`fullRouteSlice.length=${fullRouteSlice.length}, uniqueFullRouteSlice.length=${uniqueFullRouteSlice.length}`);
  
  // 表示用のバス停データ
  const routeStopsFull = uniqueDisplaySlice.map((s: any, sliceIndex: number) => {
    const stopDef = stops.find((st: any) => st.stop_id === s.stop_id) || { 
      stop_name: s.stop_id, 
      stop_lat: 0, 
      stop_lon: 0 
    };
    const isBeforeStart = sliceIndex < actualPreviousCount;
    
    console.log(`Display Stop ${sliceIndex}: ${s.stop_id} (${stopDef.stop_name}), isBeforeStart: ${isBeforeStart}`);
    
    return { 
      ...stopDef, 
      seq: s.seq, 
      arrival_time: s.arrival_time, 
      departure_time: s.departure_time,
      isBeforeStart: isBeforeStart
    };
  });
  
  // 位置情報共有用のバス停データ
  const fullRouteStops = uniqueFullRouteSlice.map((s: any) => {
    const stopDef = stops.find((st: any) => st.stop_id === s.stop_id) || { 
      stop_name: s.stop_id, 
      stop_lat: 0, 
      stop_lon: 0 
    };
    return { 
      ...stopDef, 
      seq: s.seq, 
      arrival_time: s.arrival_time, 
      departure_time: s.departure_time,
      isBeforeStart: false
    };
  });

  return {
    routeStopsFull,
    fullRouteStops,
    actualPreviousCount
  };
};

/**
 * バス停順序情報取得
 */
export const getRouteSequenceInfo = (routeStops: BusStop[]) => {
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

/**
 * 通過済みバス停の推論
 */
export const inferPassedStopsForRoute = (passages: PassedStopRecord[], routeStops: BusStop[]): PassedStopRecord[] => {
  if (passages.length === 0) return [];

  const sequenceInfo = getRouteSequenceInfo(routeStops);
  const seqMap = new Map(sequenceInfo.map(info => [info.stopId, info]));

  // 最新の通過記録から基準点を決定
  let highestSeq = -1;
  passages.forEach(passage => {
    const info = seqMap.get(passage.stopId);
    if (info && typeof info.seq === 'number' && info.seq > highestSeq) {
      highestSeq = info.seq;
    }
  });

  if (highestSeq === -1) return [];

  // 基準記録より前の全てのバス停を推論で追加
  const referenceRecord = passages.reduce<PassedStopRecord | null>((current, candidate) => {
    const candidateInfo = seqMap.get(candidate.stopId);
    if (!candidateInfo || candidateInfo.seq !== highestSeq) return current;
    
    if (!current || candidate.passTime > current.passTime) {
      return candidate;
    }
    return current;
  }, null);

  if (!referenceRecord) return [];

  const inferredPassages: PassedStopRecord[] = [];
  sequenceInfo.forEach(info => {
    if (info.seq < highestSeq && !passages.some(p => p.stopId === info.stopId)) {
      inferredPassages.push({
        stopId: info.stopId,
        stopName: info.stopName,
        passTime: new Date(referenceRecord.passTime.getTime() - (highestSeq - info.seq) * 60000),
        delay: 0,
        inferred: true,
        username: referenceRecord.username,
        userId: referenceRecord.userId
      });
    }
  });

  return [...passages, ...inferredPassages];
};

/**
 * 位置から通過済みバス停を推論
 */
export const inferPreviousPassedStops = (
  currentPos: google.maps.LatLng, 
  tripId: string, 
  routeStops: BusStop[]
): PassedStopRecord[] => {
  console.log(`inferPreviousPassedStops: 使用するバス停リスト数 = ${routeStops.length} (表示範囲のみ)`);
  
  if (routeStops.length === 0) return [];
  
  // 現在位置から最も近いバス停を特定
  let nearestStopIndex = -1;
  let nearestDistance = Infinity;
  
  routeStops.forEach((stop: BusStop, index: number) => {
    const stopLat = parseFloat(String(stop.stop_lat));
    const stopLon = parseFloat(String(stop.stop_lon));
    
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
    return [];
  }
  
  const nearestStop = routeStops[nearestStopIndex];
  
  // 乗車判定の条件：最寄りバス停から500m以内
  if (nearestDistance > DISTANCE_THRESHOLDS.SHARING_LIMIT) {
    console.log(`乗車判定失敗: 最寄りバス停 ${nearestStop.stop_name} から ${nearestDistance.toFixed(0)}m離れています（${DISTANCE_THRESHOLDS.SHARING_LIMIT}m以上）`);
    return [];
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
  
  return newPassedStops;
};
