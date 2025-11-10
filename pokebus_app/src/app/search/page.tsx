"use client";
import { useState, useEffect, useRef } from "react";
import { Menu, X, MapPin } from "lucide-react";
import Script from "next/script";
import styles from "./search.module.css";

  // Google Maps API の型定義を追加
declare global {
  interface Window {
    google: typeof google;
  }
}export default function BusSearch() {
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
  const routeMarkersRef = useRef<google.maps.Marker[]>([]);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const tripStopsRef = useRef<Record<string, any[]> | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Google Maps APIが読み込まれた後にマップを初期化
  const initializeMap = () => {
    if (!mapRef.current || !window.google || !window.google.maps || !window.google.maps.Map) {
      console.log('Google Maps API not fully loaded yet');
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
      console.error('Failed to initialize Google Maps:', error);
      return;
    }

    // Places APIサービスを初期化
    try {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      placesService.current = new window.google.maps.places.PlacesService(map);
    } catch (error) {
      console.error('Failed to initialize Places API:', error);
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
      console.error('Failed to initialize Directions API:', error);
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
            new window.google.maps.Marker({
              position: current,
              map,
              icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
              title: "現在地",
            });
            map.setCenter(current);
          } catch (error) {
            console.error('Failed to set current location:', error);
          }
        },
        (err) => console.error('Geolocation error:', err)
      );
    }
  };

  // ユーザーが特定の便（trip）を選んだとき、その便の停車順のみを表示して地図に描画する
  const handleSelectBus = async (tripId: string) => {
    console.log('handleSelectBus called with tripId:', tripId);
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
            strokeColor: '#FF5722', 
            strokeWeight: 4, 
            map: mapInstance.current! 
          });
          routePolylineRef.current = poly;
          const bounds = new window.google.maps.LatLngBounds();
          if (currentLocationRef.current) bounds.extend(currentLocationRef.current);
          path.forEach(p => bounds.extend(new window.google.maps.LatLng(p.lat, p.lng)));
          mapInstance.current!.fitBounds(bounds);
        }
      }

      // バス選択後はモーダルを閉じる
      console.log('Closing bus routes modal from handleSelectBus');
      setShowBusRoutes(false);
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
  
  // nahaディレクトリのデータ用
  const nahaDataCache = useRef<{ stops: any[]; stopTimes: any[]; trips: any[]; routes: any[]; } | null>(null);
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
    const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni'];
    const allStops: any[] = [];
    
    for (const company of companies) {
      try {
        const res = await fetch(`/${company}/stops.txt`);
        if (res.ok) {
          const txt = await res.text();
          const parsed = parseCsv(txt);
          allStops.push(...parsed);
        }
      } catch (e) {
        console.warn(`Failed to load stops for ${company}:`, e);
      }
    }
    
    // nahaデータも追加
    try {
      console.log('Loading naha data in loadStops...');
      const nahaData = await loadNahaData();
      if (nahaData && nahaData.stops) {
        console.log(`Adding ${nahaData.stops.length} naha stops to total stops`);
        console.log('First few naha stops:', nahaData.stops.slice(0, 3));
        allStops.push(...nahaData.stops);
      } else {
        console.warn('Naha data is null or has no stops');
      }
    } catch (e) {
      console.error('Failed to load naha stops:', e);
    }
    
    // 重複するstop_idを除去（最初に見つかったものを保持）
    const uniqueStops = allStops.filter((stop, index) => 
      allStops.findIndex(s => s.stop_id === stop.stop_id) === index
    );
    
    console.log(`Total unique stops: ${uniqueStops.length} (original: ${allStops.length})`);
    const nahaStops = uniqueStops.filter(s => s.stop_id.startsWith('naha_'));
    console.log(`Naha stops in final list: ${nahaStops.length}`);
    
    stopsCache.current = uniqueStops;
    return uniqueStops;
  }

  async function loadStopTimes() {
    if (stopTimesCache.current) return stopTimesCache.current;
    const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni'];
    const allStopTimes: any[] = [];
    
    for (const company of companies) {
      try {
        const res = await fetch(`/${company}/stop_times.txt`);
        if (res.ok) {
          const txt = await res.text();
          const parsed = parseCsv(txt);
          allStopTimes.push(...parsed);
        }
      } catch (e) {
        console.warn(`Failed to load stop_times for ${company}:`, e);
      }
    }
    
    // nahaデータも追加
    try {
      const nahaData = await loadNahaData();
      if (nahaData && nahaData.stopTimes) {
        allStopTimes.push(...nahaData.stopTimes);
      }
    } catch (e) {
      console.warn('Failed to load naha stop_times:', e);
    }
    
    stopTimesCache.current = allStopTimes;
    return allStopTimes;
  }

  async function loadTrips() {
    if (tripsCache.current) return tripsCache.current;
    const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni'];
    const allTrips: any[] = [];
    
    for (const company of companies) {
      try {
        const res = await fetch(`/${company}/trips.txt`);
        if (res.ok) {
          const txt = await res.text();
          const parsed = parseCsv(txt);
          allTrips.push(...parsed);
        }
      } catch (e) {
        console.warn(`Failed to load trips for ${company}:`, e);
      }
    }
    
    // nahaデータも追加
    try {
      const nahaData = await loadNahaData();
      if (nahaData && nahaData.trips) {
        allTrips.push(...nahaData.trips);
      }
    } catch (e) {
      console.warn('Failed to load naha trips:', e);
    }
    
    tripsCache.current = allTrips;
    return allTrips;
  }

  async function loadRoutes() {
    if (routesCache.current) return routesCache.current;
    const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni'];
    const allRoutes: any[] = [];
    
    for (const company of companies) {
      try {
        const res = await fetch(`/${company}/routes.txt`);
        if (res.ok) {
          const txt = await res.text();
          const parsed = parseCsv(txt);
          allRoutes.push(...parsed);
        }
      } catch (e) {
        console.warn(`Failed to load routes for ${company}:`, e);
      }
    }
    
    // nahaデータも追加
    try {
      const nahaData = await loadNahaData();
      if (nahaData && nahaData.routes) {
        allRoutes.push(...nahaData.routes);
      }
    } catch (e) {
      console.warn('Failed to load naha routes:', e);
    }
    
    routesCache.current = allRoutes;
    return allRoutes;
  }

  // nahaディレクトリのバス情報をGTFS形式に変換して読み込む
  async function loadNahaData() {
    console.log('=== loadNahaData function called ===');
    if (nahaDataCache.current) {
      console.log('Using cached naha data:', nahaDataCache.current);
      return nahaDataCache.current;
    }
    
    const allData: any[] = [];
    
    // nahabus.jsonを読み込み
    try {
      console.log('Attempting to fetch nahabus.json...');
      const res = await fetch('/naha/nahabus.json');
      console.log('nahabus.json fetch response:', res.status, res.statusText, 'URL:', res.url);
      if (res.ok) {
        const text = await res.text();
        console.log('nahabus.json text length:', text.length);
        if (text.trim().length > 0) {
          try {
            const data = JSON.parse(text);
            console.log('nahabus.json parsed successfully, type:', Array.isArray(data) ? 'array' : typeof data, 'length/keys:', Array.isArray(data) ? data.length : Object.keys(data).length);
            if (Array.isArray(data)) {
              allData.push(...data);
              console.log('nahabus.json added to allData, new total:', allData.length);
            } else {
              console.warn('nahabus.json is not an array:', data);
            }
          } catch (parseError) {
            console.error('Failed to parse nahabus.json:', parseError);
            console.log('Raw text preview:', text.substring(0, 200));
          }
        } else {
          console.warn('nahabus.json is empty');
        }
      } else {
        console.warn('Failed to fetch nahabus.json:', res.status, res.statusText);
      }
    } catch (e) {
      console.error('Error loading nahabus.json:', e);
    }
    
    // kokutai.jsonを読み込み
    try {
      console.log('Attempting to fetch kokutai.json...');
      const res = await fetch('/naha/kokutai.json');
      console.log('kokutai.json fetch response:', res.status, res.statusText, 'URL:', res.url);
      if (res.ok) {
        const text = await res.text();
        console.log('kokutai.json text length:', text.length);
        if (text.trim().length > 0) {
          try {
            const data = JSON.parse(text);
            console.log('kokutai.json parsed successfully, type:', Array.isArray(data) ? 'array' : typeof data, 'length/keys:', Array.isArray(data) ? data.length : Object.keys(data).length);
            if (Array.isArray(data)) {
              allData.push(...data);
              console.log('kokutai.json added to allData, new total:', allData.length);
            } else {
              console.warn('kokutai.json is not an array:', data);
            }
          } catch (parseError) {
            console.error('Failed to parse kokutai.json:', parseError);
            console.log('Raw text preview:', text.substring(0, 200));
          }
        } else {
          console.warn('kokutai.json is empty');
        }
      } else {
        console.warn('Failed to fetch kokutai.json:', res.status, res.statusText);
      }
    } catch (e) {
      console.error('Error loading kokutai.json:', e);
    }
    
    console.log('=== Summary of naha data loading ===');
    console.log('Total allData items:', allData.length);
    
    if (allData.length > 0) {
      // GTFS形式に変換
      console.log('Converting naha data to GTFS format...');
      const gtfsData = convertNahaToGTFS(allData);
      console.log('Naha GTFS conversion completed:', {
        totalBusData: allData.length,
        stops: gtfsData.stops.length,
        stopTimes: gtfsData.stopTimes.length,
        trips: gtfsData.trips.length,
        routes: gtfsData.routes.length
      });
      nahaDataCache.current = gtfsData;
      return gtfsData;
    }
    
    console.warn('No naha data loaded - returning empty GTFS structure');
    return { stops: [], stopTimes: [], trips: [], routes: [] };
  }

  // nahaバスデータをGTFS形式に変換
  function convertNahaToGTFS(nahaData: any[]) {
    const stops: any[] = [];
    const stopTimes: any[] = [];
    const trips: any[] = [];
    const routes: any[] = [];
    const processedStops = new Set<string>();
    const processedRoutes = new Set<string>();

    nahaData.forEach((busData, index) => {
      if (!busData.Daiya || !busData.Daiya.PassedSchedules) return;

      const routeId = `naha_${busData.Daiya.Course.Keitou.KeitouNo}`;
      const tripId = `naha_trip_${busData.Daiya.SID}`;
      const routeName = busData.Daiya.Course.Name;
      const routeShortName = busData.Daiya.Course.Keitou.KeitouNo;

      // ルート情報を追加（重複チェック）
      if (!processedRoutes.has(routeId)) {
        routes.push({
          route_id: routeId,
          route_short_name: routeShortName,
          route_long_name: routeName,
          route_type: 3, // バス
          agency_id: 'naha_bus'
        });
        processedRoutes.add(routeId);
      }

      // トリップ情報を追加
      trips.push({
        trip_id: tripId,
        route_id: routeId,
        service_id: 'naha_service',
        trip_headsign: busData.Daiya.Course.Group.YukisakiName || routeName
      });

      // 停留所と時刻表情報を処理
      busData.Daiya.PassedSchedules.forEach((schedule: any, stopIndex: number) => {
        const stopId = `naha_${schedule.Station.Sid}`;
        
        // 停留所情報を追加（重複チェック）
        if (!processedStops.has(stopId)) {
          // 座標を度数に変換
          let lat, lon;
          
          // 座標が度数形式かどうかをチェック
          const rawLat = parseFloat(schedule.Station.Position.Latitude);
          const rawLon = parseFloat(schedule.Station.Position.Longitude);
          
          if (rawLat > 1000) {
            // 度*100000形式の場合
            lat = rawLat / 100000;
            lon = rawLon / 100000;
          } else {
            // 既に度数形式の場合
            lat = rawLat;
            lon = rawLon;
          }
          
          // 座標が沖縄県の範囲内かチェック
          if (lat < 24 || lat > 27 || lon < 122 || lon > 132) {
            console.warn(`Invalid coordinates for ${schedule.Station.Name}: ${lat}, ${lon}`);
            lat = 26.2125; // 那覇市中心部
            lon = 127.6811;
          }

          stops.push({
            stop_id: stopId,
            stop_name: schedule.Station.Name,
            stop_lat: lat.toString(),
            stop_lon: lon.toString(),
            stop_code: schedule.Station.RenbanCd || '',
            stop_desc: schedule.Station.ShortName || schedule.Station.Name
          });
          processedStops.add(stopId);
        }

        // 時刻表情報を追加
        stopTimes.push({
          trip_id: tripId,
          stop_id: stopId,
          stop_sequence: schedule.OrderNo.toString(),
          arrival_time: schedule.ScheduledTime.Value,
          departure_time: schedule.StartTime.Value
        });
      });
    });

    return { stops, stopTimes, trips, routes };
  }

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
          console.warn('Places API search failed:', e);
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
              unique_key: `start_place_${p.place_id}_${index}`,
              type: 'place',
              structured_formatting: {
                main_text: p.structured_formatting.main_text,
                secondary_text: `📍 ${p.structured_formatting.secondary_text}`
              }
            }));

          predictions.push(...placeMatches);
        } catch (e) {
          console.warn('Places API search failed:', e);
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
      if (!geocodedLocation && matchedByName.length === 0) {
        try {
          if (window.google && window.google.maps && window.google.maps.Geocoder) {
            const geocoder = new window.google.maps.Geocoder();
            const geoRes: any = await new Promise(resolve => {
              geocoder.geocode({ address: q }, (results: any, status: any) => {
                resolve({ results, status });
              });
            });
            if (geoRes && geoRes.status === window.google.maps.GeocoderStatus.OK && geoRes.results && geoRes.results[0]) {
              const loc = geoRes.results[0].geometry.location;
              geocodedLocation = { lat: loc.lat(), lon: loc.lng() };
            }
          }
        } catch (e) {
          console.warn('Geocoding failed:', e);
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

      // 出発地点取得（選択されていれば優先、なければ現在地）
      let pos: {lat: number, lon: number};
      if (selectedStart) {
        pos = { lat: parseFloat(selectedStart.stop_lat), lon: parseFloat(selectedStart.stop_lon) };
      } else {
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
      console.log('Closing bus routes modal from handleSearch');
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

  // start 停留所を選択したときに、その停留所から selectedDest まで行くルート（停車順）と該当する便を算出して表示する
  const handleSelectStartStop = async (startStop: any) => {
    // 選択された出発地点を保存
    setSelectedStart(startStop);
    setRouteError(null);
    setLoadingRoute(true);
    // 古いモーダル状態をクリア
    console.log('Starting handleSelectStartStop, closing any open modals');
    setShowBusRoutes(false);
    console.log('handleSelectStartStop called with:', { startStop, selectedDest, selectedDestIds });
    try {
      if (!selectedDest) throw new Error('目的地が選択されていません');

      const stops = await loadStops();
      const stopTimes = await loadStopTimes();
      const trips = await loadTrips();
      const routes = await loadRoutes();
      
      console.log('Data loaded:', { 
        stopsCount: stops.length, 
        stopTimesCount: stopTimes.length,
        tripsCount: trips.length,
        routesCount: routes.length 
      });

      // trip_id -> ordered stop sequence
      const tripStops: Record<string, { stop_id: string; seq: number; arrival_time?: string; departure_time?: string }[]> = {};
      for (const st of stopTimes) {
        if (!tripStops[st.trip_id]) tripStops[st.trip_id] = [];
        tripStops[st.trip_id].push({ stop_id: st.stop_id, seq: Number(st.stop_sequence), arrival_time: st.arrival_time, departure_time: st.departure_time });
      }
      for (const k of Object.keys(tripStops)) tripStops[k].sort((a,b)=>a.seq-b.seq);

      const destIds = selectedDestIds.length > 0 ? selectedDestIds : [selectedDest.stop_id];
      const startId = startStop.stop_id;
      
      console.log('Looking for trips from', startId, 'to one of', destIds);

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
        console.log('No matching trips found. Debug info:', {
          startId,
          destIds,
          totalTrips: Object.keys(tripStops).length,
          sampleTripStops: Object.entries(tripStops).slice(0, 3).map(([tripId, stops]) => ({
            tripId,
            stopIds: stops.map(s => s.stop_id)
          }))
        });
        throw new Error('該当する便が見つかりませんでした');
      }
      
      console.log('Found matching trips:', matchingTrips.length);

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
        console.log('Created bus info:', busInfo);
        return busInfo;
      });

      console.log('All buses created:', buses.length, buses);

      // 出発時刻でソート
      buses.sort((a, b) => {
        if (!a.departure || !b.departure) return 0;
        return a.departure.localeCompare(b.departure);
      });

      // キャッシュとしてこの時点で tripStops を保存しておく（便選択時に再利用）
      tripStopsRef.current = tripStops;

      console.log('Setting route state:', {
        routeStops: [],
        routeBuses: buses.length,
        selectedTripId: null,
        showStopCandidates: false,
        showBusRoutes: true
      });

      setRouteStops([]);
      setRouteBuses(buses);
      setSelectedTripId(null);
      setShowStopCandidates(false);
      console.log('Opening bus routes modal');
      setShowBusRoutes(true);
      
      console.log('Route state set successfully');

    } catch (e: any) {
      console.error('Error in handleSelectStartStop:', e);
      setRouteError(e.message || 'ルート取得でエラーが発生しました');
    } finally {
      console.log('handleSelectStartStop finished, loadingRoute set to false');
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
    console.log('Closing bus routes modal from clearRoute');
    setShowBusRoutes(false);
    
    // 地図上のマーカーをクリア
    routeMarkersRef.current.forEach(m => m.setMap(null));
    routeMarkersRef.current = [];
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
    console.log('showBusRoutes changed:', showBusRoutes);
  }, [showBusRoutes]);

  useEffect(() => {
    console.log('routeBuses changed:', routeBuses.length, routeBuses);
  }, [routeBuses]);

  useEffect(() => {
    console.log('loadingRoute changed:', loadingRoute);
  }, [loadingRoute]);

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
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=geometry,places`}
        onLoad={() => {
          console.log('Google Maps script loaded');
          // 少し遅延してからmapLoadedを設定（完全な初期化を待つ）
          setTimeout(() => setMapLoaded(true), 100);
        }}
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
            placeholder="出発地を入力（空欄で現在地）"
            className={styles.searchInput}
            value={startSearchQuery}
            onChange={(e) => handleStartSearchChange(e.target.value)}
            onFocus={() => startSearchQuery && setShowStartPredictions(true)}
            onBlur={() => setTimeout(() => setShowStartPredictions(false), 150)}
          />
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
          
          {/* 出発地点検索予測 */}
          {showStartPredictions && startPredictions.length > 0 && (
            <div className={styles.predictions}>
              {startPredictions.map((prediction) => (
                <div
                  key={prediction.unique_key}
                  className={styles.predictionItem}
                  onClick={() => handleStartPredictionClick(prediction)}
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
          
          {/* 目的地検索予測 */}
          {showPredictions && predictions.length > 0 && (
            <div className={styles.predictions}>
              {predictions.map((prediction) => (
                <div
                  key={prediction.unique_key}
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

        {/* 選択された出発地点表示 */}
        {selectedStart && (
          <div className={styles.resultsContainer}>
            <div className={styles.nearbyList}>
              <h3>選択された出発地点</h3>
              <div className={styles.nearbyItem}>
                <div>
                  <div className={styles.stopName}>{selectedStart.stop_name}</div>
                </div>
                <div>
                  <button className={styles.selectButton} onClick={() => { setSelectedStart(null); setStartSearchQuery(""); }}>変更</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 出発地点候補選択モーダル */}
        {showStopCandidates && (
          <div className={styles.modalOverlay} style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div className={styles.modalContent} style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '0',
              maxWidth: '90vw',
              maxHeight: '80vh',
              width: '400px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}>
              <div className={styles.modalHeader} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px',
                borderBottom: '1px solid #eee'
              }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>出発地点を選択</h3>
                <button 
                  className={styles.closeButton}
                  onClick={() => setShowStopCandidates(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '4px'
                  }}
                >
                  <X size={24} />
                </button>
              </div>
              <div className={styles.modalBody} style={{
                padding: '20px',
                maxHeight: '60vh',
                overflowY: 'auto'
              }}>
                {loadingStops && (
                  <div className={styles.loadingSection} style={{
                    textAlign: 'center',
                    padding: '40px'
                  }}>
                    <div className={styles.spinner} style={{
                      width: '40px',
                      height: '40px',
                      border: '4px solid #f3f3f3',
                      borderTop: '4px solid #007bff',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto 16px'
                    }}></div>
                    <p>検索中...</p>
                  </div>
                )}
                {stopsError && (
                  <div className={styles.errorSection} style={{
                    textAlign: 'center',
                    padding: '40px',
                    color: '#dc3545'
                  }}>
                    <p>{stopsError}</p>
                  </div>
                )}
                {nearbyStops.length > 0 && (
                  <div className={styles.stopsList}>
                    {nearbyStops.map((s: any, index: number) => (
                      <div 
                        key={`nearby_${s.stop_id}_${index}`} 
                        className={styles.stopCard}
                        onClick={() => handleSelectStartStop(s)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '16px',
                          marginBottom: '8px',
                          border: '1px solid #e0e0e0',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          backgroundColor: 'white'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8f9fa';
                          e.currentTarget.style.borderColor = '#007bff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                          e.currentTarget.style.borderColor = '#e0e0e0';
                        }}
                      >
                        <div className={styles.stopInfo}>
                          <div className={styles.stopName} style={{
                            fontSize: '16px',
                            fontWeight: '500',
                            marginBottom: '4px'
                          }}>{s.stop_name}</div>
                          <div className={styles.stopDistance} style={{
                            fontSize: '14px',
                            color: '#666'
                          }}>
                            📍 {s.distance ? `${Math.round(s.distance)}m` : '距離不明'}
                          </div>
                        </div>
                        <div className={styles.selectArrow} style={{
                          color: '#007bff',
                          fontSize: '18px'
                        }}>▶</div>
                      </div>
                    ))}
                  </div>
                )}
                {!loadingStops && nearbyStops.length === 0 && selectedDest && (
                  <div className={styles.noResultsSection} style={{
                    textAlign: 'center',
                    padding: '40px',
                    color: '#666'
                  }}>
                    <p>該当する停留所が見つかりませんでした</p>
                    <p>検索条件を変更してお試しください</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* バス便選択モーダル */}
        {showBusRoutes && (
          <div className={styles.modalOverlay} style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div className={styles.modalContent} style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '0',
              maxWidth: '90vw',
              maxHeight: '80vh',
              width: '450px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}>
              <div className={styles.modalHeader} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px',
                borderBottom: '1px solid #eee'
              }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>バス便選択</h3>
                <button 
                  className={styles.closeButton}
                  onClick={() => {
                    console.log('Closing bus routes modal from close button');
                    setShowBusRoutes(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '4px'
                  }}
                >
                  <X size={24} />
                </button>
              </div>
              <div className={styles.routeInfo} style={{
                padding: '16px 20px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #eee'
              }}>
                <div className={styles.routePoints} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div className={styles.startPoint} style={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1
                  }}>
                    <span className={styles.pointIcon} style={{ marginRight: '8px' }}>🚏</span>
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{selectedStart?.stop_name}</span>
                  </div>
                  <div className={styles.routeArrow} style={{
                    margin: '0 16px',
                    color: '#007bff',
                    fontWeight: 'bold'
                  }}>→</div>
                  <div className={styles.endPoint} style={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                    justifyContent: 'flex-end'
                  }}>
                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{selectedDest?.stop_name}</span>
                    <span className={styles.pointIcon} style={{ marginLeft: '8px' }}>🎯</span>
                  </div>
                </div>
              </div>
              <div className={styles.modalBody}>
                {(() => {
                  console.log('Modal body rendering:', { loadingRoute, routeError, routeBusesLength: routeBuses.length });
                  return null;
                })()}
                {loadingRoute && (
                  <div className={styles.loadingSection}>
                    <div className={styles.spinner}></div>
                    <p>ルート情報を取得中...</p>
                  </div>
                )}
                {routeError && (
                  <div className={styles.errorSection}>
                    <p>{routeError}</p>
                  </div>
                )}
                {routeBuses.length > 0 && (
                  <div className={styles.busList}>
                    {(() => {
                      console.log('Rendering bus list:', routeBuses.length, 'buses', routeBuses);
                      return null;
                    })()}
                    {routeBuses.map((b: any) => (
                      <div 
                        key={b.trip_id} 
                        className={`${styles.busCard} ${selectedTripId === b.trip_id ? styles.selectedBus : ''}`}
                        onClick={() => handleSelectBus(b.trip_id)}
                        style={{
                          padding: '16px',
                          marginBottom: '12px',
                          border: selectedTripId === b.trip_id ? '2px solid #007bff' : '1px solid #e0e0e0',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          backgroundColor: selectedTripId === b.trip_id ? '#f0f8ff' : 'white'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedTripId !== b.trip_id) {
                            e.currentTarget.style.backgroundColor = '#f8f9fa';
                            e.currentTarget.style.borderColor = '#007bff';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedTripId !== b.trip_id) {
                            e.currentTarget.style.backgroundColor = 'white';
                            e.currentTarget.style.borderColor = '#e0e0e0';
                          }
                        }}
                      >
                        <div className={styles.busHeader} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '12px'
                        }}>
                          <div className={styles.busNumber} style={{
                            fontSize: '18px',
                            fontWeight: '600',
                            color: '#007bff'
                          }}>
                            🚌 {b.route_short_name || b.route_long_name || b.route_id}
                          </div>
                          <div className={styles.busStatus} style={{
                            fontSize: '12px',
                            color: selectedTripId === b.trip_id ? '#007bff' : '#666',
                            fontWeight: '500'
                          }}>
                            {selectedTripId === b.trip_id ? '表示中' : 'タップして表示'}
                          </div>
                        </div>
                        <div className={styles.busDetails} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div className={styles.timeDetail} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            flex: 1
                          }}>
                            <span className={styles.timeLabel} style={{
                              fontSize: '12px',
                              color: '#666',
                              marginBottom: '4px'
                            }}>出発</span>
                            <span className={styles.timeValue} style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#28a745'
                            }}>
                              {b.departure || '不明'}
                            </span>
                          </div>
                          <div className={styles.timeDetail} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            flex: 1
                          }}>
                            <span className={styles.timeLabel} style={{
                              fontSize: '12px',
                              color: '#666',
                              marginBottom: '4px'
                            }}>到着</span>
                            <span className={styles.timeValue} style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#dc3545'
                            }}>
                              {b.arrival || '不明'}
                            </span>
                          </div>
                          <div className={styles.stopsCount} style={{
                            fontSize: '14px',
                            color: '#666',
                            backgroundColor: '#f8f9fa',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontWeight: '500'
                          }}>
                            {b.stops_count}駅
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!loadingRoute && routeBuses.length === 0 && selectedStart && selectedDest && (
                  <div className={styles.noResultsSection}>
                    <p>該当するバス便が見つかりませんでした</p>
                    <p>別の出発地点をお試しください</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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