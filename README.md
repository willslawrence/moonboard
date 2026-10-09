# Will's Wall

The crew's app for the wall at Will's. It was called MoonBoard Direct until 9 October 2026,
and was renamed so that nobody takes it for Moon's own app; the address and the repository
keep the old name.

Drive a MoonBoard v1 LED controller directly over BLE — no Arduino replacement
controller, no Raspberry Pi. We act as the BLE central and write the same
`l#S5,P9,E18#` ASCII string to the Nordic UART Service that the official app uses.

- **`docs/index.html`** — the app, one page, served by GitHub Pages at
  <https://willslawrence.github.io/moonboard/>. The benchmarks for five hold-set and
  angle combinations are built in, 1,580 problems in all. Find a route, light it, queue
  for the wall, log tries and sends, and see what the rest of the crew are on. On an
  iPhone the phone that holds the Bluetooth needs
  [Bluefy](https://apps.apple.com/app/id1492822055) (iOS Safari has no Web Bluetooth);
  every other phone can use any browser, through the relay.
- **`relay/`** — a Cloudflare Worker that passes what one phone lights to the phone at
  the wall, and keeps the crew's logbook.
- **`moonprobe.py`** — macOS BLE probe. `python3 moonprobe.py go` scans, finds the
  box, and dumps its GATT services. Read-only.
- **`docs/test.html`** — a bare wall test: single LEDs, a column, a row, the corners,
  and a stepper for finding the payload limit.
- **`docs/sketch.html`** — a sketchpad for drawing a pattern on the wall and copying it
  out as text.
- **`docs/known-good.html`** — the 27 August build, kept as a copy that is known to work.

## What is settled about the box

All of this was assumed at first and has since been checked against the wall.

- **It is Nordic UART**, as the probe found, and the one ASCII string is all it needs.
- **Holds are numbered from 0, up one column and down the next**: A1 = 0, A18 = 17,
  B18 = 18, K18 = 197. The page had four ordering modes while this was being found out;
  they are constants now.
- **Three colours are proven on this box**: `S` green, `P` blue, `E` red.
- **Holds must be listed in ascending number order.** Grouping them by type makes the box
  mis-colour holds and light strays beside isolated moves.
- **Every write redraws the whole wall**, sent in 20-byte chunks. The box gives no
  feedback, and there is a ceiling on how much it will render (see *Finding the payload
  limit*).

## Safety

Read-only except the one ASCII write. Nordic DFU/bootloader UUIDs are hard-blocked
in both the script and the page.

## The app, page by page

Four pages side by side, named in a bar along the foot of the screen: **Routes**,
**Board**, **Log**, and a cog at the right-hand end for **Settings**. Tap one, or swipe
sideways anywhere but on the picture. Android's Back button comes back to the board, after
closing whatever is open on top of it.

### Board

The page you climb from, top to bottom:

- **Light up Route** puts the open problem on the wall. **Show 2nd route** adds it beside
  what is already up (see *Two routes at once*).
- The picture of the wall with the open problem ringed: green start, blue, red finish.
  Flick it left or right to step through the list.
- Left of the picture, the wall's panel: **Next up**, **History**, the line, and what is
  on the wall (see *Two phones, one wall*).
- A row with the open problem's name and grade, which is also the way to the search,
  then **Quick log** and **Instagram**.
- A short list of routes. Scroll it and the picture shrinks into the top corner so the
  list has the room. It stays small while routes are picked, so the list can be gone
  through with each one showing on the small picture, and a tap on the picture brings
  it back.

There is no Hide button: once a problem is open the board stays, and taking a problem
off the wall is not something a stray tap should do with other people climbing. One tap on
the picture never opens anything either. It only undoes: it puts a shrunken picture back
and stops the beta climber. Two taps are for focus.

### Focus, and picking holds

Two taps on the picture and it fills the screen, with the open problem's name and grade
over it and nothing to press. Two more taps put the page back, and so does Back. A flick
still steps through the list.

In focus a tap on a hold rings it in violet, and another tap lets it go. With a hold
picked, two buttons come up under the picture, and a small cross that lets every hold go:

- **Light up taps** puts just those holds on the wall, all blue. It is a custom route:
  *On wall* names it that, with whoever lit it (see *What's on the wall*).
- **Search routes** goes to the page of routes with the list narrowed to the routes that
  use every picked hold. A note over the list says which holds, and its cross shows every
  route again.

Two taps leave focus only when both land on the same hold, so two neighbours tapped
quickly are two picks. Thirty holds can be picked at most.

### Routes

Nothing but the list. The search box has a small keyboard of its own on a phone, so the
phone's keyboard does not cover half the routes. Under it are the filters: a line with
two dots to drag for the easiest and hardest grade wanted, the **From** and **To** pickers
that say the same thing, **Sent** to show or hide what you have climbed, and **Sort**
(popular, best, easiest, hardest, A–Z). The filter button carries a green dot whenever
something is filtering, so a short list never looks like a bug. Pick a route and you are
back at the board with it open.

The list can also be narrowed to the routes that use certain holds, picked on the picture
(see *Focus, and picking holds*). While it is, a note over the list says which holds.

### Log

Logging, and what you have climbed. Top to bottom:

- **The open problem**, with **Log try** and **Log send**, then **Beta** and the
  **Logbook**. A small line offers to undo your last go (see *Logbook*).
- **Your history on this route**: one row for each session you were on it, a dot for
  every go.
- **Community**: who has climbed the open problem and how each of them first got up it,
  then what the rest of the crew have logged in the last eight hours. Tap one of their
  routes to open it.
- **This session**: the routes you have been on, and under them your sends, tries and
  hardest grade, with a dot for every go in the order they happened. A ring is a try, a
  green dot a send, a gold dot a flash. A session is a run of goes with no gap of four
  hours, so an evening that runs past midnight is still one session.
- **Earlier sessions**, a line each, which open to show their routes.

### Quick log

For logging without leaving the board. A tap on **Quick log** dims the screen and swings
out two round buttons: red logs a try at once, green is a send. The finger can also go
down on the button, slide on to one, and let go. A short line says what was logged.

### How a send is asked

A send needs one more answer: which go it was. Four green bubbles swing out in an arc
from the button that was pressed, under **Log send** and over **Quick log**: **Flash**,
**2nd**, **3rd**, **4+**. Because the tries are counted, the app already knows the likely
answer and rings it in white: no tries logged means flash, one means 2nd, three or more
means 4+. Tap it, or tap another if it is wrong. A tap on the dimmed screen, or on the
cross where the button was, puts them away with nothing logged.

A flash is the first go ever. Send a route you have already sent and it is a **session
send**: the bubbles say so, the tries that count are this session's, and it shows as
*Session flash*, *Session 2nd* and so on everywhere a send is shown, the way the
MoonBoard app names them. Nothing is stored differently. The log keeps flash, 2nd, 3rd
and 4+, and which of a climber's sends came first is worked out when rows are shown, so
old entries read correctly and points do not move.

### Two routes at once

Two people on different problems, without relighting between goes. Open the second
problem and tap **Show 2nd route**. It asks one question, and on yes the problem goes up
beside whatever is on the wall, which stays the main one.

On the wall each route then has one colour: the main one is all **blue**, the second all
**green**, and a hold they share is **red**. The box has only three colours and cannot
blink without redrawing everything, so a shared hold is steady red rather than
alternating. Starts are not marked on the wall. Every benchmark tops out on row 18, and
the phone shows the start. A second route put up with nothing else on the wall is all
green. On the phone the open problem keeps its usual colours and the second is drawn
dashed and orange.

Adding another problem replaces the second one. **Light up Route** puts one problem up
on its own, and that is also how a second one comes off. Nothing about the pair is kept
on a phone: which two are up is read back from the lights, so every phone sees the same
thing. The grade meter on row 1 stays dark while two are up.

### Beta

How to climb it: the order hands and feet go on. One beta per problem, shared by the
crew. **+ Beta** on the log page opens the tools beside the picture: pick a limb, tap a
hold. A foot can also go on the kickboard, or flag left, down or right, and a Hips row
shifts the weight left, square or right. Once a problem has one the button reads
**▶ Beta**, and a stick climber drawn to scale moves through it over the picture until
the picture is tapped. The line under the picture says who entered it, and lets you edit.

### Instagram

The MoonBoard app has no tag for each problem. Its *Beta videos* screen copies a caption
with the problem's name, grade, angle, setup and setter, and Moon's own servers gather
the posts that tag `@moonclimbing`. That gallery cannot be read from here, and the
Instagram app takes no link that carries a search: a link to Instagram's own search
opens the app at its front page.

So the Instagram button, at the end of the search row, opens a sheet of videos found by
Google. A Programmable Search engine kept to instagram.com is asked by Google's own script,
which is fetched the first time the sheet is opened and not before. Each row is one post:
a small picture where Google has one (about half of them), how the caption begins, who
posted it and when. A tap opens that post in Instagram. At the foot is a plain web search
for more, and Google's mark. New posts take a while to turn up, because Google has to
find them first.

Google matches a whole page, and an Instagram page carries the captions of the posts shown
beside it, so some of what comes back is a video of another route. A post is listed only
when its own caption names the route the way a problem is named: the whole name, with its
grade, "benchmark" or "BM" straight after it, a grade straight before it, or "set by" its
setter soon after (a name of three words or more may also simply open the caption). A name
inside a longer problem's name does not count (TESS WIDE is not TESS), and nor does a
caption that puts the problem on another hold set. This leaves out the odd real video that
only says the name, which the web search at the foot still finds.

The button still copies the app's caption, ready to paste into a post of your own. The
engine's id is `IG_CX` in the page; were it empty, the button would open the web search.

### Settings

The fourth page, behind the cog at the end of the row of pages. It was a sheet opened from
the search row until the cog moved down there.

- **Games on the wall**: Snake and Connect four. They open over the page.
- **Background**, for this phone only: light foggy grey, which every phone starts on,
  light taupe, or black. (Every phone was put back on the grey once, on 2026-10-08.)
- **Light the wall as soon as I pick a problem**, off unless a phone turns it on.
- **Show the grade on row 1**. Row 1 carries no holds on any 2016 benchmark, so it reads
  out the grade from A1 onward, one light per V-grade: five green up to V5, two blue for
  V6–V7, red from V8. On the 2019 and 2024 sets a few routes use row 1, and the meter is
  left off for those.
- **Hold set on the wall**. This changes the route list and the picture for everyone, so
  only switch it when the holds on the wall actually change.
- **Where you're climbing** (see below), a log of what the page has done, and the build
  stamp.

## Two phones, one wall

The box takes a single Bluetooth connection, so only one phone can hold the link. Everyone
else still gets the whole app - search, logbook, points, the line - with no Bluetooth at all.

Nothing to set up. Whoever taps **Connect** becomes the bridge automatically, and every other
phone posts what it lights to the relay for that phone to write. The room code ships with a
shared default, so a second phone just works. Bluetooth always wins if this phone has it.

The header only claims a connection it can prove. A room code being set means nothing on its
own — the relay answers with how many phones are bridging, and if that's zero a red banner
says so. Before that, losing Bluetooth mid-session left every button lit and the wall quietly
frozen.

The code is in public source, so it isn't a secret - but the relay only does anything while
someone is actively bridging.

**Where you're climbing**, in Settings, is which wall a phone talks to. It is Will's Wall
unless you say otherwise, and that needs no code. A different MoonBoard picks **Another wall**
and gives it a code of its own, the same on every phone there, so two walls on the same hold
set never light each other's problems. Each wall has its own line and its own evening's
routes. The logbook, the climbers and the hold-set setting are still one shared set.

### What's on the wall

When someone lights a problem, every other phone gets an **On wall** card naming it and who
put it up. One tap opens that problem. It sits at the foot of the panel left of the board,
and it settles into a plain label once you are looking at the problem that is up.

A custom route, lit from holds picked on the picture, has no name of its own, so the card
reads **Custom route** with whoever lit it. A tap opens the picture in focus with those
holds picked, to look at, change and light again. The line and tonight's history leave
custom routes out, because neither keeps the holds. A phone on an older build shows
nothing for one.

Opening it is a look, not a send - the problem is already lit, and re-sending would only put
your name on someone else's pick. For the same reason **Light the wall as soon as I pick a
problem** is off unless a phone turns it on: with several people on one wall, browsing the list
should not change what somebody is half way up.

The phone holding Bluetooth is the one that writes to the box, so it is the one that knows what
is up. It tells the relay; the relay hands it to everyone else in `/status`. A phone on an
older build that lights a problem without saying which is matched back to the list by its
holds, so the name still shows, just without a person. If the bridging phone itself is on an
older build the relay says nothing rather than guess.

### Next up

A line for the wall, the chalkboard by a pool table. **Next up**, at the top of the panel
left of the board, puts your name down with the problem that is open, and the lights do not
change. One spot each: tap it on another problem and you keep your place with that one
instead; tap **In line** to give the place up.

Under it the panel reads down towards the wall. A **History** bar, folded until it is
tapped, holds the problems that have been up this session; each is there once, however often
it was lit. Then the line, with whoever is next nearest the wall and **Put it up** on their
card. Then a band marked *Next up*, and at the foot what is on the wall now.

Tapping a card, in the line or in the history, opens that problem on your phone and lights
nothing. **Put it up** is the one tap that changes the wall. Anyone can tap it, and the problem
goes up under the name of the climber who was waiting, so *On wall* says whose go it is.
That is also what uses their spot: lighting your own queued problem with the bulb does the same.

The relay keeps the line and the history, because the phone at the wall drops off every time
its screen sleeps and a line that vanished with it would be no line at all. A spot nobody has
used in three hours is dropped, and after four hours with nothing lit the history starts again.

## Finding the payload limit

`docs/test.html` has a stepper that lights holds in wiring order from A1 up and reports the
byte and chunk count. The box gives no feedback on an over-long write - it just renders less
than it was sent - so the only honest measurement is a pattern you can count: ask for N, count
what lit, and where they stop matching is the ceiling.

Known so far: 213 bytes rendered during the first probing, but WILL WALL at 46 LEDs and 208
bytes never appeared, so something other than raw length is involved. Worth walking the
stepper up to settle it.

## Standby

Connecting a phone puts something on the wall, and it comes back whenever nothing is loaded.
It answers the only question you have at that moment - is this thing actually talking to the
box - without picking a problem to find out. It is WW - two overlapping Ws, twelve LEDs, one write, straight up, stays there.
WILL WALL was dropped — 46 LEDs and 208 bytes and it never rendered on the box, so the real
payload ceiling is lower than the 250 the earlier probing suggested. The moon, a climber, a dashed
frame, the scrolling MOON and nothing at all are still in the page, but the Settings choice
between them is hidden: every phone shows WW.

Patterns are stored as eighteen quoted rows using the sketchpad's own alphabet - `#` green,
`o` blue, `x` red - so anything drawn at the wall in `sketch.html` pastes straight in. Both
Will patterns came in that way.

The scrolling MOON is its own option rather than the default. The word can't sit still on the
wall - four letters want nineteen columns against eleven - but it can walk past, right to
left over about two seconds at a frame every 70ms, settling on the static moon. Only that
option animates; every other standby is one write and done, because an animation on every
clear would be the flicker all over again. Picking a problem mid-scroll cancels it.

MOON as letters doesn't fit: four letters need fifteen columns and the wall is eleven. The
moon itself does. All three drawings step around the dead A2 and A4 holds and stay inside the
payload the controller will render.

## The crew

No logins. The name picker in the header is who you are - set once, remembered on the
device - and **+ New climber…** at the foot of it adds a name. The relay Worker holds one
Durable Object with everyone's data, and `GET /lists` returns the lot. Anyone with the page
can write; that's the point.

Each climber also has a saved list of projects from the app's earlier days. Those lists are
still kept on the relay, but the page no longer offers a way to add to one or to look at one:
the list on screen is always the benchmarks for the hold set that is up.

## Logbook

**Log try** logs one attempt and **Log send** asks which go it was (see *How a send is
asked*). Both are on the log page, and **Quick log** does the same from the board.

The log page's own undo is careful. The relay's undo takes off a climber's newest entry,
whenever that was, so the page only offers it for a go from the current session, names the
go, and wants a second tap. Anything older is changed in the **Logbook**, where it can be
seen: any climber's entries, a block for each day, with the newest open. Hold a row there to
lock it or delete it. A locked entry cannot be deleted or undone, and **Lock my entries**
locks all of yours at once.

Rows live in the relay Worker as an append-only `log:` prefix, with a per-person `stats:`
index carrying the attempt count and the sends in order. `/lists` returns the index; the rows
themselves are only fetched when the log page or the **Logbook** opens, so the log can grow
without slowing the page. `done:` is still the chip and filter
index and is kept in step by the same write: each row of the route list carries the names of
those who have sent it, as coloured chips.

`POST /lists/log/import` takes a climber's logbook from the official MoonBoard app in one
batch, every row carrying the day it was really climbed. The rows land locked.

## Points

MoonBoard's own scheme: base 350 at 5+ climbing 50 a grade to 1200 at 8C, off the **setter**
grade, plus a bonus for a quick ascent - flash +53, second try +2, third try +1, nothing
beyond. Benchmarks only, and only the **first** successful ascent counts, so sending something
second go and flashing it later still scores the second go. That's why `stats` keeps the sends
in order rather than just the latest one. Ticks that predate the logbook have no recorded
result and score base with no bonus.

The top ten sits under the logbook; your own row is highlighted and pinned below if you're
outside it. Scores are worked out in the page from data it already has - no extra endpoint.

## Snake

In Settings, under *Games on the wall*. Played on the whole wall, eleven columns by eighteen
rows. Green body, blue head, red food; swipe the grid or use the arrows. It speeds up as it
grows.

Snake suits this box in a way Tetris doesn't. Every write redraws the whole wall, and the safe
payload is about 250 bytes - roughly 49 lit LEDs. A Tetris stack passes that at four or five
rows and the string starts truncating. A snake is a few dozen cells however long the game runs,
and constant movement makes a full redraw read as animation rather than flicker. Best lengths
are kept per climber.

## Connect four

In Settings, under *Games on the wall*. Opens as a full screen sheet and starts a game.

Each seat takes a climber from the name picker's roster, and a chess clock gives both the same
budget - two minutes by default - counting down only on their own turn. Run out and you lose
on time. A board that fills with no line is a draw: the clocks stop and nobody is given the
win. A win is recorded against the winner's name and the ranking below the board shows
who's ahead; top of the pile is king of the board. Wins only count when both seats are
named, so a knockabout doesn't pollute the record. Seven columns on C–I, six rows on 7–12 — middle of the
wall, clear of the dead A2 and A4 holds. Green plays first, blue second, and a winning
line goes red. One write per move, which suits a protocol that only does whole-wall
rewrites.

A red frame boxes the playfield in, with the top edge lit in whoever is to play. It steps
down from solid to dashed to nothing as the board fills, because a full board plus a solid
box overruns the payload the controller will render - solid holds to about 19 pieces and
dashed to 29, which is past the end of most games.

Whose turn it is shows two ways: a coloured dot in the page and the frame's top edge on the
wall, both steady. They used to pulse; every pulse frame rewrote the whole board and the
pieces winked along with the marker, which made a mess of the lights for no gain. One write
per move now, nothing on a timer.

## Board image

`docs/board-2016.png` is the 2016 wall photo from Moonboard-Guidebook (MIT), with
rings drawn over it the way the official app does. Hold centres on the 450x692
source are `x = 65 + (col-1)*34.6`, `y = 60 + (18-row)*34.6`, `r = 20`; the page
stores those as percentages so the overlay scales with the image. Column letters
and row numbers are printed on the photo. The wall artwork itself is Moon
Climbing's — fine for a personal page, not for anything you ship.

The 2019 and 2024 sets have drawn pictures, `board-2019.png` and `board-2024.png`, laid
out on an even grid, so their rings are placed by row and column alone.

## Benchmark data

One list for each hold set and wall angle, the benchmarks the Moon app shows for each,
inlined into the page so it works with no network at the wall:

| Hold set | Angle | Benchmarks |
|---|---|---|
| MoonBoard 2016 | 40° | 572 |
| Masters 2019 | 40° | 418 |
| Masters 2019 | 25° | 122 |
| MoonBoard 2024 | 40° | 427 |
| MoonBoard 2024 | 25° | 41 |

They come from the boardsesh catalog by way of boardhang's `catalog-data` (MIT). The 2016
rows keep the ids they have always had, because the crew's logbook points at them, and a
benchmark Moon has since retired is kept by name so an old logbook row still reads.

Holds arrive as `E6`-style grid refs and go through the same `holdNum()` as everything else
the page lights.

## On a phone's Home Screen

The page carries the tags and the manifest that let a phone open it full screen from a Home
Screen icon, with its own icon. An iPhone decides how an icon opens when the icon is made, so
one made before 7 October 2026 has to be deleted and added again.

The name under the icon is Will's Wall. An iPhone keeps the name an icon was made with, so
an icon from before 9 October 2026 still says MoonBoard until it is deleted and added again.

## Setup

```bash
python3 -m venv .venv && ./.venv/bin/pip install bleak
./go.sh
```

## Relay (drive the wall remotely)

`relay/` is a Cloudflare Worker at `moonboard-relay.willslawrence.workers.dev`.
The phone opens a WebSocket to `/ws?room=<code>` and acts as the BLE bridge;
anything POSTed to `/send?room=<code>` is written to the wall. A payload has to be
`l#…#` made of `S`, `P`, `E`, digits and commas, or it is refused.

`/send` also takes `now: {id, by, board}` - which problem this is and whose phone lit it - and
`/status?room=<code>` answers `{bridges, now}`, where `now` is `{payload, t, id?, by?, board?}`
or `null`. A bridge says `{type:"hello"}` when it connects, to promise it will report what it
lights itself, and then `{type:"now", payload, now}` each time it does. `now` is held in memory
only: it means something only while a phone is bridging, and a bridge repeats its last write
whenever it reconnects, marked `again:true` so the repeat is not taken for the problem going up
a second time.

`/status` also answers `line` and `hist`: who is waiting, next first, and the problems that
have been up this session, oldest first, each `{id, by, board, t}`. `POST /line?room=<code>`
with `{op:"join", by, id, board}` takes a spot or swaps the problem in the one you hold, and
`{op:"leave", by}` gives it up. A problem going up under a name removes that climber's spot if
they were waiting with it. Both lists are kept in the room's storage: twelve in the line and
eighty problems in a session's history at most.

The crew's data is under `/lists`, shared by every wall:

| Route | What it does |
|---|---|
| `GET /lists` | `{people, lists, done, stats, wins, snake, board, betas}`: the climbers, their saved lists, who has sent what, each climber's counts and sends, the game records, the hold set that is up, and which problems have a beta |
| `POST /lists/person` | Add a climber (24 at most) |
| `GET /lists/log?person=&limit=` | One climber's log, or the newest rows of everyone's |
| `POST /lists/log` | Log a go: `{person, id, result}`, result one of `try flash 2nd 3rd 4+` |
| `POST /lists/log/undo` | Take off a climber's newest entry, unless it is locked |
| `POST /lists/log/entry`, `/lists/log/lock` | Lock, unlock or delete one entry; lock all of a climber's |
| `POST /lists/log/import` | Bring in a logbook from the official app |
| `GET` and `POST /lists/beta` | Read or save a problem's beta |
| `POST /lists/board` | Change the hold set that is up |
| `POST /lists/snake`, `/lists/win` | Best snake length; a Connect four win |
| `POST /lists/tick`, `/lists/done` | The saved lists and plain ticks from the app's earlier days |

The default wall's room code ships in the page, so it is not a secret. The command-line
tools read theirs from `.relay-room` (gitignored) or `$MOONBOARD_ROOM`.

```bash
./relay.sh "l#S36,P37,E38#"     # one payload
./go.sh --relay show            # any command, over the relay
```

Deploy: `cd relay && npx wrangler deploy`. A deploy restarts the relay and drops the phone
at the wall, so not while people are climbing.
