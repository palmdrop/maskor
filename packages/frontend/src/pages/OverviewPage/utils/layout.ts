// Tile sizing for the compact fragment tile (`TileContent`). The horizontal
// tile Overview was retired in favour of the vertical read/reorder surface (ADR
// 0010); `TileContent` survives only as the read-only tile used inside the
// place-in-sequence modal, so the density axis here is decoupled from the
// Overview's spine detail level.

export type TileDensity = "full" | "compact" | "mini";

export type TileDimensions = {
  tileWidth: number;
  tileHeight: number;
  tileClass: string;
};

export const TILE_DIMENSIONS_BY_DENSITY: Record<TileDensity, TileDimensions> = {
  full: { tileWidth: 160, tileHeight: 112, tileClass: "h-28 w-40 p-3" },
  compact: { tileWidth: 128, tileHeight: 56, tileClass: "h-14 w-32 p-2" },
  mini: { tileWidth: 80, tileHeight: 24, tileClass: "h-6 w-20 p-0" },
};
