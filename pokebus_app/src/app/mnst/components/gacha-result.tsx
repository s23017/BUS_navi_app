import { motion } from "motion/react";
import { X } from "lucide-react";

interface Character {
  id: number;
  name: string;
  rarity: number;
  type: string;
  imageUrl: string;
}

interface GachaResultProps {
  results: Character[];
  onClose: () => void;
}

export function GachaResult({ results, onClose }: GachaResultProps) {
  const getRarityColor = (rarity: number) => {
    switch (rarity) {
      case 5:
        return "from-yellow-400 via-orange-500 to-pink-600";
      case 4:
        return "from-purple-400 via-purple-500 to-purple-600";
      case 3:
        return "from-blue-400 via-blue-500 to-blue-600";
      default:
        return "from-gray-400 via-gray-500 to-gray-600";
    }
  };

  const getRarityStars = (rarity: number) => {
    return "★".repeat(rarity);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-800 to-pink-700 relative overflow-hidden">
      {/* Fireworks effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-yellow-300"
            initial={{
              x: "50%",
              y: "50%",
              scale: 0,
              opacity: 1,
            }}
            animate={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              scale: [0, 1, 0],
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: 2,
              delay: i * 0.1,
              ease: "easeOut",
            }}
          />
        ))}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full p-3 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Results */}
      <div className="relative z-10 px-6 py-12">
        <motion.h2
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-white text-center mb-8 drop-shadow-lg"
        >
          召喚結果
        </motion.h2>

        <div className={`grid ${results.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'} gap-4 max-w-7xl mx-auto`}>
          {results.map((character, index) => (
            <motion.div
              key={`${character.id}-${index}`}
              initial={{ scale: 0, rotateY: 180, opacity: 0 }}
              animate={{ scale: 1, rotateY: 0, opacity: 1 }}
              transition={{
                duration: 0.6,
                delay: index * 0.2,
                type: "spring",
                stiffness: 100,
              }}
              className="relative"
            >
              <div
                className={`bg-gradient-to-br ${getRarityColor(
                  character.rarity
                )} p-1 rounded-lg shadow-2xl`}
              >
                <div className="bg-gray-900 rounded-lg overflow-hidden">
                  {/* Character image */}
                  <div className="aspect-square overflow-hidden">
                    <img
                      src={character.imageUrl}
                      alt={character.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Character info */}
                  <div className="p-3 text-center">
                    <div className="text-yellow-300 mb-1">
                      {getRarityStars(character.rarity)}
                    </div>
                    <p className="text-white mb-1">{character.name}</p>
                    <p className="text-gray-300">{character.type}</p>
                  </div>
                </div>
              </div>

              {/* Special glow for 5-star */}
              {character.rarity === 5 && (
                <motion.div
                  className="absolute inset-0 rounded-lg"
                  animate={{
                    boxShadow: [
                      "0 0 20px rgba(251, 191, 36, 0.5)",
                      "0 0 40px rgba(251, 191, 36, 0.8)",
                      "0 0 20px rgba(251, 191, 36, 0.5)",
                    ],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Continue button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: results.length * 0.2 + 0.5 }}
          className="text-center mt-12"
        >
          <button
            onClick={onClose}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-12 py-4 rounded-full shadow-lg transform hover:scale-105 transition-all"
          >
            もう一度引く
          </button>
        </motion.div>
      </div>
    </div>
  );
}
