/* DINO RUNNER RPG - CUSTOM IMAGE READY VERSION
    - Code modified to load and draw 'background.png', 'cactus.png', and 'bird.png'.
    - Removed all placeholder colored drawings for obstacles.
*/

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container'); 

// Canvas Size
const BASE_WIDTH = 800;
const BASE_HEIGHT = 400;
canvas.width = BASE_WIDTH;
canvas.height = BASE_HEIGHT;

// Game State Enum
const STATE = {
    MENU: 0,
    RUNNING: 1,
    SHOP: 2,
    GAMEOVER: 3
};

// --- IMAGES ---
const dinoImg = new Image();
dinoImg.src = 'assets/dino.png'; 
dinoImg.onerror = () => { console.error("Dino image failed to load. Check 'assets/dino.png' path."); };

// NEW: Load Custom Obstacle Images
const cactusImg = new Image();
cactusImg.src = 'assets/cactus.png';
cactusImg.onerror = () => { console.error("Cactus image failed to load. Check 'assets/cactus.png' path."); };

const birdImg = new Image();
birdImg.src = 'assets/bird.png';
birdImg.onerror = () => { console.error("Bird image failed to load. Check 'assets/bird.png' path."); };

// NEW: Load Background Image
const backgroundImg = new Image();
backgroundImg.src = 'assets/background.png';
backgroundImg.onerror = () => { console.error("Background image failed to load. Check 'assets/background.png' path."); };

// --- GAME CONFIGURATION ---
const GRAVITY = 0.6;
const GROUND_Y = 320; 
const BASE_SPEED = 6;
const REST_INTERVAL = 180; 
const COIN_SPAWN_RATE = 0.05; 
const BACKGROUND_SCROLL_SPEED = 0.5; // Slower than the foreground

class Game {
    constructor() {
        this.state = STATE.RUNNING;
        this.frameCount = 0;
        this.score = 0;
        this.money = 0;
        this.speed = BASE_SPEED;
        this.distance = 0;
        
        this.timer = 0; 
        this.lastTime = Date.now();
        
        // NEW: Background scrolling position
        this.bgX = 0; 

        // Entities
        this.dino = new Dino();
        this.obstacles = [];
        this.coins = [];
        this.particles = [];

        // Input
        this.keys = {};
        window.addEventListener('keydown', (e) => this.handleInput(e, true));
        window.addEventListener('keyup', (e) => this.handleInput(e, false));
        
        // Touch Input for Mobile
        canvas.addEventListener('touchstart', (e) => this.handleTouch(e));

        // Stats & Upgrades
        this.stats = {
            speedLvl: 0, staminaLvl: 0, cdrLvl: 0 
        };

        // Skill States
        this.skills = {
            timeSlow: { active: false, level: 1, cd: 60, currentCd: 0, duration: 5 },
            invincible: { active: false, level: 1, cd: 120, currentCd: 0, duration: 5 },
            noSpawn: { active: false, level: 1, cd: 180, currentCd: 0, duration: 5 } 
        };

        this.costs = {
            speed: 100, stamina: 100, cdr: 200,
            skillTime: 300, skillInvincible: 500, skillClear: 400
        };
        
        this.loop();
        resizeGame(); 
        window.addEventListener('resize', resizeGame);
    }

    handleInput(e, isDown) {
        this.keys[e.code] = isDown;
        
        if (this.state === STATE.RUNNING) {
            if (isDown) {
                if (e.code === 'Space' || e.code === 'ArrowUp') this.dino.jump();
                if (e.code === 'Digit1') this.activateSkill('timeSlow');
                if (e.code === 'Digit2') this.activateSkill('invincible');
                if (e.code === 'Digit3') this.activateSkill('noSpawn'); 
            }
        }
    }

    handleTouch(e) {
        e.preventDefault(); 

        if (this.state !== STATE.RUNNING) return;

        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const canvasRect = canvas.getBoundingClientRect();
        
        const relativeX = touchX - canvasRect.left;
        const relativeY = touchY - canvasRect.top;
        
        const canvasWidth = canvasRect.width;
        const canvasHeight = canvasRect.height;

        if (relativeY < canvasHeight * 0.75) {
            this.dino.jump();
            return;
        }

        const skillZoneWidth = canvasWidth / 3;

        if (relativeX < skillZoneWidth) {
            this.activateSkill('timeSlow');
        } else if (relativeX < skillZoneWidth * 2) {
            this.activateSkill('invincible');
        } else {
            this.activateSkill('noSpawn'); 
        }
    }


    activateSkill(name) {
        const s = this.skills[name];
        
        const cdrMult = 1 - (this.stats.cdrLvl * 0.05);
        
        if (s.currentCd <= 0) {
            s.active = true;
            setTimeout(() => { s.active = false; }, s.duration * 1000);
            s.currentCd = s.cd * cdrMult;
        }
    }

    update() {
        if (this.state !== STATE.RUNNING) return;

        let now = Date.now();
        let dt = (now - this.lastTime) / 1000;
        this.lastTime = now;
        this.timer += dt;

        if (this.timer >= REST_INTERVAL) {
            this.openShop();
        }

        let currentSpeed = (this.speed + (this.stats.speedLvl * 0.5));
        if (this.skills.timeSlow.active) currentSpeed *= 0.5;

        this.distance += currentSpeed;
        this.score = Math.floor(this.distance / 10);
        
        // NEW: Background Scroll Update
        this.bgX -= currentSpeed * BACKGROUND_SCROLL_SPEED;
        if (this.bgX < -backgroundImg.width) {
            this.bgX += backgroundImg.width;
        }
        if (this.bgX < -BASE_WIDTH) { // Handle wrapping if the image is shorter than the canvas
            this.bgX += BASE_WIDTH;
        }

        this.dino.update();

        if (!this.skills.noSpawn.active && this.frameCount % Math.floor(1000 / currentSpeed) === 0) { 
            this.spawnObstacle();
        }

        if (Math.random() < COIN_SPAWN_RATE) this.spawnCoin(); 

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.update(currentSpeed);
            
            if (!this.skills.invincible.active && this.checkCollision(this.dino, obs)) {
                this.gameOver();
            }

            if (obs.markedForDeletion) this.obstacles.splice(i, 1);
        }

        for (let i = this.coins.length - 1; i >= 0; i--) {
            const c = this.coins[i];
            c.update(currentSpeed);
            if (this.checkCollision(this.dino, c)) {
                this.money += 10;
                this.coins.splice(i, 1); 
            }
            if (c.markedForDeletion) this.coins.splice(i, 1);
        }

        for (let key in this.skills) {
            if (this.skills[key].currentCd > 0) this.skills[key].currentCd -= dt;
        }

        this.frameCount++;
        this.updateUI();
    }

    spawnObstacle() {
        const type = Math.random() > 0.7 ? 'BIRD' : 'CACTUS';
        this.obstacles.push(new Obstacle(type));
    }

    spawnCoin() {
        this.coins.push(new Coin());
    }

    checkCollision(rect1, rect2) {
        return (
            rect1.x < rect2.x + rect2.w &&
            rect1.x + rect1.w > rect2.x &&
            rect1.y < rect2.y + rect2.h &&
            rect1.y + rect1.h > rect2.y
        );
    }

    draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // NEW: Draw Background
        if (backgroundImg.complete && backgroundImg.naturalWidth > 0) {
            // Draw the first image
            ctx.drawImage(backgroundImg, this.bgX, 0, backgroundImg.width, BASE_HEIGHT);
            // Draw the second image right after the first (for seamless scrolling)
            ctx.drawImage(backgroundImg, this.bgX + backgroundImg.width, 0, backgroundImg.width, BASE_HEIGHT);
        } else {
            // Fallback solid color background
            ctx.fillStyle = '#f7f7f7';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw Ground Line
        ctx.fillStyle = '#333';
        ctx.fillRect(0, GROUND_Y, canvas.width, 2);

        this.dino.draw();
        this.obstacles.forEach(o => o.draw());
        this.coins.forEach(c => c.draw());

        if (this.skills.invincible.active) {
            ctx.strokeStyle = 'gold';
            ctx.lineWidth = 3;
            ctx.strokeRect(this.dino.x - 5, this.dino.y - 5, this.dino.w + 10, this.dino.h + 10);
        }
        if (this.skills.timeSlow.active) {
            ctx.fillStyle = 'rgba(0, 200, 255, 0.2)';
            ctx.fillRect(0,0, canvas.width, canvas.height);
        }
    }

    loop() {
        requestAnimationFrame(() => this.loop()); 
        this.update();
        this.draw();
    }

    // --- UI & SHOP ---

    updateUI() {
        document.getElementById('scoreDisplay').innerText = this.score;
        document.getElementById('moneyDisplay').innerText = this.money;
        document.getElementById('timeDisplay').innerText = Math.max(0, (REST_INTERVAL - this.timer)).toFixed(0);
        
        const sPct = (this.dino.stamina / this.dino.maxStamina) * 100;
        document.getElementById('staminaBar').style.width = `${sPct}%`;

        const updateCD = (id, skill) => {
            const pct = skill.currentCd > 0 ? (skill.currentCd / (skill.cd * (1-(this.stats.cdrLvl*0.05)))) * 100 : 0;
            document.getElementById(id).style.width = `${pct}%`;
        };
        updateCD('cd-time', this.skills.timeSlow);
        updateCD('cd-invincible', this.skills.invincible);
        updateCD('cd-clear', this.skills.noSpawn); 
    }

    openShop() {
        this.state = STATE.SHOP;
        document.getElementById('shopScreen').classList.remove('hidden');
        document.getElementById('shopMoney').innerText = this.money;
        this.updateShopCosts();
    }

    closeShop() {
        document.getElementById('shopScreen').classList.add('hidden');
        this.timer = 0; 
        this.lastTime = Date.now(); 
        this.state = STATE.RUNNING;
    }

    updateShopCosts() {} 

    upgrade(type) {
        let cost = this.costs[type];
        if (this.money >= cost) {
            this.money -= cost;
            this.costs[type] = Math.floor(cost * 1.5); 
            document.getElementById(`cost-${type}`).innerText = `$${this.costs[type]}`;
            
            if (type === 'speed') this.stats.speedLvl++;
            if (type === 'stamina') {
                this.stats.staminaLvl++;
                this.dino.maxStamina += 20;
            }
            if (type === 'cdr') {
                if (this.stats.cdrLvl < 10) this.stats.cdrLvl++;
            }
            if (type === 'skillTime') this.skills.timeSlow.duration += 1;
            if (type === 'skillInvincible') this.skills.invincible.duration += 1;

            document.getElementById('shopMoney').innerText = this.money;
        }
    }

    gameOver() {
        this.state = STATE.GAMEOVER;
        document.getElementById('finalScore').innerText = this.score;
        document.getElementById('gameOverScreen').classList.remove('hidden');
    }

    createParticles(x, y, color) {}
}

// --- ENTITIES ---

class Dino {
    constructor() {
        this.w = 70;
        this.h = 70; 
        this.x = 50;
        this.y = GROUND_Y - this.h;
        
        this.dy = 0;
        this.jumpForce = 12;
        this.grounded = true;
        
        this.maxStamina = 100;
        this.stamina = 100;
    }

    jump() {
        if (this.grounded && this.stamina >= 20) { 
            this.grounded = false;
            this.dy = -this.jumpForce;
            this.stamina -= 20;
        }
    }

    update() {
        this.y += this.dy;
        
        if (this.y + this.h < GROUND_Y) {
            this.dy += GRAVITY;
            this.grounded = false;
        } else {
            this.dy = 0;
            this.grounded = true;
            this.y = GROUND_Y - this.h;
        }

        if (this.stamina < this.maxStamina) this.stamina += 0.125; 
    }

    draw() {
        if (dinoImg.complete && dinoImg.naturalWidth > 0) {
            ctx.drawImage(dinoImg, this.x, this.y, this.w, this.h);
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y, this.w, this.h);
        }
    }
}

class Obstacle {
    constructor(type) {
        this.type = type;
        this.x = canvas.width;
        this.markedForDeletion = false;

        if (type === 'CACTUS') {
            this.w = 30;
            this.h = 50;
            this.y = GROUND_Y - this.h;
        } else if (type === 'BIRD') {
            this.w = 40;
            this.h = 30;
            const minAirHeight = 100; 
            const maxAirHeight = 160;
            this.y = GROUND_Y - (minAirHeight + (Math.random() * (maxAirHeight - minAirHeight))); 
        }
    }

    update(speed) {
        this.x -= speed;
        if (this.x + this.w < 0) this.markedForDeletion = true;
    }

    draw() {
        // NEW: Draw the loaded images instead of colored shapes
        if (this.type === 'CACTUS') {
            if (cactusImg.complete && cactusImg.naturalWidth > 0) {
                ctx.drawImage(cactusImg, this.x, this.y, this.w, this.h);
            } else {
                ctx.fillStyle = 'green';
                ctx.fillRect(this.x, this.y, this.w, this.h);
            }
        } else if (this.type === 'BIRD') {
            if (birdImg.complete && birdImg.naturalWidth > 0) {
                ctx.drawImage(birdImg, this.x, this.y, this.w, this.h);
            } else {
                ctx.fillStyle = 'gray';
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(this.x + 20, this.y + 30);
                ctx.lineTo(this.x + 40, this.y);
                ctx.fill();
            }
        }
    }
}

class Coin {
    constructor() {
        this.w = 20;
        this.h = 20;
        this.x = canvas.width;
        const minHeight = 100; 
        const maxHeight = 150; 
        this.y = GROUND_Y - (minHeight + (Math.random() * (maxHeight - minHeight)));
        this.markedForDeletion = false;
    }

    update(speed) {
        this.x -= speed;
        if (this.x + this.w < 0) this.markedForDeletion = true;
    }

    draw() {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(this.x + 10, this.y + 10, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#daa520';
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.font = '10px Arial';
        ctx.fillText('$', this.x + 7, this.y + 14);
    }
}

// --- Responsive Scaling Logic ---

function resizeGame() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    const scaleX = windowWidth / BASE_WIDTH;
    const scaleY = windowHeight / BASE_HEIGHT;
    
    const scale = Math.min(scaleX, scaleY);
    
    gameContainer.style.transform = `scale(${scale})`;

    const newWidth = BASE_WIDTH * scale;
    const newHeight = BASE_HEIGHT * scale;
    
    gameContainer.style.left = `${(windowWidth - newWidth) / 2}px`;
    gameContainer.style.top = `${(windowHeight - newHeight) / 2}px`;
}


// Start the game
const game = new Game();/* DINO RUNNER RPG - FINAL, WORKING VERSION
    - Fixed: Coin spawning location and array management.
    - Fixed: Reduced Dino Stamina regeneration rate by 75%.
*/

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container'); // Get container for responsiveness

// Canvas Size
const BASE_WIDTH = 800;
const BASE_HEIGHT = 400;
canvas.width = BASE_WIDTH;
canvas.height = BASE_HEIGHT;

// Game State Enum
const STATE = {
    MENU: 0,
    RUNNING: 1,
    SHOP: 2,
    GAMEOVER: 3
};

// --- IMAGES ---
// Ensure you have dino.png in the assets folder!
const dinoImg = new Image();
dinoImg.src = 'assets/dino.png'; 

dinoImg.onerror = () => {
    console.error("Dino image failed to load. Check 'assets/dino.png' path and file name.");
};

// --- GAME CONFIGURATION ---
const GRAVITY = 0.6;
const GROUND_Y = 320; // Y position of the floor
const BASE_SPEED = 6;
const REST_INTERVAL = 180; // Seconds (3 mins)
const COIN_SPAWN_RATE = 0.05; // 5% chance per frame for testing (Easily visible)

class Game {
    constructor() {
        this.state = STATE.RUNNING;
        this.frameCount = 0;
        this.score = 0;
        this.money = 0;
        this.speed = BASE_SPEED;
        this.distance = 0;
        
        // Timer for Rest Station
        this.timer = 0; // seconds
        this.lastTime = Date.now();

        // Entities
        this.dino = new Dino();
        this.obstacles = [];
        this.coins = [];
        this.particles = [];

        // Input
        this.keys = {};
        window.addEventListener('keydown', (e) => this.handleInput(e, true));
        window.addEventListener('keyup', (e) => this.handleInput(e, false));
        
        // Touch Input for Mobile
        canvas.addEventListener('touchstart', (e) => this.handleTouch(e));

        // Stats & Upgrades
        this.stats = {
            speedLvl: 0, 
            staminaLvl: 0, 
            cdrLvl: 0 
        };

        // Skill States
        this.skills = {
            timeSlow: { active: false, level: 1, cd: 60, currentCd: 0, duration: 5 },
            invincible: { active: false, level: 1, cd: 120, currentCd: 0, duration: 5 },
            clearFront: { level: 1, cd: 180, currentCd: 0, duration: 0 }
        };

        this.costs = {
            speed: 100, stamina: 100, cdr: 200,
            skillTime: 300, skillInvincible: 500, skillClear: 400
        };
        
        this.loop();
        resizeGame(); // Initial responsive resize
        window.addEventListener('resize', resizeGame);
    }

    handleInput(e, isDown) {
        this.keys[e.code] = isDown;
        
        if (isDown) {
            if (this.state === STATE.RUNNING) {
                if (e.code === 'Space' || e.code === 'ArrowUp') this.dino.jump();
                if (e.code === 'Digit1') this.activateSkill('timeSlow');
                if (e.code === 'Digit2') this.activateSkill('invincible');
                if (e.code === 'Digit3') this.activateSkill('clearFront');
            }
        }
    }

    handleTouch(e) {
        e.preventDefault(); 

        if (this.state !== STATE.RUNNING) return;

        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const canvasRect = canvas.getBoundingClientRect();
        
        const relativeX = touchX - canvasRect.left;
        const relativeY = touchY - canvasRect.top;
        
        const canvasWidth = canvasRect.width;
        const canvasHeight = canvasRect.height;

        // 1. Jump: If tapped in the top 75% of the screen
        if (relativeY < canvasHeight * 0.75) {
            this.dino.jump();
            return;
        }

        // 2. Skills: If tapped in the bottom 25% of the screen
        const skillZoneWidth = canvasWidth / 3;

        if (relativeX < skillZoneWidth) {
            this.activateSkill('timeSlow');
        } else if (relativeX < skillZoneWidth * 2) {
            this.activateSkill('invincible');
        } else {
            this.activateSkill('clearFront');
        }
    }


    activateSkill(name) {
        const s = this.skills[name];
        
        const cdrMult = 1 - (this.stats.cdrLvl * 0.05);
        
        if (s.currentCd <= 0) {
            if (name === 'clearFront') {
                const clearRange = 300 + (s.level * 50); 
                this.obstacles = this.obstacles.filter(o => o.x > this.dino.x + clearRange); 
                
                s.currentCd = s.cd * cdrMult;
                this.createParticles(this.dino.x + 100, this.dino.y, 'yellow');
            } else {
                s.active = true;
                setTimeout(() => { s.active = false; }, s.duration * 1000);
                s.currentCd = s.cd * cdrMult;
            }
        }
    }

    update() {
        if (this.state !== STATE.RUNNING) return;

        // Time Management
        let now = Date.now();
        let dt = (now - this.lastTime) / 1000;
        this.lastTime = now;
        this.timer += dt;

        // Check Rest Station
        if (this.timer >= REST_INTERVAL) {
            this.openShop();
        }

        // Difficulty / Speed Scaling
        let currentSpeed = (this.speed + (this.stats.speedLvl * 0.5));
        if (this.skills.timeSlow.active) currentSpeed *= 0.5;

        this.distance += currentSpeed;
        this.score = Math.floor(this.distance / 10);

        // Update Dino
        this.dino.update();

        // Obstacle Spawning and Updating
        if (this.frameCount % Math.floor(1000 / currentSpeed) === 0) { 
            this.spawnObstacle();
        }

        // Coin Spawning
        if (Math.random() < COIN_SPAWN_RATE) this.spawnCoin(); 

        // Update and Collision Check for Obstacles & Coins (Backward iteration for safe removal)
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.update(currentSpeed);
            
            if (!this.skills.invincible.active && this.checkCollision(this.dino, obs)) {
                this.gameOver();
            }

            if (obs.markedForDeletion) this.obstacles.splice(i, 1);
        }

        for (let i = this.coins.length - 1; i >= 0; i--) {
            const c = this.coins[i];
            c.update(currentSpeed);
            if (this.checkCollision(this.dino, c)) {
                this.money += 10;
                this.coins.splice(i, 1); // Remove collected coin
            }
            if (c.markedForDeletion) this.coins.splice(i, 1);
        }

        // Cooldowns
        for (let key in this.skills) {
            if (this.skills[key].currentCd > 0) this.skills[key].currentCd -= dt;
        }

        this.frameCount++;
        this.updateUI();
    }

    spawnObstacle() {
        const type = Math.random() > 0.7 ? 'BIRD' : 'CACTUS';
        this.obstacles.push(new Obstacle(type));
    }

    spawnCoin() {
        this.coins.push(new Coin());
    }

    checkCollision(rect1, rect2) {
        return (
            rect1.x < rect2.x + rect2.w &&
            rect1.x + rect1.w > rect2.x &&
            rect1.y < rect2.y + rect2.h &&
            rect1.y + rect1.h > rect2.y
        );
    }

    draw() {
        // Clear Canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Ground
        ctx.fillStyle = '#333';
        ctx.fillRect(0, GROUND_Y, canvas.width, 2);

        // Draw Entities
        this.dino.draw();
        this.obstacles.forEach(o => o.draw());
        this.coins.forEach(c => c.draw());

        // Visual Effects for Skills
        if (this.skills.invincible.active) {
            ctx.strokeStyle = 'gold';
            ctx.lineWidth = 3;
            ctx.strokeRect(this.dino.x - 5, this.dino.y - 5, this.dino.w + 10, this.dino.h + 10);
        }
        if (this.skills.timeSlow.active) {
            ctx.fillStyle = 'rgba(0, 200, 255, 0.2)';
            ctx.fillRect(0,0, canvas.width, canvas.height);
        }
    }

    loop() {
        requestAnimationFrame(() => this.loop());
        this.update();
        this.draw();
    }

    // --- UI & SHOP ---

    updateUI() {
        document.getElementById('scoreDisplay').innerText = this.score;
        document.getElementById('moneyDisplay').innerText = this.money;
        document.getElementById('timeDisplay').innerText = Math.max(0, (REST_INTERVAL - this.timer)).toFixed(0);
        
        // Stamina
        const sPct = (this.dino.stamina / this.dino.maxStamina) * 100;
        document.getElementById('staminaBar').style.width = `${sPct}%`;

        // Cooldown Visuals
        const updateCD = (id, skill) => {
            const pct = skill.currentCd > 0 ? (skill.currentCd / (skill.cd * (1-(this.stats.cdrLvl*0.05)))) * 100 : 0;
            document.getElementById(id).style.width = `${pct}%`;
        };
        updateCD('cd-time', this.skills.timeSlow);
        updateCD('cd-invincible', this.skills.invincible);
        updateCD('cd-clear', this.skills.clearFront);
    }

    openShop() {
        this.state = STATE.SHOP;
        document.getElementById('shopScreen').classList.remove('hidden');
        document.getElementById('shopMoney').innerText = this.money;
        this.updateShopCosts();
    }

    closeShop() {
        document.getElementById('shopScreen').classList.add('hidden');
        this.timer = 0; // Reset rest timer
        this.lastTime = Date.now(); // Reset delta time tracker
        this.state = STATE.RUNNING;
    }

    updateShopCosts() {} // Placeholder for future logic

    upgrade(type) {
        let cost = this.costs[type];
        if (this.money >= cost) {
            this.money -= cost;
            this.costs[type] = Math.floor(cost * 1.5); // Increase price
            document.getElementById(`cost-${type}`).innerText = `$${this.costs[type]}`;
            
            // Apply Upgrade
            if (type === 'speed') this.stats.speedLvl++;
            if (type === 'stamina') {
                this.stats.staminaLvl++;
                this.dino.maxStamina += 20;
            }
            if (type === 'cdr') {
                if (this.stats.cdrLvl < 10) this.stats.cdrLvl++;
            }
            // Skill Upgrades
            if (type === 'skillTime') this.skills.timeSlow.duration += 1;
            if (type === 'skillInvincible') this.skills.invincible.duration += 1;

            document.getElementById('shopMoney').innerText = this.money;
        }
    }

    gameOver() {
        this.state = STATE.GAMEOVER;
        document.getElementById('finalScore').innerText = this.score;
        document.getElementById('gameOverScreen').classList.remove('hidden');
    }

    createParticles(x, y, color) {
        // Simple particle effect placeholder
    }
}

// --- ENTITIES ---

class Dino {
    constructor() {
        this.w = 70; 
        this.h = 70; 
        this.x = 50;
        this.y = GROUND_Y - this.h;
        
        this.dy = 0;
        this.jumpForce = 12;
        this.grounded = true;
        
        this.maxStamina = 100;
        this.stamina = 100;
    }

    jump() {
        if (this.grounded && this.stamina >= 20) {
            this.grounded = false;
            this.dy = -this.jumpForce;
            this.stamina -= 20;
        }
    }

    update() {
        // Physics
        this.y += this.dy;
        
        if (this.y + this.h < GROUND_Y) {
            this.dy += GRAVITY;
            this.grounded = false;
        } else {
            this.dy = 0;
            this.grounded = true;
            this.y = GROUND_Y - this.h;
        }

        // Stamina Regen (Reduced by 75%: 0.5 * 25% = 0.125)
        if (this.stamina < this.maxStamina) this.stamina += 0.125; 
    }

    draw() {
        if (dinoImg.complete && dinoImg.naturalWidth > 0) {
            ctx.drawImage(dinoImg, this.x, this.y, this.w, this.h);
        } else {
            // Fallback placeholder (Red Box)
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y, this.w, this.h);
        }
    }
}

class Obstacle {
    constructor(type) {
        this.type = type;
        this.x = canvas.width;
        this.markedForDeletion = false;

        if (type === 'CACTUS') {
            this.w = 30;
            this.h = 50;
            this.y = GROUND_Y - this.h;
            this.color = '#008000'; // Green
        } else if (type === 'BIRD') {
            this.w = 40;
            this.h = 30;
            // Bird spawns in the air
            this.y = GROUND_Y - 80 - (Math.random() * 50); 
            this.color = '#555'; // Dark Grey
        }
    }

    update(speed) {
        this.x -= speed;
        if (this.x + this.w < 0) this.markedForDeletion = true;
    }

    draw() {
        ctx.fillStyle = this.color;
        
        if (this.type === 'CACTUS') {
            ctx.fillRect(this.x + 10, this.y, 10, this.h); 
            ctx.fillRect(this.x, this.y + 10, 10, 20); 
            ctx.fillRect(this.x + 20, this.y + 15, 10, 15); 
        } else {
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x + 20, this.y + 30);
            ctx.lineTo(this.x + 40, this.y);
            ctx.fill();
        }
    }
}

class Coin {
    constructor() {
        this.w = 20;
        this.h = 20;
        this.x = canvas.width;
        // FIX: Ensured coins spawn low enough to be visible and collectible (within the canvas)
        const minHeight = 100; 
        const maxHeight = 150; 
        this.y = GROUND_Y - (minHeight + (Math.random() * (maxHeight - minHeight)));
        this.markedForDeletion = false;
    }

    update(speed) {
        this.x -= speed;
        if (this.x + this.w < 0) this.markedForDeletion = true;
    }

    draw() {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(this.x + 10, this.y + 10, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#daa520';
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.font = '10px Arial';
        ctx.fillText('$', this.x + 7, this.y + 14);
    }
}

// --- Responsive Scaling Logic ---

function resizeGame() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    const scaleX = windowWidth / BASE_WIDTH;
    const scaleY = windowHeight / BASE_HEIGHT;
    
    const scale = Math.min(scaleX, scaleY);
    
    gameContainer.style.transform = `scale(${scale})`;

    const newWidth = BASE_WIDTH * scale;
    const newHeight = BASE_HEIGHT * scale;
    
    gameContainer.style.left = `${(windowWidth - newWidth) / 2}px`;
    gameContainer.style.top = `${(windowHeight - newHeight) / 2}px`;
}


// Start the game
const game = new Game();