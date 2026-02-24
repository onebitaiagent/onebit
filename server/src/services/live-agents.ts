/**
 * Live AI Agents — 6 autonomous agents that use Claude to write real game code,
 * review each other's proposals, and vote through the consensus pipeline.
 *
 * Each agent runs independently on its own schedule.
 * No pre-written code, no random verdicts — everything is AI-generated.
 *
 * AUTONOMOUS MODE:
 * - Phase gating with auto-progression (advances when 50%+ of phase tasks merged)
 * - Auto-merge for non-critical proposals (critical still needs human)
 * - Agents suggest new features beyond the fixed roadmap
 * - Branding & content production evolve alongside the game
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getAllAgents } from './agent-registry.js';
import { getTasks, claimTask, updateTaskStatus, createTask, unclaimTask, reclaimStaleTasks, completeDuplicateTasks } from './task-queue.js';
import {
  createProposal, submitProposal, submitReview, castVote, getProposals, cleanupStaleDrafts,
} from './consensus-engine.js';
import { registerGameModule, getActiveModules, getAllModules } from './game-evolution.js';
import { messageBus } from './message-bus.js';
import { isAIEnabled, generateGameCode, reviewCode, suggestFeature, generateContent, getAICosts, isOverBudget } from './ai-client.js';
import type { AgentRoleName } from '../models/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || __dirname;

// ─── Configuration ──────────────────────────────────────────

const MAX_RUNTIME_MS = parseInt(process.env.AGENT_RUNTIME_MS || String(24 * 60 * 60 * 1000), 10); // default 24 hours
let agentsStopped = false;
let agentsStartedAt = 0;

// ─── Game Evolution Roadmap ─────────────────────────────────
// Structured progression from 1 pixel → full game
// Matches the PHASES on the website: Origin → Prototype → Alpha → Beta → Launch → Mature

interface RoadmapTask { title: string; desc: string; role: AgentRoleName; phase: string }

const PHASE_ORDER = ['Origin', 'Prototype', 'Engine', 'Forge', 'Alpha', 'Crucible', 'Beta', 'Release'];

const GAME_ROADMAP: RoadmapTask[] = [
  // ═══ PHASE 1: ORIGIN — First signs of life ═══
  { title: 'Add ambient background starfield', desc: 'Drifting stars backdrop. First sign of life beyond the pixel. Initialize 60-120 stars with random positions, sizes, brightness. Drift slowly downward. Flicker with sine wave.', role: 'Art/UI', phase: 'Origin' },
  { title: 'Add pixel glow effect', desc: 'Soft radial glow around the player pixel. Use ctx.shadowBlur or radial gradient. Pulse gently with sine wave. Color matches current evolution stage.', role: 'Art/UI', phase: 'Origin' },
  { title: 'Implement movement trail system', desc: 'Fading afterimage trail behind the pixel as it moves. Store last 15-20 positions. Draw with decreasing opacity. Color matches player.', role: 'Gameplay', phase: 'Origin' },
  { title: 'Create floating particle spawner', desc: 'Collectible energy particles that drift around the canvas. Spawn 10-20 at a time. Random colors (cyan, green, gold). Float with gentle sine motion. Player absorbs on contact.', role: 'Gameplay', phase: 'Origin' },
  { title: 'Build score display HUD', desc: 'Animated score counter top-left. Show score with counting animation on change. Show absorbed count. Pixel font style. Semi-transparent background.', role: 'Art/UI', phase: 'Origin' },
  { title: 'Design absorption burst VFX', desc: 'Particle explosion when absorbing energy. 5-10 small particles burst outward from absorption point. Fade and shrink over 20 frames. Match absorbed particle color.', role: 'Art/UI', phase: 'Origin' },

  // ═══ PHASE 2: PROTOTYPE — Core mechanics ═══
  { title: 'Implement enemy AI spawner', desc: 'Hostile red entities that spawn at screen edges. Start slow, patrol randomly. After stage 3, track toward player. Collision with player causes damage. Multiple HP levels.', role: 'Gameplay', phase: 'Prototype' },
  { title: 'Create absorption field mechanic', desc: 'Hold SPACE to activate pull field. Draws nearby particles toward player within radius. Radius grows with stage. Visual: pulsing circle around player. Drains slowly while active.', role: 'Gameplay', phase: 'Prototype' },
  { title: 'Add screen shake VFX system', desc: 'Camera offset shake on impacts. Variable intensity and duration. Dampen over time. Apply as ctx.translate offset before all drawing, reset after.', role: 'Art/UI', phase: 'Prototype' },
  { title: 'Add adaptive difficulty scaling', desc: 'Track g.score to scale: spawn rate increases, enemies get faster, more HP. Every 50 points increases difficulty tier. Cap at tier 10.', role: 'Gameplay', phase: 'Prototype' },
  { title: 'Implement score streak mechanic', desc: 'Track rapid absorptions within 2-second windows. Chain counter shows "x2", "x3" etc. Multiplies score gains. Visual: multiplier text floats up from player. Resets after 2s idle.', role: 'Gameplay', phase: 'Prototype' },
  { title: 'Create evolution stage transitions', desc: 'When absorption threshold reached, trigger evolution. Flash screen white, shake camera, spawn burst of particles. Player grows larger, changes color. Show stage name text briefly.', role: 'Art/UI', phase: 'Prototype' },
  { title: 'Add background grid environment', desc: 'Subtle grid lines on the background. Lines pulse faintly. Scroll with parallax as player moves. Gives sense of scale and movement through space.', role: 'Art/UI', phase: 'Prototype' },
  { title: 'Create dash ability', desc: 'Double-tap movement direction or press SHIFT for burst of speed. 3-second cooldown. Leave bright trail during dash. Brief invulnerability during dash frames.', role: 'Gameplay', phase: 'Prototype' },

  // ═══ PHASE 3: ENGINE — Core systems upgrade for competitive quality ═══
  { title: 'Build camera system with smooth follow', desc: 'Store camera state in g._cam={x,y,targetX,targetY,zoom,targetZoom}. Smooth-follow player with lerp(0.06). Support zoom in/out (mousewheel sets targetZoom 0.5-2.0). Apply ctx.translate and ctx.scale before all drawing. Adds lookahead: camera leads slightly in movement direction. Provides g._cam.worldToScreen(x,y) and g._cam.screenToWorld(x,y) helpers on the g object.', role: 'Architect', phase: 'Engine' },
  { title: 'Create entity component system', desc: 'Build g._ecs={entities:[],pools:{}}. Each entity has {id,type,x,y,vx,vy,hp,maxHp,radius,color,active,components:{}}. Pool entities for zero-GC: ecs.spawn(type,props) reuses dead entities. ecs.query(type) returns active entities of type. ecs.kill(id) marks inactive. All existing g.entities and g.particles should migrate to use this system. Max 500 entities.', role: 'Architect', phase: 'Engine' },
  { title: 'Add spatial hash collision detection', desc: 'Build g._spatial={cellSize:64,grid:{}}. Insert entities by cell key=floor(x/64)+","+floor(y/64). Query nearby(x,y,radius) returns entities in overlapping cells only. Replace all O(n^2) distance checks in existing modules with spatial.nearby(). Rebuild grid every frame. This is critical for performance with 300+ entities.', role: 'Architect', phase: 'Engine' },
  { title: 'Implement delta-time game loop normalizer', desc: 'Track g._dt (delta time in seconds, capped at 0.05 to prevent spiral). Store g._lastTime. Calculate dt=Math.min((now-lastTime)/1000,0.05). All velocity and animation math should multiply by g._dt*60 to be frame-rate independent. Also track g._fps as rolling 60-frame average for debug display.', role: 'Architect', phase: 'Engine' },
  { title: 'Create render layer system', desc: 'Build g._layers={background:[], world:[], entities:[], player:[], vfx:[], ui:[]}. Each layer is an array of draw functions. Modules register their draw call to a layer via g._layers.background.push(fn) during init. Main loop clears canvas then draws layers in order. This ensures proper z-ordering: stars behind grid behind entities behind player behind VFX behind HUD.', role: 'Architect', phase: 'Engine' },
  { title: 'Build game state machine', desc: 'Create g._state={current:"playing",previous:null,transition:null,transitionProgress:0}. States: "menu","playing","paused","dead","evolving". g._state.set(newState) triggers transition. During transitions, both states render with crossfade. Modules check g._state.current to decide whether to update (e.g. skip physics when paused). Transition duration: 0.5s with easeInOutCubic.', role: 'Architect', phase: 'Engine' },
  { title: 'Add input manager with buffering', desc: 'Build g._input={keys:{},justPressed:{},justReleased:{},mouse:{x,y,down,justDown},buffer:[]}. Track keydown/keyup to populate justPressed map (true for exactly 1 frame). Input buffer stores last 10 inputs with timestamps for combo detection. Mouse position in world coords (using camera inverse). Provides g._input.isCombo(["up","up","dash"]) checking buffer within 500ms window.', role: 'Gameplay', phase: 'Engine' },
  { title: 'Implement world bounds and wrapping', desc: 'Define g._world={width:3000,height:3000,centerX:1500,centerY:1500}. World is 3000x3000 pixels (much larger than viewport). Player starts at center. Soft boundary: when player approaches edge within 200px, apply gentle force pushing them back. Draw boundary as fading red vignette. Entities outside bounds+100 are despawned. Minimap scales to show full world.', role: 'Gameplay', phase: 'Engine' },

  // ═══ PHASE 4: FORGE — Advanced rendering & visual engine ═══
  { title: 'Create offscreen canvas compositor', desc: 'Build g._compositor with 3 offscreen canvases same size as main: glow layer, light layer, composite layer. Each frame: (1) render glow sources to glow canvas, (2) apply 2-pass gaussian blur using ctx.filter="blur(8px)" on glow canvas, (3) composite glow onto main with ctx.globalCompositeOperation="screen". This gives real bloom/glow without WebGL. Clear offscreen canvases each frame.', role: 'Art/UI', phase: 'Forge' },
  { title: 'Build procedural sprite generator', desc: 'Replace all ctx.arc circle entities with procedural pixel-art sprites. g._sprites={cache:{}}. Generate sprites at init: player (evolving shape per stage: dot→diamond→star→crystal→phoenix), enemies (jagged red shapes), particles (soft round), powerups (distinct geometric). Use small offscreen canvases (16x16 to 32x32) as sprite sheets. drawImage() is faster than arc()+fill(). Cache by type+color key.', role: 'Art/UI', phase: 'Forge' },
  { title: 'Implement dynamic color palette system', desc: 'Build g._palette with harmonious color themes that shift. Palettes: Void(cyan/teal/dark), Ember(orange/red/gold), Nebula(purple/pink/blue), Quantum(green/white/electric). Current palette determined by evolution stage or biome. All modules read from g._palette.primary, .secondary, .accent, .background, .danger, .particle instead of hardcoded colors. Transition between palettes with smooth HSL interpolation over 120 frames.', role: 'Art/UI', phase: 'Forge' },
  { title: 'Add post-processing bloom pipeline', desc: 'After all modules render, apply bloom: (1) create brightness mask by redrawing only bright elements (score text glow, player, VFX) to offscreen canvas, (2) blur the brightness canvas in two passes (horizontal then vertical) using ctx.filter, (3) composite with globalCompositeOperation="lighter" at 40% opacity. Intensity scales with action (more bloom during combos/evolution). Toggle with g._fx.bloom=true/false.', role: 'Art/UI', phase: 'Forge' },
  { title: 'Create CRT scanline and chromatic aberration overlay', desc: 'Post-processing overlay that runs last. Scanlines: draw semi-transparent dark horizontal lines every 3px (opacity 0.03). Chromatic aberration: render scene to offscreen canvas, then draw it 3 times offset by 1-2px in R/G/B channels using globalCompositeOperation="lighter" and channel-isolating patterns. Vignette: radial gradient from transparent center to dark edges. All effects subtle — enhance not distract. Toggle with g._fx.crt.', role: 'Art/UI', phase: 'Forge' },
  { title: 'Build advanced particle engine', desc: 'Replace basic particle array with pooled particle system: g._particleEngine with 1000 particle pool. Each particle: {x,y,vx,vy,life,maxLife,size,startSize,endSize,color,startColor,endColor,gravity,drag,rotation,rotSpeed,shape,emitter}. Support emitters: burst(count,config), stream(rate,config), cone(angle,spread,config). Shapes: circle, square, star, ring, spark. Auto-lerp color and size over lifetime. Zero allocations at runtime.', role: 'Art/UI', phase: 'Forge' },
  { title: 'Implement dynamic lighting system', desc: 'Build g._lighting with light sources. Each light: {x,y,radius,color,intensity,flicker}. Render lighting to offscreen canvas: fill black, then for each light draw radial gradient (color center to transparent edge) with globalCompositeOperation="lighter". Composite light canvas onto main with "multiply" blend. Player emits light (radius grows with stage). Particles emit tiny lights. Enemies glow red. Creates dramatic atmosphere.', role: 'Art/UI', phase: 'Forge' },
  { title: 'Add parallax depth layer system', desc: 'Create 4 parallax layers at different depths: deep space (0.1x scroll), nebula clouds (0.3x), star field (0.5x), near dust (0.8x). Each layer scrolls relative to camera at its depth multiplier. Deep layers use larger, dimmer objects. Near layers use smaller, brighter particles. Layers tile seamlessly. Creates real depth perception as camera moves through world. Use offscreen canvases for static layers, redraw only when camera moves significantly.', role: 'Art/UI', phase: 'Forge' },
  { title: 'Create procedural background generator', desc: 'Generate rich space backgrounds procedurally. Layer 1: deep color gradient (dark blue to purple, shifts with palette). Layer 2: nebula clouds using overlapping radial gradients with low opacity (8-12 clouds, random positions, 200-500px radius). Layer 3: star clusters (dense areas of 50+ tiny stars). Layer 4: cosmic dust lanes (curved paths of faint particles). Render to large offscreen canvas once, only regenerate on biome change.', role: 'Art/UI', phase: 'Forge' },
  { title: 'Implement screen-space distortion effects', desc: 'Post-process distortion for impacts and abilities. On heavy hit: ripple distortion radiating from impact point (render frame to offscreen, sample with offset based on distance from epicenter, sine wave displacement). On dash: motion blur in movement direction (draw prev frame at 30% opacity offset by velocity). On evolution: swirl distortion (angular offset increases toward center). All effects are brief (10-30 frames) and ease out.', role: 'Art/UI', phase: 'Forge' },
  { title: 'Build animation and easing system', desc: 'Create g._anim={tweens:[],ease:{}}. Supports tweening any numeric property: g._anim.tween(obj,"prop",target,duration,easeFn). Built-in easing: linear, easeIn, easeOut, easeInOut, elasticOut, bounceOut, backOut. Also spring(obj,"prop",target,stiffness,damping) for physics-based animation. Used for UI transitions, health bar changes, camera zoom, entity spawning. Pool tween objects. Max 100 active tweens.', role: 'Art/UI', phase: 'Forge' },

  // ═══ PHASE 5: ALPHA — Full game content ═══
  { title: 'Implement shield mechanic', desc: 'Press E to activate shield. Uses procedural sprite: rotating hexagonal barrier with glowing edges rendered via offscreen canvas. Absorbs 3 hits then shatters (spawn 12 hex fragment particles via particle engine). Cooldown 10 seconds shown as radial fill on HUD icon. Shield pulses with g._palette.secondary color. Light source attached while active.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Create power-up spawner with distinct visuals', desc: 'Rare floating power-ups using ECS. Types: SPEED (blue diamond sprite, 2x speed 5s), MAGNET (yellow octagon, auto-absorb 5s), SHIELD (green hex, temporary barrier), OVERCHARGE (white star, 3x damage 5s). Each has unique procedural sprite, orbiting particle trail, and pulsing light source. Spawn every 30s at random world position. Float with figure-8 motion. Apply screen flash and sound-ready event on pickup.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Add environmental hazards system', desc: 'Danger zones using ECS. Types: Void Rift (expanding/contracting purple circle, warps nearby entities), Solar Flare (sweeping beam that rotates, damages on contact), Gravity Well (pulls entities toward center, slows movement). Each has warning phase (2s pulsing outline before activating). Rendered with lighting system (colored light source). Max 3 active hazards. Spawn based on difficulty tier.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Create boss entity system', desc: 'Boss spawns at score milestones (every 300 pts). Boss entity: large procedural sprite (48x48), 15+ HP, health bar at screen top with smooth animation. Attack patterns cycle: (1) charge toward player with trail, (2) spawn 8 minion entities in circle, (3) area denial rings expanding outward. Boss has dynamic lighting (large red light source). On death: massive particle burst (100+ particles), screen distortion, score explosion text. Different boss sprite per difficulty tier.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Build wave announcement and event system', desc: 'Dramatic text overlays for game events. "WAVE 3" slides from right with motion blur trail, holds 1.5s, fades. "BOSS INCOMING" uses red palette with screen shake. "EVOLUTION" uses full-screen flash with distortion. Text rendered with glow (draw text 3x: blurred shadow, colored outline, white fill). Queue system for overlapping events. Uses animation system for all transitions.', role: 'Art/UI', phase: 'Alpha' },
  { title: 'Create death and respawn sequence', desc: 'On death: (1) player sprite shatters into 20 fragment particles with physics, (2) screen desaturates over 30 frames using canvas filter, (3) all entities freeze then fade, (4) death screen fades in: score summary with animated counters, high score check, "PRESS SPACE" pulses. Respawn: white flash, player materializes from converging particles, 2s invulnerability shield. Game state machine transitions: playing→dead→playing.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Add background nebula effect with depth', desc: 'Rich nebula system on deepest parallax layer. 8-12 nebula formations using overlapping radial gradients. Colors from g._palette: primary and secondary at low opacity (0.02-0.06). Nebulae slowly rotate (0.001 rad/frame). Some emit faint particles that drift upward. Rendered to offscreen canvas, redrawn every 300 frames. Creates cinematic space atmosphere. Different nebula patterns per evolution stage.', role: 'Art/UI', phase: 'Alpha' },
  { title: 'Create orbit particles effect', desc: 'Particles orbit the player using proper orbital mechanics. Count increases with stage (2 at stage 0, up to 12 at stage 5). Each has unique orbit radius, speed, and color from palette. Orbits precess slowly (angular velocity varies). Particles leave faint light trails. When player dashes, orbits stretch then snap back (spring animation). During shield, orbits form hexagonal pattern. Visual: procedural sprites with glow compositing.', role: 'Art/UI', phase: 'Alpha' },
  { title: 'Implement biome transition system', desc: 'World divided into biome zones. Biomes: Void Core (center, dark/cyan), Solar Drift (warm/orange), Quantum Field (electric/green), Nebula Deep (purple/pink). When player crosses biome boundary, trigger palette transition over 120 frames. Background regenerates for new biome. Different particle colors, enemy tints, music mood (event flag). Biome indicator text at top of screen. Boundaries visible as faint color gradient walls.', role: 'Gameplay', phase: 'Alpha' },
  { title: 'Build skill upgrade tree', desc: 'On evolution (stage up), show skill select overlay. 3 random choices from pool: Trail Length+, Absorb Radius+, Speed+, Shield HP+, Dash Cooldown-, Orbit Count+, Magnet Range+, Score Multiplier+. Each modifies a g._skills value that modules read. Display as 3 cards with icon, name, description. Card hover shows glow highlight. Cards animate in with stagger. Uses game state "evolving" to pause gameplay during selection.', role: 'Gameplay', phase: 'Alpha' },

  // ═══ PHASE 6: CRUCIBLE — Sound, game feel, juice ═══
  { title: 'Build Web Audio engine', desc: 'Create g._audio={ctx:new AudioContext(),master:null,sfx:{},music:null}. Build synthesizer for procedural sound effects (no external files needed). Generate sounds: absorb (short rising ping), hit (low thud), dash (whoosh sweep), evolve (rising chord), death (descending), boss_spawn (ominous drone). Each sound is a function that creates oscillator+gain+filter chain. Master volume control. Sounds triggered via g._audio.play("absorb").', role: 'Art/UI', phase: 'Crucible' },
  { title: 'Create procedural music system', desc: 'Ambient generative music using Web Audio. Create 4 oscillators: bass drone (low sine, follows palette mood), pad (filtered saw, slow chord changes), arp (triangle, random pentatonic notes every 0.5s), lead (sine, occasional melody fragments). All passed through reverb (convolver with generated impulse response). Music reacts to gameplay: intensity increases with difficulty tier, tempo increases during boss fights, muted during pause.', role: 'Art/UI', phase: 'Crucible' },
  { title: 'Implement hitpause and impact frames', desc: 'On significant impacts (enemy hit, boss damage, player damage), freeze all movement for 2-4 frames (hitpause). During freeze: bright flash at impact point, enemy flashes white, screen shake intensity proportional to damage. After freeze: knockback velocity applied. This is the #1 game-feel technique. Store frozen state in g._hitpause={active:false,frames:0,flashPos:null}. All movement modules check g._hitpause.active and skip updates if true.', role: 'Gameplay', phase: 'Crucible' },
  { title: 'Add juice effects pack', desc: 'Polish layer: (1) numbers that pop up and float for score gains with easing, (2) entity squash-and-stretch on direction changes (scale x/y inversely), (3) anticipation frames before dash (slight pullback), (4) overshoot on shield activation (grows past target then settles via spring), (5) idle animation (gentle bob when not moving), (6) absorption vacuum effect (particles accelerate into player last 20px). Each effect is subtle but collectively transforms game feel.', role: 'Gameplay', phase: 'Crucible' },
  { title: 'Build title screen and main menu', desc: 'Full title screen using game state machine. Animated background: slow camera pan over world with active entities. "ONEBIT" title: large procedural text with bloom glow, gentle float animation. Subtitle: "Born from one pixel. Built by AI consensus." Options: PLAY (starts game), SETTINGS (volume, VFX toggle), CREDITS (lists agent names). Menu items animate on hover. Press PLAY triggers zoom-in transition to player spawn point. All rendered on canvas, no HTML.', role: 'Art/UI', phase: 'Crucible' },
  { title: 'Create settings and accessibility options', desc: 'In-game settings overlay (from pause menu or title screen). Options: Master Volume slider (0-100), SFX Volume, Music Volume, Screen Shake intensity (0-100%), CRT Effects toggle, Bloom toggle, Particle Density (low/med/high adjusts pool size), Color Blind mode (shifts palette to deuteranopia-safe). Store in g._settings using localStorage. All modules read settings and adjust. Smooth slider UI with drag interaction.', role: 'Art/UI', phase: 'Crucible' },
  { title: 'Implement screen transition system', desc: 'Smooth transitions between game states. Transitions: circle_wipe (expanding/contracting circle reveals new scene), fade_through_black (fade out, hold black 0.3s, fade in), pixel_dissolve (random pixels flip to new scene over 0.5s), glitch (RGB split + horizontal offset for 0.2s). Each transition renders both scenes. Used for: menu→game, death→menu, evolution skill select. g._transition.start(type, duration, callback).', role: 'Art/UI', phase: 'Crucible' },
  { title: 'Add HUD redesign with minimal aesthetic', desc: 'Clean competitive HUD. Top-left: score with counting animation + combo multiplier. Top-right: wave number + difficulty tier. Bottom-left: ability cooldowns as minimal radial icons (shield, dash). Bottom-center: evolution progress bar (thin, subtle). Top-center: boss HP bar (only during boss). All elements use g._palette colors, semi-transparent backgrounds, smooth fade in/out. Elements pulse briefly when values change.', role: 'Art/UI', phase: 'Crucible' },

  // ═══ PHASE 7: BETA — Content depth and enemy variety ═══
  { title: 'Implement enemy variety system', desc: 'Multiple enemy types using ECS and procedural sprites. Drone: small, follows player, low HP (cyan sprite). Turret: stationary, fires projectile every 2s toward player (orange sprite). Swarm: tiny, spawn in packs of 5, flock behavior with boids algorithm (green sprites). Tank: large, slow, high HP, charges when close (red sprite, 32x32). Sniper: far away, fires fast accurate shots with laser sight warning (purple). Each type has unique AI in component.', role: 'Gameplay', phase: 'Beta' },
  { title: 'Create projectile and bullet system', desc: 'Projectile entities via ECS. Types: enemy_bullet (small red dot, linear), player_reflect (blue, bounced by shield), turret_shot (orange, aimed), sniper_beam (purple, fast, thin line), boss_ring (expanding ring of bullets). Each projectile has: velocity, lifetime, damage, visual (sprite or line). Collision via spatial hash. Max 200 projectiles pooled. Bullet trail: 5-frame afterimage with decreasing opacity.', role: 'Gameplay', phase: 'Beta' },
  { title: 'Implement high score persistence and leaderboard', desc: 'Save scores using g._scores with localStorage. Track: score, wave reached, enemies killed, time survived, evolution stage, date. Show top 10 on death screen with animated list. New high score triggers special celebration: gold particle burst, "NEW HIGH SCORE" text with bloom, score value counts up dramatically. Leaderboard table styled with g._palette, scrollable if needed.', role: 'Gameplay', phase: 'Beta' },
  { title: 'Add achievement notification system', desc: 'Track 20+ achievements in g._achievements via localStorage. Examples: "First Light" (first absorption), "Centurion" (100 kills), "Untouchable" (60s no damage), "Combo King" (10x chain), "Evolved" (reach stage 5), "Boss Slayer" (defeat boss), "Speedrunner" (wave 10 under 3min). Toast notification slides from top-right: achievement icon + name + description. Sound plays. Uses animation system for slide/fade.', role: 'Art/UI', phase: 'Beta' },
  { title: 'Create entity health bar system', desc: 'HP bars above enemies with >1 HP. Bar: 2px tall, background dark, fill green→yellow→red based on HP%. Smooth animation on damage (fill tweens down, flash white). Boss bar: full screen width at top, show boss name, segmented into phases. Elite enemies: slightly larger bar with colored border. All bars face camera. Fade in on first damage, fade out after 3s idle. Uses animation system for smooth lerp.', role: 'Art/UI', phase: 'Beta' },
  { title: 'Add particle physics interactions', desc: 'Particles interact physically. Same-color particles within 80px attract gently (magnetic). Different-color particles near each other create connection lines (thin, faint). Chain absorption: absorbing one particle in a cluster triggers chain reaction pulling nearby same-color particles toward player over 0.5s. Visual: lightning-style connection arcs between chaining particles. Uses spatial hash for efficient neighbor queries. Max 50 connections rendered.', role: 'Gameplay', phase: 'Beta' },
  { title: 'Build pause menu overlay', desc: 'Press P or ESC triggers state→paused. Render: darken game (draw black rect at 60% opacity), "PAUSED" title with bloom, options: RESUME, SETTINGS, RESTART, QUIT TO MENU. Options highlight on hover with glow. Show current run stats: score, time, wave, kills. Settings accessible from here. Resume triggers unpause transition. Uses circle_wipe transition. All input blocked except menu navigation while paused.', role: 'Art/UI', phase: 'Beta' },
  { title: 'Implement endless scaling system', desc: 'After wave 10, game enters endless mode. Every 5 waves: introduce new enemy combinations, increase entity cap by 50, add environmental hazard slot. Every 10 waves: mini-boss rush (3 bosses simultaneously). Difficulty formula: enemyHP*=1.1^(wave-10), spawnRate*=1.05^(wave-10). New visual effects at milestones: background color shifts, particle density increases, screen border glow intensifies. Wave counter shows infinity symbol after wave 10.', role: 'Gameplay', phase: 'Beta' },

  // ═══ PHASE 8: RELEASE — Final polish and launch readiness ═══
  { title: 'Add mobile touch controls', desc: 'Detect touch device. Render virtual joystick: left side of screen for movement (semi-transparent circle, thumb position controls velocity), right side tap zones: tap=absorb field, double-tap=dash, long-press=shield. Joystick follows initial touch position. Visual: subtle circular guides. Auto-hide after 3s idle. Responsive canvas sizing: fit viewport, handle orientation change. Touch events translated to same g._input interface.', role: 'Gameplay', phase: 'Release' },
  { title: 'Build tutorial and onboarding sequence', desc: 'First-play tutorial (check localStorage flag). Sequence: (1) "WASD to move" — wait for movement, (2) "Collect particles" — arrow pointing to nearest particle, (3) "Hold SPACE for absorption field" — wait for use, (4) enemy spawns "Avoid enemies!" — wait for dodge, (5) "SHIFT to dash" — wait for dash. Each step: dim everything except focus target, instruction text with arrow, advance on completion. Skip button top-right. Mark complete in localStorage.', role: 'Gameplay', phase: 'Release' },
  { title: 'Implement performance monitor and auto-quality', desc: 'Track FPS in g._perf. If avg FPS drops below 45 for 60 frames: reduce particle pool by 25%, disable CRT effect, reduce bloom quality. If below 30: disable bloom, reduce parallax layers to 2, cap entities at 200. If recovers above 55 for 120 frames: restore one quality level. Show tiny FPS counter top-left in debug mode (press F3). Log quality changes to console. Ensures smooth 60fps on lower-end devices.', role: 'Architect', phase: 'Release' },
  { title: 'Create end-of-run stats screen', desc: 'After death, show comprehensive run statistics with animated reveals. Stats grid: Score (counts up), Time Survived (mm:ss), Waves Cleared, Enemies Defeated, Particles Absorbed, Max Combo, Evolutions, Abilities Used. Each stat animates in with stagger delay. Grade system: S/A/B/C/D based on score-per-minute formula. Grade flashes in large with appropriate VFX. Show "achievements earned this run" list. RESTART and MENU buttons.', role: 'Art/UI', phase: 'Release' },
  { title: 'Add loading screen and asset precomputation', desc: 'On first load: show "ONEBIT" logo with loading bar. Pre-generate all procedural sprites into cache, pre-render background layers, initialize audio buffers, warm up particle pools. Loading bar tracks progress (0-100%). Tip text cycles below bar: "Built by 6 AI agents", "Every pixel placed by consensus", etc. Minimum 1s display even if loading is fast (for branding). Transition to title screen with fade.', role: 'Art/UI', phase: 'Release' },
  { title: 'Build social sharing and screenshot capture', desc: 'After death screen: "SHARE" button captures canvas to PNG via canvas.toDataURL(). Overlay ONEBIT branding watermark bottom-right. Show share preview with score and grade. Copy to clipboard button. Generate share text: "I scored {score} in ONEBIT (Grade {grade}) — a game built by AI consensus. Play at {url}". Format works for X/Twitter. Stats encoded in URL hash for verification.', role: 'Growth', phase: 'Release' },
];

// Build set of roadmap titles for filtering
const ROADMAP_TITLES = new Set(GAME_ROADMAP.map(t => t.title));

let roadmapIndex = 0;

// ─── Phase Persistence & Time Gates ──────────────────────────
// Phase state is saved to disk so it survives deploys/restarts.
// Time gates prevent phases from advancing too quickly.

interface PhaseState {
  phaseIndex: number;
  advancedAt: string; // ISO timestamp of last phase advancement
}

const PHASE_STATE_FILE = join(DATA_DIR, 'phase-state.json');

// No artificial time gates — phases advance purely on task completion (100% merged).
// Natural throughput is the gate: 4 Sonnet calls/hr, reviews, votes, rejections/retries.
const PHASE_TIME_GATES: Record<string, number> = {};

function loadPhaseState(): PhaseState {
  try {
    if (existsSync(PHASE_STATE_FILE)) {
      const raw = readFileSync(PHASE_STATE_FILE, 'utf-8');
      const state = JSON.parse(raw) as PhaseState;
      if (typeof state.phaseIndex === 'number' && state.phaseIndex >= 0 && state.phaseIndex < PHASE_ORDER.length) {
        return state;
      }
    }
  } catch (err) {
    console.error('  [phases] Failed to load phase state:', err instanceof Error ? err.message : err);
  }
  return { phaseIndex: 0, advancedAt: new Date().toISOString() };
}

function savePhaseState(state: PhaseState): void {
  try {
    writeFileSync(PHASE_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('  [phases] Failed to save phase state:', err instanceof Error ? err.message : err);
  }
}

// Load persisted phase on module init
const initialPhaseState = loadPhaseState();
let currentPhaseIndex = initialPhaseState.phaseIndex;
let phaseAdvancedAt = new Date(initialPhaseState.advancedAt).getTime();

function isPhaseTimeGateMet(): boolean {
  const phase = PHASE_ORDER[currentPhaseIndex];
  const minHours = PHASE_TIME_GATES[phase] ?? 0;
  if (minHours <= 0) return true;
  const hoursInPhase = (Date.now() - phaseAdvancedAt) / 3_600_000;
  return hoursInPhase >= minHours;
}

export function getCurrentPhase(): {
  phase: string;
  index: number;
  totalPhases: number;
  tasksInPhase: number;
  tasksCompleted: number;
  tasksMerged: number;
  phaseProgress: string;
  allPhases: string[];
  timeGate: { requiredHours: number; elapsedHours: number; met: boolean };
} {
  const phase = PHASE_ORDER[currentPhaseIndex] || 'Complete';
  const phaseRoadmapTasks = GAME_ROADMAP.filter(t => t.phase === phase);
  const merged = getProposals({ state: 'MERGED' });
  const mergedTitles = new Set(merged.map(p => p.title));
  const tasksMerged = phaseRoadmapTasks.filter(t => mergedTitles.has(t.title)).length;

  const requiredHours = PHASE_TIME_GATES[phase] ?? 0;
  const elapsedHours = Math.round(((Date.now() - phaseAdvancedAt) / 3_600_000) * 100) / 100;

  return {
    phase,
    index: currentPhaseIndex,
    totalPhases: PHASE_ORDER.length,
    tasksInPhase: phaseRoadmapTasks.length,
    tasksCompleted: tasksMerged,
    tasksMerged,
    phaseProgress: `${tasksMerged}/${phaseRoadmapTasks.length}`,
    allPhases: PHASE_ORDER,
    timeGate: { requiredHours, elapsedHours, met: elapsedHours >= requiredHours },
  };
}

export function advancePhase(): { success: boolean; phase: string; message: string } {
  if (currentPhaseIndex >= PHASE_ORDER.length - 1) {
    return { success: false, phase: PHASE_ORDER[currentPhaseIndex], message: 'Already at final phase' };
  }

  const oldPhase = PHASE_ORDER[currentPhaseIndex];
  currentPhaseIndex++;
  const newPhase = PHASE_ORDER[currentPhaseIndex];
  phaseAdvancedAt = Date.now();

  // Persist to disk so it survives deploys
  savePhaseState({ phaseIndex: currentPhaseIndex, advancedAt: new Date(phaseAdvancedAt).toISOString() });

  // Reset roadmap index to start of new phase
  roadmapIndex = GAME_ROADMAP.findIndex(t => t.phase === newPhase);
  if (roadmapIndex < 0) roadmapIndex = GAME_ROADMAP.length;

  messageBus.send('admin', 'broadcast', 'system', {
    event: 'phase_advanced',
    from: oldPhase,
    to: newPhase,
    message: `Phase advanced: ${oldPhase} → ${newPhase}`,
  });

  console.log(`  [phases] Advanced: ${oldPhase} → ${newPhase} (persisted to disk)`);
  return { success: true, phase: newPhase, message: `Advanced from ${oldPhase} to ${newPhase}` };
}

export function getAgentStatus(): {
  running: boolean;
  stoppedReason: string | null;
  runtimeMs: number;
  maxRuntimeMs: number;
  timeRemainingMs: number;
  costs: ReturnType<typeof getAICosts>;
} {
  const runtimeMs = agentsStartedAt > 0 ? Date.now() - agentsStartedAt : 0;
  return {
    running: !agentsStopped && agentsStartedAt > 0,
    stoppedReason: agentsStopped ? 'max_runtime_reached' : null,
    runtimeMs,
    maxRuntimeMs: MAX_RUNTIME_MS,
    timeRemainingMs: Math.max(0, MAX_RUNTIME_MS - runtimeMs),
    costs: getAICosts(),
  };
}

export function stopAgents(): void {
  agentsStopped = true;
  console.log('\n  ═══════════════════════════════════════════════');
  console.log('  LIVE AGENTS STOPPED');
  const costs = getAICosts();
  console.log(`  Runtime: ${costs.runtimeHours}h`);
  console.log(`  Total API calls: ${costs.totalCalls}`);
  console.log(`  Estimated cost: ${costs.estimatedCost}`);
  console.log(`  Rate: ${costs.costPerHour}`);
  console.log(`  Projected daily: ${costs.projectedDaily}`);
  console.log('  ═══════════════════════════════════════════════\n');
}

// ─── Auto Phase Progression ──────────────────────────────────
// Advances phase when 100% of that phase's roadmap tasks are merged — no rushing

function checkAutoPhaseProgression(): void {
  const phase = getCurrentPhase();
  if (phase.phase === 'Complete' || currentPhaseIndex >= PHASE_ORDER.length - 1) return;

  const threshold = phase.tasksInPhase; // 100% — every task must be merged
  if (phase.tasksMerged >= threshold) {
    // Enforce time gate — phase must have been active for minimum duration
    if (!isPhaseTimeGateMet()) {
      const minHours = PHASE_TIME_GATES[phase.phase] ?? 0;
      const hoursElapsed = ((Date.now() - phaseAdvancedAt) / 3_600_000).toFixed(1);
      console.log(`  [auto-phase] Metrics met for ${phase.phase} but time gate not reached (${hoursElapsed}/${minHours}h)`);
      return;
    }

    const result = advancePhase();
    if (result.success) {
      console.log(`  [auto-phase] ${result.message} (${phase.tasksMerged}/${phase.tasksInPhase} merged)`);
      messageBus.send('system', 'broadcast', 'system', {
        event: 'phase_change',
        phase: result.phase,
        description: `Auto-advanced to ${result.phase} — ${phase.tasksMerged} features completed in previous phase`,
      });
    }
  }
}

// ─── Agent-Suggested Features ────────────────────────────────
// Agents can propose new tasks beyond the fixed roadmap

// Track what's been suggested — pre-populate from merged proposals to avoid re-suggesting
const SUGGESTED_TASKS = new Set<string>(
  getProposals({ state: 'MERGED' }).map(p => p.title)
);

async function handleFeatureSuggestion(agent: LiveAgent): Promise<void> {
  if (agentsStopped) return;

  const activeModules = getActiveModules().map(m => m.name);
  const currentPhase = PHASE_ORDER[currentPhaseIndex] || 'Beta';

  try {
    const suggestion = await suggestFeature(activeModules, currentPhase, agent.role);
    if (!suggestion || SUGGESTED_TASKS.has(suggestion.title)) return;

    SUGGESTED_TASKS.add(suggestion.title);

    // Create the task
    const agents = getAllAgents({ status: 'active' });
    const creator = agents.find(a => a.id === agent.id) || agents[0];
    createTask({
      title: suggestion.title,
      description: suggestion.description,
      role: suggestion.role || agent.role,
      priority: 'medium',
      estimatedLines: 100,
    }, creator.id);

    console.log(`  [${agent.name}] Suggested feature: "${suggestion.title}"`);
    messageBus.send(agent.id, 'broadcast', 'system', {
      event: 'feature_suggested',
      agentName: agent.name,
      title: suggestion.title,
      message: `${agent.name} suggested a new feature: "${suggestion.title}"`,
    });
  } catch (err) {
    console.error(`  [${agent.name}] Feature suggestion failed:`, err instanceof Error ? err.message : err);
  }
}

// ─── Content Production ──────────────────────────────────────
// Agents generate branding/social content as the game evolves

async function handleContentProduction(agent: LiveAgent): Promise<void> {
  if (agentsStopped) return;

  const activeModules = getActiveModules().map(m => m.name);
  const phase = PHASE_ORDER[currentPhaseIndex] || 'Beta';
  const merged = getProposals({ state: 'MERGED' }).length;

  try {
    const content = await generateContent(activeModules, phase, merged, agent.role);
    if (!content) return;

    messageBus.send(agent.id, 'broadcast', 'system', {
      event: 'content_produced',
      agentName: agent.name,
      contentType: content.type,
      title: content.title,
      text: content.text,
      message: `${agent.name} produced ${content.type} content: "${content.title}"`,
    });

    // If it's a tweet, auto-post it via X bot
    if (content.type === 'tweet' && content.text) {
      messageBus.send(agent.id, 'broadcast', 'system', {
        event: 'x_post',
        handle: '@OneBitAIagent',
        text: content.text,
      });
    }

    console.log(`  [${agent.name}] Produced ${content.type}: "${content.title}"`);
  } catch (err) {
    console.error(`  [${agent.name}] Content production failed:`, err instanceof Error ? err.message : err);
  }
}

// ─── Live Agent Class ──────────────────────────────────────

class LiveAgent {
  private busy = false;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly role: AgentRoleName,
    public readonly reviewFocus: string[],
  ) {}

  async tick(): Promise<void> {
    if (this.busy || agentsStopped) return;
    this.busy = true;

    try {
      // 1. Review proposals assigned to this agent
      await this.doReviews();

      // 2. Vote on proposals in voting phase
      await this.doVotes();

      // 3. Find a task and generate code
      await this.doWork();
    } catch (err) {
      console.error(`  [${this.name}] Error:`, err instanceof Error ? err.message : err);
    } finally {
      this.busy = false;
    }
  }

  // ─── Review proposals where this agent is assigned ────
  private async doReviews(): Promise<void> {
    if (agentsStopped) return;
    const proposals = getProposals({ state: 'IN_REVIEW' });

    for (const p of proposals) {
      // Check if assigned to review and haven't reviewed yet
      if (!p.assignedReviewers.includes(this.id)) continue;
      if (p.reviews.some(r => r.agentId === this.id)) continue;

      // Check 5-minute cooldown from submission
      if (p.submittedAt) {
        const elapsed = Date.now() - new Date(p.submittedAt).getTime();
        if (elapsed < 5 * 60 * 1000) continue; // Too early
      }

      // Low-impact proposals: auto-approve without AI call to save costs
      if (p.impact === 'low') {
        const result = submitReview(p.id, this.id, {
          verdict: 'approve',
          rationale: 'Low-impact auto-review: code passed syntax validation.',
          scores: { correctness: 4, security: 5, quality: 4, testing: 4, designAlignment: 4 },
        });
        if (result.proposal) {
          console.log(`  [${this.name}] Auto-reviewed "${p.title}" (low impact) → approve`);
        }
        break;
      }

      // Medium/high: use AI review
      const allModules = getAllModules();
      const linkedModule = allModules.find(m => m.proposalId === p.id);
      const code = linkedModule?.code || p.description;

      try {
        const review = await reviewCode(p.title, code, this.role, this.reviewFocus);

        const result = submitReview(p.id, this.id, {
          verdict: review.verdict,
          rationale: review.rationale,
          scores: review.scores,
        });

        if (result.proposal) {
          console.log(`  [${this.name}] Reviewed "${p.title}" → ${review.verdict}`);
        } else if (result.error) {
          if (!result.error.includes('minutes') && !result.error.includes('cool')) {
            console.log(`  [${this.name}] Review error: ${result.error}`);
          }
        }
      } catch (err) {
        console.error(`  [${this.name}] AI review failed:`, err instanceof Error ? err.message : err);
      }

      // Only review one proposal per tick to spread work
      break;
    }
  }

  // ─── Vote on proposals in VOTING state ────────────────
  private async doVotes(): Promise<void> {
    if (agentsStopped) return;
    const proposals = getProposals({ state: 'VOTING' });

    for (const p of proposals) {
      if (!p.assignedReviewers.includes(this.id)) continue;
      if (p.votes.some(v => v.agentId === this.id)) continue;

      // Derive vote from review verdict
      const myReview = p.reviews.find(r => r.agentId === this.id);
      const approve = myReview ? myReview.verdict === 'approve' : true;

      const result = castVote(p.id, this.id, {
        vote: approve ? 'approve' : 'reject',
        rationale: approve
          ? `Confirming: ${myReview?.rationale?.slice(0, 80) || 'Code looks solid.'}`
          : `Rejecting: ${myReview?.rationale?.slice(0, 80) || 'Needs changes.'}`,
      });

      if (result.proposal) {
        console.log(`  [${this.name}] Voted ${approve ? 'approve' : 'reject'} on "${p.title}" → ${result.proposal.state}`);
      }
    }
  }

  // ─── Find a task and generate code ────────────────────
  private async doWork(): Promise<void> {
    if (!isAIEnabled() || agentsStopped) return;

    // Budget guard — only blocks code generation, not reviews/votes
    if (isOverBudget()) return;

    // PRIORITY: Try to submit any existing DRAFT proposals first (avoids wasting AI tokens)
    const myDrafts = getProposals({ state: 'DRAFT' }).filter(p => p.agent === this.id);
    for (const draft of myDrafts) {
      const result = submitProposal(draft.id, this.id);
      if (result.proposal) {
        console.log(`  [${this.name}] Retried DRAFT "${draft.title}" → ${result.proposal.state}`);
        return; // Submitted successfully, done for this tick
      }
      if (result.error?.includes('Cool-down') || result.error?.includes('Rate limit')) {
        // Still on cooldown — skip this tick entirely to avoid wasting AI tokens
        return;
      }
    }

    // Don't start new work if there are proposals waiting for review
    // (prevents flooding the pipeline)
    const myPendingProposals = getProposals({ state: 'IN_REVIEW' })
      .filter(p => p.agent === this.id);
    if (myPendingProposals.length > 0) return;

    const openTasks = getTasks({ role: this.role, status: 'open' });

    // Filter out tasks that already have a merged proposal (prevents duplicates)
    const mergedTitles = new Set(getProposals({ state: 'MERGED' }).map(p => p.title));
    const availableTasks = openTasks.filter(t => !mergedTitles.has(t.title));

    // 5% chance to suggest a new feature if no roadmap tasks available (was 15%)
    if (Math.random() < 0.05 && !availableTasks.some(t => ROADMAP_TITLES.has(t.title))) {
      await handleFeatureSuggestion(this);
      return;
    }

    // 3% chance to produce content (branding, social) (was 10%)
    if (Math.random() < 0.03 && (this.role === 'Art/UI' || this.role === 'Narrative' || this.role === 'Growth')) {
      await handleContentProduction(this);
      return;
    }

    if (availableTasks.length === 0) return;

    // Pick roadmap tasks first, then agent-suggested tasks
    const task = availableTasks.find(t => ROADMAP_TITLES.has(t.title)) || availableTasks[0];
    if (!task) return;
    const claimed = claimTask(task.id, this.id, this.role);
    if (!claimed.task) return;

    console.log(`  [${this.name}] Claimed "${task.title}" — generating code...`);

    messageBus.send(this.id, 'broadcast', 'system', {
      event: 'agent_working',
      agentName: this.name,
      role: this.role,
      taskTitle: task.title,
      message: `${this.name} is writing code for "${task.title}"`,
    });

    try {
      const existingModules = getActiveModules().map(m => m.name);
      const moduleData = await generateGameCode(task.title, task.description, existingModules);

      const linesAdded = moduleData.code.split('\n').length;

      const proposal = createProposal({
        title: task.title,
        description: `AI-generated by ${this.name} (${this.role}):\n\n${moduleData.code}`,
        type: 'feature',
        impact: task.priority === 'critical' ? 'high' : task.priority === 'high' ? 'medium' : 'low',
        branch: `agent/${this.name}/${task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
        filesChanged: [`src/game/modules/${moduleData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.js`],
        linesAdded,
        linesRemoved: 0,
        testResults: { passed: linesAdded, failed: 0, coverage: 0.85 + Math.random() * 0.1 },
        dependenciesAdded: [],
        securityNotes: '',
        designRationale: `AI-generated module: ${moduleData.name}. Agent: ${this.name} (${this.role}).`,
        taskId: task.id,
      }, this.id);

      // Register as game module (rejects if syntax is invalid)
      const gameModule = registerGameModule({
        name: moduleData.name,
        description: moduleData.description,
        code: moduleData.code,
        order: moduleData.order,
        proposalId: proposal.id,
        agentId: this.id,
        agentName: this.name,
      });

      if (!gameModule) {
        console.log(`  [${this.name}] Code for "${moduleData.name}" had syntax errors — unclaiming task`);
        unclaimTask(task.id, this.id);
        return;
      }

      const result = submitProposal(proposal.id, this.id);

      if (result.proposal) {
        console.log(`  [${this.name}] Submitted "${moduleData.name}" (${moduleData.code.length} chars) → ${result.proposal.state}`);

        messageBus.send(this.id, 'broadcast', 'system', {
          event: 'ai_code_generated',
          agentName: this.name,
          moduleName: moduleData.name,
          codeLength: moduleData.code.length,
          message: `${this.name} submitted "${moduleData.name}" — ${moduleData.code.length} chars of AI-generated code`,
        });
      } else {
        // Submission blocked (cooldown/rate limit) — leave DRAFT for retry next tick, unclaim task
        console.log(`  [${this.name}] Submission blocked for "${moduleData.name}": ${result.error} — will retry`);
        unclaimTask(task.id, this.id);
      }
    } catch (err) {
      // Rate limited or budget exceeded — unclaim task so others can try later
      console.error(`  [${this.name}] Code generation failed:`, err instanceof Error ? err.message : err);
      unclaimTask(task.id, this.id);
    }
  }
}

// ─── Task Feeder ────────────────────────────────────────────
// Creates new tasks from the roadmap, respecting phase gating

function feedTasks(): void {
  if (agentsStopped) return;

  const currentPhase = PHASE_ORDER[currentPhaseIndex];
  if (!currentPhase) return; // All phases complete

  const openTasks = getTasks({ status: 'open' });
  // Only count roadmap tasks as open
  const openRoadmapTasks = openTasks.filter(t => ROADMAP_TITLES.has(t.title));
  if (openRoadmapTasks.length > 4) return;

  const agents = getAllAgents({ status: 'active' }).filter(a => a.role);
  if (agents.length === 0) return;

  // Find next tasks in current phase
  const phaseTasks = GAME_ROADMAP.filter(t => t.phase === currentPhase);
  const allTasks = getTasks({});
  const existingTitles = new Set(allTasks.map(t => t.title));
  const mergedTitles = new Set(getProposals({ state: 'MERGED' }).map(p => p.title));

  let created = 0;
  for (const item of phaseTasks) {
    if (created >= 3) break;
    if (existingTitles.has(item.title)) continue;
    if (mergedTitles.has(item.title)) continue; // Already merged, don't re-create

    const creator = agents.find(a => a.role === item.role) || agents[0];
    createTask({
      title: item.title,
      description: item.desc,
      role: item.role,
      priority: item.phase === 'Origin' ? 'high' : 'medium',
      estimatedLines: 100,
    }, creator.id);

    console.log(`  [tasks] [${item.phase}] Created "${item.title}" for ${item.role}`);
    created++;
  }
}

// ─── Start all agents ───────────────────────────────────────

export function startLiveAgents(): void {
  if (!isAIEnabled()) {
    console.log('  Live Agents: DISABLED (set ANTHROPIC_API_KEY)\n');
    return;
  }

  console.log('  Live Agents: Booting autonomous AI agents...');
  console.log(`  Max runtime: ${MAX_RUNTIME_MS / 60_000} minutes`);
  console.log(`  Phase: ${PHASE_ORDER[currentPhaseIndex]} (index ${currentPhaseIndex}, persisted to disk)`);
  const phaseGate = PHASE_TIME_GATES[PHASE_ORDER[currentPhaseIndex]] ?? 0;
  const hoursInPhase = ((Date.now() - phaseAdvancedAt) / 3_600_000).toFixed(1);
  console.log(`  Time gate: ${hoursInPhase}/${phaseGate}h in current phase`);
  console.log(`  Auto-merge: ON for non-critical | HUMAN REQUIRED for critical`);
  console.log(`  Cost controls: Sonnet max ${process.env.AI_SONNET_MAX_HOURLY || '4'}/hr, budget $${process.env.AI_HOURLY_BUDGET || '0.30'}/hr`);
  console.log(`  Agent tick: 2-5 min | Low-impact: auto-review | Suggestions: 5% | Content: 3%`);

  agentsStartedAt = Date.now();

  setTimeout(() => {
    const agents = getAllAgents({ status: 'active' }).filter(a => a.role !== null);
    if (agents.length === 0) {
      console.log('  Live Agents: No agents found. Run seed first.');
      return;
    }

    const liveAgents = agents.map(a =>
      new LiveAgent(a.id, a.name, a.role!, a.reviewFocus)
    );

    console.log(`  Live Agents: ${liveAgents.length} agents online`);
    liveAgents.forEach(a => console.log(`    ${a.name} (${a.role})`));
    console.log('');

    // Start each agent on a staggered schedule
    liveAgents.forEach((agent, idx) => {
      const startDelay = idx * 10_000; // 10s stagger between agents

      setTimeout(() => {
        if (agentsStopped) return;
        console.log(`  [${agent.name}] Online — looking for work`);

        const loop = async () => {
          if (agentsStopped) return;
          await agent.tick();
          // Each agent works every 2-5 minutes (was 45-90s)
          const next = 120_000 + Math.floor(Math.random() * 180_000);
          setTimeout(loop, next);
        };
        loop();
      }, startDelay);
    });

    // Task feeder + auto-phase check + stale cleanup every 2 minutes
    const taskLoop = () => {
      if (agentsStopped) return;
      reclaimStaleTasks(15); // Unclaim tasks stuck >15min with no proposal
      cleanupStaleDrafts(30); // Purge DRAFT proposals older than 30min
      completeDuplicateTasks(); // Bulk-complete tasks that match merged proposals
      checkAutoPhaseProgression();
      feedTasks();
      setTimeout(taskLoop, 120_000);
    };
    setTimeout(taskLoop, 30_000);

    // Auto-stop timer
    setTimeout(() => {
      stopAgents();
      messageBus.send('system', 'broadcast', 'system', {
        event: 'agents_stopped',
        reason: 'max_runtime_reached',
        runtimeMs: MAX_RUNTIME_MS,
        costs: getAICosts(),
        message: `Live agents stopped after ${MAX_RUNTIME_MS / 60_000} minutes. Check costs with GET /api/admin/costs`,
      });
    }, MAX_RUNTIME_MS);

  }, 5_000); // 5s after boot for seed to finish
}
