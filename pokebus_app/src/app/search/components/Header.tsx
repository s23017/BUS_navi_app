// components/Header.tsx - ヘッダーコンポーネント
import React from 'react';
import { Menu, X } from 'lucide-react';
import styles from '../search.module.css';

interface HeaderProps {
  menuOpen: boolean;
  onMenuToggle: () => void;
  onRankingClick?: () => void;
  onProfileClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  menuOpen,
  onMenuToggle,
  onRankingClick,
  onProfileClick
}) => {
  const handleRankingClick = () => {
    onRankingClick?.();
    onMenuToggle(); // メニューを閉じる
  };

  const handleProfileClick = () => {
    onProfileClick?.();
    onMenuToggle(); // メニューを閉じる
  };

  return (
    <div className={styles.header}>
      <img src="/pokebus_icon.png" alt="logo" className={styles.logo} />
      <button 
        className={styles.menuButton}
        onClick={onMenuToggle}
      >
        {menuOpen ? <X size={28} /> : <Menu size={28} />}
      </button>
      
      {/* メニュードロップダウン */}
      {menuOpen && (
        <div className={styles.dropdown}>
          <ul className={styles.dropdownList}>
            <li 
              className={styles.dropdownItem}
              onClick={handleRankingClick}
            >
              🏆 ランキング
            </li>
            <li 
              className={styles.dropdownItem}
              onClick={handleProfileClick}
              style={{ cursor: 'pointer' }}
            >
              👤 プロフィール
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};
