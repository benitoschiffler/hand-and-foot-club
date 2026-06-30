import { useEffect, useRef } from "react";

interface CardState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rank: string;
  suit: string;
  color: string;
  done: boolean;
}

interface ConfettiState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  shape: "circle" | "rect" | "triangle";
  alpha: number;
}

const SUITS = [
  { symbol: "♣", color: "#111827" }, // Spades/Clubs dark gray
  { symbol: "♦", color: "#ef4444" }, // Diamonds red
  { symbol: "♥", color: "#ef4444" }, // Hearts red
  { symbol: "♠", color: "#111827" }, // Spades dark gray
  { symbol: "★", color: "#d97706" }, // Joker gold
];

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "Jkr"];
const CONFETTI_COLORS = ["#ff007f", "#ff00ff", "#7f00ff", "#0000ff", "#007fff", "#00ffff", "#00ff7f", "#00ff00", "#7fff00", "#ffff00", "#ff7f00", "#ff0000"];

export function VictoryCelebration() {
  const cardsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cardsCanvas = cardsCanvasRef.current;
    const confettiCanvas = confettiCanvasRef.current;
    if (!cardsCanvas || !confettiCanvas) return;

    const cardsCtx = cardsCanvas.getContext("2d");
    const confettiCtx = confettiCanvas.getContext("2d");
    if (!cardsCtx || !confettiCtx) return;

    let animationFrameId: number;
    let width = (cardsCanvas.width = confettiCanvas.width = window.innerWidth);
    let height = (cardsCanvas.height = confettiCanvas.height = window.innerHeight);

    // Handle resizing
    const handleResize = () => {
      width = cardsCanvas.width = confettiCanvas.width = window.innerWidth;
      height = cardsCanvas.height = confettiCanvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const CARD_WIDTH = 80;
    const CARD_HEIGHT = 120;
    const GRAVITY = 0.28;
    const BOUNCE = 0.85;

    // Define 4 piles across the screen
    const getPiles = () => [
      { x: width * 0.2, y: 100, dir: 1 },
      { x: width * 0.4, y: 100, dir: -1 },
      { x: width * 0.6, y: 100, dir: 1 },
      { x: width * 0.8, y: 100, dir: -1 },
    ];

    let piles = getPiles();
    let activeCards: CardState[] = [];
    let confetti: ConfettiState[] = [];

    // Card spawning controller
    let frameCount = 0;
    let currentPileIdx = 0;
    let cardsSpawnedCount = 0;
    const maxCards = 120; // limit total cards spawned to prevent performance issues

    const spawnCard = () => {
      if (cardsSpawnedCount >= maxCards) return;

      const pile = piles[currentPileIdx];
      const suitObj = SUITS[Math.floor(Math.random() * SUITS.length)];
      const rank = RANKS[Math.floor(Math.random() * RANKS.length)];

      activeCards.push({
        x: pile.x - CARD_WIDTH / 2,
        y: pile.y,
        vx: (Math.random() * 4 + 1.5) * pile.dir,
        vy: -Math.random() * 3 - 2, // Slight upward push
        rank,
        suit: suitObj.symbol,
        color: suitObj.color,
        done: false,
      });

      cardsSpawnedCount++;
      currentPileIdx = (currentPileIdx + 1) % piles.length;
    };

    // Confetti spawning helper
    const spawnConfettiBurst = (x: number, y: number, count: number, angleRange: [number, number]) => {
      for (let i = 0; i < count; i++) {
        const angle = angleRange[0] + Math.random() * (angleRange[1] - angleRange[0]);
        const speed = Math.random() * 15 + 8;
        confetti.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          size: Math.random() * 10 + 6,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.2,
          shape: ["circle", "rect", "triangle"][Math.floor(Math.random() * 3)] as any,
          alpha: 1,
        });
      }
    };

    // Spawn initial bursts
    spawnConfettiBurst(0, height, 80, [-Math.PI / 6, -Math.PI / 3]); // Bottom-left shooting up-right
    spawnConfettiBurst(width, height, 80, [-Math.PI * 2 / 3, -Math.PI * 5 / 6]); // Bottom-right shooting up-left

    const drawCard = (ctx: CanvasRenderingContext2D, card: CardState) => {
      const { x, y, rank, suit, color } = card;
      const radius = 8;

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;

      // Draw white card body
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, CARD_WIDTH, CARD_HEIGHT, radius);
      } else {
        // Fallback for older browsers
        ctx.rect(x, y, CARD_WIDTH, CARD_HEIGHT);
      }
      ctx.fill();

      // Border
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#d1d5db";
      ctx.stroke();

      // Content styling
      ctx.fillStyle = color;
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      // Top Left Corner
      ctx.fillText(rank, x + 6, y + 6);
      ctx.fillText(suit, x + 6, y + 22);

      // Bottom Right Corner (inverted)
      ctx.save();
      ctx.translate(x + CARD_WIDTH - 6, y + CARD_HEIGHT - 6);
      ctx.rotate(Math.PI);
      ctx.fillText(rank, 0, 0);
      ctx.fillText(suit, 0, 16);
      ctx.restore();

      // Giant center suit symbol
      ctx.font = "bold 44px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(suit, x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2);

      ctx.restore();
    };

    const loop = () => {
      frameCount++;

      // Resize checking in loop just in case
      piles = getPiles();

      // 1. Spawn a card every 8 frames
      if (frameCount % 8 === 0) {
        spawnCard();
      }

      // 2. Spawn continuous light floaters
      if (Math.random() < 0.15) {
        confetti.push({
          x: Math.random() * width,
          y: -10,
          vx: (Math.random() - 0.5) * 2,
          vy: Math.random() * 3 + 2,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          size: Math.random() * 8 + 4,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.1,
          shape: ["circle", "rect", "triangle"][Math.floor(Math.random() * 3)] as any,
          alpha: 0.9,
        });
      }

      // Periodically trigger smaller corner bursts to keep excitement going
      if (frameCount % 180 === 0) {
        spawnConfettiBurst(0, height, 30, [-Math.PI / 6, -Math.PI / 3]);
        spawnConfettiBurst(width, height, 30, [-Math.PI * 2 / 3, -Math.PI * 5 / 6]);
      }

      // 3. Update & Render Cards (Bottom Canvas)
      // Note: We do NOT clear the cards canvas background, creating the solitaire trail.
      activeCards.forEach((card) => {
        if (card.done) return;

        // Apply physics
        card.vy += GRAVITY;
        card.x += card.vx;
        card.y += card.vy;

        // Bounce on bottom
        if (card.y + CARD_HEIGHT >= height) {
          card.y = height - CARD_HEIGHT;
          card.vy = -card.vy * BOUNCE;
        }

        // Render card at its new position
        drawCard(cardsCtx, card);

        // Mark as done when going off-screen left/right
        if (card.x + CARD_WIDTH < -50 || card.x > width + 50) {
          card.done = true;
        }
      });

      // 4. Update & Render Confetti (Top Canvas)
      confettiCtx.clearRect(0, 0, width, height);
      confetti = confetti.filter((p) => {
        p.vy += 0.1; // gentle gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.alpha -= 0.005; // slowly fade out

        if (p.y > height + 20 || p.alpha <= 0) return false;

        confettiCtx.save();
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate(p.rotation);
        confettiCtx.globalAlpha = p.alpha;
        confettiCtx.fillStyle = p.color;

        if (p.shape === "circle") {
          confettiCtx.beginPath();
          confettiCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          confettiCtx.fill();
        } else if (p.shape === "rect") {
          confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size / 2);
        } else {
          // Triangle
          confettiCtx.beginPath();
          confettiCtx.moveTo(0, -p.size / 2);
          confettiCtx.lineTo(p.size / 2, p.size / 2);
          confettiCtx.lineTo(-p.size / 2, p.size / 2);
          confettiCtx.closePath();
          confettiCtx.fill();
        }

        confettiCtx.restore();
        return true;
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      <canvas ref={cardsCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <canvas ref={confettiCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}
