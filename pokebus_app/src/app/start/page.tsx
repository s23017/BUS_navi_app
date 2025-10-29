"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React from "react";

export default function StartPage() {
  const router = useRouter();

  const handleTap = () => {
    router.push("/login");
  };

  return (
    <div
      onClick={handleTap}
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#d9f0d3", // 薄いグリーン
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {/* 中央のロゴ */}
      <div style={{ textAlign: "center", zIndex: 2 }}>
        <Image
          src="/logo.png" // ← ここをロゴ画像のパスに変更（例: /images/logo.png）
          alt="Pocket Navigation BUS"
          width={400}
          height={300}
          style={{
            objectFit: "contain",
          }}
        />
      </div>

      {/* 背景のバスキャラクター */}
      <Image
        src="/bus_character.png" // ← ここを赤いキャラクター画像に変更
        alt="bus character"
        width={400}
        height={600}
        style={{
          position: "absolute",
          bottom: "-50px",
          right: "-40px",
          opacity: 0.25,
          transform: "rotate(-10deg)",
        }}
      />

      {/* 下部のテキスト */}
      <p
        style={{
          position: "absolute",
          bottom: "100px",
          fontSize: "28px",
          color: "rgba(0,0,0,0.4)",
          fontWeight: "500",
        }}
      >
        タップでスタート
      </p>
    </div>
  );
}
