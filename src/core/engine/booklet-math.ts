/**
 * Booklet (Saddle-Stitch / Zine) Imposition Math
 */

export interface BookletSheetPair {
  leftPageNum: number;  // 1-based original page number, or 0 for blank padding
  rightPageNum: number; // 1-based original page number, or 0 for blank padding
}

export interface BookletSheet {
  front: BookletSheetPair;
  back: BookletSheetPair;
}

export function generateBookletSheets(pageNumbers: number[]): BookletSheet[] {
  const count = pageNumbers.length;
  // Pad up to next multiple of 4
  const remainder = count % 4;
  const paddedCount = remainder === 0 ? count : count + (4 - remainder);

  const paddedPages: number[] = new Array(paddedCount).fill(0);
  for (let i = 0; i < count; i++) {
    paddedPages[i] = pageNumbers[i];
  }
  // Remaining slots stay 0 (blank white pages)

  const sheets: BookletSheet[] = [];
  const numSheets = paddedCount / 4;

  for (let s = 0; s < numSheets; s++) {
    const leftFrontIdx = paddedCount - 2 * s - 1; // 0-based index
    const rightFrontIdx = 2 * s;

    const leftBackIdx = 2 * s + 1;
    const rightBackIdx = paddedCount - 2 * s - 2;

    const front: BookletSheetPair = {
      leftPageNum: paddedPages[leftFrontIdx],
      rightPageNum: paddedPages[rightFrontIdx],
    };

    const back: BookletSheetPair = {
      leftPageNum: paddedPages[leftBackIdx],
      rightPageNum: paddedPages[rightBackIdx],
    };

    sheets.push({ front, back });
  }

  return sheets;
}
