// ====================== VARIABLES GLOBALES ======================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let WIDTH, HEIGHT, baseScale = 1;
let userScale = 1;

let ball = { x: 0, y: 0, vx: 0, vy: 0, radius: 40, mass: 1, visible: false, alpha: 1 };
let holes = [];
let spring = { x: 0, y: 0, length: 0, maxLength: 0, pulled: 0, disappearing: false, alpha: 1, width: 80 };
let tilt = { x: 0, y: 0 };
let score = 0;
let timeLeft = 120;
let gameRunning = false;
let ballLaunched = false;

let difficulty = 5;
let reboundSens = 1;
let tiltSens = 1.5;
let numHoles = 4;
let maxDuration = 120;

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

document.getElementById('applyBtn').addEventListener('click', (e) => {
    e.stopImmediatePropagation();

    difficulty = Math.max(1, Math.min(10, parseInt(document.getElementById('diff').value) || 5));
    numHoles = parseInt(document.getElementById('holes').value) || 4;
    reboundSens = parseFloat(document.getElementById('rebound').value) || 1;
    tiltSens = parseFloat(document.getElementById('tiltSens').value) || 1.5;
    ball.mass = parseFloat(document.getElementById('mass').value) || 1;

    let durationMin = parseFloat(document.getElementById('duration').value) || 2;
    durationMin = Math.max(1, Math.min(5, durationMin));
    document.getElementById('duration').value = durationMin;

    maxDuration = durationMin * 60;
    userScale = Math.max(0.5, Math.min(2, parseFloat(document.getElementById('scale').value) || 1));

    score = 0;
    timeLeft = maxDuration;
    document.getElementById('scoreValue').textContent = 0;
    document.getElementById('timeValue').textContent = Math.ceil(timeLeft);

    generateHoles(numHoles);
    resetBall();
    resize();

    menuContent.classList.remove('show');
    console.log(`✅ Nouvelle partie : ${durationMin} min | Scale: ${userScale}`);
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

    canvas.style.position = 'absolute';
    canvas.style.left = (winW - gameWidth) + 'px';
    canvas.style.top = '0px';

    WIDTH = gameWidth;
    HEIGHT = gameHeight;

    baseScale = Math.min(WIDTH / 900, HEIGHT / 1600) * 0.92;
    const totalScale = baseScale * userScale;

    spring.x = WIDTH * 0.88;
    spring.y = HEIGHT * 0.80;
    spring.maxLength = HEIGHT * 0.155;
    spring.width = 80 * totalScale;

    generateHoles(numHoles);
    resetBall();
    draw();                    // ← important pour éviter l'écran noir
}

// ====================== HOLES ======================
function isTooClose(x, y) {
    return holes.some(h => Math.hypot(x - h.x, y - h.y) < 110 * baseScale * userScale);
}

function isTooCloseToSpring(x, y) {
    return Math.hypot(x - spring.x, y - spring.y) < 220 * baseScale * userScale;
}

function generateHoles(count) {
    holes = [];
    const margin = 100 * baseScale * userScale;
    for (let i = 0; i < count; i++) {
        let attempts = 0, hx, hy;
        do {
            hx = margin + Math.random() * (WIDTH - 2 * margin);
            hy = margin + Math.random() * (HEIGHT - 2 * margin);
            attempts++;
        } while ((isTooClose(hx, hy) || isTooCloseToSpring(hx, hy)) && attempts < 80);

        holes.push({
            x: hx, y: hy,
            radius: 35 * baseScale * userScale,
            bourrelet: difficulty,
            eaten: false
        });
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

    if (spring.disappearing && spring.alpha > 0) spring.alpha -= delta * 5;

    if (ballLaunched) {
        ball.vx += tilt.x * tiltSens * 0.3 * delta * 60;
        ball.vy += tilt.y * tiltSens * 0.3 * delta * 60;
    }

    if (!('ontouchstart' in window) && spring.disappearing) ball.vy += 0.08;

    ball.vx *= 0.985;
    ball.vy *= 0.985;
    ball.x += ball.vx * delta * 60;
    ball.y += ball.vy * delta * 60;

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

    for (let h of holes) {
        const d = Math.hypot(ball.x - h.x, ball.y - h.y);
        if (d < h.radius + ball.radius + 12 * baseScale * userScale) {
            const speed = Math.hypot(ball.vx, ball.vy);

            if (!h.eaten && speed < 4.0 + difficulty * 0.35) {
                playSound('plouf');
                const scoreMultiplier = 0.9 - (difficulty - 1) * 0.09;
                score += Math.floor((120 + speed * 25) * scoreMultiplier);
                document.getElementById('scoreValue').textContent = score;
                h.eaten = true;
                ball.visible = false;
                setTimeout(() => { resetBall(); checkAllHolesBlocked(); }, 800);
                return;
            }

            if (!h.eaten) {
                const baseRepel = h.bourrelet * 38;
                const speedFactor = Math.max(0.4, 20 / (speed + 8));
                const repel = baseRepel * speedFactor * 0.04;
                const nx = (ball.x - h.x) / d;
                const ny = (ball.y - h.y) / d;
                ball.vx += nx * repel;
                ball.vy += ny * repel;
            }
        }
    }

    timeLeft -= delta;
    document.getElementById('timeValue').textContent = Math.max(0, Math.ceil(timeLeft));

    if (timeLeft <= 0) {
        gameRunning = false;
        playSound('end');
        alert("Temps écoulé ! Score final : " + score);
    }
}

// ====================== RESET ======================
function resetBall() {
    const totalScale = baseScale * userScale;
    spring.pulled = 0;
    spring.disappearing = false;
    spring.alpha = 1;
    spring.length = spring.maxLength;

    ball.radius = 40 * totalScale;
    ball.x = spring.x;
    ball.y = spring.y - spring.length * 0.82;
    ball.vx = 0;
    ball.vy = 0;
    ball.visible = true;
    ballLaunched = false;
}

// ====================== DESSIN ======================
function draw() {
    if (!WIDTH || !HEIGHT) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const totalScale = baseScale * userScale;

    // Tapis (baseScale uniquement)
    if (images.tapisoblond && images.tapisoblond.complete) {
        const tx = (WIDTH - 900 * baseScale) / 2;
        const ty = (HEIGHT - 1600 * baseScale) / 2;
        ctx.drawImage(images.tapisoblond, tx, ty, 900 * baseScale, 1600 * baseScale);
    } else {
        ctx.fillStyle = '#d2b48c';
        ctx.beginPath();
        ctx.ellipse(WIDTH / 2, HEIGHT / 2, WIDTH * 0.45, HEIGHT * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Trous
    holes.forEach(h => {
        if (images.trou && images.trou.complete)
            ctx.drawImage(images.trou, h.x - 100*totalScale, h.y - 100*totalScale, 200*totalScale, 200*totalScale);

        const reliefScale = 0.9 + (difficulty - 1) * 0.12;
        if (images.trourelief && images.trourelief.complete) {
            const size = 80 * reliefScale * totalScale;
            ctx.drawImage(images.trourelief, h.x - size/2, h.y - size/2, size, size);
        }
        if (h.eaten && images.troubord && images.troubord.complete) {
            const factor = 1.1 + (difficulty - 1) * 0.09;
            const bSize = 102 * factor * totalScale;
            ctx.drawImage(images.troubord, h.x - bSize/2, h.y - bSize/2, bSize, bSize);
        }
    });

    // Bordure tapis
    if (images.tapisoblondbord && images.tapisoblondbord.complete) {
        const tx = (WIDTH - 900 * baseScale) / 2;
        const ty = (HEIGHT - 1600 * baseScale) / 2;
        ctx.drawImage(images.tapisoblondbord, tx, ty, 900 * baseScale, 1600 * baseScale);
    }

    // Ressort
    const currentLength = spring.length - spring.pulled;
    if ((!spring.disappearing || spring.alpha > 0) && images.ressort && images.ressort.complete) {
        ctx.globalAlpha = spring.alpha;
        ctx.drawImage(images.ressort, spring.x - spring.width / 2, spring.y - currentLength, spring.width, currentLength + 35 * totalScale);
        ctx.globalAlpha = 1;
    }

    // Bille
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
        }
        ctx.restore();
    }
}

// ====================== CONTRÔLES ======================
function startDrag(e) {
    if (menuContent.classList.contains('show') || !ball.visible) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const my = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    if (Math.hypot(mx - ball.x, my - ball.y) < 160 * baseScale * userScale) isDragging = true;
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
    const force = pullRatio * (powerSetting / 10) * 6.5;

    ball.vx = (Math.random() - 0.5) * 7;
    ball.vy = Math.max(12, force / ball.mass * 1.4);

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
window.addEventListener('keyup', e => keys[e.key] = false);
window.addEventListener('resize', resize);

// Sliders
const sliders = ['diff','holes','rebound','tiltSens','power','mass','scale','duration'];
sliders.forEach(id => {
    const el = document.getElementById(id);
    const val = document.getElementById(id + 'Val');
    if (el && val) {
        if (id === 'diff' || id === 'duration') {
            el.step = "1";
            if (id === 'duration') {
                el.max = "5";
                el.value = "2";
            }
        }
        el.addEventListener('input', () => val.textContent = el.value);
    }
});

// ====================== BOUCLE ======================
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const delta = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (gameRunning) updatePhysics(delta);
    draw();
    animationFrame = requestAnimationFrame(gameLoop);
}

// ====================== INIT ======================
loadAssets();
resize();
resetBall();
draw();                       // premier affichage
requestAnimationFrame(gameLoop);

setInterval(() => { if (gameRunning) handleKeyboard(); }, 16);

console.log("🎮 HABILE - Version complète corrigée (erreur startDrag résolue)");
