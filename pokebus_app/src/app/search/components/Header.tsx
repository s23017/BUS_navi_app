"use client";
import React from "react";
import { useRouter } from "next/navigation";
import searchStyles from "../search.module.css";
import { Menu, X } from "lucide-react";

type Props = {
  menuOpen: boolean;
  toggleMenu: () => void;
  onGoProfile: () => void;
  onLogoClick?: () => void;
};

export default function Header({ menuOpen, toggleMenu, onGoProfile, onLogoClick }: Props) {
  const router = useRouter();
  const handleLogoClick = () => {
    if (onLogoClick) {
      onLogoClick();
      return;
    }
    router.push("/search");
  };

  return (
    <>
      <div className={searchStyles.header}>
        <img
          src="/pokebus_icon.png"
          alt="logo"
          className={searchStyles.logo}
          onClick={handleLogoClick}
          style={{ cursor: "pointer" }}
        />
        <button
          className={searchStyles.menuButton}
          onClick={toggleMenu}
          aria-label="メニュー"
        >
          {menuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {menuOpen && (
        <div className={searchStyles.dropdown}>
          <ul className={searchStyles.dropdownList}>
            <li
              className={searchStyles.dropdownItem}
              onClick={() => {
                toggleMenu();
                router.push("/ranking");
              }}
              style={{ cursor: "pointer" }}
            >
              🏆 ランキング
            </li>
            <li
              className={searchStyles.dropdownItem}
              onClick={() => {
                toggleMenu();
                onGoProfile();
              }}
              style={{ cursor: "pointer" }}
            >
              👤 プロフィール
            </li>
          </ul>
        </div>
      )}

      <div className={searchStyles.headerPlaceholder} aria-hidden="true" />
    </>
  );
}
