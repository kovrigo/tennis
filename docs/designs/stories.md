# Stories: Leningrad Oblast Tennis Federation website, first version

Brief: the Brief for the federation website, first version.

Roles: visitor (player, parent, coach or fan; no account), organizer (federation staff who run the site), chair umpire (keeps one match's score).

## Stories

- **S1.** As a visitor, I want to see upcoming, current and finished tournaments with their key facts and regulation, so that I can plan which ones to play or watch.
  - RTT and amateur tournaments are shown apart; search by name or city.
- **S2.** As a visitor, I want to follow the score of matches being played right now, so that I know what happens on court without being there.
  - A point shows within a few seconds, with no reload, including the current game.
- **S3.** As a visitor, I want to see a tournament's matches by day and court with their results, so that I know when a player plays and how it went.
- **S4.** As a visitor, I want to see the federation's rating lists and where each player's points came from, so that I can trust a player's place.
  - Points come only from a regulation's points table; national RTT points are never calculated.
  - Public player data is name, city and club only.
- **S5.** As a visitor, I want to read the federation's news, so that I hear about events and results.
- **S6.** As an organizer, I want to publish a tournament with its events, players and matches, each with a court, time and chair umpire, so that visitors and umpires see the plan.
  - Visitors see nothing until it is published.
  - Only organizers create accounts, for chair umpires and other organizers.
- **S7.** As an organizer, I want to set up points tables and rating lists from the regulations, and record and correct results and final stages, so that points reach the rating exactly as the regulation sets them.
  - Each points table names its regulation; a sample table says it is a sample.
  - Points are fixed when the event closes; only reopening the event recalculates them.
  - A final score can be entered for a match nobody scored live.
- **S8.** As an organizer, I want to publish news, so that visitors hear about the federation's events.
- **S9.** As a chair umpire, I want to keep my match's score point by point from a phone, so that visitors and the organizer see it live.
  - Only matches assigned to me; I can undo, pause, and end early by retirement, walkover or default.
  - A dropped connection or a page reload loses no point and counts none twice.
  - One phone per match; the organizer can hand it to another phone.
- **S10.** As an organizer, I want a printable protocol of every match, so that the tournament keeps a record of how each match went.
  - Anyone can open and print it.

## Coverage

Each outcome, with the story that covers it for each role. "gap" means the role may need it and the Brief is silent; "none" means the role has no use for it.

- See the tournament calendar
  - Visitor: S1
  - Organizer: S6
  - Chair umpire: none
- Follow live scores
  - Visitor: S2
  - Organizer: gap (watch every court at once while running the day)
  - Chair umpire: none
- See matches by day, court and result
  - Visitor: S3
  - Organizer: S6
  - Chair umpire: S9 (own matches on every day)
- See rating and points
  - Visitor: S4
  - Organizer: S7
  - Chair umpire: none
- Read and publish news
  - Visitor: S5
  - Organizer: S8
  - Chair umpire: none
- Keep a match's score
  - Visitor: none
  - Organizer: S7 (final score by hand)
  - Chair umpire: S9
- Get a match protocol
  - Visitor: S10
  - Organizer: S10
  - Chair umpire: gap (confirm the protocol of the match they scored)
- Get access to the site
  - Visitor: none
  - Organizer: gap (who may become an organizer)
  - Chair umpire: S6
- Fix wrong public data
  - Visitor: gap (report a wrong result or name)
  - Organizer: S7
  - Chair umpire: S9 (undo)

## Gaps

- **Organizer, watch every court at once.** On tournament day the organizer runs several courts. The Brief gives only the public live page; it is silent on whether that is enough.
- **Chair umpire, confirm the protocol of the match they scored.** Paper protocols are usually signed by the umpire. The Brief has no sign-off step.
- **Organizer, who may become an organizer.** The Brief creates the first organizer at install and lets any organizer add others. It does not say who decides.
- **Visitor, report a wrong result or name.** A parent may spot a wrong score or a misspelt child's name. The Brief offers only the footer contacts, and no way to ask to hide a minor's name.
- out: "Going live: production hosting, a domain name, backups and sending email."
- out: "Online entries, entry fees, waiting lists and payments."
- out: "Draw generation, seeding, brackets and automatic advancement."
- out: "Any sync with the national RTT calendar or ratings."
- out: "Calculating national RTT points."
- out: "Rating rules beyond the plain sum in a set period (see the list above)."
- out: "The official federation protocol layout, until we receive a blank sample."
- out: "Export beyond printing one match protocol, such as a whole tournament's results."
- out: "Tracking the individual server in doubles."
- out: "Match statistics beyond the score (aces, faults and similar)."
- out: "Player accounts, following a player, and notifications by email or messenger."
- out: "About, documents, clubs and courts, coaches and referees pages."
- out: "Site-wide search and the side filters from the prototype."
- out: "Redesign beyond the prototype, and an English version."
- out: "Merging duplicate player records."
- out: "A full history of who changed what."
