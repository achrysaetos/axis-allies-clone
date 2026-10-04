import { space } from '../../engine/data';
import { factoryAt, unitsAt } from '../../engine/queries';
import { POWERS } from '../../engine/types';
import type { GameState, SpaceId } from '../../engine/types';
import { powerName } from '../theme';
import { PowerTag, UnitChips } from '../units';

export function SpaceInfo({ state, id }: { state: GameState; id: SpaceId }) {
  const def = space(id);
  const owner = state.owner[id];
  const factory = factoryAt(state, id);
  const units = unitsAt(state, id).filter((u) => u.type !== 'factory');
  return (
    <section className="hover-card">
      <h4>{id}</h4>
      <div className="facts">
        {def.water ? <span>Sea zone</span> : owner ? <PowerTag power={owner} /> : <span>Neutral</span>}
        {def.ipc > 0 && <span>{def.ipc} IPC</span>}
        {def.victoryCity && <span className="vc">★ Victory city</span>}
        {def.capital && <span>Capital of {powerName(def.capital)}</span>}
        {factory && <span>Factory{factory.damage > 0 ? ` (${factory.damage} damage)` : ''}</span>}
      </div>
      {POWERS.filter((p) => units.some((u) => u.owner === p)).map((p) => (
        <div key={p} className="hover-owner">
          <span className="dim">{powerName(p)}</span>
          <UnitChips units={units.filter((u) => u.owner === p)} />
        </div>
      ))}
    </section>
  );
}
