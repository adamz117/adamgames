// The five Nine Holes venues, with the colours the game paints them in (see
// public/games/nine-holes/index.html, PALETTES), for the homepage plate and venue tiles.
export interface Venue {
  id: 'forest' | 'beach' | 'alpine' | 'volcanic' | 'haunted';
  name: string;
  blurb: string;
  colors: {
    ground: [string, string, string];
    deep: string;
    rough: string;
    fwEdge: string;
    fw: string;
    green: string;
    collar: string;
    water: string;
    sand: string;
    sea: string;
    trees: string;
    ink: string;
  };
}

export const VENUES: Venue[] = [
  {
    id: 'forest',
    name: 'Pine Forest',
    blurb: 'Sheltered woodland with a river through the trees, and piles of fallen leaves that play like sand.',
    colors: { ground: ['#C9D8C4', '#B9CCB6', '#A8BEA8'], deep: '#6E8E68', rough: '#9EC48E', fwEdge: '#68915E', fw: '#DBF1C6', green: '#E2F7C6', collar: '#AFD397', water: '#9CCBE4', sand: '#E4D2A6', sea: '#6FAACB', trees: '#4F7D55', ink: '#1c3324' },
  },
  {
    id: 'beach',
    name: 'Coastal Beach',
    blurb: 'Links grass along the shore, with the sea down one side and nothing to stop the wind.',
    colors: { ground: ['#D9E6B4', '#CCDDA2', '#BED293'], deep: '#8E9C6F', rough: '#C2CE91', fwEdge: '#89A462', fw: '#E9F4C8', green: '#E2F7C6', collar: '#AFD397', water: '#8FD3DA', sand: '#EDE0BC', sea: '#3FA9C4', trees: '#7F9A5E', ink: '#27381f' },
  },
  {
    id: 'alpine',
    name: 'Highland Peaks',
    blurb: 'Thin mountain air, and granite boulders that kick a rolling ball on up the hole.',
    colors: { ground: ['#D9E2E5', '#BFCBD0', '#9BB7C5'], deep: '#566A5B', rough: '#8FA68E', fwEdge: '#536A58', fw: '#B9D3B7', green: '#E2F7C6', collar: '#AFD397', water: '#9CC6D8', sand: '#DCD3BC', sea: '#7FA9C0', trees: '#344F43', ink: '#1f2c33' },
  },
  {
    id: 'volcanic',
    name: 'Volcanic Island',
    blurb: 'Bright turf on the fire coast, basalt in the landing zones, and lava where you least want it.',
    colors: { ground: ['#AFCB83', '#86AD62', '#668D4B'], deep: '#314C32', rough: '#6E984E', fwEdge: '#4D7D39', fw: '#A8D55D', green: '#E2F7C6', collar: '#AFD397', water: '#5CC3D0', sand: '#55514C', sea: '#168FB0', trees: '#24492E', ink: '#16260f' },
  },
  {
    id: 'haunted',
    name: 'Spooky Forest',
    blurb: 'The pine forest at dusk, for the last ten days of October. Mind the pumpkins.',
    colors: { ground: ['#43503F', '#36412F', '#2A3226'], deep: '#223229', rough: '#466944', fwEdge: '#3E623B', fw: '#93B783', green: '#B4CF9F', collar: '#86AC78', water: '#5E7F92', sand: '#B8AA86', sea: '#2E4452', trees: '#1E3127', ink: '#eceadc' },
  },
];

export const venueById = (id: string) => VENUES.find((v) => v.id === id) ?? VENUES[0];
