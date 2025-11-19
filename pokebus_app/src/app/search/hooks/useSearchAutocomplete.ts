// hooks/useSearchAutocomplete.ts - 検索オートコンプリート機能
import { useState, useCallback } from 'react';
import { getDistance } from '../utils';

export const useSearchAutocomplete = (
  autocompleteService: React.RefObject<google.maps.places.AutocompleteService | null>,
  currentLocation: google.maps.LatLng | null
) => {
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [startPredictions, setStartPredictions] = useState<any[]>([]);
  const [showStartPredictions, setShowStartPredictions] = useState(false);

  // データローダー
  const loadStops = async () => {
    const res = await fetch('/okibus/stops.txt');
    const text = await res.text();
    return text.trim().split('\n').slice(1).map(line => {
      const [stopId, stopCode, stopName, stopDesc, stopLat, stopLon] = line.split(',');
      return { stop_id: stopId, stop_name: stopName, stop_lat: parseFloat(stopLat), stop_lon: parseFloat(stopLon) };
    });
  };

  // 出発地点検索入力ハンドラ
  const handleStartSearchChange = useCallback(async (value: string) => {
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
      
      if (currentLocation) {
        try {
          userLat = currentLocation.lat();
          userLon = currentLocation.lng();
        } catch (e) {
          userLat = null; 
          userLon = null;
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
            stop_id: s.stop_id,
            stop_name: s.stop_name,
            stop_lat: s.stop_lat,
            stop_lon: s.stop_lon,
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
          // ignore prediction errors
        }
      }

      if (predictions.length > 0) {
        setStartPredictions(predictions.slice(0, 8));
        setShowStartPredictions(true);
      }
    } catch (e) {
      // ignore prediction errors
    }
  }, [autocompleteService, currentLocation]);

  // 目的地検索入力ハンドラ
  const handleSearchChange = useCallback(async (value: string) => {
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
      
      if (currentLocation) {
        try {
          userLat = currentLocation.lat();
          userLon = currentLocation.lng();
        } catch (e) {
          userLat = null; 
          userLon = null;
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
            stop_id: s.stop_id,
            stop_name: s.stop_name,
            stop_lat: s.stop_lat,
            stop_lon: s.stop_lon,
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
          // ignore prediction errors
        }
      }

      if (predictions.length > 0) {
        setPredictions(predictions.slice(0, 8));
        setShowPredictions(true);
      }
    } catch (e) {
      // ignore prediction errors
    }
  }, [autocompleteService, currentLocation]);

  // 選択ハンドラー
  const handleSelectStart = useCallback((prediction: any) => {
    setShowStartPredictions(false);
    setStartPredictions([]);
    return prediction;
  }, []);

  const handleSelectDestination = useCallback((prediction: any) => {
    setShowPredictions(false);
    setPredictions([]);
    return prediction;
  }, []);

  return {
    predictions,
    setPredictions,
    showPredictions,
    setShowPredictions,
    startPredictions,
    setStartPredictions,
    showStartPredictions,
    setShowStartPredictions,
    handleStartSearchChange,
    handleSearchChange,
    handleSelectStart,
    handleSelectDestination
  };
};
