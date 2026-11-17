import type { BattleInventory } from '../battle/BattleItems';
import type { AdventureStats } from '../story/GameSession';

export class ProgressHud {
  private readonly root = document.createElement('aside');

  constructor() {
    ProgressHud.installStyles();
    this.root.className = 'progress-hud';
    this.root.setAttribute('aria-label', 'Adventure progress');
    document.body.appendChild(this.root);
  }

  set(stats: AdventureStats, inventory: BattleInventory): void {
    this.root.innerHTML = `
      <div><b>WINS</b><span>${stats.wins}</span></div>
      <div><b>CAUGHT</b><span>${stats.captures}</span></div>
      <div><b>STREAK</b><span>${stats.streak}</span></div>
      <div><b>BALLS</b><span>${inventory.pokeBall + inventory.greatBall + inventory.ultraBall}</span></div>
    `;
  }

  private static installStyles(): void {
    if (document.querySelector('#progress-hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'progress-hud-styles';
    style.textContent = `
      .progress-hud{position:fixed;right:max(14px,env(safe-area-inset-right));top:max(14px,env(safe-area-inset-top));
        z-index:14;display:grid;grid-template-columns:repeat(2,minmax(74px,1fr));gap:6px;padding:8px;
        border:1px solid rgba(255,255,255,.2);border-radius:12px;background:rgba(8,19,21,.48);
        box-shadow:0 8px 28px rgba(0,0,0,.24);backdrop-filter:blur(7px);pointer-events:none;
        color:#f4fff9;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
      .progress-hud div{display:flex;align-items:center;justify-content:space-between;gap:9px;
        min-width:78px;padding:4px 6px;border-radius:7px;background:rgba(255,255,255,.055)}
      .progress-hud b{font-size:9px;letter-spacing:.08em;color:#a9d8c5}
      .progress-hud span{font-size:13px;font-weight:900}
      body.battle-active .progress-hud{display:none}
      @media (pointer:coarse),(max-width:900px){
        .progress-hud{right:max(10px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top));
          transform:scale(.9);transform-origin:right top;opacity:.86}
      }
      @media (max-width:520px){
        .progress-hud{grid-template-columns:repeat(4,auto);left:50%;right:auto;transform:translateX(-50%) scale(.78);
          transform-origin:top center;white-space:nowrap}
        .progress-hud div{min-width:58px}
      }
    `;
    document.head.appendChild(style);
  }
}
