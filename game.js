// Modak Focus Challenge - Core Game Script (Fixed Targets & High UX Mode)

// ----------------------------------------------------
// 1. STATE & VARIABLES
// ----------------------------------------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Logical coordinates (internally scaled to fit screen)
const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 500;

// Game State Variables
let gameState = 'start'; // 'start', 'playing', 'gameover'
let score = 0;
let totalClicks = 0;
let correctClicks = 0;
let mistakes = 0;
const maxMistakes = 3;
let timeLeft = 30.0; // seconds
let gameTimerInterval = null;

// Game Arrays
let particles = [];
let floatingTexts = [];
let ripples = []; // Tap feedback expanding rings

// Screen Shaker Utility
let screenShakeActive = false;
let screenShakeTime = 0;
const screenShakeDuration = 300; // ms
const screenShakeIntensity = 8;

// Sound Controller State
let isMuted = false;
let audioCtx = null;

// Background Image
const bgImage = new Image();
bgImage.src = 'assets/background.png';
let isBgLoaded = false;
bgImage.onload = () => {
    isBgLoaded = true;
};

// High score stored locally
let highScore = localStorage.getItem("modak_high_score") || 0;

// ----------------------------------------------------
// 2. FIXED TARGET MODAK COORDINATES (Perfected for Background Image)
// ----------------------------------------------------
let modaks = [
    { id: 1, x: 375, y: 270, radius: 28, collected: false }, // Upper-Left Modak (near leaf)
    { id: 2, x: 615, y: 285, radius: 28, collected: false }, // Upper-Right Modak (near stone)
    { id: 3, x: 525, y: 328, radius: 28, collected: false }, // Middle Modak (under butterflies)
    { id: 4, x: 340, y: 390, radius: 28, collected: false }, // Lower-Left Modak (near squirrel)
    { id: 5, x: 722, y: 382, radius: 28, collected: false }  // Lower-Right Modak (near flower)
];

// Start button coordinates (green "START GAME" button printed on background image)
const startButtonBox = { xMin: 50, xMax: 230, yMin: 360, yMax: 410 };

// Play Again button coordinates drawn on Game Over canvas
const playAgainButtonBox = { xMin: 450, xMax: 630, yMin: 288, yMax: 333 };

// ----------------------------------------------------
// 3. AUDIO SYNTHESIZER (Web Audio API)
// ----------------------------------------------------
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Sound generator helper
function playTone(freqStart, freqEnd, type, duration, volume = 0.1) {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;

    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, audioCtx.currentTime);
        if (freqEnd !== freqStart) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + duration);
        }

        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.warn("Audio Context failed to play tone:", e);
    }
}

function playCorrectSound() {
    playTone(523.25, 1046.50, 'sine', 0.15, 0.15);
    setTimeout(() => {
        playTone(783.99, 1318.51, 'sine', 0.20, 0.10);
    }, 60);
}

function playIncorrectSound() {
    playTone(180, 80, 'sawtooth', 0.35, 0.20);
}

function playTickSound() {
    playTone(600, 600, 'triangle', 0.05, 0.10);
}

function playGameOverFanfare(isWin) {
    if (isWin) {
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
        notes.forEach((f, i) => {
            setTimeout(() => playTone(f, f * 1.05, 'triangle', 0.3, 0.12), i * 100);
        });
    } else {
        const notes = [392.00, 311.13, 261.63, 196.00];
        notes.forEach((f, i) => {
            setTimeout(() => playTone(f, f * 0.9, 'sawtooth', 0.4, 0.15), i * 150);
        });
    }
}

function toggleMute() {
    isMuted = !isMuted;
    const muteBtn = document.getElementById("muteBtn");
    muteBtn.textContent = isMuted ? "🔇" : "🔊";
    localStorage.setItem("modak_muted", isMuted ? "true" : "false");
    initAudio();
}

if (localStorage.getItem("modak_muted") === "true") {
    isMuted = true;
    document.getElementById("muteBtn").textContent = "🔇";
}

// ----------------------------------------------------
// 4. CANVAS RESIZING (Device Pixel Ratio)
// ----------------------------------------------------
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = (rect.width * (LOGICAL_HEIGHT / LOGICAL_WIDTH)) * dpr;
    canvas.style.height = `${rect.width * (LOGICAL_HEIGHT / LOGICAL_WIDTH)}px`;

    ctx.scale(canvas.width / LOGICAL_WIDTH, canvas.height / LOGICAL_HEIGHT);
}
window.addEventListener('resize', resizeCanvas);

// Initialize resize on script load
setTimeout(resizeCanvas, 100);

// ----------------------------------------------------
// 5. EFFECT CLASSES (PARTICLES, FLOATING TEXT, RIPPLES)
// ----------------------------------------------------
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = (Math.random() - 0.5) * 6 - 2;
        this.radius = Math.random() * 4 + 2;
        this.color = color;
        this.alpha = 1;
        this.decay = 0.02 + Math.random() * 0.02;
        this.gravity = 0.08;
    }

    update() {
        this.x += this.vx;
        this.vy += this.gravity;
        this.y += this.vy;
        this.alpha -= this.decay;
        return this.alpha > 0;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.restore();
    }
}

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.vy = -1.2;
        this.alpha = 1;
    }

    update() {
        this.y += this.vy;
        this.alpha -= 0.022;
        return this.alpha > 0;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 24px Poppins';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

class Ripple {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.radius = 5;
        this.maxRadius = 55;
        this.alpha = 1.0;
        this.color = color;
    }

    update() {
        this.radius += 3.0;
        this.alpha -= 0.06;
        return this.alpha > 0;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

function spawnModakBurst(x, y) {
    const colors = ['#fbbf24', '#f59e0b', '#ffffff', '#fef08a'];
    for (let i = 0; i < 20; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        particles.push(new Particle(x, y, color));
    }
    // Add expanding gold ripple
    ripples.push(new Ripple(x, y, 'rgba(251, 191, 36, 0.8)'));
}

function spawnIncorrectBurst(x, y) {
    const colors = ['#ef4444', '#f87171', '#7f1d1d'];
    for (let i = 0; i < 12; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        particles.push(new Particle(x, y, color));
    }
    // Add expanding red ripple
    ripples.push(new Ripple(x, y, 'rgba(239, 68, 68, 0.85)'));
}

function triggerScreenShake() {
    screenShakeActive = true;
    const gameScreen = document.getElementById("gameScreen");
    gameScreen.classList.remove("shake-screen");
    void gameScreen.offsetWidth; // Reflow
    gameScreen.classList.add("shake-screen");
    
    setTimeout(() => {
        gameScreen.classList.remove("shake-screen");
        screenShakeActive = false;
    }, 350);
}

// ----------------------------------------------------
// 6. GAME CONTROL FLOW
// ----------------------------------------------------

function startGame() {
    initAudio();
    gameState = 'playing';

    score = 0;
    mistakes = 0;
    timeLeft = 30.0;
    totalClicks = 0;
    correctClicks = 0;
    particles = [];
    floatingTexts = [];
    ripples = [];
    
    modaks.forEach(m => m.collected = false);

    document.getElementById("scoreVal").textContent = score;
    document.getElementById("mistakeVal").textContent = `0 / ${maxMistakes}`;
    document.getElementById("timerVal").textContent = `${timeLeft.toFixed(1)}s`;
    
    const progressFill = document.getElementById("timerProgress");
    progressFill.style.width = '100%';
    progressFill.className = 'progress-bar-fill';

    resizeCanvas();

    if (gameTimerInterval) clearInterval(gameTimerInterval);
    
    let lastTime = Date.now();
    gameTimerInterval = setInterval(() => {
        if (gameState !== 'playing') return;

        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        lastTime = now;

        timeLeft -= elapsed;

        if (timeLeft <= 0) {
            timeLeft = 0;
            endGame(false);
        }

        document.getElementById("timerVal").textContent = `${timeLeft.toFixed(1)}s`;
        const pct = Math.max(0, (timeLeft / 30.0) * 100);
        progressFill.style.width = `${pct}%`;

        if (timeLeft <= 6 && timeLeft > 3) {
            progressFill.className = 'progress-bar-fill warning';
        } else if (timeLeft <= 3) {
            progressFill.className = 'progress-bar-fill critical';
        } else {
            progressFill.className = 'progress-bar-fill';
        }

        if (timeLeft <= 5 && timeLeft > 0) {
            const tickCheck = Math.floor(timeLeft);
            if (!this.lastTickSec || this.lastTickSec !== tickCheck) {
                playTickSound();
                this.lastTickSec = tickCheck;
            }
        }
    }, 100);

    requestAnimationFrame(gameLoop);
}

// ----------------------------------------------------
// 7. INPUT DETECT HANDLING (WITH GENEROUS HITBOXES)
// ----------------------------------------------------

function handleTap(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const clickX = ((clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const clickY = ((clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;

    // A. Start Screen Menu clicks
    if (gameState === 'start') {
        if (clickX >= startButtonBox.xMin && clickX <= startButtonBox.xMax &&
            clickY >= startButtonBox.yMin && clickY <= startButtonBox.yMax) {
            playCorrectSound();
            startGame();
        }
        return;
    }

    // B. Game Over Screen Restart clicks
    if (gameState === 'gameover') {
        if (clickX >= playAgainButtonBox.xMin && clickX <= playAgainButtonBox.xMax &&
            clickY >= playAgainButtonBox.yMin && clickY <= playAgainButtonBox.yMax) {
            playCorrectSound();
            startGame();
        }
        return;
    }

    // C. Active Game clicks
    if (gameState === 'playing') {
        totalClicks++;
        let hitModak = null;

        // Check distance to Modaks - increased hit sensitivity to 55px radius for better mobile/mouse responsiveness
        for (let m of modaks) {
            const dist = Math.hypot(m.x - clickX, m.y - clickY);
            if (dist <= 55) {
                hitModak = m;
                break;
            }
        }

        if (hitModak) {
            if (!hitModak.collected) {
                // Correct tap!
                hitModak.collected = true;
                correctClicks++;
                score += 100;
                document.getElementById("scoreVal").textContent = score;

                // Play correct sound & spawn sparkles
                playCorrectSound();
                spawnModakBurst(hitModak.x, hitModak.y);
                floatingTexts.push(new FloatingText(hitModak.x, hitModak.y - 15, "+100", "#fbbf24"));

                // Check victory condition
                const allFound = modaks.every(m => m.collected);
                if (allFound) {
                    endGame(true);
                }
            }
        } else {
            // Mistake check (Only penalize garden area clicks, avoiding left panel)
            if (clickX > 280) {
                score = Math.max(0, score - 50);
                document.getElementById("scoreVal").textContent = score;

                playIncorrectSound();
                spawnIncorrectBurst(clickX, clickY);
                triggerScreenShake();
                floatingTexts.push(new FloatingText(clickX, clickY - 15, "-50", "#f87171"));

                mistakes++;
                timeLeft = Math.max(0, timeLeft - 2.0); // Deduct 2 seconds
                document.getElementById("mistakeVal").textContent = `${mistakes} / ${maxMistakes}`;

                if (mistakes >= maxMistakes) {
                    endGame(false);
                }
            }
        }
    }
}

// Mouse Down
canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handleTap(e.clientX, e.clientY);
});

// Touch Start
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
        handleTap(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: false });

// ----------------------------------------------------
// 8. HOVER UX CURSOR DETECTION
// ----------------------------------------------------
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const clickY = ((e.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;

    let overInteractive = false;

    if (gameState === 'start') {
        if (clickX >= startButtonBox.xMin && clickX <= startButtonBox.xMax &&
            clickY >= startButtonBox.yMin && clickY <= startButtonBox.yMax) {
            overInteractive = true;
        }
    } else if (gameState === 'gameover') {
        if (clickX >= playAgainButtonBox.xMin && clickX <= playAgainButtonBox.xMax &&
            clickY >= playAgainButtonBox.yMin && clickY <= playAgainButtonBox.yMax) {
            overInteractive = true;
        }
    } else if (gameState === 'playing') {
        // Hover pointer on uncollected Modaks
        for (let m of modaks) {
            if (!m.collected) {
                const dist = Math.hypot(m.x - clickX, m.y - clickY);
                if (dist <= 55) {
                    overInteractive = true;
                    break;
                }
            }
        }
    }

    canvas.style.cursor = overInteractive ? 'pointer' : 'default';
});

// ----------------------------------------------------
// 9. GAME LOOP & RENDERING
// ----------------------------------------------------

function gameLoop() {
    updateGame();
    drawGame();
    requestAnimationFrame(gameLoop);
}

function updateGame() {
    // Update particles
    particles = particles.filter(part => part.update());

    // Update floating texts
    floatingTexts = floatingTexts.filter(txt => txt.update());

    // Update ripples
    ripples = ripples.filter(rip => rip.update());
}

function drawGame() {
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 1. Draw Background Image
    if (isBgLoaded) {
        ctx.drawImage(bgImage, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Poppins';
        ctx.fillText('Loading background...', 100, 250);
    }

    // 2. Draw Subtle Target Guides (pulsing gold circles) around uncollected Modaks
    if (gameState === 'playing') {
        modaks.forEach(m => {
            if (!m.collected) {
                ctx.save();
                ctx.translate(m.x, m.y);
                // Pulse gold circle effect
                const pulseAlpha = 0.22 + Math.sin(Date.now() * 0.005) * 0.08;
                ctx.strokeStyle = `rgba(251, 191, 36, ${pulseAlpha})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(0, 0, 28, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        });
    }

    // 3. Draw Found Indicators (green spinning ring and checkmark)
    if (gameState === 'playing' || gameState === 'gameover') {
        modaks.forEach(m => {
            if (m.collected) {
                drawCollectedIndicator(m.x, m.y);
            }
        });
    }

    // 4. Render Particles, Floating Text & Tap Ripples
    ripples.forEach(rip => rip.draw());
    particles.forEach(part => part.draw());
    floatingTexts.forEach(txt => txt.draw());

    // 5. Render Game Over Summary Card
    if (gameState === 'gameover') {
        drawGameOverCard();
    }
}

// Draw a beautiful rotating checkmark indicator over found Modaks
function drawCollectedIndicator(x, y) {
    ctx.save();
    ctx.translate(x, y);

    // Rotating green dashed outline
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 32, Date.now() * 0.002, Date.now() * 0.002 + Math.PI * 2);
    ctx.stroke();

    // Solid inner green circle
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
    ctx.fill();

    // Symmetrical Checkmark tick
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-2, 4);
    ctx.lineTo(6, -5);
    ctx.stroke();
    
    ctx.restore();
}

// Draw Summary panel on Canvas (Game Over screen)
function drawGameOverCard() {
    const cardX = 420;
    const cardY = 100;
    const cardW = 300;
    const cardH = 280;

    ctx.save();

    // Drop shadow
    ctx.shadowBlur = 25;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    
    // Glassmorphic panel body
    ctx.fillStyle = 'rgba(30, 27, 75, 0.88)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
    ctx.lineWidth = 2.5;
    
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 20);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    ctx.textAlign = 'center';
    
    const win = modaks.every(m => m.collected);
    
    // Card Title
    ctx.font = 'bold 28px Poppins';
    if (win) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('VICTORY!', cardX + cardW/2, cardY + 50);
    } else if (mistakes >= maxMistakes) {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('OUT OF LIVES!', cardX + cardW/2, cardY + 50);
    } else {
        ctx.fillStyle = '#f59e0b';
        ctx.fillText("TIME'S UP!", cardX + cardW/2, cardY + 50);
    }

    // Subtitle
    ctx.font = '500 13px Poppins';
    ctx.fillStyle = '#cbd5e1';
    const subtext = win ? "Superb selective attention!" : "Filter out the distractions!";
    ctx.fillText(subtext, cardX + cardW/2, cardY + 75);

    // Separator Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 25, cardY + 95);
    ctx.lineTo(cardX + cardW - 25, cardY + 95);
    ctx.stroke();

    // stats list
    ctx.textAlign = 'left';
    ctx.font = '600 15px Poppins';
    ctx.fillStyle = '#94a3b8';
    
    ctx.fillText("Final Score:", cardX + 35, cardY + 130);
    ctx.fillText("Accuracy:", cardX + 35, cardY + 160);
    ctx.fillText("High Score:", cardX + 35, cardY + 190);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(score.toString(), cardX + cardW - 35, cardY + 130);
    
    let accuracy = 100;
    if (totalClicks > 0) {
        accuracy = Math.round((correctClicks / totalClicks) * 100);
    }
    ctx.fillText(`${accuracy}%`, cardX + cardW - 35, cardY + 160);
    ctx.fillText(highScore.toString(), cardX + cardW - 35, cardY + 190);

    // Button metrics
    const btnX = playAgainButtonBox.xMin;
    const btnY = playAgainButtonBox.yMin;
    const btnW = playAgainButtonBox.xMax - playAgainButtonBox.xMin;
    const btnH = playAgainButtonBox.yMax - playAgainButtonBox.yMin;

    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrad.addColorStop(0, '#fbbf24');
    btnGrad.addColorStop(1, '#d97706');
    
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 12);
    ctx.fillStyle = btnGrad;
    ctx.fill();
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px Poppins';
    ctx.fillText('🔄 PLAY AGAIN', btnX + btnW/2, btnY + btnH/2 + 5.5);

    ctx.restore();
}

// ----------------------------------------------------
// 10. GAME OVER CONTROL STATE
// ----------------------------------------------------
function endGame(win) {
    gameState = 'gameover';
    if (gameTimerInterval) clearInterval(gameTimerInterval);

    let newBest = false;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem("modak_high_score", highScore);
        document.getElementById("highScoreVal").textContent = highScore;
        newBest = true;
    }

    playGameOverFanfare(win || newBest);
}

// ----------------------------------------------------
// 11. INITIALIZATION & KICK-OFF
// ----------------------------------------------------
requestAnimationFrame(gameLoop);
window.onload = () => {
    resizeCanvas();
};