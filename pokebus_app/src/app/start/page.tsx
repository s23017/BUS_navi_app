"use client";
import { useRouter } from "next/navigation";
import React from "react";

export default function StartPage() {
  const router = useRouter();

  const handleTap = () => {
    router.push("/auth/login");
  };

  return (
    <div
      onClick={handleTap}
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #e0e7ff 0%, #fff 100%)",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <h1 style={{ fontSize: 36, marginBottom: 24 }}>BUS navi</h1>
      <p style={{ fontSize: 20, color: "#555" }}>画面をタップしてスタート</p>
    </div>
  );
}
