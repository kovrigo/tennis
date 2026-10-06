# Brief: Leningrad Oblast Tennis Federation website, first version

Status: draft for sign-off. Documentation only; nothing is built yet.

## The ask

"A simple public site with tournament schedule, live match scoring, organizer and chair umpire administration, players and points, news, and match protocol export."

The attached prototype is the agreed starting layout, not the final design. This Brief proposes the smallest first version that does all six things for real. Redesign and extras wait for later tasks.

## The problem

The federation runs tournaments across the region. Players, parents and coaches need one place to see:

- which tournaments are coming;
- what happens on court right now;
- who won;
- where each player stands in the federation's rating.

Federation staff need a way to publish all of this. Chair umpires need a way to send the score from court as they keep it.

The prototype shows the wanted result. It is a single page with fixed sample content. Nothing in it is stored, entered or updated.

## Who has it

- **Visitor:** a player, parent, coach or fan. Reads the site, no account.
- **Organizer:** federation staff who run the site. Publishes tournaments, players, matches, results, points and news. Gives chair umpires access.
- **Chair umpire:** the umpire on the chair for one match. Keeps that match's score on a phone. Sees and changes nothing else.

## What exists today

- In the project: an empty site that already runs on the test server. No data, no accounts, no pages yet.
- The prototype: five screens. Home, RTT tournaments, amateur tournaments, rating and live score.
- Every name, tournament, score, rating, address and phone number in the prototype is sample data. Its own footer says so ("демонстрационные данные").
- We have not seen the federation's current site, rating spreadsheet, regulations or paper score sheets. This Brief assumes none of them.

## What the prototype keeps and what it drops

Kept as the starting layout: the header and its four sections, colours, fonts, the home page slider, tournament cards, live match cards and the rating list.

Dropped in the first version, because they have no data or function behind them yet:

- the site-wide search button and the side filters by age, category, surface and district;
- the "apply in 2 minutes" and "run a tournament" tiles, and every "apply" and "waiting list" button;
- entry counters such as "46/64";
- the top bar links (about, documents, clubs and courts, coaches, contacts);
- the "about", "clubs" and "coaches and referees" blocks, partners and social links;
- the rating's singles, combined and doubles switch, the "recalculated every Monday" line, and the columns for change since last week, wins, win rate and best result;
- the calendar's PDF download and its note about syncing with the RTT calendar;
- the live page's status filter;
- match "statistics" links and the "bracket" link.

Nothing from the prototype is faked. A part with no real data behind it is left out.

## Premises

1. Points come from the federation's written regulations, never from rules we make up.
2. National RTT points belong to the Russian Tennis Tour. This site never calculates them.
3. This version ends on the test site with sample data. Every page there says the data is sample. A sample points table names its source as "sample, not a regulation". Going live is a separate task.
4. Many matches will have no chair umpire. Organizers must be able to enter a final score by hand.
5. Courts may have weak mobile internet. A point tapped on a working phone must never be lost or counted twice.

## Alternatives considered

1. **Showcase site, results by hand.** Calendar, news and final scores typed in by organizers. The rating is uploaded as a ready table from the federation's own spreadsheet. No live scoring. Smallest effort and no regulation risk. Rejected: live scoring is a core part of the ask.
2. **Federation site with live scoring and points tables (chosen).** All six areas, each in its simplest real form. Chair umpires score point by point. Points come from tables the organizer copies from each regulation. Medium-to-large effort.
3. **Full tournament management.** Everything in option 2, plus online entries and fees, automatic draws and seeding, and automatic advancement. It also adds a sync with the national RTT calendar and a full rating rules engine. Best long-term shape. Rejected for now: it needs regulations, payment and integrations we do not have.

## Chosen approach

Option 2. The site is in Russian. Every public page and the chair umpire's screen work on a phone.

### Public pages

- **Home:** a slider of the next tournaments, matches live now, the three latest news and the top five of one rating list. The organizer picks that list.
- **RTT tournaments** and **Amateur tournaments:** the calendar, split by type as in the prototype. Tabs for upcoming, current and finished, and a search by name or city.
- **Tournament page:** its facts, regulation, entry page link, matches by day and court, and final stages with points.
- **Live score:** matches across all tournaments, one tab per day with today open first, and a filter by tournament.
- **Match protocol:** one page per match, printable.
- **Rating:** one tab per rating list.
- **Player page:** the player's places and results.
- **News:** a list and one page per news item.

The header keeps the prototype's four sections and adds News. The footer shows the contacts the organizer enters: address, phone and email. It stays empty until they are entered. Sign-in for staff is a small footer link.

### Tournament calendar

- The organizer adds a tournament with: name, dates, city and venue, type (RTT or amateur), and category as written in its regulation. Also: age group, surface, number of courts, referee's name, and entry deadline.
- Each tournament carries its regulation document (Положение) as a file or a link. It can carry a plain link to an outside entry page, such as the RTT page on tennis.ru.
- A tournament has one or more events (разряды), for example "boys under 15, singles".
- A tournament stays a draft, unseen by visitors, until the organizer publishes it. The organizer can return it to draft.
- Its events and matches show as soon as the tournament is published, including ones added later.
- Player pages and rating lists show only results from published tournaments.

### Order of play and results

- The organizer adds matches: event, round, players (two per side for doubles), court, planned day and time, chair umpire and match format.
- A round is a plain name the organizer types, such as "1/4 финала" or "Группа А". Knockout and group events both work this way.
- A player slot can stay empty until known. Visitors see "to be decided".
- The organizer moves winners to the next round by hand. The site does not build draws.
- A match is one of: scheduled, live, paused, finished, or not played.
  - It turns live when the umpire records who serves first.
  - "Not played" is set by the organizer for a match that will not take place. It has no winner. A walkover is different: it is a finished match with a winner.
- For a match nobody scored live, the organizer types the result: games per set, tiebreak points, any match tiebreak score, the winner, and how it ended. It ended as completed, retirement, walkover or default.
- Players are picked from one shared list. Adding a name that already exists shows a warning, so ratings do not split across duplicates.
- Anything a result or a rating uses cannot be deleted: players, matches, events, tournaments, points tables and rating lists. Accounts are switched off, never deleted.

### Live scoring

- The chair umpire signs in on a phone and sees their assigned matches for every day of the tournament.
- They record who serves first. Then they tap which side won each point.
- The site counts points, games, sets and tiebreaks for the chosen format. It also tracks which side serves.
- The score is always rebuilt from the list of points. So undo removes the last point exactly, across games and sets, and can be repeated.
- The umpire can pause and resume a match, for example for rain. Visitors see that it is paused. Pauses do not count toward match duration.
- A match ends when one side wins. The umpire can undo that last point to reopen it. The umpire can also end a match as a retirement, a walkover or a default.
- Visitors see the score change within a few seconds, without reloading. They see the current game too, for example 30–15.
- If the connection drops, the umpire keeps tapping. The phone keeps the points in order and sends them when the connection returns. The screen shows how many points wait to be sent.
- Waiting points survive a page reload. A resent point is never counted twice.
- Only one phone scores a match at a time. A second phone is refused until the organizer hands the match over, to the same umpire or another one. The score continues from the last point the site received.
- After a handover, points still waiting on the old phone are refused. Points lost on a dead phone are fixed by the organizer by hand.
- In doubles the site tracks which pair serves, not which player.
- The organizer picks the match format per event, from the tournament's regulation, and can change it per match. All formats follow the standard tennis scoring rules. Tiebreaks go to seven points and match tiebreaks to ten, each won by two. With no-advantage scoring, one point at deuce decides the game. Four formats, each with advantage or no-advantage scoring:
  - best of three sets, tiebreak at six all;
  - two sets with tiebreak at six all, and a match tiebreak instead of a third set;
  - one set, tiebreak at six all;
  - short sets, and a match tiebreak instead of a third set. A short set goes to the first with four games and a two-game lead. At four all a tiebreak decides it.

  The tournament's regulation is the source. The organizer checks each format against it before use.

### Match protocol

- Every match has a protocol page. Anyone can open it and print it or save it as PDF from the browser.
- It shows: tournament, event, round, court, date, chair umpire, players, who served first, start and end time, and duration. It also shows the score by sets with tiebreak points, how the match ended, and each game in order with who served.
- A match entered by hand shows only its result, marked "entered by hand".
- An organizer can correct the result of any match. The protocol then shows the corrected result, hides the game-by-game list, and says "corrected by organizer" with the date.
- The layout is our own, not the official federation form. See decision 2.

### Players, points and rating

Points depend only on regulations, in this exact way:

- **Points tables.** The organizer enters a points table copied from an official regulation. Each row is a stage label and its points, for example "winner", "finalist", "1/2", "1/4", "1/8". The organizer types the stage labels as the regulation names them. A stage with no row earns zero. Each table records its source: the document name, its date, and a file or link.
- **Which events earn points.** Each event either has a points table and a rating list, or has neither. An event with neither earns no points. An RTT event may carry a federation table if the federation's regulation says so. National RTT points are never calculated.
- **Doubles.** A doubles event can feed its own rating list. Each partner gets the table's points. If a regulation gives doubles a smaller share, the organizer enters a separate table with those smaller numbers.
- **Closing an event.** When an event ends, the organizer records each player's final stage. In an event with a table, the stage is picked from the table's rows. Otherwise the organizer types it. In doubles the stage is recorded once per pair. The site looks up the points and shows them on the tournament and player pages. Points are fixed at that moment. A later change to the table does not change past events.
- **Correcting a closed event.** The organizer can reopen an event, fix stages and close it again. Points are then recalculated from the event's table as it is at that moment.
- **Rating lists.** Each list has a name, a counting period, and links to the regulations behind it. A list contains only players from events assigned to it.
- **Totals and places.** A player's total is the sum of points from events whose tournament's last day falls inside the counting period. The organizer sets the period's start and end dates from the regulation. Equal totals share a place, and the next place is skipped (1, 1, 3). Each row also shows how many events counted.
- **New season.** The organizer creates a new list for each new period. Old lists stay visible.
- **Players.** Each player has a page with their places and every event result. A result shows its points, or only the stage when the event earns none. Public data is name, city and club only.

The first version does not do the following. Each needs the regulation's exact wording first:

- counting only a player's best few results;
- a counting period that moves forward by itself each week;
- bonus points for beating a higher-ranked player;
- a minimum number of tournaments to appear in a list;
- tie-breaking rules other than a shared place;
- weekly rating history and change arrows;
- checking a player's age against an age group.

### News

- The organizer writes news: title, date, text with paragraphs and links, and one optional picture.
- News stays a draft until the organizer publishes it.

### Accounts

- Visitors have no accounts.
- The first organizer account is created on the server when the site is installed.
- Organizers create accounts for other organizers and for chair umpires, reset their passwords, and switch accounts off.
- A chair umpire can only score the matches assigned to them.

### How it will be built

- On the existing empty site, which already runs on the test server.
- All data lives in one database file on the server. No extra service needs to run.
- Pictures and regulation files are stored on the server next to it.

## Out of scope for this version

- Going live: production hosting, a domain name, backups and sending email.
- Online entries, entry fees, waiting lists and payments.
- Draw generation, seeding, brackets and automatic advancement.
- Any sync with the national RTT calendar or ratings.
- Calculating national RTT points.
- Rating rules beyond the plain sum in a set period (see the list above).
- The official federation protocol layout, until we receive a blank sample.
- Export beyond printing one match protocol, such as a whole tournament's results.
- Tracking the individual server in doubles.
- Match statistics beyond the score (aces, faults and similar).
- Player accounts, following a player, and notifications by email or messenger.
- About, documents, clubs and courts, coaches and referees pages.
- Site-wide search and the side filters from the prototype.
- Redesign beyond the prototype, and an English version.
- Merging duplicate player records.
- A full history of who changed what.

## Decisions for the CEO

1. **The rating model.** Is the model in "Players, points and rating" enough for the federation's rating regulation? It is a points table by stage reached, summed over a set period. Can RTT tournaments in the region also earn federation points? Four defaults are our own choice, not taken from any regulation:
   - equal totals share a place, and the next place is skipped (1, 1, 3);
   - an event counts by its tournament's last day;
   - each doubles partner gets the table's full points;
   - the four match formats offered.

   Recommendation: confirm the model and these defaults for this version. Let each event carry a table only when a regulation gives it one. Send the regulation when available; it changes only the tables an organizer enters, unless it contradicts a default above.
2. **Protocol layout.** Our own clear printable layout, or the official federation form? Recommendation: our own layout now. If the official form is required, we need a blank sample.
3. **One organizer role.** Federation staff hold all organizer rights, or each club organizes only its own tournaments? Recommendation: one role with full rights now; club organizers later.
4. **Public player data.** Name, city and club only, with no birth dates? The federation confirms it holds consent to publish results, including for minors. Recommendation: yes, those three fields only.

## Success criteria

On the test site, with sample data marked as sample:

- An organizer publishes a tournament with an 8-player singles event, a doubles event and their matches.
- A chair umpire scores singles and doubles matches point by point from a phone. Visitors on another phone see each point within 5 seconds.
- The umpire's connection drops mid-game. Scoring goes on, and the points arrive in order, none lost or doubled, once it returns.
- One match ends in a retirement. The organizer types the final score of another match nobody scored live.
- The organizer closes the singles event. The players' points appear in the rating list and on their pages, matching the points table.
- Every match's protocol opens and prints as one clean page.
- News appears on the home page.
- Every public page reads well on a phone, with no sideways scrolling.

## Next step

The federation should send three things. The build does not wait for them; the test site uses sample tables meanwhile.

- the regulation that sets rating points;
- a blank official match protocol, if one is required;
- the name of one organizer and one chair umpire who will try the test site. We arrange their access.
