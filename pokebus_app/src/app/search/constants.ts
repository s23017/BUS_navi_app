// 定数定義ファイル
export const GEO_TIMEOUT_CODE = 3;
export const GEO_PERMISSION_DENIED_CODE = 1;
export const MIN_SHARE_INTERVAL_MS = 30000; // Firestore共有は30秒間隔を基本とする
export const MIN_MOVEMENT_METERS = 15; // 小刻みな揺れによる書き込みを防ぐ最小移動距離

export const DISTANCE_THRESHOLDS = {
  BUS_STOP_PROXIMITY: 500, // バス停近距離判定
  ROUTE_CORRIDOR: 1000,    // バス路線沿い判定
  SHARING_LIMIT: 500,      // 位置情報共有可能距離
  NEAR_STOP_THRESHOLD: 200 // バス停接近通知距離
} as const;

export const MAP_CONFIG = {
  DEFAULT_CENTER: { lat: 26.2124, lng: 127.6792 }, // 沖縄県那覇市
  DEFAULT_ZOOM: 13,
  MIN_ZOOM: 10,
  MAX_ZOOM: 18
} as const;

export const FIREBASE_COLLECTIONS = {
  LOCATIONS: 'locations',
  BUS_STOP_PASSAGES: 'bus_stop_passages'
} as const;

export const TIME_INTERVALS = {
  LOCATION_UPDATE: 5000,    // 位置情報更新間隔（ミリ秒）
  CLEANUP_INTERVAL: 60000,  // クリーンアップ間隔
  PASSAGE_RETENTION: 3600000 // 通過記録保持時間（1時間）
} as const;
