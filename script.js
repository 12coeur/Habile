// ====================== VARIABLES GLOBALES ======================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let WIDTH, HEIGHT, scaleFactor = 1;
let userScale = 1;

let ball = { x: 0, y: 0, vx: 0, vy: 0, radius: 40, mass: 1, visible: false, alpha: 1 };
let holes = [];
let spring = { x: 0, y: 0, length: 0, maxLength: 0, pulled: 0, disappearing: false, alpha: 1, width: 80 };
let tilt = { x: 0, y: 0 };
let score = 0;
let timeLeft = 300;
let gameRunning = false;
let ballLaunched = false;

let difficulty = 5;
let reboundSens = 1;
let tiltSens = 1.5;
let numHoles = 4;
let maxDuration = 300;

let images = {};
let sounds = {};
let keys = {};
let lastTime = 0;
let animationFrame;
let isDragging = false;

// ====================== MENU ======================
const hamburger = document.getElementById('hamburger');
const menuContent = document.getElementById('menu-content');

hamburger.addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    menuContent.classList.toggle('show');
});

document.getElementById('startBtn').addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    menuContent.classList.remove('show');
});

document.getElementById('applyBtn').addEventListener('click', (e) => {
    e.stopImmediatePropagation();

    difficulty = parseFloat(document.getElementById('diff').value);
    numHoles = parseInt(document.getElementById('holes').value);
    reboundSens = parseFloat(document.getElementById('rebound').value);
    tiltSens = parseFloat(document.getElementById('tiltSens').value);
    ball.mass = parseFloat(document.getElementById('mass').value);
    maxDuration = parseFloat(document.getElementById('duration').value) * 60;
    userScale = parseFloat(document.getElementById('scale').value || 1);

    score = 0;
    timeLeft = maxDuration;
    document.getElementById('scoreValue').textContent = 0;
    document.getElementById('timeValue').textContent = Math.ceil(timeLeft);

    generateHoles(numHoles);
    resetBall();

    menuContent.classList.remove('show');
    console.log("✅ Paramètres appliqués");
});

// ====================== CHARGEMENT ASSETS ======================
function loadAssets() {
    const imgNames = ['ressort', 'trou', 'bille', 'troubord', 'trourelief', 'tapisoblond', 'tapisoblondbord'];
    imgNames.forEach(name => {
        images[name] = new Image();
        images[name].onload = () => console.log(`✅ Image chargée : ${name}.png`);
        images[name].onerror = () => console.error(`❌ Erreur image : images/${name}.png`);
        images[name].src = `images/${name}.png`;
    });

    const soundFiles = { plouf: 'sons/plouf.wav', end: 'sons/applaudissements.mp3', ding: 'sons/dingding.mp3' };
    Object.keys(soundFiles).forEach(key => {
        sounds[key] = new Audio(soundFiles[key]);
        sounds[key].preload = 'auto';
        sounds[key].load();
    });
}

// ====================== RESIZE ======================
function resize() {
    let winW = window.innerWidth;
    let winH = window.innerHeight;

    const ratio = 9 / 16;
    let gameHeight = winH;
    let gameWidth = Math.floor(gameHeight * ratio);

    if (gameWidth > winW) {
        gameWidth = winW;
        gameHeight = Math.floor(gameWidth / ratio);
    }

    canvas.width = gameWidth;
    canvas.height = gameHeight;

    const offsetX = winW - gameWidth;
    canvas.style.position = 'absolute';
    canvas.style.left = offsetX + 'px';
    canvas.style.top = '0px';

    WIDTH = gameWidth;
    HEIGHT = gameHeight;

    scaleFactor = Math.min(WIDTH / 900, HEIGHT / 1600) * 0.92 * userScale;

    spring.x = WIDTH * 0.88;
    spring.y = HEIGHT * 0.80;
    spring.maxLength = HEIGHT * 0.155;
    spring.length = spring.maxLength;
    spring.width = ball.radius * 2;

    generateHoles(numHoles);
    resetBall();
}

// ====================== HOLES ======================
function isTooClose(x, y) {
    return holes.some(h => Math.hypot(x - h.x, y - h.y) < 110);
}

function isTooCloseToSpring(x, y) {
    return Math.hypot(x - spring.x, y - spring.y) < 220;
}

function generateHoles(count) {
    holes = [];
    const margin = 100;
    for (let i = 0; i < count; i++) {
        let attempts = 0, hx, hy;
        do {
            hx = margin + Math.random() * (WIDTH - 2 * margin);
            hy = margin + Math.random() * (HEIGHT - 2 * margin);
            attempts++;
        } while ((isTooClose(hx, hy) || isTooCloseToSpring(hx, hy)) && attempts < 60);

        holes.push({ x: hx, y: hy, radius: 35, bourrelet: difficulty, eaten: false });
    }
}

function playSound(name) {
    if (sounds[name]) sounds[name].play().catch(() => {});
}

function checkAllHolesBlocked() {
    if (holes.every(h => h.eaten)) {
        score += 500 + Math.floor(difficulty * 100);
        document.getElementById('scoreValue').textContent = score;
        playSound('ding');
        holes.forEach(h => h.eaten = false);
    }
}

// ====================== PHYSIQUE ======================
function updatePhysics(delta) {
    if (!gameRunning || !ball.visible) return;

    if (spring.disappearing && spring.alpha > 0) {
        spring.alpha -= delta * 5;
        if (spring.alpha < 0) spring.alpha = 0;
    }

    if (ballLaunched) {
        const gx = tilt.x * tiltSens * 0.3;
        const gy = tilt.y * tiltSens * 0.3;
        ball.vx += gx * delta * 60;
        ball.vy += gy * delta * 60;
    }

    if (!('ontouchstart' in window) && spring.disappearing) ball.vy += 0.08;

    ball.vx *= 0.985;
    ball.vy *= 0.985;
    ball.x += ball.vx * delta * 60;
    ball.y += ball.vy * delta * 60;

    // Rebond bord elliptique
    const cx = WIDTH / 2, cy = HEIGHT / 2;
    const a = WIDTH * 0.45, b = HEIGHT * 0.45;
    const dx = ball.x - cx, dy = ball.y - cy;
    const dist = Math.sqrt(dx * dx / (a * a) + dy * dy / (b * b));
    if (dist > 0.94) {
        const angle = Math.atan2(dy * a, dx * b);
        ball.vx = -ball.vx * reboundSens * 0.85;
        ball.vy = -ball.vy * reboundSens * 0.85;
        ball.x = cx + Math.cos(angle) * a * 0.91;
        ball.y = cy + Math.sin(angle) * b * 0.91;
    }

    // ====================== INTERACTION TROUS (CORRIGÉ) ======================
    for (let h of holes) {
        const d = Math.hypot(ball.x - h.x, ball.y - h.y);
        if (d < h.radius + ball.radius + 12) {
            const speed = Math.hypot(ball.vx, ball.vy);

            // Manger le trou uniquement si très lent
            if (!h.eaten && speed < 4.0 + difficulty * 0.35) {
                playSound('plouf');
                const scoreMultiplier = 0.9 - (difficulty - 1) * 0.09;
                score += Math.floor((120 + speed * 25) * scoreMultiplier);
                document.getElementById('scoreValue').textContent = score;
                h.eaten = true;
                ball.visible = false;
                setTimeout(() => { 
                    resetBall(); 
                    checkAllHolesBlocked(); 
                }, 800);
                return;
            }

            // RÉPULSION : forte quand trou LIBRE, nulle quand trou BLOQUÉ
            if (!h.eaten) {   // <--- seulement quand le trou est encore libre
                const baseRepel = h.bourrelet * 38;           // très fort à difficulty=10
                const speedFactor = Math.max(0.4, 20 / (speed + 8));
                const repel = baseRepel * speedFactor;

                const nx = (ball.x - h.x) / d;
                const ny = (ball.y - h.y) / d;
                ball.vx += nx * repel * 0.04;
                ball.vy += ny * repel * 0.04;
            }
            // Quand h.eaten === true → aucune répulsion (inefficace)
        }
    }

    timeLeft -= delta;
    document.getElementById('timeValue').textContent = Math.ceil(timeLeft);

    if (timeLeft <= 0) {
        gameRunning = false;
        playSound('end');
        alert("Temps écoulé ! Score final : " + score);
    }
}

// ====================== RESET ======================
function resetBall() {
    spring.pulled = 0;
    spring.disappearing = false;
    spring.alpha = 1;
    spring.length = spring.maxLength;

    ball.x = spring.x;
    ball.y = spring.y - spring.length * 0.82;
    ball.vx = 0;
    ball.vy = 0;
    ball.visible = true;
    ballLaunched = false;
}

// ====================== DESSIN ======================
function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    if (images.tapisoblond && images.tapisoblond.complete) {
        const tx = (WIDTH - 900 * scaleFactor) / 2;
        const ty = (HEIGHT - 1600 * scaleFactor) / 2;
        ctx.drawImage(images.tapisoblond, tx, ty, 900 * scaleFactor, 1600 * scaleFactor);
    } else {
        ctx.fillStyle = '#d2b48c';
        ctx.beginPath();
        ctx.ellipse(WIDTH / 2, HEIGHT / 2, WIDTH * 0.45, HEIGHT * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    holes.forEach(h => {
        if (images.trou && images.trou.complete) ctx.drawImage(images.trou, h.x - 100, h.y - 100, 200, 200);
        const reliefScale = 0.9 + (difficulty - 1) * 0.12;
        if (images.trourelief && images.trourelief.complete) {
            const size = 80 * reliefScale;
            ctx.drawImage(images.trourelief, h.x - size/2, h.y - size/2, size, size);
        }
        if (h.eaten && images.troubord && images.troubord.complete) {
            const factor = 1.1 + (difficulty - 1) * 0.09;
            const bSize = 102 * factor;
            ctx.drawImage(images.troubord, h.x - bSize/2, h.y - bSize/2, bSize, bSize);
        }
    });

    if (images.tapisoblondbord && images.tapisoblondbord.complete) {
        const tx = (WIDTH - 900 * scaleFactor) / 2;
        const ty = (HEIGHT - 1600 * scaleFactor) / 2;
        ctx.drawImage(images.tapisoblondbord, tx, ty, 900 * scaleFactor, 1600 * scaleFactor);
    }

    const currentLength = spring.length - spring.pulled;
    if (!spring.disappearing || spring.alpha > 0) {
        ctx.globalAlpha = spring.alpha;
        if (images.ressort && images.ressort.complete) {
            ctx.drawImage(images.ressort, spring.x - spring.width / 2, spring.y - currentLength, spring.width, currentLength + 35);
        } else {
            ctx.fillStyle = '#555';
            ctx.fillRect(spring.x - spring.width / 2, spring.y - currentLength, spring.width, currentLength + 30);
        }
        ctx.globalAlpha = 1;
    }

    if (ball.visible) {
        ctx.save();
        ctx.globalAlpha = ball.alpha;
        ctx.translate(ball.x, ball.y);
        ctx.rotate(Math.atan2(ball.vy || 0, ball.vx || 0));
        if (images.bille && images.bille.complete) {
            ctx.drawImage(images.bille, -ball.radius, -ball.radius, ball.radius * 2, ball.radius * 2);
        } else {
            ctx.fillStyle = '#f0f0f0';
            ctx.beginPath();
            ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#4488ff';
            ctx.beginPath();
            ctx.arc(-16, -16, 20, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// ====================== BOUCLE ======================
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const delta = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (gameRunning) updatePhysics(delta);
    draw();
    animationFrame = requestAnimationFrame(gameLoop);
}

// ====================== CONTRÔLES ======================
function startDrag(e) {
    if (menuContent.classList.contains('show') || !ball.visible) return;

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const my = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    if (Math.hypot(mx - ball.x, my - ball.y) < 160) isDragging = true;
}

function moveDrag(e) {
    if (!isDragging || menuContent.classList.contains('show')) return;
    const rect = canvas.getBoundingClientRect();
    const my = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    spring.pulled = Math.max(0, Math.min(spring.maxLength * 0.95, my - (spring.y - spring.length)));
    ball.y = spring.y - spring.length + spring.pulled;
}

function endDrag() {
    if (!isDragging) return;
    isDragging = false;

    const pullRatio = spring.pulled / spring.maxLength;
    const powerSetting = parseFloat(document.getElementById('power').value) || 50;
    const force = pullRatio * (powerSetting / 10) * 6.5;   // force doublée et plus

    // ÉJECTION VERS LE BAS - beaucoup plus forte
    ball.vx = (Math.random() - 0.5) * 7;
    ball.vy = Math.max(12, force / ball.mass * 1.4);   // vitesse minimale élevée

    ballLaunched = true;
    if (!gameRunning) gameRunning = true;

    spring.disappearing = true;
    spring.pulled = 0;
}

function handleDeviceOrientation(e) {
    if (e.gamma !== undefined && e.beta !== undefined) {
        tilt.x = e.gamma / 45;
        tilt.y = e.beta / 45;
    }
}

function handleKeyboard() {
    const sens = 1.2;
    tilt.x = tilt.y = 0;
    if (keys['ArrowLeft'] || keys['q'] || keys['Q']) tilt.x = -sens;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) tilt.x = sens;
    if (keys['ArrowUp'] || keys['z'] || keys['Z']) tilt.y = -sens;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) tilt.y = sens;
}

// ====================== ÉVÉNEMENTS ======================
canvas.addEventListener('mousedown', startDrag);
canvas.addEventListener('mousemove', moveDrag);
canvas.addEventListener('mouseup', endDrag);
canvas.addEventListener('touchstart', startDrag);
canvas.addEventListener('touchmove', moveDrag);
canvas.addEventListener('touchend', endDrag);

window.addEventListener('deviceorientation', handleDeviceOrientation);
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup',   e => keys[e.key] = false);
window.addEventListener('resize', resize);

// Sliders
const sliders = ['diff','holes','rebound','tiltSens','power','mass','scale','duration'];
sliders.forEach(id => {
    const el = document.getElementById(id);
    const val = document.getElementById(id + 'Val');
    if (el && val) el.addEventListener('input', () => val.textContent = el.value);
});

// ====================== INIT ======================
loadAssets();
resize();
resetBall();
requestAnimationFrame(gameLoop);

setInterval(() => { if (gameRunning) handleKeyboard(); }, 16);

console.log("🎮 HABILE - Correction finale : bourrelet fort seulement sur trous libres + éjection doublée");