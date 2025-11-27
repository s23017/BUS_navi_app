import { useState } from "react";
import { GachaResult } from "./gacha-result";
import { Sparkles, Gem } from "lucide-react";
import { motion, useMotionValue } from "motion/react";

interface Character {
  id: number;
  name: string;
  rarity: number;
  type: string;
  imageUrl: string;
}

const mockCharacters: Character[] = [
  { id: 1, name: "ドラゴンナイト", rarity: 5, type: "火属性", imageUrl: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop" },
  { id: 2, name: "氷の女王", rarity: 5, type: "水属性", imageUrl: "https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&h=400&fit=crop" },
  { id: 3, name: "森の守護者", rarity: 5, type: "木属性", imageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=400&fit=crop" },
  { id: 4, name: "雷神", rarity: 5, type: "光属性", imageUrl: "https://images.unsplash.com/photo-1601814933824-fd0b574dd592?w=400&h=400&fit=crop" },
  { id: 5, name: "闇の魔術師", rarity: 5, type: "闇属性", imageUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=400&fit=crop" },
  { id: 6, name: "炎の剣士", rarity: 4, type: "火属性", imageUrl: "https://images.unsplash.com/photo-1589254065878-42c9da997008?w=400&h=400&fit=crop" },
  { id: 7, name: "水の妖精", rarity: 4, type: "水属性", imageUrl: "https://images.unsplash.com/photo-1613521973253-7e98c1a8f21e?w=400&h=400&fit=crop" },
  { id: 8, name: "風の戦士", rarity: 4, type: "木属性", imageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop" },
  { id: 9, name: "スライム", rarity: 3, type: "火属性", imageUrl: "https://images.unsplash.com/photo-1516110833967-0b5716ca1387?w=400&h=400&fit=crop" },
  { id: 10, name: "ゴブリン", rarity: 3, type: "木属性", imageUrl: "https://images.unsplash.com/photo-1576768350844-c83aecade05d?w=400&h=400&fit=crop" },
];

export function GachaScreen() {
  const [orbs, setOrbs] = useState(500);
  const [showResult, setShowResult] = useState(false);
  const [results, setResults] = useState<Character[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [gachaType, setGachaType] = useState<1 | 10 | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFlying, setIsFlying] = useState(false);

  const orbX = useMotionValue(0);
  const orbY = useMotionValue(0);

  const performGacha = (count: number, cost: number) => {
    if (orbs < cost) {
      alert("オーブが足りません！");
      return;
    }

    setOrbs(orbs - cost);
    setIsAnimating(true);

    const gachaResults: Character[] = [];
    for (let i = 0; i < count; i++) {
      const random = Math.random();
      let selectedCharacter: Character;
      
      if (random < 0.05) {
        // 5% chance for 5-star
        const fiveStars = mockCharacters.filter(c => c.rarity === 5);
        selectedCharacter = fiveStars[Math.floor(Math.random() * fiveStars.length)];
      } else if (random < 0.25) {
        // 20% chance for 4-star
        const fourStars = mockCharacters.filter(c => c.rarity === 4);
        selectedCharacter = fourStars[Math.floor(Math.random() * fourStars.length)];
      } else {
        // 75% chance for 3-star
        const threeStars = mockCharacters.filter(c => c.rarity === 3);
        selectedCharacter = threeStars[Math.floor(Math.random() * threeStars.length)];
      }
      
      gachaResults.push(selectedCharacter);
    }

    setTimeout(() => {
      setIsAnimating(false);
      setResults(gachaResults);
      setShowResult(true);
      setGachaType(null);
      setIsFlying(false);
      orbX.set(0);
      orbY.set(0);
    }, 3000);
  };

  const handleDragEnd = async () => {
    const x = orbX.get();
    const y = orbY.get();
    
    setIsDragging(false);
    
    // Check if user pulled down enough (at least 50px down)
    if (y > 50 && gachaType) {
      // Calculate launch power based on pull distance
      const pullDistance = Math.sqrt(x * x + y * y);
      
      if (pullDistance > 50) {
        setIsFlying(true);
        
        // Animate orb flying to dragon's eye
        // Use the animate API to fly the orb to target position
        const targetY = -400; // Fly up to dragon's eye area
        
        // Create flying animation
        setTimeout(() => {
          const cost = gachaType === 1 ? 50 : 450;
          performGacha(gachaType, cost);
        }, 800);
      } else {
        // Not pulled enough, reset
        setGachaType(null);
      }
    } else {
      // Not pulled enough, reset
      setGachaType(null);
    }
  };

  const handleClose = () => {
    setShowResult(false);
    setResults([]);
  };

  if (showResult) {
    return <GachaResult results={results} onClose={handleClose} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-purple-700 to-pink-600 relative overflow-hidden">
      {/* Animated background stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="absolute bg-white rounded-full animate-pulse"
            style={{
              width: Math.random() * 3 + 1 + "px",
              height: Math.random() * 3 + 1 + "px",
              top: Math.random() * 100 + "%",
              left: Math.random() * 100 + "%",
              animationDelay: Math.random() * 2 + "s",
              animationDuration: Math.random() * 3 + 2 + "s",
            }}
          />
        ))}
      </div>

      {/* Orbs display */}
      <div className="relative z-10 pt-6 px-6 flex justify-between items-center">
        <div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-full border-2 border-yellow-400">
          <Gem className="w-6 h-6 text-yellow-400" />
          <span className="text-white">{orbs}</span>
        </div>
      </div>

      {/* Main content */}
      {!gachaType ? (
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 pb-20">
          {/* Title */}
          <div className="text-center mb-12">
            <h1 className="text-white mb-2 drop-shadow-lg">プレミアムガチャ</h1>
            <p className="text-yellow-300">★5排出率アップ中！</p>
          </div>

          {/* Featured character display */}
          <div className="relative mb-12">
            <div className="w-64 h-64 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-1 animate-pulse">
              <div className="w-full h-full rounded-full bg-gradient-to-br from-purple-900 to-purple-700 flex items-center justify-center overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop"
                  alt="Featured"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <Sparkles className="absolute top-0 right-0 w-12 h-12 text-yellow-300 animate-spin" style={{ animationDuration: '3s' }} />
            <Sparkles className="absolute bottom-0 left-0 w-8 h-8 text-pink-300 animate-spin" style={{ animationDuration: '4s' }} />
          </div>

          {/* Gacha buttons */}
          <div className="space-y-4 w-full max-w-md">
            <button
              onClick={() => {
                if (orbs < 50) {
                  alert("オーブが足りません！");
                  return;
                }
                setGachaType(1);
              }}
              disabled={isAnimating}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-4 rounded-xl shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed border-2 border-blue-300"
            >
              <div className="flex items-center justify-between px-6">
                <span>単発ガチャ</span>
                <div className="flex items-center gap-1">
                  <Gem className="w-5 h-5" />
                  <span>50</span>
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                if (orbs < 450) {
                  alert("オーブが足りません！");
                  return;
                }
                setGachaType(10);
              }}
              disabled={isAnimating}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white py-4 rounded-xl shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed border-2 border-pink-300"
            >
              <div className="flex items-center justify-between px-6">
                <div className="flex flex-col items-start">
                  <span>10連ガチャ</span>
                  <span className="text-yellow-300">★4以上確定！</span>
                </div>
                <div className="flex items-center gap-1">
                  <Gem className="w-5 h-5" />
                  <span>450</span>
                </div>
              </div>
            </button>
          </div>

          {/* Probabilities */}
          <div className="mt-8 bg-black/30 backdrop-blur-sm rounded-lg p-4 text-white max-w-md w-full">
            <p className="text-center mb-2">排出確率</p>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>★★★★★</span>
                <span className="text-yellow-300">5.0%</span>
              </div>
              <div className="flex justify-between">
                <span>★★★★</span>
                <span className="text-purple-300">20.0%</span>
              </div>
              <div className="flex justify-between">
                <span>★★★</span>
                <span className="text-blue-300">75.0%</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen">
          {/* Dragon */}
          <div className="relative w-full max-w-2xl aspect-square mb-32">
            {/* Dragon body */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <svg viewBox="0 0 400 400" className="w-full h-full drop-shadow-2xl">
                {/* Dragon head */}
                <ellipse cx="200" cy="200" rx="150" ry="120" fill="#7C3AED" opacity="0.9" />
                
                {/* Horns */}
                <path d="M 120 140 Q 100 100 110 80 L 120 100 Z" fill="#6D28D9" />
                <path d="M 280 140 Q 300 100 290 80 L 280 100 Z" fill="#6D28D9" />
                
                {/* Eyes (sockets) */}
                <circle cx="160" cy="180" r="35" fill="#1F2937" className="dragon-eye-left" />
                <circle cx="240" cy="180" r="35" fill="#1F2937" className="dragon-eye-right" />
                
                {/* Eye highlights */}
                <circle cx="160" cy="180" r="25" fill="#374151" opacity="0.5" />
                <circle cx="240" cy="180" r="25" fill="#374151" opacity="0.5" />
                
                {/* Glow effect when orb is near */}
                {isDragging && (
                  <>
                    <motion.circle
                      cx="200"
                      cy="180"
                      r="60"
                      fill="none"
                      stroke="#FBBF24"
                      strokeWidth="3"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.8, 1.2, 0.8] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </>
                )}
                
                {/* Nose */}
                <ellipse cx="200" cy="220" rx="20" ry="15" fill="#6D28D9" />
                
                {/* Mouth */}
                <path d="M 160 240 Q 200 260 240 240" stroke="#1F2937" strokeWidth="4" fill="none" strokeLinecap="round" />
                
                {/* Scales/details */}
                <circle cx="140" cy="150" r="8" fill="#6D28D9" opacity="0.7" />
                <circle cx="260" cy="150" r="8" fill="#6D28D9" opacity="0.7" />
                <circle cx="120" cy="200" r="10" fill="#6D28D9" opacity="0.7" />
                <circle cx="280" cy="200" r="10" fill="#6D28D9" opacity="0.7" />
              </svg>
            </motion.div>

            {/* Target indicator */}
            {isDragging && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <div className="relative w-24 h-24">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 border-4 border-yellow-400 border-dashed rounded-full"
                  />
                  <div className="absolute inset-2 border-2 border-yellow-300 rounded-full" />
                  <div className="absolute inset-4 bg-yellow-400/20 rounded-full" />
                </div>
              </motion.div>
            )}
          </div>

          {/* Draggable Orb */}
          <motion.div
            drag
            dragMomentum={false}
            dragElastic={0.1}
            dragConstraints={{ top: -100, bottom: 200, left: -100, right: 100 }}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
            style={{ x: orbX, y: orbY }}
            className="cursor-grab active:cursor-grabbing"
            whileHover={{ scale: 1.1 }}
            whileDrag={{ scale: 1.2 }}
            animate={
              isFlying
                ? {
                    x: 0,
                    y: -500,
                    scale: 0.5,
                    opacity: 0.5,
                  }
                : {}
            }
            transition={
              isFlying
                ? {
                    duration: 0.8,
                    ease: "easeOut",
                  }
                : {}
            }
          >
            <div className="relative w-32 h-32">
              {/* Orb glow */}
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 30px 10px rgba(251, 191, 36, 0.5)",
                    "0 0 50px 20px rgba(251, 191, 36, 0.8)",
                    "0 0 30px 10px rgba(251, 191, 36, 0.5)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-full"
              />
              
              {/* Orb */}
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-yellow-200 via-yellow-400 to-orange-500 shadow-2xl flex items-center justify-center">
                <div className="w-4/5 h-4/5 rounded-full bg-gradient-to-br from-white/40 to-transparent" />
                <div className="absolute top-1/4 left-1/4 w-8 h-8 rounded-full bg-white/60 blur-sm" />
              </div>
            </div>
          </motion.div>

          {/* Slingshot line */}
          {isDragging && (
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: "100%", height: "100%" }}
            >
              <line
                x1="50%"
                y1="50%"
                x2={`calc(50% + ${orbX.get()}px)`}
                y2={`calc(50% + ${orbY.get()}px)`}
                stroke="rgba(251, 191, 36, 0.5)"
                strokeWidth="3"
                strokeDasharray="5,5"
              />
            </svg>
          )}

          {/* Instruction */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-white text-center mt-16"
          >
            {gachaType === 1 ? "オーブを引っ張って離そう！" : "オーブを引っ張って離そう！（10連）"}
          </motion.p>

          {/* Cancel button */}
          <button
            onClick={() => setGachaType(null)}
            className="mt-8 text-white/70 hover:text-white underline"
          >
            キャンセル
          </button>
        </div>
      )}

      {/* Loading overlay */}
      {isAnimating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50"
        >
          {/* Dragon awakening animation */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: [0.5, 1.2, 1], opacity: 1 }}
            transition={{ duration: 1 }}
            className="mb-8"
          >
            <div className="w-48 h-48 relative">
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 40px 20px rgba(251, 191, 36, 0.3)",
                    "0 0 80px 40px rgba(251, 191, 36, 0.6)",
                    "0 0 40px 20px rgba(251, 191, 36, 0.3)",
                  ],
                }}
                transition={{ duration: 1, repeat: Infinity }}
                className="absolute inset-0 rounded-full"
              />
              <svg viewBox="0 0 200 200" className="w-full h-full">
                <ellipse cx="100" cy="100" rx="75" ry="60" fill="#7C3AED" />
                <motion.circle
                  cx="80"
                  cy="90"
                  r="15"
                  fill="#FBBF24"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <motion.circle
                  cx="120"
                  cy="90"
                  r="15"
                  fill="#FBBF24"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              </svg>
            </div>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-white"
          >
            ドラゴンが目覚める...
          </motion.p>
        </motion.div>
      )}
    </div>
  );
}