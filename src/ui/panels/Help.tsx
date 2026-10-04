import { useEffect } from 'react';
import { STATS, VICTORY_THRESHOLD } from '../../engine/data';
import type { Options, UnitType } from '../../engine/types';
import { UnitSvg } from '../icons';
import { UNIT_GLYPH } from '../theme';

const NOTES: Record<UnitType, string> = {
  infantry: 'Attacks at 2 when paired with an artillery.',
  artillery: 'Raises one attacking infantry to 2.',
  armour: 'Can blitz through an empty enemy territory and keep going.',
  aaGun: 'Fires once at each attacking plane before the battle, hitting on 1. Moves only in noncombat.',
  factory: 'Places as many new units as its territory is worth. Bombing damage lowers that.',
  fighter: 'Lands on friendly territory or a carrier. Can escort or intercept raids if that rule is on.',
  bomber: 'Can raid an enemy industrial complex instead of fighting.',
  transport: 'Carries one land unit plus one infantry. Never fires; chosen as a casualty last.',
  submarine:
    'Fires a surprise strike first or submerges, unless an enemy destroyer is present. Planes cannot hit it without your own destroyer.',
  destroyer: 'Cancels enemy submarines’ surprise strike and submerging, and lets your planes hit them.',
  cruiser: 'Bombards the shore before a landing.',
  carrier: 'Carries two fighters.',
  battleship: 'Takes two hits to sink and is repaired after the battle. Bombards the shore before a landing.',
};

const CONTROLS = [
  [
    'Drag a piece',
    'Move every unit of that type in the space. Shift-drag moves everything you have there. Units that cannot reach stay behind.',
  ],
  ['Click a piece', 'Pick up one unit; click again for more. Shift-click takes all of that type, right-click puts one back.'],
  ['Click a space', 'Move what you are holding there. Highlighted spaces are in reach.'],
  ['Hover an enemy space', 'While holding units, see your chance to win if you attack.'],
  [
    'Transports',
    'Drop land units on a sea zone to load. Drag cargo onto a coast to land it; shift-drag lands everything aboard.',
  ],
  ['Purchase and mobilize', 'Click cards to buy, then drag new units from the tray onto a highlighted space.'],
];

const SHORTCUTS = [
  ['E', 'End the phase'],
  ['Ctrl or Cmd + Z', 'Undo the last move'],
  ['Esc', 'Clear the selection or close a dialog'],
  ['Enter', 'Start the turn, or confirm a warning'],
  ['?', 'Show or hide this help'],
];

export function Help({ options, onClose }: { options: Options; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const t = VICTORY_THRESHOLD[options.victory];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="turn-card help" onClick={(e) => e.stopPropagation()}>
        <header className="row">
          <h2 className="grow">How to play</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </header>
        <p>
          The Allies (Soviet Union, United Kingdom, United States) play against the Axis (Germany, Japan). Each round the powers
          play in this order: Soviet Union, Germany, United Kingdom, Japan, United States. After the United States’ turn, the Axis
          win holding {t.Axis} victory cities, or the Allies win holding {t.Allies}.
        </p>
        <div className="shortcuts controls">
          {CONTROLS.map(([how, what]) => (
            <div key={how}>
              <strong>{how}.</strong> {what}
            </div>
          ))}
        </div>
        <ol>
          <li>
            <strong>Purchase.</strong> Buy units. They wait off the board until Mobilize.
          </li>
          <li>
            <strong>Combat move.</strong> Move into enemy territories and sea zones to attack. Units moved now must end in a
            battle, except tanks that blitzed through an empty territory.
          </li>
          <li>
            <strong>Combat.</strong> Fight each battle: raids, then landings, then the rest. Attackers can retreat between rounds.
          </li>
          <li>
            <strong>Noncombat move.</strong> Move units that did not attack, and land every plane on friendly ground or a carrier.
          </li>
          <li>
            <strong>Mobilize.</strong> Place new units at your industrial complexes, ships next to them. Then you collect income.
          </li>
        </ol>
        <table className="help-units">
          <thead>
            <tr>
              <th />
              <th>Cost</th>
              <th>Att</th>
              <th>Def</th>
              <th>Move</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(Object.keys(NOTES) as UnitType[]).map((u) => (
              <tr key={u}>
                <td className="help-unit">
                  <UnitSvg type={u} color="var(--text)" size={22} />
                  {UNIT_GLYPH[u].name}
                </td>
                <td>{STATS[u].cost}</td>
                <td>{u === 'factory' ? '' : STATS[u].attack}</td>
                <td>{u === 'factory' ? '' : STATS[u].defense}</td>
                <td>{u === 'factory' ? '' : STATS[u].move}</td>
                <td className="dim">{NOTES[u]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="shortcuts">
          {SHORTCUTS.map(([key, what]) => (
            <div key={key}>
              <kbd>{key}</kbd> {what}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
