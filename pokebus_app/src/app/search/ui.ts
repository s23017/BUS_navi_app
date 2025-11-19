// UI状態管理・通知関連
import { useState, useEffect } from 'react';
import { PassedStopRecord } from './types';

/**
 * UI状態管理
 */
export const useUIState = () => {
  const [isSheetMinimized, setIsSheetMinimized] = useState(false);
  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [notification, setNotification] = useState<string>('');
  const [isNotificationVisible, setIsNotificationVisible] = useState(false);

  /**
   * 通知を表示
   */
  const showNotification = (message: string, duration: number = 3000) => {
    setNotification(message);
    setIsNotificationVisible(true);

    setTimeout(() => {
      setIsNotificationVisible(false);
      setTimeout(() => setNotification(''), 300); // フェードアウト後にクリア
    }, duration);
  };

  return {
    isSheetMinimized,
    setIsSheetMinimized,
    sheetTranslateY,
    setSheetTranslateY,
    isBottomSheetVisible,
    setIsBottomSheetVisible,
    notification,
    isNotificationVisible,
    showNotification
  };
};

/**
 * ビューポート管理
 */
export const useViewport = () => {
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const updateViewport = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      setViewportHeight(window.innerHeight);
    };

    updateViewport();
    
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);

    // モバイルブラウザのアドレスバー対応
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimeout(updateViewport, 100);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return { viewportHeight };
};

/**
 * バス停通過通知
 */
export const showBusStopNotificationFromOtherUser = (passedStop: PassedStopRecord, showNotification: (msg: string) => void) => {
  if (passedStop.username && !passedStop.inferred) {
    const message = `${passedStop.username}さんが${passedStop.stopName}を通過しました`;
    showNotification(message);
    console.log('バス停通過通知:', message);
  }
};

/**
 * 検索結果管理
 */
export const useSearch = () => {
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [destinationResults, setDestinationResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedStart, setSelectedStart] = useState<any>(null);
  const [selectedDestination, setSelectedDestination] = useState<any>(null);

  const clearSearch = () => {
    setSearchResults([]);
    setDestinationResults([]);
    setSelectedStart(null);
    setSelectedDestination(null);
  };

  return {
    searchResults,
    setSearchResults,
    destinationResults,
    setDestinationResults,
    isSearching,
    setIsSearching,
    selectedStart,
    setSelectedStart,
    selectedDestination,
    setSelectedDestination,
    clearSearch
  };
};

/**
 * バス一覧表示管理
 */
export const useBusList = () => {
  const [availableBuses, setAvailableBuses] = useState<any[]>([]);
  const [isLoadingBuses, setIsLoadingBuses] = useState(false);
  const [selectedBusInfo, setSelectedBusInfo] = useState<string>('');

  return {
    availableBuses,
    setAvailableBuses,
    isLoadingBuses,
    setIsLoadingBuses,
    selectedBusInfo,
    setSelectedBusInfo
  };
};

/**
 * エラー処理管理
 */
export const useErrorHandling = () => {
  const [errors, setErrors] = useState<string[]>([]);

  const addError = (error: string) => {
    setErrors(prev => [...prev, error]);
    console.error('アプリケーションエラー:', error);
  };

  const clearErrors = () => {
    setErrors([]);
  };

  const removeError = (index: number) => {
    setErrors(prev => prev.filter((_, i) => i !== index));
  };

  return {
    errors,
    addError,
    clearErrors,
    removeError
  };
};
