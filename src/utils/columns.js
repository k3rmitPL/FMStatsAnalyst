// Display names for Football Manager CSV export columns.
// Keys are the raw CSV headers (kept unchanged in the stored data);
// values are the labels shown in the UI. Mirrors FMCol in FM27DataAnalysis.
// Columns not listed here are shown with their original header.

const COLUMN_LABELS = {
  Inf: 'Info',
  'Based In': 'League Nation',
  'Best Pos': 'Best Position',

  DoB: 'Date of Birth',

  'Contract Start Date': 'Contract Start',
  Expires: 'Contract End',

  "Player's Interest": 'Player Interest',

  'From Bench': 'Played From Bench',

  'Int Apps': 'International Appearances',
  'International Appearances (Season)': 'International Appearances This Season',
  'Int Gls': 'International Goals',
  'Yth Apps': 'Youth International Appearances',
  'Yth Gls': 'Youth International Goals',

  Apps: 'Appearances',
  'Mins/Gm': 'Minutes per Game',

  'Goals per 90 minutes': 'Goals per 90',
  'xG/90': 'Expected Goals per 90',
  xG: 'Expected Goals',
  'NP-xG': 'Non-Penalty Expected Goals',
  'NP-xG/90': 'Non-Penalty Expected Goals per 90',
  'xG-OP': 'Expected Goals Overperformance',
  'xG-OP/90': 'Expected Goals Overperformance per 90',
  'Mins/Gl': 'Minutes per Goal',

  Pens: 'Penalties Taken',
  'Pens/90': 'Penalties Taken per 90',
  'Pens S': 'Penalties Scored',
  'Pens S/90': 'Penalties Scored per 90',
  'Pen/R': 'Penalties Scored Ratio',
  'Pens Saved': 'Penalties Saved',
  'Pens Faced': 'Penalties Faced',
  'Pens Saved Ratio': 'Penalties Saved Ratio',

  xA: 'Expected Assists',
  'xA/90': 'Expected Assists per 90',
  'Asts/90': 'Assists per 90',

  MLG: 'Mistakes Leading to Goal',
  'MLG/90': 'Mistakes Leading to Goal per 90',

  'Cln/90': 'Clean Sheets per 90',
  'Tcon/90': 'Team Goals Conceded per 90',
  'Tgls/90': 'Team Goals per 90',

  Fouls: 'Fouls Made',
  'Fouls/90': 'Fouls Made per 90',
  'Fouls Against/90': 'Fouls Against per 90',

  Drb: 'Dribbles Made',
  'Drb/90': 'Dribbles Made per 90',
  'Sprints/90': 'High Intensity Sprints per 90',
  Off: 'Offsides',
  'Off/90': 'Offsides per 90',
  Distance: 'Distance Covered',
  'Dist/90': 'Distance Covered per 90',

  'Cr A': 'Crosses Attempted',
  'Crs A/90': 'Crosses Attempted per 90',
  'Cr C': 'Crosses Completed',
  'Cr C/90': 'Crosses Completed per 90',
  'Cr C/A': 'Cross Completion Ratio',

  'OP-Crs A': 'Open Play Crosses Attempted',
  'OP-Crs A/90': 'Open Play Crosses Attempted per 90',
  'OP-Crs C': 'Open Play Crosses Completed',
  'OP-Crs C/90': 'Open Play Crosses Completed per 90',
  'OP-Cr %': 'Open Play Cross Completion Ratio',

  'Pas A': 'Passes Attempted',
  'Ps A/90': 'Passes Attempted per 90',
  'Ps C': 'Passes Completed',
  'Ps C/90': 'Passes Completed per 90',
  'Pas %': 'Passes Completed Ratio',
  Key: 'Key Passes',
  'KP/90': 'Key Passes per 90',
  'OP-KP/90': 'Open Play Key Passes per 90',
  CCC: 'Clear Cut Chances Created',
  'Ch C/90': 'Clear Cut Chances Created per 90',
  PsP: 'Progressive Passes',
  'Pr passes/90': 'Progressive Passes per 90',

  'Tck A': 'Tackles Attempted',
  'Tck A/90': 'Tackles Attempted per 90',
  // FM's Tck/90 counts completed tackles.
  'Tck/90': 'Tackles Completed per 90',
  'Tck C': 'Tackles Completed',
  'Tck R': 'Tackle Completion Ratio',
  'K Tck': 'Key Tackles',
  'K Tck/90': 'Key Tackles per 90',

  'Shts Blckd': 'Shots Blocked (Defending)',
  'Shts Blckd/90': 'Shots Blocked (Defending) per 90',

  'Pres A': 'Pressures Attempted',
  'Pres A/90': 'Pressures Attempted per 90',
  'Pres C': 'Pressures Completed',
  'Pres C/90': 'Pressures Completed per 90',

  Blk: 'Blocks',
  'Blk/90': 'Blocks per 90',

  Itc: 'Interceptions',
  'Int/90': 'Interceptions per 90',

  'Clr/90': 'Clearances per 90',

  'Poss Won/90': 'Possession Won per 90',
  'Poss Lost/90': 'Possession Lost per 90',

  'Conv %': 'Shot Conversion Rate',
  'Shot/90': 'Shots per 90',
  ShT: 'Shots on Target',
  'ShT/90': 'Shots on Target per 90',
  'Shot %': 'Shots on Target Ratio',
  'Shots From Outside The Box Per 90 minutes': 'Shots From Outside the Box per 90',
  'Goals From Outside The Box/90': 'Goals From Outside the Box per 90',
  'Free Kick Shots/90': 'Free Kick Shots per 90',
  'xG/shot': 'Expected Goals per Shot',

  'Con/90': 'Goals Conceded per 90',

  'Sv %': 'Save Ratio',
  'xSv %': 'Expected Save Percentage',
  xGP: 'Expected Goals Prevented',
  'xGP/90': 'Expected Goals Prevented per 90',
  'Saves/90': 'Saves per 90',
  Svp: 'Saves Parried',
  'Svp/90': 'Saves Parried per 90',
  Svh: 'Saves Held',
  'Svh/90': 'Saves Held per 90',
  Svt: 'Saves Tipped',
  'Svt/90': 'Saves Tipped per 90',

  'Hdrs A': 'Headers Attempted',
  'Aer A/90': 'Headers Attempted per 90',
  Hdrs: 'Headers Won',
  'Hdr %': 'Headers Won Ratio',
  'Hdrs W/90': 'Headers Won per 90',
  'K Hdrs/90': 'Key Headers per 90',
  'Hdrs L/90': 'Headers Lost per 90',

  Yel: 'Yellow Cards',
  'Yel/90': 'Yellow Cards per 90',
  Red: 'Red Cards',
  'Red/90': 'Red Cards per 90',
  PoM: 'Player of the Match',
  'PoM/90': 'Player of the Match per 90',

  Starts: 'Played From Start',
}

/**
 * Returns the display label for a column header.
 * `info` is the column's entry from the import's columnInfo; its unit is appended, e.g. "Height (cm)".
 */
export function columnLabel(column, info) {
  const label = COLUMN_LABELS[column] ?? column
  return info?.unit ? `${label} (${info.unit})` : label
}
