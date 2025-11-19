// hooks/useBusSearch.ts - バス検索機能
import { useState, useCallback } from 'react';
import { getDistance } from '../utils';

export const useBusSearch = () => {
  const [nearbyStops, setNearbyStops] = useState<any[]>([]);
  const [stopsError, setStopsError] = useState<string | null>(null);
  const [loadingStops, setLoadingStops] = useState(false);
  const [showStopCandidates, setShowStopCandidates] = useState(false);
  const [showBusRoutes, setShowBusRoutes] = useState(false);

  // データローダー
  const loadStops = async () => {
    const res = await fetch('/okibus/stops.txt');
    const text = await res.text();
    return text.trim().split('\n').slice(1).map(line => {
      const [stopId, stopCode, stopName, stopDesc, stopLat, stopLon] = line.split(',');
      return { stop_id: stopId, stop_name: stopName, stop_lat: parseFloat(stopLat), stop_lon: parseFloat(stopLon) };
    });
  };

  const loadStopTimes = async () => {
    const res = await fetch('/okibus/stop_times.txt');
    const text = await res.text();
    return text.trim().split('\n').slice(1).map(line => {
      const [tripId, arrivalTime, departureTime, stopId, stopSequence] = line.split(',');
      return { trip_id: tripId, arrival_time: arrivalTime, departure_time: departureTime, stop_id: stopId, stop_sequence: parseInt(stopSequence) };
    });
  };

  // メイン検索機能
  const handleSearch = useCallback(async (
    searchQuery: string,
    selectedStart: any | null,
    currentLocation: google.maps.LatLng | null,
    geocodingService?: google.maps.Geocoder
  ) => {
    setStopsError(null);
    setNearbyStops([]);
    setLoadingStops(true);
    
    try {
      if (!searchQuery.trim()) throw new Error('目的地名を入力してください');

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

      // 座標がない場合はジオコーディングを試行
      if (!geocodedLocation && matchedByName.length === 0 && geocodingService) {
        try {
          const geoRes: any = await new Promise((resolve) => {
            geocodingService.geocode({ address: q }, (results: any, status: any) => {
              resolve({ results, status });
            });
          });
          if (geoRes && geoRes.status === window.google.maps.GeocoderStatus.OK && geoRes.results && geoRes.results[0]) {
            const loc = geoRes.results[0].geometry.location;
            geocodedLocation = { lat: loc.lat(), lon: loc.lng() };
          }
        } catch (e) {
          // ジオコーディングエラーは無視
        }
      }

      // Build list of destination stop_ids: by name matches and by proximity to geocoded location
      const destIdsSet = new Set<string>();
      for (const s of matchedByName) destIdsSet.add(s.stop_id);
      if (geocodedLocation) {
        const geoRadius = 200; // meters: consider stops within 200m of geocoded location as destination stops
        for (const s of stops) {
          const lat = parseFloat(String(s.stop_lat));
          const lon = parseFloat(String(s.stop_lon));
          if (isNaN(lat) || isNaN(lon)) continue;
          const d = getDistance(geocodedLocation.lat, geocodedLocation.lon, lat, lon);
          if (d <= geoRadius) destIdsSet.add(s.stop_id);
        }
      }

      const destIds = Array.from(destIdsSet);
      if (destIds.length === 0) throw new Error('目的地が見つかりません');

      // 出発地点取得（選択されていれば優先、なければ現在地）
      let pos: {lat: number, lon: number};
      if (selectedStart && selectedStart.type === 'stop') {
        pos = { lat: parseFloat(selectedStart.stop_lat), lon: parseFloat(selectedStart.stop_lon) };
      } else if (selectedStart && selectedStart.type === 'current') {
        pos = { lat: selectedStart.lat, lon: selectedStart.lng };
      } else if (currentLocation) {
        pos = { lat: currentLocation.lat(), lon: currentLocation.lng() };
      } else {
        // 現在地を取得
        pos = await new Promise<{lat:number, lon:number}>((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('位置情報が取得できません'));
          navigator.geolocation.getCurrentPosition(
            p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), 
            () => reject(new Error('位置情報の取得に失敗しました')),
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 60000
            }
          );
        });
      }

      // 距離算出 - 出発地点から近い順にソート
      const withDist = stops.map((s: any) => ({ 
        ...s, 
        distance: getDistance(pos.lat, pos.lon, parseFloat(s.stop_lat), parseFloat(s.stop_lon)) 
      }));
      const candidates = withDist
        .filter((s:any) => s.distance < 3000) // 3km以内
        .sort((a:any,b:any) => a.distance - b.distance) // 距離順でソート
        .slice(0, 100); // 上位100件

      // stop_times をロードして trip ごとの停車順を作る
      const stopTimes = await loadStopTimes();
      const tripStops: Record<string, { stop_id: string; seq: number }[]> = {};
      for (const st of stopTimes) {
        if (!tripStops[st.trip_id]) tripStops[st.trip_id] = [];
        tripStops[st.trip_id].push({ stop_id: st.stop_id, seq: Number(st.stop_sequence) });
      }
      for (const k of Object.keys(tripStops)) {
        tripStops[k].sort((a,b) => a.seq - b.seq);
      }

      const destIdsArr = destIds;
      const filtered: any[] = [];
      
      // 各候補停留所について、その停留所から目的地に行くバス路線があるかチェック
      for (const c of candidates) {
        const cid = c.stop_id;
        let ok = false;
        for (const [tripId, stopsArr] of Object.entries(tripStops)) {
          const idxStart = stopsArr.findIndex((x:any) => x.stop_id === cid);
          if (idxStart === -1) continue;
          // check for any destination id that appears after start
          for (const did of destIdsArr) {
            const idxDest = stopsArr.findIndex((x:any) => x.stop_id === did);
            if (idxDest !== -1 && idxStart < idxDest) { 
              ok = true; 
              break; 
            }
          }
          if (ok) break;
        }
        if (ok) filtered.push(c);
      }

      setNearbyStops(filtered.slice(0, 20));
      setShowStopCandidates(true);
      setShowBusRoutes(false);
      
    } catch (e: any) {
      setStopsError(e.message || '検索でエラーが発生しました');
    } finally {
      setLoadingStops(false);
    }
  }, []);

  return {
    nearbyStops,
    stopsError,
    loadingStops,
    showStopCandidates,
    showBusRoutes,
    setShowStopCandidates,
    setShowBusRoutes,
    handleSearch
  };
};
