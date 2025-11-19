"use client";
import React from "react";
import styles from "../search.module.css";
import { MapPin, Crosshair } from "lucide-react";

type Props = {
  startSearchQuery: string;
  searchQuery: string;
  handleStartSearchChange: (v: string) => void;
  handleSearchChange: (v: string) => void;
  handleUseCurrentLocation: () => void;
  handleSearch: () => void;
  clearRoute: () => void;
  showStartPredictions: boolean;
  startPredictions: any[];
  showPredictions: boolean;
  predictions: any[];
  handleStartPredictionClick: (p: any) => void;
  handlePredictionClick: (p: any) => void;
  setShowStartPredictions: (b: boolean) => void;
  setShowPredictions: (b: boolean) => void;
};

export default function SearchBar(props: Props) {
  const {
    startSearchQuery,
    searchQuery,
    handleStartSearchChange,
    handleSearchChange,
    handleUseCurrentLocation,
    handleSearch,
    clearRoute,
    showStartPredictions,
    startPredictions,
    showPredictions,
    predictions,
    handleStartPredictionClick,
    handlePredictionClick,
    setShowStartPredictions,
    setShowPredictions,
  } = props;

  return (
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
        type="button"
        className={styles.locationButton}
        onClick={handleUseCurrentLocation}
        title="現在地を出発地に設定"
      >
        <span className={styles.locationIcon}>
          <Crosshair size={16} />
        </span>
        現在地
      </button>
      <button className={styles.searchButton} onClick={handleSearch}>
        検索
      </button>
      <button className={styles.clearButton} onClick={clearRoute} title="ルートをクリア">
        クリア
      </button>

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
  );
}
