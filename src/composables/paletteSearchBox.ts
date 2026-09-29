import { createGlobalFlag } from "./globalFlag";
import { PALETTE_SEARCH_BOX_DEFAULT } from "../../common/paletteSearchBox";

// Whether the top bar shows a search box that opens the command palette (#2569), hydrated from
// /api/config. The default lives in common/paletteSearchBox.ts; the key stays literal here, for the
// reason common/showLoadAverage.ts gives.
const flag = createGlobalFlag("paletteSearchBox", PALETTE_SEARCH_BOX_DEFAULT);

export const paletteSearchBox = flag.state;
export const setPaletteSearchBox = flag.set;
export const savePaletteSearchBox = flag.save;
