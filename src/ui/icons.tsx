import type { UnitType } from '../engine/types';

/** Silhouettes drawn in a 20 by 12 box, so a piece reads at a glance like the sculpts on the board. */
const SHAPES: Record<UnitType, string> = {
  infantry: 'M9 1a2 2 0 1 1 0 .1zM7 4h4l1 4h-1.4l-.4 4H8.8l-.4-4H6.5zM12 3.5l3-2.5.6.6-3 2.6z',
  artillery: 'M3 6h9l6-4 .8 1.2-6 4.3H3zM6 7a3 3 0 1 1 0 .1zM2 9h3v1H2z',
  armour: 'M2 6h16v4H2zM6 3h7v3H6zM13 4h6v1h-6zM3 10h14l-1.5 2h-11z',
  aaGun: 'M4 8h12v3H4zM7 8 9 2h1L8.5 8zM11.5 8 14 2h1l-2.4 6zM8 6h5v2H8z',
  factory: 'M2 11V5l4 2.5V5l4 2.5V5l4 2.5V1h3v10z',
  fighter: 'M9 0h2l.5 5H19v2h-7.5l-.5 2.5 2.5 1.2V12H7v-1.3l2.5-1.2L9 7H1V5h7.5z',
  bomber: 'M9 0h2l.4 4.5H20V7h-8.6l-.3 2.6 2.9 1V12H6v-1.4l2.9-1L8.6 7H0V4.5h8.6z',
  transport: 'M1 7h18l-2 4H3zM5 3h8v4H5zM13 5h3v2h-3z',
  submarine: 'M1 8c3-2 15-2 18 0-3 2-15 2-18 0zM8 4h3v3H8zM9 2h1v2H9z',
  destroyer: 'M0 7h20l-3 3H3zM7 4h5v3H7zM13 5h2v2h-2zM9 2h1v2H9z',
  cruiser: 'M0 7h20l-3 3H3zM4 5h3v2H4zM8 3h4v4H8zM13 5h3v2h-3zM16 5.5h3v.8h-3zM1 5.5h3v.8H1z',
  carrier: 'M0 6h20v2l-2 3H2L0 8zM13 2h3v4h-3z',
  battleship: 'M0 7h20l-2.5 4h-15zM3 5h3v2H3zM7 2h5v5H7zM13 5h3v2h-3zM16 5.4h4v.9h-4zM0 5.4h3v.9H0z',
};

export function UnitIcon({
  type,
  x = 0,
  y = 0,
  scale = 1,
  fill,
}: {
  type: UnitType;
  x?: number;
  y?: number;
  scale?: number;
  fill: string;
}) {
  return <path d={SHAPES[type]} fill={fill} transform={`translate(${x},${y}) scale(${scale})`} />;
}

/** The same silhouette as a standalone inline image for HTML trays and dialogs. */
export function UnitSvg({ type, color, size = 20 }: { type: UnitType; color: string; size?: number }) {
  return (
    <svg width={size} height={(size * 12) / 20} viewBox="0 0 20 12" className="unit-svg">
      <path d={SHAPES[type]} fill={color} />
    </svg>
  );
}
