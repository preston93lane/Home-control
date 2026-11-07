# Hearts

A phone game of Hearts for 3, 4 or 5 players. Friends join from a texted link, empty seats are played by the computer, and the game master sends the final scores to the Hearts Championship Google Sheet.

It works the same way as the Golf game: one web page, with Firebase keeping everyone's phones in sync. It uses the Golf game's Firebase project, so there's nothing new to set up there.

## Playing

1. Open the page, type your name, tap **Create game**. You're the game master.
2. Tap **Invite players → Text it** to text the link (or read out the 4-letter room code).
3. In **Game master settings** choose:
   - **Players:** 3, 4 or 5
   - **Play to:** 50, 100 or 150
   - **Jack of ♦ = −10:** on or off
4. Tap **Start game**. Any empty seats are played by the computer.

Tap a card to pick it up, then tap it again to play it. If a phone reloads or goes to sleep, open the page again and tap **Back to game**.

### Rules used

- Pass 3 cards each hand. 4 players: left, right, across, no pass. 3 players: left, right, no pass. 5 players: left, right, 2 left, 2 right, no pass.
- 2♣ leads the first trick. You must follow suit. No hearts or Q♠ on the first trick unless you have nothing else. Hearts can't be led until one has been played.
- Each heart is 1 point, Q♠ is 13. Take all of them (shoot the moon) and everyone else gets 26.
- Jack of Diamonds option: whoever takes the J♦ gets −10.
- The game ends when someone reaches the target. Lowest score wins, and a tie means everyone tied wins.
- **3 players:** 2♦ removed, 17 cards each. **5 players:** 2♦ and 2♠ removed, 10 cards each.

## Google Sheet (one-time setup)

The sheet is rebuilt so each export just adds rows. Your old layout (a column per player) and the wins table are kept, but they're now calculated automatically.

| Tab | What's in it |
|---|---|
| **Games** | The log, with one row per player per game: Game ID, Date, Players, Player, Score, Won, Play to, J♦ −10, Hands. The app adds rows here. |
| **Score Grid** | The original layout: one row per game, one column per player, plus the date and player count. |
| **Standings** | Wins, games played, win %, wins and games at 3, 4 and 5 players, and average score for each player. Sorted by wins. |

Steps:

1. Open your Google Sheet (or a new, empty one) and go to **Extensions → Apps Script**.
2. Delete what's in the editor, paste in all of [`google-sheet/Code.gs`](google-sheet/Code.gs), and save.
3. Pick **setup** in the function menu and tap **Run**. Approve the permissions it asks for. This creates the three tabs and loads all 26 games from the 2025 championship sheet.
4. **Deploy → New deployment →** gear icon **→ Web app**. Set *Execute as* to **Me** and *Who has access* to **Anyone**, then tap **Deploy**.
5. Copy the **Web app URL** (it ends in `/exec`).
6. In the Hearts app, tap **Google Sheet & past games** on the main screen, paste the URL, and tap **Save**.

When a game ends, the game master taps **Export to Google Sheet**. Check that the names match the sheet's spelling (the name boxes suggest names already in the sheet), then tap **Send**. Computer players are left out unless you tick the box. If a game is sent twice, the sheet ignores the second copy. If there's no signal, send it later from **Google Sheet & past games**. **Copy rows** copies the rows so you can paste them into the Games tab yourself.

## Hosting

The game is a static page (`index.html` and `rules.js`), so you can host it the same way as Golf, for example on GitHub Pages. It has to be served over https, not opened as a file.

## Files

- `index.html`: the app (screens, multiplayer, export)
- `rules.js`: the rules, scoring and computer players
- `google-sheet/Code.gs`: the Apps Script for the spreadsheet
- `../test/hearts.test.js`: rules tests (`npm test`)
