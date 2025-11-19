// components/SearchForm.tsx - 元のレイアウトに合わせた検索フォーム
import React from 'react';
import { MapPin, Crosshair } from 'lucide-react';
import styles from '../search.module.css';

interface SearchFormProps {
  startSearchQuery: string;
  setStartSearchQuery: (value: string) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  startPredictions?: any[];
  predictions?: any[];
  showStartPredictions?: boolean;
  showPredictions?: boolean;
  onStartSearchChange?: (value: string) => void;
  onSearchChange?: (value: string) => void;
  onSelectStart?: (prediction: any) => void;
  onSelectDestination?: (prediction: any) => void;
  onSearch?: () => void;
  onUseCurrentLocation?: () => void;
  onClear?: () => void;
  onStartFocus?: () => void;
  onStartBlur?: () => void;
  onDestFocus?: () => void;
  onDestBlur?: () => void;
}

export function SearchForm({
  startSearchQuery,
  setStartSearchQuery,
  searchQuery,
  setSearchQuery,
  startPredictions = [],
  predictions = [],
  showStartPredictions = false,
  showPredictions = false,
  onStartSearchChange,
  onSearchChange,
  onSelectStart,
  onSelectDestination,
  onSearch,
  onUseCurrentLocation,
  onClear,
  onStartFocus,
  onStartBlur,
  onDestFocus,
  onDestBlur
}: SearchFormProps) {
  
  const handleStartInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setStartSearchQuery(value);
    if (onStartSearchChange) {
      onStartSearchChange(value);
    }
  };

  const handleDestInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (onSearchChange) {
      onSearchChange(value);
    }
  };

  const handleStartSelect = (prediction: any) => {
    if (onSelectStart) {
      onSelectStart(prediction);
    }
  };

  const handleDestSelect = (prediction: any) => {
    if (onSelectDestination) {
      onSelectDestination(prediction);
    }
  };

  return (
    <div className={styles.searchBar}>
      <input
        type="text"
        placeholder="出発地を入力（空欄で現在地）"
        className={styles.searchInput}
        value={startSearchQuery}
        onChange={handleStartInputChange}
        onFocus={() => {
          if (startSearchQuery && onStartSearchChange) {
            onStartSearchChange(startSearchQuery);
          }
          if (onStartFocus) onStartFocus();
        }}
        onBlur={() => {
          setTimeout(() => {
            if (onStartBlur) onStartBlur();
          }, 150);
        }}
      />
      <input
        type="text"
        placeholder="目的地を入力またはタップ"
        className={styles.searchInput}
        value={searchQuery}
        onChange={handleDestInputChange}
        onFocus={() => {
          if (searchQuery && onSearchChange) {
            onSearchChange(searchQuery);
          }
          if (onDestFocus) onDestFocus();
        }}
        onBlur={() => {
          setTimeout(() => {
            if (onDestBlur) onDestBlur();
          }, 150);
        }}
      />
      <button
        type="button"
        className={styles.locationButton}
        onClick={onUseCurrentLocation}
        title="現在地を出発地に設定"
      >
        <span className={styles.locationIcon}>
          <Crosshair size={16} />
        </span>
        現在地
      </button>
      <button 
        className={styles.searchButton}
        onClick={onSearch}
      >
        検索
      </button>
      <button 
        className={styles.clearButton}
        onClick={onClear}
        title="ルートをクリア"
      >
        クリア
      </button>
      
      {/* 出発地点検索予測 */}
      {showStartPredictions && startPredictions.length > 0 && (
        <div className={styles.predictions}>
          {startPredictions.map((prediction) => (
            <div
              key={prediction.unique_key || prediction.place_id}
              className={styles.predictionItem}
              onClick={() => handleStartSelect(prediction)}
            >
              <MapPin size={16} className={styles.predictionIcon} />
              <div className={styles.predictionText}>
                <div className={styles.predictionMain}>
                  {prediction.structured_formatting?.main_text || prediction.stop_name}
                </div>
                <div className={styles.predictionSub}>
                  {prediction.structured_formatting?.secondary_text}
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
              key={prediction.unique_key || prediction.place_id}
              className={styles.predictionItem}
              onClick={() => handleDestSelect(prediction)}
            >
              <MapPin size={16} className={styles.predictionIcon} />
              <div className={styles.predictionText}>
                <div className={styles.predictionMain}>
                  {prediction.structured_formatting?.main_text || prediction.stop_name}
                </div>
                <div className={styles.predictionSub}>
                  {prediction.structured_formatting?.secondary_text}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
