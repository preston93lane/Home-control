/**
 * Hearts Championship: score sheet + receiver for the Hearts app.
 *
 * Paste this into Extensions → Apps Script of your Google Sheet, run setup() once,
 * then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Copy the web app URL (ends in /exec) into the Hearts app.
 *
 * Tabs it creates:
 *   Games       – the log. One row per player per game. The app appends here.
 *   Score Grid  – the old layout: one row per game, one column per player, date, player count.
 *   Standings   – wins by 3/4/5 players, games played, win %, average score. All formulas.
 */

var GAMES = 'Games';
var GRID = 'Score Grid';
var STANDINGS = 'Standings';
var HEADERS = ['Game ID', 'Date', 'Players', 'Player', 'Score', 'Won', 'Play to', 'J♦ −10', 'Hands'];

// Your games so far, from the "2025 Hearts championship" sheet.
// The last game had no date written down, so its date is left blank.
var HISTORY = [
  ['1/11/25',  { Johnny: 69, Joseph: 114, Nathan: 85, Preston: 70 }],
  ['5/27/25',  { Aaron: 91, Johnny: 42, Preston: 101 }],
  ['5/27/25',  { Aaron: 44, Johnny: 117, Preston: 75 }],
  ['10/25/25', { Aaron: 12, Nathan: 2, Tyler: 100, Preston: 18 }],
  ['4/26/26',  { Aaron: 80, Joseph: 102, Nathan: 64, Tyler: 42 }],
  ['5/7/26',   { Aaron: 23, Johnny: 105, Nathan: 52, Preston: 26 }],
  ['5/7/26',   { Aaron: 14, Nathan: 64, Preston: 104 }],
  ['5/7/26',   { Aaron: 79, Nathan: 100, Preston: 81 }],
  ['5/16/26',  { Aaron: 109, Nathan: 82, Preston: 64, 'John Rieth': 94 }],
  ['5/17/26',  { Aaron: 90, Joseph: 82, Nathan: 86, Preston: 107, 'John Rieth': 82 }],
  ['5/24/26',  { Aaron: 100, Johnny: 49, Nathan: 10, Preston: 60, Jordan: 118 }],
  ['5/24/26',  { Aaron: 75, Nathan: 108, Preston: 73, Jordan: 90 }],
  ['6/12/26',  { Nathan: 100, Preston: -14, 'John Rieth': 42 }],
  ['6/12/26',  { Nathan: 68, Preston: 91, 'John Rieth': 101 }],
  ['6/20/26',  { Nathan: 121, Preston: 32, 'John Rieth': 87 }],
  ['6/30/26',  { Nathan: 106, Preston: 62, 'John Rieth': 75 }],
  ['7/1/26',   { Aaron: 47, Nathan: 115, Preston: 30 }],
  ['7/1/26',   { Aaron: 106, Nathan: 46, Preston: 62 }],
  ['7/11/26',  { Aaron: 33, Joseph: 102, Nathan: 45, Preston: 71, 'John Rieth': 35 }],
  ['7/11/26',  { Joseph: 95, Nathan: 78, Preston: 81, 'John Rieth': 110 }],
  ['8/14/26',  { Aaron: 17, Johnny: 98, Chloe: 118 }],
  ['9/4/26',   { Nathan: 110, Preston: 28, 'John Rieth': 52 }],
  ['9/4/26',   { Aaron: 58, Nathan: 100, Preston: 82, 'John Rieth': 115, 'J donavan': 87 }],
  ['10/14/26', { Aaron: 97, Johnny: 47, Preston: 116 }],
  ['10/14/26', { Aaron: 48, Johnny: 17, Preston: 103, 'John Rieth': 65 }],
  ['',         { Aaron: 44, Preston: 106, 'John Rieth': 84 }]
];

/** Run once from the Apps Script editor. Safe to run again: it never duplicates games. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var games = ensureGamesSheet_(ss);
  if (games.getLastRow() < 2) importHistory_(games);
  buildGrid_(ss);
  buildStandings_(ss);
  SpreadsheetApp.getActive().toast('Hearts sheet is ready. Now deploy it as a web app.');
}

/** The Hearts app POSTs finished games here. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var g = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActive();
    var sheet = ensureGamesSheet_(ss);
    if (!ss.getSheetByName(STANDINGS)) { buildGrid_(ss); buildStandings_(ss); }

    var ids = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === g.gameId) return json_({ ok: true, duplicate: true, added: 0 });
    }
    var date = parseIsoDate_(g.date);
    var rows = (g.results || []).map(function (r) {
      return [g.gameId, date, g.players, String(r.name).trim(), Number(r.score), r.won ? 1 : 0,
              g.target, g.jd ? 'Yes' : 'No', g.hands];
    });
    if (!rows.length) return json_({ ok: false, error: 'No players in the export' });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    return json_({ ok: true, added: rows.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Lets you open the web app URL in a browser to check it's running. */
function doGet() {
  return json_({ ok: true, message: 'Hearts score sheet is ready to receive games.' });
}

/* ---------------- helpers ---------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parseIsoDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
}

function parseShortDate_(s) {
  var m = /^(\d+)\/(\d+)\/(\d+)$/.exec(s || '');
  return m ? new Date(2000 + +m[3], +m[1] - 1, +m[2]) : '';
}

function ensureGamesSheet_(ss) {
  var sh = ss.getSheetByName(GAMES) || ss.insertSheet(GAMES, 0);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('B:B').setNumberFormat('m/d/yy');
  return sh;
}

function importHistory_(sheet) {
  var rows = [];
  HISTORY.forEach(function (game, i) {
    var date = game[0], scores = game[1];
    var names = Object.keys(scores);
    var low = Math.min.apply(null, names.map(function (n) { return scores[n]; }));
    var id = 'H' + ('00' + (i + 1)).slice(-3);   // H001… sorts before app games (H2026…)
    names.forEach(function (n) {
      rows.push([id, parseShortDate_(date), names.length, n, scores[n], scores[n] === low ? 1 : 0, '', '', '']);
    });
  });
  sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
}

function buildGrid_(ss) {
  var sh = ss.getSheetByName(GRID) || ss.insertSheet(GRID);
  sh.clear();
  // One row per game (oldest first), one column per player, like the original sheet.
  sh.getRange('A1').setFormula(
    "=QUERY(" + GAMES + "!A:E,\"select A, B, C, max(E) where D is not null group by A, B, C pivot D order by A " +
    "label A 'Game', B 'Date', C 'Players'\",1)");
  sh.getRange('B:B').setNumberFormat('m/d/yy');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);
  sh.getRange('1:1').setFontWeight('bold');
}

function buildStandings_(ss) {
  var sh = ss.getSheetByName(STANDINGS) || ss.insertSheet(STANDINGS);
  sh.clear();
  var G = GAMES + '!';
  var P = G + 'D2:D', N = G + 'C2:C', W = G + 'F2:F', SC = G + 'E2:E';
  sh.getRange(1, 1, 1, 11).setValues([[
    'Player', 'Wins', 'Games played', 'Win %', '3 player wins', '4 player wins', '5 player wins',
    '3 player games', '4 player games', '5 player games', 'Avg score'
  ]]).setFontWeight('bold');
  // Players sorted by most wins.
  sh.getRange('A2').setFormula(
    '=ARRAYFORMULA(LET(p,UNIQUE(FILTER(' + P + ',' + P + '<>"")),w,COUNTIFS(' + P + ',p,' + W + ',1),SORT(p,w,FALSE,p,TRUE)))');
  var f = function (expr) { return '=ARRAYFORMULA(IF(A2:A="",,' + expr + '))'; };
  sh.getRange('B2').setFormula(f('COUNTIFS(' + P + ',A2:A,' + W + ',1)'));
  sh.getRange('C2').setFormula(f('COUNTIF(' + P + ',A2:A)'));
  sh.getRange('D2').setFormula(f('IFERROR(B2:B/C2:C,0)'));
  sh.getRange('E2').setFormula(f('COUNTIFS(' + P + ',A2:A,' + W + ',1,' + N + ',3)'));
  sh.getRange('F2').setFormula(f('COUNTIFS(' + P + ',A2:A,' + W + ',1,' + N + ',4)'));
  sh.getRange('G2').setFormula(f('COUNTIFS(' + P + ',A2:A,' + W + ',1,' + N + ',5)'));
  sh.getRange('H2').setFormula(f('COUNTIFS(' + P + ',A2:A,' + N + ',3)'));
  sh.getRange('I2').setFormula(f('COUNTIFS(' + P + ',A2:A,' + N + ',4)'));
  sh.getRange('J2').setFormula(f('COUNTIFS(' + P + ',A2:A,' + N + ',5)'));
  sh.getRange('K2').setFormula(f('ROUND(SUMIF(' + P + ',A2:A,' + SC + ')/C2:C,1)'));
  sh.getRange('D:D').setNumberFormat('0%');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
}
