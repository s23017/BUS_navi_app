"use client";
import { useState, useEffect, useRef } from "react";
import { Menu, X, MapPin } from "lucide-react";
import Script from "next/script";
import styles from "./search.module.css";

// Google Maps API の型定義を追加
declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}

export default function BusSearch() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const directionsService = useRef<google.maps.DirectionsService | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const currentLocationRef = useRef<google.maps.LatLng | null>(null);
  const routeMarkersRef = useRef<google.maps.Marker[]>([]);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const tripStopsRef = useRef<Record<string, any[]> | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Google Maps APIが読み込まれた後にマップを初期化
  const initializeMap = () => {
    if (!mapRef.current || !window.google) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 26.2125, lng: 127.6811 }, // 那覇市
      zoom: 14,
    });
    mapInstance.current = map;

    // Places APIサービスを初期化
    autocompleteService.current = new window.google.maps.places.AutocompleteService();
    placesService.current = new window.google.maps.places.PlacesService(map);
    
    // Directions APIサービスを初期化
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

    // 現在地をマップに表示
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const current = new window.google.maps.LatLng(latitude, longitude);
          currentLocationRef.current = current; // 現在地を保存
          
          // 現在地マーカーを表示（ルート表示時は自動的に隠される）
          new window.google.maps.Marker({
            position: current,
            map,
            icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            title: "現在地",
          });
          map.setCenter(current);
        },
        (err) => console.error(err)
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
      // find the first index of any dest within the trip
      let startIdx = 0;
      let endIdx = tripStops.length - 1;
      // If user previously selected a start stop, try to limit from that start
      // Find start stop index by matching stop_id from nearbyStops? We'll try selectedTripId context: assume tripStops contain the start stop earlier
      // For simplicity, show full sequence but if selectedDestIds present, cut until the first dest encountered
      if (destIdsArr.length > 0) {
        const destIdx = tripStops.findIndex(s => destIdsArr.includes(s.stop_id));
        if (destIdx !== -1) endIdx = destIdx;
      }

      const slice = tripStops.slice(startIdx, endIdx + 1);
      const routeStopsFull = slice.map((s: any) => {
        const stopDef = stops.find((st: any) => st.stop_id === s.stop_id) || { stop_name: s.stop_id, stop_lat: 0, stop_lon: 0 };
        return { ...stopDef, seq: s.seq, arrival_time: s.arrival_time, departure_time: s.departure_time };
      });

      setRouteStops(routeStopsFull);
      setSelectedTripId(tripId);

      // 地図に描画（マーカーとポリライン）
      if (mapInstance.current && window.google) {
        routeMarkersRef.current.forEach(m => m.setMap(null));
        routeMarkersRef.current = [];
        if (routePolylineRef.current) {
          routePolylineRef.current.setMap(null);
          routePolylineRef.current = null;
        }

        const path: google.maps.LatLngLiteral[] = [];
        for (const rs of routeStopsFull) {
          const lat = parseFloat(rs.stop_lat);
          const lon = parseFloat(rs.stop_lon);
          if (isNaN(lat) || isNaN(lon)) continue;
          const pos = { lat, lng: lon };
          path.push(pos);
          const marker = new window.google.maps.Marker({ position: pos, map: mapInstance.current!, title: rs.stop_name });
          routeMarkersRef.current.push(marker);
        }

        if (path.length > 0) {
          const poly = new window.google.maps.Polyline({ path, strokeColor: '#FF5722', strokeWeight: 4, map: mapInstance.current! });
          routePolylineRef.current = poly;
          const bounds = new window.google.maps.LatLngBounds();
          if (currentLocationRef.current) bounds.extend(currentLocationRef.current);
          path.forEach(p => bounds.extend(new window.google.maps.LatLng(p.lat, p.lng)));
          mapInstance.current!.fitBounds(bounds);
        }
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

  // キャッシュ用refs（GTFS読み込みを1回にする）
  const stopsCache = useRef<any[] | null>(null);
  const stopTimesCache = useRef<any[] | null>(null);
  const tripsCache = useRef<any[] | null>(null);
  const routesCache = useRef<any[] | null>(null);
  const [nearbyStops, setNearbyStops] = useState<any[]>([]);
  const [routeStops, setRouteStops] = useState<any[]>([]);
  const [routeBuses, setRouteBuses] = useState<any[]>([]);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

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

  function parseCsv(txt: string) {
    const lines = txt.trim().split(/\r?\n/);
    const header = lines[0].split(",");
    return lines.slice(1).map(line => {
      const cols = line.split(",");
      const obj: any = {};
      header.forEach((h, i) => (obj[h] = cols[i]));
      return obj;
    });
  }

  async function loadStops() {
    if (stopsCache.current) return stopsCache.current;
    const res = await fetch('/okibus/stops.txt');
    const txt = await res.text();
    const parsed = parseCsv(txt);
    stopsCache.current = parsed;
    return parsed;
  }

  async function loadStopTimes() {
    if (stopTimesCache.current) return stopTimesCache.current;
    const res = await fetch('/okibus/stop_times.txt');
    const txt = await res.text();
    const parsed = parseCsv(txt);
    stopTimesCache.current = parsed;
    return parsed;
  }

  async function loadTrips() {
    if (tripsCache.current) return tripsCache.current;
    const res = await fetch('/okibus/trips.txt');
    const txt = await res.text();
    const parsed = parseCsv(txt);
    tripsCache.current = parsed;
    return parsed;
  }

  async function loadRoutes() {
    if (routesCache.current) return routesCache.current;
    const res = await fetch('/okibus/routes.txt');
    const txt = await res.text();
    const parsed = parseCsv(txt);
    routesCache.current = parsed;
    return parsed;
  }

  // 検索入力はローカルGTFSだけで処理（Google Placesを使わない）
  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    setShowPredictions(false);
    setPredictions([]);
    try {
      const q = value.trim().toLowerCase();
      if (!q) return;
      const stops = await loadStops();
      // 現在地が取れていれば距離でソート
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

      const matches = stops
        .filter((s: any) => (s.stop_name || '').toLowerCase().includes(q))
        .map((s: any) => {
          let secondary = '';
          if (userLat !== null && userLon !== null) {
            const d = Math.round(getDistance(userLat, userLon, parseFloat(s.stop_lat), parseFloat(s.stop_lon)));
            secondary = `${d} m`;
          }
          return { place_id: s.stop_id, structured_formatting: { main_text: s.stop_name, secondary_text: secondary } };
        })
        .sort((a: any, b: any) => {
          // if both have secondary (distance), sort by it
          const ad = a.structured_formatting.secondary_text ? parseInt(a.structured_formatting.secondary_text) : Infinity;
          const bd = b.structured_formatting.secondary_text ? parseInt(b.structured_formatting.secondary_text) : Infinity;
          return ad - bd;
        })
        .slice(0, 8);

      if (matches.length > 0) {
        setPredictions(matches);
        setShowPredictions(true);
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

      const stops = await loadStops();
      // 目的地をstops.txtから見つける（部分一致, 大文字小文字無視）
      const q = searchQuery.trim().toLowerCase();
      const matchedByName = stops.filter((s: any) => (s.stop_name || '').toLowerCase().includes(q));

      // Try geocoding only if no name matches were found (reduces unnecessary Geocoder calls)
      let geocodedLocation: { lat: number; lon: number } | null = null;
      if (matchedByName.length === 0) {
        try {
          if (window.google && window.google.maps && window.google.maps.Geocoder) {
            const geocoder = new window.google.maps.Geocoder();
            const geoRes: any = await new Promise(resolve => {
              geocoder.geocode({ address: searchQuery }, (results: any, status: any) => {
                resolve({ results, status });
              });
            });
            if (geoRes && geoRes.status === window.google.maps.GeocoderStatus.OK && geoRes.results && geoRes.results[0]) {
              const loc = geoRes.results[0].geometry.location;
              geocodedLocation = { lat: loc.lat(), lon: loc.lng() };
            }
          }
        } catch (e) {
          // ignore geocode errors (this avoids breaking search flow if key is restricted)
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
      const repDest = matchedByName.length > 0 ? matchedByName[0] : (stops.find((s:any)=>s.stop_id === destIds[0]) || { stop_name: searchQuery, stop_id: destIds[0] });
      setSelectedDest(repDest);
      setSelectedDestIds(destIds);

      // 現在地取得
      const pos = await new Promise<{lat:number, lon:number}>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('位置情報が取得できません'));
        navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), () => reject(new Error('位置情報の取得に失敗しました')));
      });

      // 距離算出
      const withDist = stops.map((s: any) => ({ ...s, distance: getDistance(pos.lat, pos.lon, parseFloat(s.stop_lat), parseFloat(s.stop_lon)) }));
      const candidates = withDist.filter((s:any) => s.distance < 1000).sort((a:any,b:any)=>a.distance-b.distance).slice(0,50);

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

  setNearbyStops(filtered.slice(0,10));
    } catch (e:any) {
      setStopsError(e.message || '検索でエラーが発生しました');
    } finally {
      setLoadingStops(false);
    }
  };

  // 予測候補クリック: 停留所予測を選んだら検索を実行
  const handlePredictionClick = async (p: any) => {
    if (!p) return;
    const name = p.structured_formatting?.main_text || '';
    setSearchQuery(name);
    setShowPredictions(false);
    setPredictions([]);
    // 目的地として検索を実行
    await handleSearch();
  };

  // start 停留所を選択したときに、その停留所から selectedDest まで行くルート（停車順）と該当する便を算出して表示する
  const handleSelectStartStop = async (startStop: any) => {
    setRouteError(null);
    setLoadingRoute(true);
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

      const destId = selectedDest.stop_id;
      const startId = startStop.stop_id;

      const matchingTrips: { tripId: string; stopsSeq: any[]; routeId?: string; routeInfo?: any; startDeparture?: string }[] = [];

      for (const trip of Object.keys(tripStops)) {
        const seq = tripStops[trip];
        const idxStart = seq.findIndex(s => s.stop_id === startId);
        const idxDest = seq.findIndex(s => s.stop_id === destId);
        if (idxStart !== -1 && idxDest !== -1 && idxStart < idxDest) {
          // 該当する停車順を切り出す
          const slice = seq.slice(idxStart, idxDest + 1);
          const tripDef = trips.find((t: any) => t.trip_id === trip);
          const routeDef = tripDef ? routes.find((r: any) => r.route_id === tripDef.route_id) : null;
          const startDeparture = slice[0]?.departure_time || slice[0]?.arrival_time || undefined;
          matchingTrips.push({ tripId: trip, stopsSeq: slice, routeId: tripDef?.route_id, routeInfo: routeDef, startDeparture });
        }
      }

      if (matchingTrips.length === 0) throw new Error('該当する便が見つかりませんでした');

      // routeBuses はマッチした便一覧（ID, route 名, 出発時刻）
      const buses = matchingTrips.map(m => ({ trip_id: m.tripId, route_id: m.routeId, route_short_name: m.routeInfo?.route_short_name, route_long_name: m.routeInfo?.route_long_name, departure: m.startDeparture }));

      // キャッシュとしてこの時点で tripStops を保存しておく（便選択時に再利用）
      tripStopsRef.current = tripStops;

      // routeStops は空にして、ユーザーが便を選択したときだけ地図に描画する（ユーザー操作を明示するため）
      setRouteStops([]);
      setRouteBuses(buses);
      setSelectedTripId(null);

    } catch (e: any) {
      setRouteError(e.message || 'ルート取得でエラーが発生しました');
    } finally {
      setLoadingRoute(false);
    }
  };

  // ルートを計算して表示（複数の交通手段を試行）
  const calculateAndDisplayRoute = (destination: google.maps.LatLng, destinationName: string) => {
    if (!directionsService.current || !directionsRenderer.current || !currentLocationRef.current) {
      console.error('Directions service not initialized or current location not available');
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
        console.log('すべての交通手段でルートが見つかりませんでした。マーカーのみ表示します。');
        
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
          console.log(`${currentMode.name}でのルートが見つかりました`);
          directionsRenderer.current!.setDirections(result);
          
          // ルート全体が見えるようにマップを調整
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend(currentLocationRef.current!);
          bounds.extend(destination);
          mapInstance.current!.fitBounds(bounds);
        } else {
          console.log(`${currentMode.name}でのルートが見つかりません: ${status}`);
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
    // ルートをクリア
    if (directionsRenderer.current) {
      directionsRenderer.current.setDirections({ routes: [] } as any);
    }
    
    // 検索バーをクリア
    setSearchQuery("");
    setPredictions([]);
    setShowPredictions(false);
    
    // マップをリセット（現在地マーカーは残す）
    if (mapInstance.current) {
      // 既存のマーカー（現在地以外）をクリア
      // 新しいマップインスタンスを作成せず、現在地を中心に戻す
      if (currentLocationRef.current) {
        mapInstance.current.setCenter(currentLocationRef.current);
        mapInstance.current.setZoom(14);
      }
    }
  };

  useEffect(() => {
    if (mapLoaded) {
      initializeMap();
    }
  }, [mapLoaded]);

  return (
    <>
      {/* Google Maps API Script */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=geometry,places`}
        onLoad={() => setMapLoaded(true)}
        strategy="lazyOnload"
      />
      
      <div className={styles.container}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <img src="/logo.png" alt="logo" className={styles.logo} />
          <button 
            className={styles.menuButton}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>

        {/* ドロップダウンメニュー */}
        {menuOpen && (
          <div className={styles.dropdown}>
            <ul className={styles.dropdownList}>
              <li className={styles.dropdownItem}>🏆 ランキング</li>
              <li className={styles.dropdownItem}>⚙ 設定</li>
            </ul>
          </div>
        )}

        {/* 検索バー */}
        <div className={styles.searchBar}>
          <input
            type="text"
            placeholder="目的地を入力またはタップ"
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => searchQuery && setShowPredictions(true)}
            onBlur={() => setTimeout(() => setShowPredictions(false), 150)}
          />
          <button 
            className={styles.searchButton}
            onClick={handleSearch}
          >
            検索
          </button>
          <button 
            className={styles.clearButton}
            onClick={clearRoute}
            title="ルートをクリア"
          >
            クリア
          </button>
          
          {/* 検索予測 */}
          {showPredictions && predictions.length > 0 && (
            <div className={styles.predictions}>
              {predictions.map((prediction) => (
                <div
                  key={prediction.place_id}
                  className={styles.predictionItem}
                  onClick={() => handlePredictionClick(prediction)}
                >
                  <MapPin size={16} className={styles.predictionIcon} />
                  <div className={styles.predictionText}>
                    <div className={styles.predictionMain}>
                      {prediction.structured_formatting.main_text}
                    </div>
                    <div className={styles.predictionSub}>
                      {prediction.structured_formatting.secondary_text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 検索結果（近隣停留所候補） */}
        <div className={styles.resultsContainer}>
          {loadingStops && <div className={styles.info}>検索中...</div>}
          {stopsError && <div className={styles.error}>{stopsError}</div>}
          {!loadingStops && nearbyStops.length === 0 && selectedDest && <div className={styles.info}>該当する近隣停留所は見つかりませんでした。</div>}
          {nearbyStops.length > 0 && (
            <div className={styles.nearbyList}>
              <h3>候補の停留所</h3>
              {nearbyStops.map((s: any) => (
                <div key={s.stop_id} className={styles.nearbyItem}>
                  <div>
                    <div className={styles.stopName}>{s.stop_name}</div>
                    <div className={styles.stopMeta}>{s.distance ? `${Math.round(s.distance)} m` : ''}</div>
                  </div>
                  <div>
                    <button className={styles.selectButton} onClick={() => handleSelectStartStop(s)}>この停留所を選択</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ルート停留所と便一覧 */}
          {routeError && <div className={styles.error}>{routeError}</div>}
          {loadingRoute && <div className={styles.info}>ルート情報を取得中...</div>}
          {routeStops.length > 0 && (
            <div className={styles.routePanel}>
              <h3>停車順</h3>
              <ol>
                {routeStops.map((rs: any) => (
                  <li key={rs.stop_id}>{rs.stop_name} {rs.arrival_time ? `(${rs.arrival_time})` : ''}</li>
                ))}
              </ol>
            </div>
          )}

          {routeBuses.length > 0 && (
            <div className={styles.busesPanel}>
              <h3>該当便一覧</h3>
              <ul>
                {routeBuses.map((b: any) => (
                  <li key={b.trip_id} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>{b.route_short_name || b.route_long_name || b.route_id} {b.departure ? `出発:${b.departure}` : ''}</span>
                    <button className={styles.selectButton} onClick={() => handleSelectBus(b.trip_id)}>{selectedTripId === b.trip_id ? '表示中' : 'この便を表示'}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

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