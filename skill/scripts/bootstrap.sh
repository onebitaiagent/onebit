#!/bin/bash
# ============================================================
# AI Collaborative Game — Project Bootstrap Script
# ============================================================
# This script initializes the full project structure, including
# the consensus engine, CI pipeline, and agent role configuration.
#
# Usage: bash bootstrap.sh <project-name> [--with-example-game]
# ============================================================

set -euo pipefail

PROJECT_NAME="${1:-ai-collab-game}"
WITH_EXAMPLE="${2:-}"

echo "🎮 Bootstrapping AI Collaborative Game: $PROJECT_NAME"
echo "=================================================="

# --- Create project directory structure ---
echo "📁 Creating project structure..."

mkdir -p "$PROJECT_NAME"/{src/{core,gameplay/{mechanics,narrative,economy,procedural},rendering/{shaders,particles,camera},ui/{components,screens,hud},audio/{music,sfx},networking/{client,server}},assets/{sprites,audio/{music,sfx},shaders,fonts,data},tests/{unit,integration,e2e,canary},docs/{design/{game-mechanics,story,art-style},technical,marketing},".consensus"/{proposals,reviews,votes,audit-log},ci/{security-checks,build,deploy},tools/{dev-dashboard,analytics}}

cd "$PROJECT_NAME"

# --- Initialize Git ---
echo "🔧 Initializing Git repository..."
git init -q
git checkout -b main

# --- Create consensus configuration ---
echo "🛡️  Setting up consensus engine..."

cat > .consensus/config.json << 'CONSENSUS_CONFIG'
{
  "version": "1.0.0",
  "min_reviewers": 2,
  "approval_threshold": 0.67,
  "security_scan_required": true,
  "max_lines_per_proposal": 500,
  "auto_reject_patterns": [
    "eval\\(",
    "exec\\(",
    "subprocess",
    "os\\.system",
    "__import__",
    "importlib",
    "pickle\\.loads",
    "requests\\.get(?!.*approved_domains)",
    "open\\(.*/etc/",
    "socket\\.connect",
    "child_process",
    "Function\\(",
    "document\\.write",
    "innerHTML\\s*=(?!.*sanitize)",
    "XMLHttpRequest(?!.*approved_domains)",
    "fetch\\((?!.*approved_domains)"
  ],
  "approved_domains": [
    "localhost",
    "api.game.example.com"
  ],
  "mandatory_test_coverage": 0.80,
  "human_review_triggers": [
    "networking_changes",
    "file_system_access",
    "dependency_additions",
    "security_model_changes",
    "consensus_engine_modifications",
    "ci_pipeline_changes",
    "canary_test_changes"
  ],
  "cool_down_period_minutes": 10,
  "max_proposals_per_agent_per_hour": 5,
  "max_messages_per_agent_per_hour": 100,
  "review_timeout_minutes": 30,
  "blind_review": true,
  "hash_chain_audit_log": true,
  "canary_tests_path": "tests/canary/"
}
CONSENSUS_CONFIG

# --- Create agent role definitions ---
echo "🤖 Configuring agent roles..."

cat > .consensus/roles.json << 'ROLES_CONFIG'
{
  "agents": [
    {
      "id": "agent_architect",
      "role": "Architect",
      "owned_paths": ["src/core/**", "ci/**", "docs/technical/**"],
      "review_focus": ["architecture", "performance", "code_quality"],
      "can_emergency_block": false
    },
    {
      "id": "agent_gameplay",
      "role": "Gameplay",
      "owned_paths": ["src/gameplay/**", "docs/design/game-mechanics/**"],
      "review_focus": ["gameplay", "balance", "fun_factor"],
      "can_emergency_block": false
    },
    {
      "id": "agent_art_ui",
      "role": "Art/UI",
      "owned_paths": ["src/rendering/**", "src/ui/**", "assets/**"],
      "review_focus": ["visual_consistency", "ux", "accessibility"],
      "can_emergency_block": false
    },
    {
      "id": "agent_qa",
      "role": "QA/Testing",
      "owned_paths": ["tests/**", "ci/security-checks/**"],
      "review_focus": ["testing", "security", "reliability"],
      "can_emergency_block": true
    },
    {
      "id": "agent_narrative",
      "role": "Narrative",
      "owned_paths": ["src/gameplay/narrative/**", "docs/design/story/**"],
      "review_focus": ["narrative_consistency", "tone", "localization"],
      "can_emergency_block": false
    },
    {
      "id": "agent_growth",
      "role": "Growth",
      "owned_paths": ["docs/marketing/**", "src/ui/social/**", "tools/analytics/**"],
      "review_focus": ["virality", "onboarding", "retention"],
      "can_emergency_block": false
    }
  ]
}
ROLES_CONFIG

# --- Create package.json ---
echo "📦 Creating package.json..."

cat > package.json << 'PACKAGE_JSON'
{
  "name": "ai-collab-game",
  "version": "0.1.0",
  "description": "A game collaboratively built by AI agents with consensus-based governance",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:canary": "vitest run --config vitest.canary.config.ts",
    "lint": "eslint src/ --ext .ts,.tsx",
    "typecheck": "tsc --noEmit",
    "security:scan": "node ci/security-checks/scanner.mjs",
    "consensus:submit": "node tools/consensus-cli.mjs submit",
    "consensus:review": "node tools/consensus-cli.mjs review",
    "consensus:status": "node tools/consensus-cli.mjs status"
  },
  "dependencies": {
    "phaser": "^3.80.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.4.0",
    "@playwright/test": "^1.42.0",
    "eslint": "^8.57.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0"
  }
}
PACKAGE_JSON

# --- Create TypeScript config ---
cat > tsconfig.json << 'TSCONFIG'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
TSCONFIG

# --- Create README ---
echo "📝 Creating README..."

cat > README.md << 'README'
# 🎮 AI Collaborative Game

A production-quality game built entirely by AI agents working together through
democratic consensus.

## What Is This?

This is an experiment: can a team of specialized AI agents collaboratively build
a game that competes with human-made games? The agents debate design decisions,
review each other's code, and vote on changes — with safety mechanisms preventing
any single agent from going rogue.

## The Agent Team

| Agent | Role | Focus |
|-------|------|-------|
| 🏗️ Architect | Technical foundation | Performance, architecture, code quality |
| 🎮 Gameplay | Game mechanics | Fun factor, balance, depth |
| 🎨 Art/UI | Visuals & interface | Style, accessibility, shareability |
| 🧪 QA | Quality & security | Testing, security, reliability |
| 📖 Narrative | Story & text | Lore, dialogue, tone |
| 📈 Growth | Marketing & virality | Retention, sharing, community |

## Safety Model

Every code change goes through:
1. Automated security scanning
2. Peer review by 2+ agents (blind review)
3. Consensus vote (67% approval threshold)
4. Human oversight for sensitive changes

See `.consensus/config.json` for the full governance model.

## Development

```bash
npm install
npm run dev        # Start dev server
npm run test       # Run tests
npm run build      # Production build
```

## License

MIT
README

# --- Create initial game entry point ---
echo "🎮 Creating initial game files..."

cat > src/core/game.ts << 'GAME_ENTRY'
import Phaser from 'phaser';

/**
 * Main game configuration.
 * This is the entry point — all scenes, systems, and plugins
 * are registered here.
 *
 * CONSENSUS NOTE: Changes to this file require Architect approval.
 */
export const createGame = (containerId: string): Phaser.Game => {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: containerId,
    width: 800,
    height: 600,
    backgroundColor: '#1a1a2e',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [],
  };

  return new Phaser.Game(config);
};
GAME_ENTRY

cat > src/core/ecs.ts << 'ECS_CORE'
/**
 * Entity Component System (ECS) — Core
 *
 * Lightweight ECS for managing game entities. Chosen for:
 * - Clean separation of data (components) and logic (systems)
 * - Easy for multiple agents to work on different systems independently
 * - Cache-friendly data layout for performance
 *
 * CONSENSUS NOTE: Changes to ECS core require Architect approval.
 */

export type EntityId = number;
export type ComponentType = string;

export interface Component {
  type: ComponentType;
}

export class World {
  private nextEntityId: EntityId = 0;
  private entities: Map<EntityId, Map<ComponentType, Component>> = new Map();
  private systems: Array<(world: World, dt: number) => void> = [];

  createEntity(): EntityId {
    const id = this.nextEntityId++;
    this.entities.set(id, new Map());
    return id;
  }

  destroyEntity(id: EntityId): void {
    this.entities.delete(id);
  }

  addComponent(entityId: EntityId, component: Component): void {
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Entity ${entityId} not found`);
    entity.set(component.type, component);
  }

  getComponent<T extends Component>(entityId: EntityId, type: ComponentType): T | undefined {
    return this.entities.get(entityId)?.get(type) as T | undefined;
  }

  query(...types: ComponentType[]): EntityId[] {
    const results: EntityId[] = [];
    for (const [id, components] of this.entities) {
      if (types.every(t => components.has(t))) {
        results.push(id);
      }
    }
    return results;
  }

  addSystem(system: (world: World, dt: number) => void): void {
    this.systems.push(system);
  }

  update(dt: number): void {
    for (const system of this.systems) {
      system(this, dt);
    }
  }
}
ECS_CORE

# --- Create initial test ---
cat > tests/unit/ecs.test.ts << 'ECS_TEST'
import { describe, it, expect } from 'vitest';
import { World, Component } from '../../src/core/ecs';

interface PositionComponent extends Component {
  type: 'position';
  x: number;
  y: number;
}

interface VelocityComponent extends Component {
  type: 'velocity';
  vx: number;
  vy: number;
}

describe('ECS World', () => {
  it('creates entities with incrementing IDs', () => {
    const world = new World();
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    expect(e2).toBe(e1 + 1);
  });

  it('adds and retrieves components', () => {
    const world = new World();
    const entity = world.createEntity();
    const pos: PositionComponent = { type: 'position', x: 10, y: 20 };
    world.addComponent(entity, pos);

    const retrieved = world.getComponent<PositionComponent>(entity, 'position');
    expect(retrieved?.x).toBe(10);
    expect(retrieved?.y).toBe(20);
  });

  it('queries entities by component types', () => {
    const world = new World();
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    const e3 = world.createEntity();

    world.addComponent(e1, { type: 'position', x: 0, y: 0 } as PositionComponent);
    world.addComponent(e1, { type: 'velocity', vx: 1, vy: 0 } as VelocityComponent);
    world.addComponent(e2, { type: 'position', x: 5, y: 5 } as PositionComponent);
    // e3 has no components

    const moving = world.query('position', 'velocity');
    expect(moving).toEqual([e1]);

    const positioned = world.query('position');
    expect(positioned).toEqual([e1, e2]);
  });

  it('destroys entities', () => {
    const world = new World();
    const entity = world.createEntity();
    world.addComponent(entity, { type: 'position', x: 0, y: 0 } as PositionComponent);
    world.destroyEntity(entity);

    const result = world.query('position');
    expect(result).toEqual([]);
  });

  it('runs systems each update', () => {
    const world = new World();
    const entity = world.createEntity();
    world.addComponent(entity, { type: 'position', x: 0, y: 0 } as PositionComponent);
    world.addComponent(entity, { type: 'velocity', vx: 10, vy: 5 } as VelocityComponent);

    world.addSystem((w, dt) => {
      for (const id of w.query('position', 'velocity')) {
        const pos = w.getComponent<PositionComponent>(id, 'position')!;
        const vel = w.getComponent<VelocityComponent>(id, 'velocity')!;
        pos.x += vel.vx * dt;
        pos.y += vel.vy * dt;
      }
    });

    world.update(1);
    const pos = world.getComponent<PositionComponent>(entity, 'position')!;
    expect(pos.x).toBe(10);
    expect(pos.y).toBe(5);
  });
});
ECS_TEST

# --- Create audit log initializer ---
cat > .consensus/audit-log/init.json << 'AUDIT_INIT'
{
  "entry_id": "audit_0",
  "timestamp": "BOOTSTRAP",
  "actor": "system",
  "action": "project_initialized",
  "target": "project",
  "details": {
    "message": "Project bootstrapped. Consensus engine active."
  },
  "previous_hash": "GENESIS",
  "entry_hash": "PENDING_FIRST_RUN"
}
AUDIT_INIT

# --- Create .gitignore ---
cat > .gitignore << 'GITIGNORE'
node_modules/
dist/
.env
*.local
.DS_Store
coverage/
playwright-report/
GITIGNORE

# --- Create Vite config ---
cat > vite.config.ts << 'VITE_CONFIG'
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    port: 3000,
  },
});
VITE_CONFIG

# --- Create index.html ---
cat > index.html << 'INDEX_HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Collaborative Game</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a1a; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    #game-container { max-width: 100vw; max-height: 100vh; }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script type="module">
    import { createGame } from './src/core/game.ts';
    createGame('game-container');
  </script>
</body>
</html>
INDEX_HTML

# --- Initial commit ---
git add -A
git commit -q -m "🎮 Initial project bootstrap — consensus engine active"

echo ""
echo "✅ Project '$PROJECT_NAME' bootstrapped successfully!"
echo ""
echo "Next steps:"
echo "  1. cd $PROJECT_NAME"
echo "  2. npm install"
echo "  3. npm run dev"
echo ""
echo "Agent team ready. Consensus engine active."
echo "Begin Sprint 1 — propose a game concept! 🚀"
