export type Rarity = "SSR" | "SR" | "R" | "N";

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
    id: "okinawan-dreamliner",
    name: "オキナワンドリームライナー",
    rarity: "SSR",
    weight: 3,
    image: "/gacha/characters/dora.png",
    description: "伝説の黄金バス。乗るだけで旅の幸運が舞い込むと言われる幻の一台。",
  },
  {
    id: "shisa-guardian",
    name: "シーサーガーディアン",
    rarity: "SR",
    weight: 7,
    image: "/gacha/characters/dog.png",
    description: "那覇の街を守る守護獣ドライバー。悪天候でも安全運転はお手の物。",
  },
  {
    id: "sunrise-conductor",
    name: "サンライズコンダクター",
    rarity: "SR",
    weight: 10,
    image: "/gacha/characters/frog.png",
    description: "朝焼けと共に現れ、乗客を笑顔で送り出す朝専用コンダクター。",
  },
  {
    id: "island-navigator",
    name: "アイランドナビゲーター",
    rarity: "R",
    weight: 18,
    image: "/gacha/characters/gost.png",
    description: "離島路線に強い経験豊富なナビゲーター。迷ったときは彼にお任せ。",
  },
  {
    id: "blue-route-driver",
    name: "ブルールートドライバー",
    rarity: "R",
    weight: 20,
    image: "/gacha/characters/mogu.png",
    description: "渋滞知らずの安定運転が評判のベテラン運転士。",
  },
  {
    id: "local-guide",
    name: "ローカルガイド",
    rarity: "N",
    weight: 42,
    image: "/gacha/characters/rabi.png",
    description: "ローカル情報ならお任せ。乗客に寄り添う親しみやすい案内役。",
  },
];
