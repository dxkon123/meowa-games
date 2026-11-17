import type { WildEncounterTable } from '../map/MapData';
import type { SpeciesId } from '../story/GameSession';

export interface WildEncounter {
  species: SpeciesId;
  level: number;
}

/**
 * Reproducible encounter controller with cooldown and a soft pity system.
 * Repeated misses gradually raise the chance so long exploration never feels empty.
 */
export class WildEncounterController {
  private cooldown = 0;
  private misses = 0;

  constructor(private readonly random: () => number = () => Math.random()) {}

  tryEncounter(
    table: WildEncounterTable | undefined,
    x: number,
    y: number,
  ): WildEncounter | undefined {
    if (!table || !table.cells.some(([cellX, cellY]) => cellX === x && cellY === y)) {
      return undefined;
    }

    if (this.cooldown > 0) {
      this.cooldown -= 1;
      return undefined;
    }

    const pityBonus = Math.max(0, this.misses - 3) * 0.025;
    const effectiveRate = Math.min(0.9, table.encounterRate + pityBonus);
    if (this.random() >= effectiveRate) {
      this.misses += 1;
      return undefined;
    }

    const totalWeight = table.entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return undefined;

    let roll = this.random() * totalWeight;
    const entry = table.entries.find((candidate) => {
      roll -= candidate.weight;
      return roll < 0;
    }) ?? table.entries[table.entries.length - 1];
    if (!entry) return undefined;

    const levelSpan = Math.max(1, entry.maxLevel - entry.minLevel + 1);
    const level = entry.minLevel + Math.floor(this.random() * levelSpan);

    this.cooldown = Math.max(0, table.cooldownSteps);
    this.misses = 0;
    return { species: entry.species, level };
  }
}
