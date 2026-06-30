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

// Game Arrays (Particles, Floating Texts, Tap Ripples)
let particles = [];
let floatingTexts = [];
let ripples = []; 

// Screen Shaker Utility
let screenShakeActive = false;
let screenShakeTime = 0;
const screenShakeDuration = 300; // ms
const screenShakeIntensity = 8;

// Sound Controller State
let isMuted = false;
let audioCtx = null;

// ----------------------------------------------------
// 2. FIXED TARGET MAPPED COORDINATES (Derived from 1536x1024 Background image)
// ----------------------------------------------------
const modaks = [
    { id: 1, x: 318, y: 283, radius: 28, collected: false }, // Upper-Left Modak
    { id: 2, x: 307, y: 371, radius: 28, collected: false }, // Bottom-Left Modak
    { id: 3, x: 388, y: 315, radius: 28, collected: false }, // Middle Modak (under butterflies)
    { id: 4, x: 479, y: 313, radius: 28, collected: false }, // Center-Right Modak
    { id: 5, x: 539, y: 264, radius: 28, collected: false }, // Upper-Right Modak
    { id: 6, x: 583, y: 410, radius: 28, collected: false }  // Bottom-Right Modak
];

const distractions = [
    { type: 'snake', x: 615, y: 317, radius: 30 },
    { type: 'stone', x: 190, y: 418, radius: 28 },
    { type: 'stone', x: 432, y: 413, radius: 28 },
    { type: 'stone', x: 719, y: 337, radius: 28 },
    { type: 'leaf',  x: 534, y: 371, radius: 20 },
    { type: 'leaf',  x: 685, y: 391, radius: 20 },
    { type: 'leaf',  x: 552, y: 317, radius: 20 }
];

// ----------------------------------------------------
// 3. IMAGE LOADER
// ----------------------------------------------------
const bgImage = new Image();
bgImage.src = 'assets/Background.png'; // Capital 'B'
let isBgLoaded = false;
bgImage.onload = () => {
    isBgLoaded = true;
};
bgImage.onerror = (err) => {
    console.error("Failed to load background image assets/Background.png", err);
};

// ----------------------------------------------------
// 2. FIXED TARGET MODAK COORDINATES (Perfected for Background Image)
// ----------------------------------------------------
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Bind DOM buttons
document.getElementById('startBtn').addEventListener('click', () => {
    playCorrectSound();
    startGame();
});

document.getElementById('resultScreen').addEventListener('click', () => {
    playCorrectSound();
    showScreen('startScreen');
    gameState = 'start';
});

// ----------------------------------------------------
// 5. AUDIO SYNTHESIZER (Web Audio API)
// ----------------------------------------------------
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

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
    playTone(600, 600, 'triangle', 0.05, 0.08);
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
// 6. CANVAS RESIZING (Device Pixel Ratio)
// ----------------------------------------------------
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(canvas.width / LOGICAL_WIDTH, canvas.height / LOGICAL_HEIGHT);
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 100);

// ----------------------------------------------------
// 7. EFFECT CLASSES (PARTICLES, FLOATING TEXT, RIPPLES)
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
    ripples.push(new Ripple(x, y, 'rgba(251, 191, 36, 0.8)'));
}

function spawnIncorrectBurst(x, y) {
    const colors = ['#ef4444', '#f87171', '#7f1d1d'];
    for (let i = 0; i < 12; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        particles.push(new Particle(x, y, color));
    }
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
    }, 300);
}

// ----------------------------------------------------
// 8. GAME CONTROL FLOW
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

    showScreen('gameScreen');
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
}

function endGame(win) {
    gameState = 'gameover';
    if (gameTimerInterval) clearInterval(gameTimerInterval);

    playGameOverFanfare(win);

    const resultScreen = document.getElementById("resultScreen");
    const resultText = document.getElementById("resultText");

    // Include Final Score on Result Screen in clean text format
    if (win) {
        resultText.innerHTML = `Victory!<br><span style="font-size: 2.2rem; font-weight: 700; margin-top: 15px; display: block; color: #f7e6cc;">Score: ${score}</span>`;
        resultScreen.className = "screen active win-bg";
    } else {
        resultText.innerHTML = `Game Over!<br><span style="font-size: 2.2rem; font-weight: 700; margin-top: 15px; display: block; color: #fcc; opacity: 0.95;">Score: ${score}</span>`;
        resultScreen.className = "screen active lose-bg";
    }

    showScreen("resultScreen");
}

// ----------------------------------------------------
// 9. INPUT DETECTION
// ----------------------------------------------------
function handleTap(clientX, clientY) {
    if (gameState !== 'playing') return;

    const rect = canvas.getBoundingClientRect();
    const clickX = ((clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const clickY = ((clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;

    totalClicks++;
    let hitModak = null;

    // Check if we hit an uncollected Modak (generous 48px hitbox)
    for (let m of modaks) {
        if (!m.collected) {
            const dist = Math.hypot(m.x - clickX, m.y - clickY);
            if (dist <= 48) {
                hitModak = m;
                break;
            }
        }
    }

    if (hitModak) {
        // Correct click!
        hitModak.collected = true;
        correctClicks++;
        score += 100;
        document.getElementById("scoreVal").textContent = score;

        playCorrectSound();
        spawnModakBurst(hitModak.x, hitModak.y);
        floatingTexts.push(new FloatingText(hitModak.x, hitModak.y - 20, "+100", "#fbbf24"));

        // Check victory condition
        const allFound = modaks.every(m => m.collected);
        if (allFound) {
            endGame(true);
        }
    } else {
        // Miss: Check if clicked a distraction
        let hitDistraction = null;
        for (let d of distractions) {
            const dist = Math.hypot(d.x - clickX, d.y - clickY);
            // 48px hit limit for snakes/stones, 40px for leaves
            const limit = (d.type === 'leaf') ? 40 : 48;
            if (dist <= limit) {
                hitDistraction = d;
                break;
            }
        }

        let penaltyLabel = "-50";
        let spawnX = clickX;
        let spawnY = clickY;

        if (hitDistraction) {
            const label = hitDistraction.type.charAt(0).toUpperCase() + hitDistraction.type.slice(1);
            penaltyLabel = `-50 (${label})`;
            spawnX = hitDistraction.x;
            spawnY = hitDistraction.y;
        } else {
            penaltyLabel = "-50 (Miss)";
        }

        score = Math.max(0, score - 50);
        document.getElementById("scoreVal").textContent = score;

        playIncorrectSound();
        spawnIncorrectBurst(spawnX, spawnY);
        triggerScreenShake();
        floatingTexts.push(new FloatingText(spawnX, spawnY - 20, penaltyLabel, "#f87171"));

        mistakes++;
        timeLeft = Math.max(0, timeLeft - 2.0); // Deduct 2 seconds
        document.getElementById("mistakeVal").textContent = `${mistakes} / ${maxMistakes}`;

        if (mistakes >= maxMistakes) {
            endGame(false);
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

// Hover cursor detection
canvas.addEventListener('mousemove', (e) => {
    if (gameState !== 'playing') {
        canvas.style.cursor = 'default';
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const clickY = ((e.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;

    let overInteractive = false;

    for (let m of modaks) {
        if (!m.collected) {
            const dist = Math.hypot(m.x - clickX, m.y - clickY);
            if (dist <= 48) {
                overInteractive = true;
                break;
            }
        }
    }

    canvas.style.cursor = overInteractive ? 'pointer' : 'default';
});

// ----------------------------------------------------
// 10. GAME LOOP & RENDERING
// ----------------------------------------------------
function gameLoop() {
    updateGame();
    drawGame();
    requestAnimationFrame(gameLoop);
}

function updateGame() {
    particles = particles.filter(part => part.update());
    floatingTexts = floatingTexts.filter(txt => txt.update());
    ripples = ripples.filter(rip => rip.update());
}

function drawGame() {
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 1. Draw Background Image
    if (isBgLoaded) {
        ctx.drawImage(bgImage, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    } else {
        ctx.fillStyle = '#0b0f19';
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Poppins';
        ctx.fillText('Loading background...', 80, 250);
    }

    // 2. Draw Collected Indicators (Checkmarks) over the found Modaks
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
}

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

    // Checkmark tick
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

// ----------------------------------------------------
// 11. INITIALIZATION
// ----------------------------------------------------
requestAnimationFrame(gameLoop);

// Show start screen on boot
showScreen('startScreen');

window.onload = () => {
    resizeCanvas();
};
