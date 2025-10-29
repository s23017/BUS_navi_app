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
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const directionsService = useRef<google.maps.DirectionsService | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const currentLocationRef = useRef<google.maps.LatLng | null>(null);

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

  // 検索予測を取得
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    
    if (value.length > 0 && autocompleteService.current) {
      const request = {
        input: value,
        location: new window.google.maps.LatLng(26.2125, 127.6811), // 沖縄中心
        radius: 50000, // 50km
        componentRestrictions: { country: 'jp' }, // 日本限定
      };

      autocompleteService.current.getPlacePredictions(request, (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setPredictions(predictions);
          setShowPredictions(true);
        } else {
          setPredictions([]);
          setShowPredictions(false);
        }
      });
    } else {
      setPredictions([]);
      setShowPredictions(false);
    }
  };

  // 予測候補をクリックした時の処理
  const handlePredictionClick = (prediction: google.maps.places.AutocompletePrediction) => {
    setSearchQuery(prediction.description);
    setShowPredictions(false);
    searchPlace(prediction.place_id);
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

  // 検索ボタンクリック時の処理
  const handleSearch = () => {
    if (searchQuery && predictions.length > 0) {
      handlePredictionClick(predictions[0]);
    }
  };

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
