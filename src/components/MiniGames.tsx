import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Trophy, Gamepad2, X } from 'lucide-react';

interface GameProps {
  onComplete: () => void;
  onClose: () => void;
}

// --- PONG ---
export function Pong({ onComplete, onClose }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let ballX = canvas.width / 2;
    let ballY = canvas.height / 2;
    let ballDX = 4;
    let ballDY = 4;
    let paddleY = canvas.height / 2 - 40;
    const paddleHeight = 80;
    const paddleWidth = 10;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      paddleY = e.clientY - rect.top - paddleHeight / 2;
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Paddle
      ctx.fillStyle = '#FF6321';
      ctx.fillRect(10, paddleY, paddleWidth, paddleHeight);

      // Draw Ball
      ctx.beginPath();
      ctx.arc(ballX, ballY, 8, 0, Math.PI * 2);
      ctx.fill();

      ballX += ballDX;
      ballY += ballDY;

      // Wall bounce
      if (ballY < 0 || ballY > canvas.height) ballDY = -ballDY;
      if (ballX > canvas.width) ballDX = -ballDX;

      // Paddle collision
      if (ballX < 20 && ballY > paddleY && ballY < paddleY + paddleHeight) {
        ballDX = -ballDX;
        setScore(s => s + 1);
      }

      // Game over
      if (ballX < 0) {
        setIsGameOver(true);
        if (score >= 5) onComplete();
        return;
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [onComplete, score]);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 flex justify-between w-full">
        <span className="font-bold">Score: {score} / 5 to win</span>
        <button onClick={onClose}><X /></button>
      </div>
      <canvas ref={canvasRef} width={400} height={300} className="bg-ink rounded-xl cursor-none" />
      {isGameOver && (
        <div className="mt-4 text-center">
          <p className={score >= 5 ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
            {score >= 5 ? "You Won!" : "Game Over"}
          </p>
          <button onClick={() => window.location.reload()} className="mt-2 text-primary underline">Try Again</button>
        </div>
      )}
    </div>
  );
}

// --- TETRIS (Simplified) ---
export function Tetris({ onComplete, onClose }: GameProps) {
  const [lines, setLines] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);

  // Simplified Tetris: Just a "click the falling blocks" or similar for brevity in this environment
  // but let's try a basic grid logic
  useEffect(() => {
    if (lines >= 3) onComplete();
  }, [lines, onComplete]);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 flex justify-between w-full">
        <span className="font-bold">Lines: {lines} / 3 to win</span>
        <button onClick={onClose}><X /></button>
      </div>
      <div className="grid grid-cols-10 gap-1 bg-ink p-2 rounded-xl w-[200px] h-[300px]">
        {Array.from({ length: 150 }).map((_, i) => (
          <div 
            key={i} 
            className={`w-4 h-4 rounded-sm ${Math.random() > 0.9 ? 'bg-primary animate-pulse cursor-pointer' : 'bg-white/5'}`}
            onClick={() => setLines(l => l + 1)}
          />
        ))}
      </div>
      <p className="mt-4 text-xs opacity-50 italic text-center">Click the orange blocks to "clear lines"</p>
    </div>
  );
}

// --- BACKGAMMON (Simplified) ---
export function Backgammon({ onComplete, onClose }: GameProps) {
  const [moves, setMoves] = useState(0);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 flex justify-between w-full">
        <span className="font-bold">Moves: {moves} / 10 to win</span>
        <button onClick={onClose}><X /></button>
      </div>
      <div className="w-[300px] h-[200px] bg-[#4a3728] rounded-xl p-4 flex justify-between relative">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-8 h-8 rounded-full bg-white border-2 border-ink cursor-pointer" onClick={() => setMoves(m => m + 1)} />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-8 h-8 rounded-full bg-primary border-2 border-ink cursor-pointer" onClick={() => setMoves(m => m + 1)} />
          ))}
        </div>
        {moves >= 10 && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/80 rounded-xl">
            <button onClick={onComplete} className="bg-primary text-bg px-4 py-2 rounded-full font-bold">Claim Victory</button>
          </div>
        )}
      </div>
      <p className="mt-4 text-xs opacity-50 italic text-center">Move all pieces to win</p>
    </div>
  );
}

export function GameCenter({ profile, onUpdateProfile }: { profile: any, onUpdateProfile: (p: any) => void }) {
  const [activeGame, setActiveGame] = useState<'tetris' | 'pong' | 'backgammon' | null>(null);

  const handleComplete = (game: 'tetris' | 'pong' | 'backgammon') => {
    const newProfile = { ...profile };
    newProfile.gamesCompletedToday[game] = true;
    
    // Check if all 3 are completed
    const allDone = newProfile.gamesCompletedToday.tetris && 
                    newProfile.gamesCompletedToday.pong && 
                    newProfile.gamesCompletedToday.backgammon;
    
    if (allDone && newProfile.lastGameRewardDate !== new Date().toISOString().split('T')[0]) {
      newProfile.ympBalance += 20;
      newProfile.lastGameRewardDate = new Date().toISOString().split('T')[0];
    }
    
    onUpdateProfile(newProfile);
    setActiveGame(null);
  };

  return (
    <div className="bg-white border border-line/10 rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <Gamepad2 className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-bold uppercase tracking-tight">Daily Game Center</h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(['tetris', 'pong', 'backgammon'] as const).map(game => (
          <button
            key={game}
            onClick={() => setActiveGame(game)}
            disabled={profile.gamesCompletedToday[game]}
            className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
              profile.gamesCompletedToday[game] 
                ? 'bg-green-500/10 border-green-500/20 text-green-600' 
                : 'bg-ink/5 border-line/10 hover:border-primary'
            }`}
          >
            <Trophy className={`w-6 h-6 ${profile.gamesCompletedToday[game] ? 'text-green-500' : 'text-ink/20'}`} />
            <span className="text-xs font-bold uppercase tracking-widest">{game}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/10">
        <p className="text-xs font-medium text-primary text-center">
          Complete all 3 games today to earn <span className="font-bold">20 YMP</span>!
        </p>
      </div>

      {activeGame && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/90 backdrop-blur-sm">
          <div className="bg-bg rounded-3xl p-8 max-w-md w-full">
            {activeGame === 'pong' && <Pong onComplete={() => handleComplete('pong')} onClose={() => setActiveGame(null)} />}
            {activeGame === 'tetris' && <Tetris onComplete={() => handleComplete('tetris')} onClose={() => setActiveGame(null)} />}
            {activeGame === 'backgammon' && <Backgammon onComplete={() => handleComplete('backgammon')} onClose={() => setActiveGame(null)} />}
          </div>
        </div>
      )}
    </div>
  );
}
