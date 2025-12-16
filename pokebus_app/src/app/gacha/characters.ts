export type Rarity = "SSR" | "SR" | "R" | "N" | "EXR";

export type GachaCharacter = {
  id: string;
  name: string;
  rarity: Rarity;
  weight: number;
  image: string;
  description: string;
};

export const characters: GachaCharacter[] = [
  {
    id: "coupon-5",
    name: "5%OFFクーポン",
    rarity: "N",
    weight: 5,
    image: "/gacha/characters/5%25.png",
    description: "気軽に使える5%オフ券。小さなお得を積み重ねよう。",
  },
  {
    id: "coupon-10",
    name: "10%OFFクーポン",
    rarity: "R",
    weight: 10,
    image: "/gacha/characters/10%25.png",
    description: "何度でも欲しい10%オフ券。次の乗車で活躍します。",
  },
  {
    id: "coupon-15",
    name: "15%OFFクーポン",
    rarity: "SR",
    weight: 15,
    image: "/gacha/characters/15%25.png",
    description: "ちょっとレアな15%オフ券。見つけたらラッキー！",
  },
  {
    id: "coupon-30",
    name: "30%OFFクーポン",
    rarity: "SSR",
    weight: 30,
    image: "/gacha/characters/30%25.png",
    description: "大当たりの30%オフ券。超お得な割引を楽しんで！",
  },
  {
    id: "coupon-miss",
    name: "はずれ券",
    rarity: "EXR",
    weight: 70,
    image: "/gacha/characters/hazure.png",
    description: "残念！今回ははずれ。次のチャレンジに期待しよう。",
  }
];
