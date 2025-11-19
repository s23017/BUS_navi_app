// components/Sidebar.tsx - サイドメニューコンポーネント
import React from 'react';
import { useRouter } from 'next/navigation';
import styles from '../search.module.css';
import { getUserDisplayName } from '../utils';

interface SidebarProps {
  menuOpen: boolean;
  currentUser: any;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  menuOpen,
  currentUser,
  onClose
}) => {
  const router = useRouter();

  return (
    <>
      <div className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarContent}>
          <h2>メニュー</h2>
          <button 
            onClick={() => {
              router.push('/ranking');
              onClose();
            }}
            className={styles.menuItem}
          >
            ランキング
          </button>
          {currentUser ? (
            <div className={styles.userInfo}>
              <p>ログイン中: {getUserDisplayName(currentUser)}</p>
            </div>
          ) : (
            <button 
              onClick={() => {
                router.push('/auth');
                onClose();
              }}
              className={styles.menuItem}
            >
              ログイン
            </button>
          )}
        </div>
      </div>

      {/* オーバーレイ */}
      {menuOpen && (
        <div 
          className={styles.overlay} 
          onClick={onClose}
        />
      )}
    </>
  );
};
