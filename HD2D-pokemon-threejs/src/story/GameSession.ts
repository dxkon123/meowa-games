import { POKEMON_CATALOG, type SpeciesId } from '../battle/PokemonCatalog';
import { createPokemon } from '../battle/BattleData';
import {
  createDefaultInventory, sanitizeInventory, type BattleInventory,
} from '../battle/BattleItems';
export type { SpeciesId } from '../battle/PokemonCatalog';

export type StoryPhase =
  | 'intro_mom'
  | 'set_clock'
  | 'watch_tv'
  | 'visit_rival'
  | 'go_route101'
  | 'rescue_birch'
  | 'choose_starter'
  | 'first_battle'
  | 'starter_received'
  | 'free_roam';

export interface PokemonInstance {
  species: SpeciesId;
  nickname: string;
  level: number;
  experience: number;
  hp: number;
  maxHp: number;
  moves: Array<{ id: string; pp: number }>;
}

export interface AdventureStats {
  battles: number;
  wins: number;
  captures: number;
  defeats: number;
  escapes: number;
  streak: number;
  bestStreak: number;
}

interface SaveData {
  schemaVersion: 1;
  phase: StoryPhase;
  party: PokemonInstance[];
  storage: PokemonInstance[];
  inventory: BattleInventory;
  currentMap: string;
  player: { x: number; y: number; facing: 'down' | 'up' | 'left' | 'right' };
  stats: AdventureStats;
}

const SAVE_KEY = 'hd2d-pokemon-opening-v1';
const SAVE_BACKUP_KEY = `${SAVE_KEY}-backup`;
const ROSTER_BACKUP_KEY = `${SAVE_KEY}-before-six-species`;
const SPECIES_NAMES = new Map(
  POKEMON_CATALOG.map(({ id, name, legacyName }) => [id, { name, legacyName }]),
);

function defaultStats(): AdventureStats {
  return {
    battles: 0,
    wins: 0,
    captures: 0,
    defeats: 0,
    escapes: 0,
    streak: 0,
    bestStreak: 0,
  };
}

function sanitizeStats(value: unknown): AdventureStats {
  const source = value && typeof value === 'object'
    ? value as Partial<AdventureStats>
    : {};
  const count = (entry: unknown) =>
    typeof entry === 'number' && Number.isFinite(entry)
      ? Math.max(0, Math.floor(entry))
      : 0;

  return {
    battles: count(source.battles),
    wins: count(source.wins),
    captures: count(source.captures),
    defeats: count(source.defeats),
    escapes: count(source.escapes),
    streak: count(source.streak),
    bestStreak: count(source.bestStreak),
  };
}

/** 只迁移旧版本自动生成的英文名，不覆盖玩家自己输入的昵称。 */
export function localizeDefaultPokemonNames(pokemon: PokemonInstance[]): PokemonInstance[] {
  for (const mon of pokemon) {
    const species = SPECIES_NAMES.get(mon.species);
    if (species && mon.nickname === species.legacyName) mon.nickname = species.name;
  }
  return pokemon;
}

export class GameSession {
  phase: StoryPhase = 'intro_mom';
  party: PokemonInstance[] = [];
  storage: PokemonInstance[] = [];
  inventory: BattleInventory = createDefaultInventory();
  currentMap = 'player-house-1f';
  player: SaveData['player'] = { x: 8, y: 7, facing: 'up' };
  stats: AdventureStats = defaultStats();

  static load(): GameSession {
    const primary = GameSession.readSave(SAVE_KEY);
    if (primary) return primary;

    const backup = GameSession.readSave(SAVE_BACKUP_KEY);
    if (backup) {
      backup.save();
      return backup;
    }

    return new GameSession();
  }

  private static readSave(key: string): GameSession | undefined {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return undefined;
      const save = JSON.parse(raw) as Partial<SaveData>;
      if (save.schemaVersion !== 1 || !save.phase || !save.currentMap || !save.player) {
        return undefined;
      }

      const session = new GameSession();
      session.phase = save.phase;
      session.party = localizeDefaultPokemonNames(Array.isArray(save.party) ? save.party : []);
      session.storage = localizeDefaultPokemonNames(Array.isArray(save.storage) ? save.storage : []);
      session.inventory = sanitizeInventory(save.inventory);
      session.currentMap = save.currentMap;
      session.player = save.player;
      session.stats = sanitizeStats(save.stats);

      const previousPartySize = session.party.length;
      const previousStorageSize = session.storage.length;
      session.party = session.party.filter((mon) => SPECIES_NAMES.has(mon.species));
      session.storage = session.storage.filter((mon) => SPECIES_NAMES.has(mon.species));

      if (previousPartySize !== session.party.length || previousStorageSize !== session.storage.length) {
        try {
          if (localStorage.getItem(ROSTER_BACKUP_KEY) === null) {
            localStorage.setItem(ROSTER_BACKUP_KEY, raw);
          }
        } catch {
          // Storage limits must never stop game startup.
        }

        if (previousPartySize > 0 && session.party.length === 0) {
          session.party.push(session.storage.shift() ?? createPokemon('treecko', 5));
        }
        session.save();
      }

      return session;
    } catch {
      return undefined;
    }
  }

  save(): void {
    const data: SaveData = {
      schemaVersion: 1,
      phase: this.phase,
      party: this.party,
      storage: this.storage,
      inventory: this.inventory,
      currentMap: this.currentMap,
      player: this.player,
      stats: this.stats,
    };

    try {
      const previous = localStorage.getItem(SAVE_KEY);
      if (previous) localStorage.setItem(SAVE_BACKUP_KEY, previous);
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Private browsing or storage quota failures must not crash gameplay.
    }
  }

  recordBattle(result: 'victory' | 'defeat' | 'escaped' | 'captured'): void {
    this.stats.battles += 1;

    if (result === 'victory' || result === 'captured') {
      this.stats.wins += 1;
      this.stats.streak += 1;
      this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);

      if (this.stats.wins % 3 === 0) this.inventory.potion += 1;
      if (this.stats.wins % 5 === 0) this.inventory.pokeBall += 1;
      if (this.stats.wins % 10 === 0) this.inventory.greatBall += 1;
    } else {
      this.stats.streak = 0;
      if (result === 'defeat') this.stats.defeats += 1;
      if (result === 'escaped') this.stats.escapes += 1;
    }

    if (result === 'captured') {
      this.stats.captures += 1;
      if (this.stats.captures % 4 === 0) this.inventory.greatBall += 1;
    }

    this.save();
  }

  setPhase(phase: StoryPhase): void {
    this.phase = phase;
    this.save();
  }

  reset(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(SAVE_BACKUP_KEY);
    } finally {
      location.reload();
    }
  }
}
