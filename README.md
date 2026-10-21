# Will's Wall

The crew's app for the wall at Will's. It was called MoonBoard Direct until 9 October 2026,
and was renamed so that nobody takes it for Moon's own app. The same day it moved to
<https://wills-wall.pages.dev/> (see [Where it is served](#where-it-is-served)); the
repository and the relay keep the old name.

Drive a MoonBoard v1 LED controller directly over BLE — no Arduino replacement
controller, no Raspberry Pi. We act as the BLE central and write the same
`l#S5,P9,E18#` ASCII string to the Nordic UART Service that the official app uses.

- **`docs/index.html`** — the app, one page, served by Cloudflare Pages at
  <https://wills-wall.pages.dev/>. The benchmarks for five hold-set and
  angle combinations are built in, 1,580 problems in all. Find a route, light it, queue
  for the wall, log tries and sends, and see what the rest of the crew are on. On an
  iPhone the phone that holds the Bluetooth needs
  [Bluefy](https://apps.apple.com/app/id1492822055) (iOS Safari has no Web Bluetooth);
  every other phone can use any browser, through the relay.
- **`relay/`** — a Cloudflare Worker that passes what one phone lights to the phone at
  the wall, and keeps the crew's logbook.
- **`docs/sun/`** — the Sun board: Will's other wall, which has no lights. A page of its
  own, with pictures of the wall and a map of its holds. See [The Sun board](#the-sun-board).
- **`store/`, `functions/`, `wrangler.toml`** — where the Sun board's routes and logbook
  are kept: a Pages Function on a D1 database, on the same address as the pages.
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

Five pages side by side, named in a bar along the foot of the screen: **Routes**,
**Board**, **History**, **Logbook**, and a cog at the right-hand end for **Settings**. Tap
one, or swipe sideways anywhere but on the picture. (Five since 2026-10-21, when Will took
logging off the log page, called it History, and made the Logbook a page of its own: it had
been a sheet over the page.) Going from one page to another that is not the board keeps a
single step in the history, so Back from any of them comes to the board; until that day
History to Settings and then Back left the app. Android's Back button comes back to the board, after
closing whatever is open on top of it, on both walls. With nothing open it says *Press Back
again to close*, and only the next Back leaves the app (Abdullah, 2026-10-15). That takes a
step in the history under everything else, which is put down on the first tap (Chrome passes
over a step a page puts down before anyone has touched it) and again on the first tap after a
Back has used it. An iPhone has no Back button and has no such step. Going from one wall to
the other walks back over the page's own steps and puts the other page in their place, so
Back never leads from one wall to the other.

### Board

The page you climb from, top to bottom:

- At Will's, a moon and a sun side by side in the header, the one you are on filled: the
  two walls (see *The Sun board*). The Sun board's page has the same thing in the same place.
- **Light up Route**, a low bar across the page, puts the open problem on the wall, and
  says in small letters that a swipe up does the same. **Show 2nd route**, which adds the
  open problem beside what is already up (see *Two routes at once*), stands beside it only
  on a phone that has asked for it in Settings.
- The picture of the wall with the open problem ringed: green start, blue, red finish.
  Flick it left or right to step through the list. A long stroke up it lights the problem
  (see *A long stroke upwards*), and a short stroke down it is two taps: into focus.
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
and stops the beta climber. Two taps are for focus, and so is a short stroke down the picture.

### A long stroke upwards

A finger going up the picture lights the open problem, the way a long swipe marks a
message read in the mail app: it has to go far, so that it cannot happen by a slip. The
picture goes up with the finger, and in the room that opens under it, which is dark, a bulb
shows, grey, in a ring that fills as the finger goes on, with **Keep going to light it up**. Far enough is
two fifths of the picture's height (never less than 150 pixels or more than 230). There
the ring is full, the bulb is lit, the room goes light and the words are **Let go to light it
up**: letting go lights the problem exactly as *Light up Route* does, and a line says *On
the wall*, or that the board is not reached. Letting go anywhere short of that puts the
picture back and does nothing, and so does coming back down first. A stroke that starts
out sideways is a flick to the next route, as before, however it goes on. It is the same in
focus.

### Focus, and picking holds

Two taps on the picture, or a short stroke down it, and it fills the screen, with the open
problem's name and grade over it. Two more taps put the page back, and so do Back and a
short stroke downwards from anywhere on the screen. (The way out was a swipe upwards until
2026-10-11, when the stroke upwards was given to lighting the problem. Since 2026-10-12 the
stroke down is the way in as well, and a thumb's width of it, 32 pixels, is enough where
it took 50: Will, "if I swipe the board down it enters or exits focus mode like the double
tap. Doesn't need to swipe long".) A flick across still steps through the list.

At the left end of the name's line is a small bulb: it lights the open problem, as *Light
up Route* does, without leaving focus. It is pale with its bulb out until this problem is
the one on the wall, then dark with the bulb lit. A long stroke up the picture does the
same (see *A long stroke upwards*).

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
phone's keyboard does not cover half the routes. Under it are the filters, on one line: a
line with two dots to drag for the easiest and hardest grade wanted, each dot with its
grade over it, then **Sent** to show, hide, or show only what you have climbed, and **Sort** (popular,
best, easiest, hardest, A–Z), both small so that the line has the room. (There were
**From** and **To** pickers under the line until 2026-10-11. They are still in the page,
out of sight, and still hold the choice.) With a keyboard, an arrow key moves the dot that
has the focus. The filter button carries a green dot whenever something is filtering, so a
short list never looks like a bug. Pick a route and you are back at the board with it open.

The list can also be narrowed to the routes that use certain holds, picked on the picture
(see *Focus, and picking holds*). While it is, a note over the list says which holds.

### History

The open route and what has happened on it, and this session. It was the log page, with
**Log try** and **Log send**, until 2026-10-21 (Will: "We don't really need the log try log
send there because people can do that with the quick log on the board page... It also means
this is not a page dedicated to logging"). Top to bottom:

- **This session**, once there is one: your sends, tries and hardest grade, with a dot for
  every go in the order they happened. A ring is a try, a green dot a send, a gold dot a
  flash. A tap on the card opens the session's climbs under the numbers, a row each, and
  another shuts them; a tap on a row opens that route. A session is a run of goes with no
  gap of four hours, so an evening that runs past midnight is still one session. (The card
  was at the foot of the page, under a list that was always open, until 2026-10-11.)
- **The open problem**: its name, its grade and a small **Beta** on one line (Will: "make
  the beta button smaller and inline with the route name"), then how it has gone for you.
  A small line offers to undo your last go (see *Logbook*).
- **Your history on this route**: one row for each session you were on it, a dot for
  every go.
- **Community**: who has climbed the open problem and how each of them first got up it,
  then what the rest of the crew have logged in the last eight hours. Tap one of their
  routes to open it.
- Earlier sessions are not listed here: the **Logbook** has every one of them, a session to a
  line (they were on this page too until 2026-10-11, which said the same thing twice).

### Somebody new

The app is better from the Home Screen, where it fills the whole screen. Somebody who opens
it in a browser tab and has not picked a climber's name gets one line over the top row of
either page: **First time here? Add it to your Home Screen**. A tap opens how to do it on an
iPhone and on an Android phone. Its cross, a stroke across it, or having read how puts it
away for good on that phone (one note, `mb-a2hs`, shared by both walls' pages); left alone
it slides off after twelve seconds and comes again at the next visit. It never shows when
the app is opened from the Home Screen, nor once a name is picked.

**What a finger does on the picture** does not show either, so it is said once (Will,
2026-10-12: "do the gesture card"). The first time a route is open on the board, a moment
after it opens, a card rises from the foot of the screen with the five things on it: two
taps (the picture fills the screen), a short swipe down (the same), a long swipe up (lights
the route), a flick left or right (the next route), and on the full screen a tap on a hold
(picks it). **Got it**, or a tap on the dark over the card, puts it away for good on that
phone (`mb-gest`). It does not come up over a sheet, in focus, or while a beta is being
drawn. The Sun board's page has a card of its own, with that wall's four (two taps or a
short swipe down, a finger across to turn the head, two fingers to zoom, a tap on a hold)
and a note of its own (`sb-gest`). Both cards, and the one about the Home Screen, are to be
had again from **Help** in Settings.

### Quick log

For logging without leaving the board. A tap on **Quick log** dims the screen and swings
out two round buttons: red logs a try at once, green is a send. The finger can also go
down on the button, slide on to one, and let go. A short line says what was logged.

### A timed session

Some come for attempts and the rest between them, not for sends. On the board, beside
**Quick log**, is a button with a timer on it. It opens a sheet that sets how many goes
make a set (one to eight) and how long the rest is (half a minute to half an hour), and
**Start the session** shuts the sheet. (The setting-up was on the log page until
2026-10-11.) The sheet rises from the foot of the screen with the board dimmed behind it,
as on the Sun board's page, and a tap on the dimmed board shuts it; until 2026-10-12 it
took the whole screen. The button is green while a session is on, and opens the same sheet to end
it. At the top of the panel beside the wall is a circle for each go. A tap
pops the next one (a tap on a popped one puts it back). When the last is popped the rest
counts down in the same box, beside the wall and never over it, so the next route can be
looked for meanwhile. When it is up the phone pings, the whole screen goes white and fades
back to the page, a phone that can buzzes, and the circles are empty again for the next
set. The ping is two notes made on the page and played by an audio element, because on
an iPhone that sounds even with the ring switch on silent; a phone lets a page make a
sound only after a touch has allowed it, so the taps that start a session and pop a circle
wake it with its sound off. **Try the ping**, under Start, plays it and shows the flash at
once, to check the sound is up. (The first flash was there in name only: its class shared
a name with a ten-pixel dot of the logbook, and that dot in a corner was all of it.) A tap on the time
skips a rest, and **End** puts the box away. A switch makes each popped circle log a
try on the route that is up; it is off unless turned on. The session is the phone's own,
kept in its storage (`mb-rest`), so it runs through a reload, and the screen is kept
awake while one is on where the phone allows. The Sun board has the same session, under
the same name, so one carries from wall to wall: there the circles lie on the picture,
down its left edge under the corner button, with nothing behind them.

**The rest counted down on the wall.** A second switch in the sheet, **Count the rest
down on the wall**, off unless turned on and kept by the phone (`mb-rest-wall`); what it
does is behind the i beside it. While a session with it on is running, row 1 of the wall is the count's: the grade is not shown there, and a
route that is up with its grade when the session starts goes up again without it. When a
rest begins the wall gets a red light on row 1 for each minute left, from A1 (eleven at
most), and the picture shows the same; a minute on, one fewer, one write each time. Five
seconds before the rest is up the wall spells **S, T, A, R, T**, a big green letter at a
time, then the rim flashes twice and the route is put back as it was, with nothing on row 1.
The phone pings and flashes as before.

It never takes the wall from anybody, which is the point of it on a wall that is shared:

- It only begins if the route open on this phone is the one on the wall, by itself. With
  another route up, or two, the rest is counted on the phone alone, and a line says so.
- Before every frame it looks at what is on the wall, asking the relay afresh when another
  phone holds the wall. If that is not exactly what the count last put there, somebody has
  lit something else: the count is off the wall for what is left of that rest, nothing more
  is sent, START neither, and a line says so. The climber lights the route again when the
  rest is up, and the next rest is counted as usual.
- Every frame goes up as the same lighting of the same route under the same name, so it is
  nobody's turn in the line and nothing new in tonight's list (the page tells the relay it
  is a repeat; see `write`, `again`).

A rest skipped, a session ended, or the switch turned off takes the count's lights off again, if
the wall is still the count's. The letters are seven wide and nine tall and no frame is
over 130 bytes, well inside what the box will draw.

### ARC: the lights lead an easy climb

The timed session's sheet has two techniques at its head: **Sets and rests**, as above, and
**ARC** (since 2026-10-21, a first step; Will: "look up ARC training climbing ... make a plan to
include this on the moonboard using the lights as a guide to the climbing automatically. The set
up and setting can go in the timed session area as another technique"). ARC, aerobic restoration
and capillarity, is easy climbing without stopping, the pump kept light. The benchmarks are too
hard for it (the easiest on the 2016 set are 6B+), so the page makes its own climbing: a path of
hand holds over the set's friendliest holds (those its easiest benchmarks use at least twice,
about seventy on the 2016 set; on a 25° set, with fewer easy benchmarks, the grades widen until
there are forty), each move within three rows and three columns of the hand that stays, hands
in turn and never crossing, up a band of rows (4 to 15) and down again.

Six holds are lit at once (Will, first: "on pace is the one you're on and the one you're moving
to, and then blue is the next one that's coming... So there's always four lights lit up at the same
time"; then: "two lights ahead, two lights behind. So green is still the two you're on, and then
blue is the two you're moving to, and red would be the two you've left"): **green**, the two the
hands should be on; **blue**, the two coming next, a hand already on one and you are ahead;
**red**, the two just left, a hand still on one and you are behind. Every so many seconds (the pace, 1 to 7, 6 to begin with)
the four move on by one hold, with a soft tick. Feet go anywhere.

The settings: **Time on** (half a minute to ten, 1:30 to begin with; Will: "maybe be like a minute
30 or 3 minutes or 4.5 minutes"), **Rest between rounds** (the same), **Rounds** (one to twelve,
five to begin with), **A new hold every** (the pace), and the tick. They are the phone's own
(`mb-arc`), apart from the session's, which the Sun board's page shares. **Start ARC** goes to the
board: three seconds to get on the two greens, then the round; the box beside the picture counts
it down with a dot for each round. A tap on the time pauses a round, or skips a rest; at the end of
a round the lights go and the phone pings, and at the end of a rest it pings and flashes as the
timed session does. Starting one technique ends the other.

**On the wall** (Will: "the four lights on the real wall, only when the wall is free, pausing if
someone else lights a route"). The wall is free when nothing is up, when what is up is the
climber's own (a route they lit, or ARC), or when nothing new has gone up for ten minutes and nobody
is waiting in the line; then ARC takes it without a word. Otherwise, on Start (or carrying on after
a pause) it asks whether to light over what is up, and if not it runs on the phone's picture alone.
Before every frame it looks at what is on the wall (asking the relay afresh, at most every second
and a half, where another phone holds it); if that is not what ARC last put up, somebody has lit
something, and ARC pauses and says whose route is up. A tap on the time carries on, asking first.
Frames go up under a number no route has (`ARC_ID`, -1), so every phone's **On wall** card says
**ARC** and the climber's name, and as the same lighting ("again"), so they are nobody's turn in the
line. At a rest and at the end ARC's lights come off, if the wall is still ARC's; a round after a
rest goes back up only on the wall ARC left dark. The relay and the Pi pass the frames on as they
pass any route; nothing of theirs changed. The plan is in the vault
(`work/active/moonboard-arc-plan.md`).

### How a send is asked

A send needs one more answer: which go it was. Four green bubbles swing out in an arc
over **Quick log** (and under **Log send**, while there was one): **Flash**,
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

A route that was tried on another day and never sent cannot be flashed either (Will,
2026-10-12: "I'll mark it down as a flash. Which is fine. If it's been a year or even
three weeks, it is a session flash, but it's not a flash for the scoring sake. It's just
a send for the scoring sake."). The line over the bubbles then says how many tries there
were before and asks which go it was *today*, and the tries from before are added to the
answer. Five tries in March and the first go today is the sixth go: it is stored as 4+,
and said back as "Session flash · go 6". Nor can a send be logged as an earlier go than
the tries logged today allow: with two tries logged, Flash tapped by mistake is stored as
the third go. So what is stored is the go it was in all, and that is what scores. With
the climber's own log to hand the page knows which tries were today's; without it, every
try counts as today's if the route was touched in the last four hours and as earlier if
not, and either way they all count. The Sun board's page does the same.

### Two routes at once

Two people on different problems, without relighting between goes. The button for it is
put away until a phone asks for it in Settings. With it there, open the second
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
crew. **+ Beta**, beside the route's name on History, opens the tools beside the picture: pick a limb, tap a
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

An option that is on or off is a row with a switch: the phone's own kind in the page's
colours, a grey track when off and the page's ink when on. (They were tick-boxes until
2026-10-12: Will, "swap out the check box for a pill toggle like the iPhone uses but to
match the site theme". Each is a tick-box still, unseen, under its switch, so nothing that
reads one changed.) What an option does is no longer written out under it. It is behind the
small **i** beside it, which opens a bubble with the words, under the i or over it,
wherever there is room; a tap anywhere else, a scroll, or another tap on the i puts the
bubble away. The same switches and the same i are in the sheets (the timed session's,
Connect four's) and on the Sun board's page.

Top to bottom (the order is of 2026-10-21; Will: "There's a few other moon boards around
that people use this app for, so I want it to be more clear how they choose where they're
climbing"):

- **Which wall**, at Will's: the MoonBoard and the Sun board.
- **Climbing as** and **Your emoji**, side by side on one line, a heading over each (Will:
  "It doesn't need to be full width. Choosing your name or your emoji. So those two can go
  on the same line"). The same line is on the Sun board's page.
  - **Climbing as** is the name picker at the top of the page, here as well. Whichever of
    the two pickers is changed, the other follows. A new name is **+ New climber**, the
    first line of either picker; the **Add a name** button that stood beside it went with
    the change of 2026-10-21.
  - **Your emoji** (since 2026-10-19): the emoji in your circle wherever your
    name is drawn, where your first letter was. A tap opens a sheet at the foot of the
    screen with 56 to tap, and a box for any other from the phone's own emoji keys; **Use
    my letter** goes back. Will: "Instead of the circles with letters for your name. Can
    it be a custom emoji... that the climber can change in settings?" An emoji in a name
    (Abdulla 🍓) was already the circle and still is, until that climber chooses another.
    Everybody sees it, on both walls: see *The crew*. One climber to an emoji, so a circle
    still says who: one somebody here has, chosen or in their name, is faded in the sheet
    and a tap on it says whose.
- **Where you're climbing**, straight under them (see below): one line, the choice (Will's Wall
  or Another MoonBoard) in its left half and, at another MoonBoard, that board's code in the
  right half. No phone has a relay to switch on: the one that holds the wall's Bluetooth shares
  it by itself, and its connection log says what the relay is doing. (A Connect relay button and
  a line about the relay stood here until 2026-10-21.)
- **Hold set on the wall**, under that: the holds up on the wall where you are climbing.
  At Will's Wall it is the crew's, kept with the tick lists as it always was; at another
  wall it is that wall's own (since 2026-10-21, see *Where you're climbing* below). It
  changes the route list and the picture for everyone climbing there, so only switch it
  when the holds on the wall actually change. Where you're climbing and the hold
  set were near the foot of the page, under "The wall, for everyone", until 2026-10-21.
- **Lighting the wall**
  - **Light a route as soon as I open it**, off unless a phone turns it on.
  - **Show the grade on the bottom row**. Row 1 carries no holds on any 2016 benchmark, so
    it reads out the grade from A1 onward, one light per V-grade: five green up to V5, two
    blue for V6–V7, red from V8. On the 2019 and 2024 sets a few routes use row 1, and the
    meter is left off for those.
  - **Show the "Show 2nd route" button**, for this phone only, off unless a phone turns it
    on (`mb-pair`). Until 2026-10-11 the button was always there; Will did not expect it to
    be used much. Two routes that somebody else puts up are shown as two either way.
- **How it looks on this phone**
  - **Background**: light foggy grey, which every phone starts on, or light taupe. (Every
    phone was put back on the grey once, on 2026-10-08. Black, which is how the app first
    looked, could be chosen until 2026-10-11; a phone that had chosen it is on the grey.)
    It is the same choice on the Sun board's page.
  - **Show the board on plywood**. Plywood is drawn for the 2016 and 2024 hold sets. On the
    2016 set a phone starts on Moon's yellow board and the switch is off; on the 2024 set
    it starts on plywood and the switch is on. Once a phone has moved the switch, that is
    what it gets on every set. Masters 2019 keeps its own picture.
- **Games on the wall**: Connect four (Snake is put away). It opens over the page.
- **The Pi in the majlis**, only where the relay says the wall has one (Will's Wall): what
  it is doing, **Let go of the wall** and **This phone's Bluetooth**.
- **Help**: **Picture gestures**, the card of what a finger does on the picture, and **Add
  to Home Screen**, the card that says how.
- **Connection log**: what the page has done with the wall and the relay, with **Copy
  log**, and the build stamp.

The page's heading stays at the very top while the rows go by under it.

## The Sun board

Will has a second wall at home: a spray wall with no lights, on which routes used to be
marked with tape. `docs/sun/` is the app for it. It is deliberately a page of its own and
not a mode of the MoonBoard page: nothing is shared but the look, the names of the crew and
the Home Screen icon. Nothing from the MoonBoard shows there and nothing from there shows
on the MoonBoard.

**Getting there.** Each page has a moon and a sun side by side at the left of its header,
the wall you are on filled, and a tap on the other goes across; a row in Settings ("Which
wall") does the same. On the MoonBoard page they are there when "Where you're climbing" is
Will's Wall. The phone remembers which wall it was on (`mb-wall`), and the MoonBoard page,
which is what a Home Screen icon opens, sends a phone that was last on the Sun board
straight there. A phone on another MoonBoard is not offered the Sun board.

**The same app.** The page is laid out as the MoonBoard page is, on purpose: Routes, Board,
Log and the cog along the foot; on the board the picture, a row with the open route (which
is also the way to the search) and **Quick log**, then a short list; two taps on the
picture for focus. Where a style rule has a twin on the MoonBoard page it is written the
same way. Two things are not as there, both to give the wall the screen (see below): no
row over the picture, and the row with the open route lies on the foot of the picture
instead of under it.

**The wall is a model.** There is one picture: the wall stood up in the room. Each flat
face (the flat wall, the kicker, the overhanging panel, the roof extension and the four
sides of the island box that hangs from the ceiling, and the face at the box's far end,
which leans back) is a picture of its own, made to
Will's measurements of the wall: the face square-on and to scale, the board in its own
colour with the tape, the chalk and the room left out, every hold on the map cut out of a
photo and set where it is, and see-through round its edge. `wall.json` says where each
face stands (`faces`: the room's centimetres at a place on the face) and the browser
draws them (CSS `matrix3d`), farthest first. The boards have plywood's grain drawn on
them (the map-making's `wood.py`), fainter where they are painted.

**Holds that are out of sight.** From where one stands the island box's right-hand side
and its near end face away, and there are holds on both. Those two faces are folded out
into the plane of the box's front face and only their holds are drawn, so the holds show
beside the box, off its edge, and can be tapped like any other. In `wall.json` such a
face is like any other; its outline is just what its holds cover.

**Two ways to look at it, and anywhere between.** One stands back from the corner and
turns one's head. Two ways of looking have a name (`eye.poses`): **Flat** is the whole flat
wall with a little room either side, seen at an angle; **Overhang** is the whole overhang
with a little room at its right and some of the flat wall still in sight. A pose may have
a place of its own to stand (`at`): the overhang is looked at from nearer square-on than
it would be from where the flat wall is seen. Between the two the head stops wherever a
finger leaves it (`CAM.t`, 0 to 1): where one stands, which way one looks and the lens are
the two poses' mixed (`camAt`). Nothing snaps. The two names are see-through buttons in the
picture's top corners, and a tap on one glides to that way of looking; a tap goes through
them to a hold that shows underneath. There was a third way, both walls at once, until
Will found it too far off to be of use.

**A finger drags the wall.** The place it takes hold of stays under it (`dragTo`). Sideways
two things can give, and they give in a fixed order, so that the whole wall is one strip
from the flat wall's far end round to the overhang's: the head turns from the first pose to
the last, and only with the head at the last does the picture itself slide on (zoomed,
there is more of it at the right). Coming back the slide is undone first. Two fingers zoom
straight in and out, and then one finger slides the picture up and down as well. The eye
never looks up or down. Drawn together past a pose's own picture, two fingers take the
wall further off: the camera goes back towards one that has all of both walls in sight
(`wideCam`, `CAM.out`), and stops there. No button goes to that view.

**Nothing is cut off, and nothing is wasted.** Unzoomed, whatever of the wall is in sight
is on the picture from top to bottom and stands on the row with the open route's name
(`poseCam`, and `camAt` between the poses). On the board page the picture is made exactly
as tall as the taller pose needs at that width (`picNeed`), and the list has what is left
of the screen. In focus the picture is much taller, so there the wall is brought closer
(`homeAt`): zoomed about its foot at the left until it fills the picture's height, or by
three tenths if that comes first, running off at the right. A route opens with the head
turned to it: at a pose when it is all on that side, else wherever most of it is in sight.

**The wall has the screen.** The two walls make a corner, so the foot of the picture is
floor: the open route's name and **Quick log** lie there, on the picture. The whole list
is the Routes page. A marked hold is a plain line round it in its colour with a little of
the colour inside; there are no dashed lines, because a dash is so many pixels long and so
crawled round the hold as the picture was zoomed.

**Holds.** `docs/sun/wall.json` is the map. It has two walls (the straight wall with the
island box opened out above it, the face at the box's far end laid beside it; the kicker,
the panel and the roof extension one above the other), each a flat drawing, and for each the outline of every hold on it as fractions of
the drawing's width and height. A face of the model says which part of its wall's drawing
it is, so a hold is a place on its wall and nothing else: everything the store keeps (a
ring in a route, a fix to the map) names the wall, never the model. A volume is a hold.
Each side of a wooden volume is a hold of its own, because it is one. A hold bolted to a
volume is a hold. A tap picks the smallest outline under the finger, so a hold on a volume
before the volume, and if the finger is on none, the nearest within a finger's width. A
tap on the model is first taken back to the face it fell on, and a hold behind another
face cannot be tapped.

**Focus, and making a route.** As on the MoonBoard, one tap on the picture does nothing and
two taps make it the whole screen, with every hold outlined, and so does a short stroke
down the picture (since 2026-10-12, as on the MoonBoard page); a stroke up or down, or the
cross, goes back. Two more taps do not: this wall's holds are close together, and two of
them tapped quickly used to shut the picture and lose every hold picked. The holds picked
are kept when the picture shuts, out of sight, and are there when it opens again; they go
when they are saved as a route, let go with the small cross, or when another route is
opened. With a route open there is a small bulb at the left end of the name's line, where
the MoonBoard's page has the bulb that lights the wall. This wall has no lights, so it
lights the route on the picture: the wall goes dim behind the route, as it is on the
board's page, and the outlines of all the other holds are put away. Another tap brings
them back, and the phone remembers which it was (`sb-lit`). With nothing picked, focus has
two buttons under the picture: **+ Add a route**, which goes straight to marking one, as the
**+** in the header does from anywhere, and **Holds changed?** (see *Putting the map right*);
they make way for the number slider of a long climb. In focus a tap on a hold picks it, and with a hold picked two
buttons come up where the MoonBoard has *Light up taps* and *Search routes*: **Save as a
route** and **Search routes**. There is no lighting a wall with no lights, so what is done
with picked holds here is to keep them. *Save as a route* asks first, then goes on to
marking: the brush says what a tap marks (start, hold, foot only, finish), a tap on a
marked hold with the same brush lets it go, and with another brush changes what it is for.
A route can run across both walls. A spot with no outline can still be marked: the tap
leaves a ring there. A route needs a start and a finish, a name, a V grade, and a rule for
feet (any feet, feet follow hands, marked feet only); it can carry the tape it has on the
wall and a note. Beside the rule for feet it can have a further one, **Flat wall off
limits**: no feet on the bare flat wall, which climbers call smearing. It is a button of
its own under the three, on or off, and goes with any of them. Every route Abdullah set
has it. While a route with the rule is on the picture, or is being made with the button
on, the flat wall has a wash of red over it, so that stepping through the routes it can
be seen without reading the rules. The wash lies on the flat wall's own face in the
model, in that face's place in the pile, so the island box and the overhang in front of
the wall are not coloured by it. Once saved everyone has it. *Search routes* lists the routes that use
every picked hold. Making a route is deliberately not on the front of the page: Will asked
for it to be found the way the MoonBoard's custom route is.

**A climb by number.** Some routes are hands in order, each hold with its number, any feet.
In the marking bar the **1 2 3** brush gives the next tap the lowest number the route does
not have yet, so a new one counts 1, 2, 3 and one with numbers missing is filled gap by
gap; the − and + beside it pick another free number, and a tap on a numbered hold takes
its number off. The holds are ringed with their numbers on them, the lowest and highest in
the start and finish colours, and a thin line runs from each number to the next where
none is missing between. Such a route needs no start or finish and may have up to 250
holds. In the store a numbered hold is a mark `{ h, r: 'n', n }`; a hold may carry two
numbers.

**A match.** Where both hands go on the one hold it carries two numbers in a row. A finger
held on a hold while numbering makes it one (`draftMatch`): a hold with no number takes two
at once, the number the bar is asking for and the next free one; a hold that has a number
takes one more, the number after its highest if no hold has that, else the number before
its lowest, or whatever number was picked by hand in the bar. A tap still takes one number
off at a time. The hold is drawn once with both numbers on it.

**Nine numbers at a time.** A hundred numbers on the wall at once cannot be read, so a
climb by number with more than nine of them shows nine, counted along the numbers it has
(stickers fall off, so there are gaps), and a slider moves on three at a time: three new
ones, three gone. The slider lies over the row with the route's name on the board page and
under the picture in focus, with an arrow at each end and the first and last number in
sight beside it. When the nine it moves to are not all on the screen the head turns to
where they are (`bestLook`, which is also how a route is looked at when it is opened).
While such a route is being marked or changed every number shows, because then the gaps
are what matter.
At the far end of the slider is a tick-box, **Reveal full route**. Ticked, every number
shows at once and the lines that join them are not drawn, since a hundred of them are a
tangle; the slider goes faint, having nothing to do. It is the phone's own choice and
stays as it was left. A short climb by number, which has no slider, keeps its lines.

**Changing a route.** Only its setter is offered **Change it** and **Take it down**, on
History (the log page until 2026-10-21); somebody else sees no row of buttons there. A route taken down leaves the list and keeps what was logged on it.

**The filters on the Routes page are the MoonBoard page's.** One line: a line with two dots
to drag for the easiest and hardest grade wanted, each dot with its grade over it, then
**Sent** (show, hide, or only what you have climbed; the routes taken down are found here
too) and **Sort** (newest, popular, easiest, hardest, A–Z) as two small boxes. They stand
open on the Routes page and the button beside the search box folds them away. (Until
2026-10-12 the line stood over a row of four pickers, with **From** and **To** saying the
same as the dots; Will: "Match the two sites route page filters and pickers I like the
moon boards". From and To are still in the page, out of sight.) The
line runs from the easiest route on the wall to the hardest, so none of it is dead, and
an end left alone moves with the wall when a route is added beyond it. There is no picker
of setters: the search box finds a setter by name.

**Logbook and points.** A try, or a send with how many goes it took, from **Quick log** on
the board (and from **Log try** and **Log send** on the log page until 2026-10-21, when the
page became History, as on the MoonBoard page). Quick log is the MoonBoard's (see *Quick log* above), with
the same words: a press swings out **Try** and **Send**, a tap on one or a slide on to it
and a let-go logs it, a send asks which go it was in four bubbles with the likely answer
ringed, a route sent before is a session send, a route tried on another day is never
logged as a flash (the tries from before are added to the answer), and a short line over
the button says what was logged or that it was not saved.
A route scores once, the first time it is sent: its V number plus one, and one more for a
flash. Tries score nothing. The points are the Sun board's own.

**Your own logbook.** History keeps each climber's own record the way the MoonBoard
page's History does. Since 2026-10-21 the row of pages at the foot is the MoonBoard page's
five: **Routes**, **Board**, **History**, **Logbook** and the cog (Will: "make the Sun board
match"). **This session** is a card at the top of the page: the session in three numbers
(sends, tries, and the hardest sent) and a dot for every go (a ring for a try, green for a
send, gold for a flash). A tap on it opens the session's climbs under the numbers, a row a
route with the latest first and how it went, and another tap shuts them. At the foot of the
page is everything in a line: sends in all, flashes, the hardest, points. A session is a run of goes with no gap
of four hours in it, and it is "this session" until its last go is eight hours old. A tap
on a route opens it on the page, ready for another go, and the board turns to look at it.
Changing the name at the top changes whose logbook it is. The page is otherwise the open
route's, and since 2026-10-12 it is laid out as the MoonBoard page's is (Will: "Match the
two pages log pages"): its own top line with the way back to the board and the page's name,
**History**; the route's card (it had **Log try** and **Log send** until 2026-10-21);
**Your history on this route**, a line
that sums it up and a row a session with a dot for every go; and **Community**, who has
climbed it, a row a climber with their circle (their emoji, or their initial) and how their first send
went, then **Lately on the Sun board**, a few of the crew's latest goes in rows of the
same kind, where a tap on a row goes to the board with that route up. What the MoonBoard
page has and this one has not is the beta, so the route's card holds the setter's two
buttons, **Change it** and **Take it down**, and for anybody else nothing.

**The Logbook** is a page of its own, between History and Settings, with a top line as
History has (the way back to the board and its name), since 2026-10-21; it was a sheet,
opened by a button in the route's card, until then. The line at the foot of History goes
there too. The MoonBoard page's is laid out the same. It has every go of one climber, a session to a line with the newest open, then
everyone's points, listed as that page lists them (how they are worked out is behind the i
beside their heading). Under the picker, **Export CSV** makes a file of the logbook that is
showing and **Import CSV** adds a file's goes to your own (see *Logbook* below; here a go
keeps its exact time, a line may say how far a go against the clock got and how long it
took, and nothing comes in locked, because this wall has no locks). A tap on an entry of your own opens it, and **Delete
this entry** takes it out (`POST /log/delete`, which counts the tally again from the rest).
Somebody else's logbook can be read and not changed, which is a courtesy: there are no
accounts.

**Settings.** As on the MoonBoard page since 2026-10-12: which wall, who is climbing and
their emoji (side by side on one line since 2026-10-21, with no Add a name button), then
**The picture** (two switches: dim the wall behind an open route, and always outline
every hold), **How it looks on this phone** (the background), and **Holds changed?**.
What each does is behind the i beside it. The header is as tall as the MoonBoard page's,
so the two walls in it are the same thing in the same place on both pages.

**Round the board.** The timed session's button is beside Quick log, as on the MoonBoard
page. Either side of the open route's name is an arrow, to the route before and the route
after in the list as it is filtered and sorted, since a stroke across the model turns the
head. The open route's row is kept at the top of what shows of the list under the picture,
so the next route is the row under it. The picture is a twentieth shorter than the wall
needs, which the list gets. On the Routes page the line for the grades is always there,
and the four pickers fold away under it. A new climber is added from the last line of the
name picker, as on the MoonBoard page.

**A go against the clock.** A long climb by number is seldom finished, so what is worth
keeping is how far a go got and how long it took. On such a route Quick log has a third
button, **Start**: it puts the time at the top of the picture, small and with nothing behind
it, and **Stop** beside it. Somebody else is likely to be holding the phone, working the
slider and pointing out the numbers to come, so the clock covers none of the wall and a
finger goes through it to the picture. Stop asks which number was reached (the best so far is offered, or the top) and
lets the time be put right by a second or ten, for a slow finger at either end. That is
logged like any go, with two things more: the number and the seconds. Reaching the last
number is a send, which go it was worked out from the tries before it; stopping short is
a try. The logbook says "to hold 55 in 5:00" beside that go's dots, the list shows each climber's best go (the
furthest, and of those the quickest), and the log page lists how far everyone has got.
The clock is kept in the phone's storage, so it runs through a locked screen or a reload,
and the screen is kept awake where the phone allows.

**Putting the map right.** The outlines are drawn from photos by a program, and it gets
some wrong, and holds go up and come off, so anyone at the wall can change it (Settings,
**Holds changed?**, *Add or remove a hold*; or *Holds changed?* in focus). That
opens a photograph of the wall being looked at in focus, with a switch to the other wall
and three brushes: **Add a hold** (a new one, or one with no outline), **Remove a hold** (one
that has come off, or an outline that is only tape), and **Wrong shape**. A hold that routes
use is not taken off without a word: it names them first, since they will want changing. It is a photograph and not the model because a hold the map lacks is not
in the model at all; each wall has one (`photo` in `wall.json`), of the size and shape of
its drawing, so the map fits it. A fix is kept by the store and reaches every phone at
once: a dropped outline can no longer be picked, and a missed hold is a ring that can,
under the name `x<number>`. When the map is next made the fixes are worked into it, each
ring gets a proper outline and a proper name, `wall.json` says which (`alias`), and the
fixes are marked done.

**A hold's name never changes** once it is published, because a route is a list of names.
The program that makes the map keeps every hold's name from the map before it, by where
the hold is, and a name that has gone is pointed (`alias`) at the hold now in its place.

**How the map is made.** Not in this repository: the photos and the scripts are in Will's
notes (`sun-board-2026-10-09/pipeline`, with a runbook). In short: `plan.py` holds the
wall's measurements, where each face's corners are on the photos, where each face stands
in the room and the two ways of looking; `faces.py` squares each face up to its measured
size and sets them together into the two walls; `detect.py`, `sam_points.py` (a
segmentation model, MobileSAM) and `pick.py` find the holds on those pictures; `match.py`
gives each hold the name it had on the map before; `draw.py` makes the drawings and cuts
the faces out of them, and `build.py` writes the pictures and `wall.json`. The pictures'
names carry the map's revision, so a phone never shows an old picture under a new map.

**Where it is kept.** `store/store.js` is the whole of it and says at its head what it
keeps and how to ask. It runs as a Pages Function (`functions/api/[[path]].js`) on a D1
database (`wrangler.toml`), at `/api/w/sun` on the site's own address, so it goes out with
a push like the pages do. The relay and the crew's MoonBoard logbook are not involved,
except once: the first time anyone opens the Sun board it copies the crew's names across.
It also keeps the climbers' emoji for both walls, at `/api/faces` (see *The crew*); a check
keeps its own with `?crew=test-...`, and a test wall's `/reset` clears that wall's.

A logbook brought in from a file goes to `POST /api/w/sun/log/import`: many goes of one
climber in a call, each with when it happened. For each route and day the logbook ends up
with as many tries and as many sends as the file lists, so a route sent five times in an
evening is five sends (Will, 2026-10-12: "I often climb a route on repeat and want to log
multiple sends on the same day"). What the logbook has of that route on that day is taken
off the file's count first, the goes of that very minute and result before any other, so
a file can be imported twice without harm, and a file with one more send in it adds the
one. `tz` says how far the climber's clock is ahead of UTC, in minutes, so that a day is
the climber's day (with the limit said under *Import CSV* below). `dry` says what would
happen and writes nothing. The page sends a long file in pieces of about 250 and never
parts a route's goes of one day, since the store counts those together. Since goes of last year can now
be written today, a climber's tally on a route is counted from the goes in the order they
happened, not the order they were written, and the logbook is handed out the same way.
The whole import is a handful of queries however long the file, because the free plan
allows fifty to a request: the rows go in with one statement that reads them out of a JSON
list, and the tallies with one more.

**Checking it.** `node store/test.mjs` checks the store alone, on a stand-in for D1 made
from Node's own SQLite. The page is checked together with the real store in headless
Chrome by `sun.mjs` in the test rig (in Will's notes, with the other rig scripts).

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

**Where you're climbing**, near the top of Settings, is which wall a phone talks to. It is Will's Wall
unless you say otherwise, and that needs no code. A different MoonBoard picks **Another
MoonBoard** (it said Another wall until 2026-10-21; Will: "the whole purpose there is to
establish a different room to control the lights. So instead of saying another wall, we
should say another moonboard") and gives it a code of its own, the same on every phone there, so two walls on the same hold
set never light each other's problems. Each wall has its own line and its own evening's
routes. The logbook and the climbers are still one shared set.

**The hold set is the wall's** (since 2026-10-21; Will: "At another wall it's that wall's
own, and Will's Wall stays as it is"). Will's Wall's is the crew's, kept with the tick lists
on the relay as before. Another wall's is kept by the site under that wall's code
(`/api/board` in `store/store.js`, beside the climbers' emoji), so one phone there switching
it switches it for every phone with the code, and never for Will's Wall. A phone at another
wall asks for it when the page opens, when the code changes, when Settings opens and when the
app comes back into sight; until somebody there picks one, a phone keeps the set it had.

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
card. Each card says what it is at its head, as the wall's card says *On wall*: **Up next**
for whoever is next, then **Up next 2**, **Up next 3** and so on, each its own colour
(violet, orange, green, and yellow for any after) beside the wall's blue. (Until 2026-10-11
the cards carried a number and one band under them said *Next up*.) At the foot is what is
on the wall now.

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

A climber is drawn as a circle in their own colour (worked out from the name, the same on
both walls) beside the routes they have sent, on the cards of the line and the wall, and
on the log page. In it is the emoji they chose in Settings, else an emoji in their name,
else their first letter (`chipFor` on both pages). An emoji stands on its own, with no colour behind
it, a little larger to fill the circle's room; a letter keeps its coloured circle (`chipPaint`; Will, 2026-10-19:
"Can you remove the circle behind the emoji"). The chosen ones are not on the relay:
they are kept by the site, in the Sun board's store (`store/store.js`, `GET` and `POST
/api/faces`, a table `faces` keyed by name), so they go out with a push and are the same on
both walls. The MoonBoard page asks for them when it opens, when it comes back into sight
after a minute or more, and when the sheet opens; the Sun board's snapshot carries them. A
page not on the site (a copy opened from a file) cannot reach them and draws letters.

## Logbook

**Quick log**, on the board, logs a go: red for a try, green for a send, which asks which go
it was (see *How a send is asked*). **Log try** and **Log send** did the same on the log page
until 2026-10-21.

History's undo is careful. The relay's undo takes off a climber's newest entry,
whenever that was, so the page only offers it for a go from the current session, names the
go, and wants a second tap. Anything older is changed in the **Logbook**, where it can be
seen.

The **Logbook** is a page of its own, between History and Settings, laid out as Settings is
with its heading pinned at the top (since 2026-10-21; Will: "add the Logbook as its own
page"). Before that it was a sheet that rose from the foot of the screen, laid out as the Sun
board's is (2026-10-12), and before that a whole screen listing a day to a line. Top to
bottom: whose logbook it is;
**Export CSV**, **Import CSV** and **Lock my entries** on one line, with an i that explains
them; a line that sums the logbook up; every go, a session to a line with the newest open,
each go with its time, the route and its grade, how it went, and a padlock if it is locked;
then everyone's points, with how they are worked out behind an i. It opens on whoever is
climbing, the name at the top of the page, each time it is opened; the picker inside shows
anybody else's. (Until 2026-10-11 it went on opening on whoever was looked at last.)

A tap on an entry of your own opens it in a card over the Logbook page: **Keep it**, **Delete
this entry**, and **Lock it** or **Unlock it**. Every such entry ends in three dots (until
2026-10-11 it took a held finger, which nobody found). A locked entry cannot be deleted or
undone, and **Lock my entries** locks all of yours at once. Somebody else's logbook can be
read and exported and not changed: its entries do not open. That is a courtesy and not a
lock, since a name is all there is; until 2026-10-12 anybody's entries opened.

**Export CSV**, in the Logbook, makes a file of the logbook that is showing, whoever's it
is (Will, 2026-10-12: "an export log option which would export a CSV of the climbers log
book"). A line a go, the oldest first: the day, the time, the climber, the route, its
grade both ways, how the go went, whether a send was a repeat, who set the route, which
hold set it is on, and the route's number. A logbook with nothing in it gives a **sample**
(Will, 2026-10-12: "there should be sample data for the export so people can see how the
date should be entered"): the headings and six example lines of routes that are on the
wall, which show a flash, a try and the send after it, a send with a day and no time, and
two more sends of one route on one day. The Sun board adds a go against the clock, where
it has a climb by number. The lines have `Example` where the climber's name goes, which is
how **Import CSV** knows to leave them out, and the file has `-sample-` in its name. On a phone the file goes to the share sheet, where it can be saved
to Files, sent by AirDrop or mail, or opened in Numbers; anywhere else it is downloaded.
It is named `wills-wall-moonboard-<climber>-<day>.csv`, is UTF-8 with the mark Excel wants
at its head, and a name that a sheet would take for a sum has an apostrophe put in front
of it. The Sun board's Logbook has the same button, with that wall's columns (how far a go
against the clock got and how long it took, the feet rule, the tape).

**Import CSV** reads a file laid out the same way and adds its goes to the logbook of
whoever is climbing, and to nobody else's (Will, 2026-10-12: "can we add a logbook import
button. if they use the same csv format. to get started, they can click the button Export
CSV and it exports whatever is in their app"). So the way to bring an old logbook in is to
export, which gives the sample, put a line for each go under its example lines, and import
the file.

- A line needs a **Date**, a **Route** and a **Result**. Every other column may be empty or
  missing, and the columns may be in any order.
- The date is best written `2026-10-12`. `12/10/2026` is read too: the file's own lines say
  whether the day or the month comes first, where one of them has a number over twelve,
  and otherwise it is read the phone's way. A month as a word is read as well.
- The time may be `18:05` or `6:05 PM`, or left out.
- The result is `try`, `flash`, `2nd go`, `3rd go` or `4+ goes`; the usual other words for
  them are understood (`flashed`, `2nd try`, `project`, `sent`).
- The route is found by its number, if the line has one in **Route id**, and by its name
  if not, whatever its capitals. The name is looked for on the line's **Hold set**, or on
  the hold set that is on the wall if the line names none.
- A line with another climber's name in it is left out, and so is a line that says it is
  from the other wall, and an example line (`Example` under **Climber**).
- Commas between the cells, or the semicolons or tabs some sheets write.

The goes are handed to the relay's `POST /lists/log/import`, which was made for logbooks
from the MoonBoard app, and they come in **locked**, as those do. **Every go of a day is
kept** (Will, 2026-10-12: "I often climb a route on repeat and want to log multiple sends
on the same day"): for each route and day the logbook ends up with as many tries and as
many sends as the file lists. What the logbook has of that route on that day is taken off
the file's count first, the goes of that very minute and result before any other, so a
file can be imported twice without harm, and a file with one more send in it adds the one.
The page asks for that with `repeats: true` and sends `tz`, how far the phone's clock is
ahead of UTC, so that a day is the climber's day.

A relay from before 2026-10-12 does not know `repeats` and keeps a try and a send at most
for each route each day. The page sees from the relay's answer which it has, and with the
older one it keeps to that rule and says of the lines it leaves out that the relay keeps
one until it is brought up to date (`npx wrangler deploy` in `relay/`, which is Will's to
run). Logging in the app never had such a limit: it is only a file's goes that were held
to one a day.

A very long file goes in pieces of about two thousand, which never part a route's goes of
one day. One limit: a day is reckoned by the clock of the phone that imports, as it is set
on the day of the import. So a go logged in the app within an hour of midnight while the
clocks were on summer time, or in another time zone, can be counted on the day next to it,
and a file with a send of that route on that day would add one too many or one too few.
(Nobody who climbs here has such a clock yet. The cure, if it is wanted, is for the page to
send the name of its time zone and for the relay and the store to work a day out from that.)

What is about to happen is asked first (the relay is
asked what it would do, with `dry`), and afterwards a line in the Logbook says how many
went in and which lines were left out, and why. A go brought in keeps the day and the time
the file gave it, written into its stamp as they stand; the page reads such a stamp as the
phone's own clock time, so its day is the same day wherever the phone is.

Rows live in the relay Worker as an append-only `log:` prefix, with a per-person `stats:`
index carrying the attempt count and the sends in order. `/lists` returns the index; the rows
themselves are only fetched when the log page or the **Logbook** opens, so the log can grow
without slowing the page. `done:` is still the chip and filter
index and is kept in step by the same write: each row of the route list carries the names of
those who have sent it, as coloured chips.

`POST /lists/log/import` takes a climber's logbook from the official MoonBoard app, or
from a file through **Import CSV**, in one batch, every row carrying the day it was really
climbed. The rows land locked. As the app's logbook is brought in, it keeps one send and
one try for each problem each day. With `repeats: true` in the request it counts instead
(see *Import CSV* above), takes `tz`, and says `repeats: true` in its answer.

## Points

MoonBoard's own scheme: base 350 at 5+ climbing 50 a grade to 1200 at 8C, off the **voted**
grade (the community's, below, whichever grade a phone shows; until 2026-10-15 the setter's), plus a bonus for a quick ascent - flash +53, second try +2, third try +1, nothing
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
The rules are behind the i beside its name, and the chess clock is a switch.

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

`docs/board-2016-ply.jpg` is the same 2016 holds on a ground of our own, for a phone that
ticks **Show the board on plywood** in Settings (kept as `mb-ply`; Moon's picture is what
everyone starts on). The holds are the cut-outs from boardhang's hold-set art, the wood is
Poly Haven's plywood texture (CC0) laid as three sheets with their seams, there is a bolt
hole at every point without a hold, and a faint stained WW sits under the holds. It is drawn
in the same frame as the photo, 650x1000, so the rings land where they did. The hold
pictures are still Moon Climbing's. A line under the picture in the page puts back the
picture a phone last showed (`mb-pic`) before anything is painted, so a phone on plywood, or
on another hold set, does not open on the yellow 2016 board for a moment.

`docs/board-2024-ply.jpg` is the 2024 set on the same ground, and it is what a phone on that
set starts on (`plyFirst` in `BOARDS`; `mb-ply` is `1` for plywood, empty for the set's own
picture, and not there at all until a phone has said). Nothing was fetched to make it: the
holds are lifted off the flat yellow of `board-2024.png` itself. Each hold's own colour is
taken from inside it and carried out to its edge, and how much of an edge pixel is hold is
how far it lies from the yellow towards that colour, so no yellow rim is left; the small
gaps closed in by one hold are drawn as dark bolt holes, and a hole a finger goes through
shows the board. It is in the same frame as the drawn picture, so the rings land where they
did. The script and its working files are in the vault, with the 2016 ones.

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

**The grade is the one the climbers voted for.** A benchmark is set at a grade, and everyone
who climbs it then says what they think it is; Moon's app keeps that as the user grade, and
where the two part it is the voted one that counts. The catalog above carries only the
setter's, so `VOTED` in the page lists the routes where the vote differs, by route id and
hold set: 64 of the 1,578, nearly all a grade easier (2016 at 40°: 13, Masters 2019: 10,
2024: 41). They were read from Moon's own app data of June 2026, from the copies shared in
GitHub's spookykat/MoonBoard issue 6 (`benchcmp.py` beside the vault's note of 2026-10-15
makes the list from one of them). The route shows, filters, sorts, lights on the wall and
scores by the voted grade; the setter's is kept as `setGrade` (Abdullah and Will,
2026-10-15). **Settings → Grades** lets a phone show the setter's instead (Community is
what everyone starts on, `mb-grade` on the phone); points go by the community grade
either way, so the ranking is one ranking.

Holds arrive as `E6`-style grid refs and go through the same `holdNum()` as everything else
the page lights.

## On a phone's Home Screen

The page carries the tags and the manifest that let a phone open it full screen from a Home
Screen icon, with its own icon. An iPhone decides how an icon opens when the icon is made, so
one made before 7 October 2026 has to be deleted and added again.

The name under the icon is Will's Wall, and the icon is Will's own picture: a slate board,
grey holds, and two white Ws meshed the way the wall shows them on connect. An iPhone keeps
the name and the picture an icon was made with, so an icon from before 9 October 2026 still
shows the old ones until it is deleted and added again.

## Setup

```bash
python3 -m venv .venv && ./.venv/bin/pip install bleak
./go.sh
```

## Where it is served

Cloudflare Pages, project `wills-wall`, wired to this repository: a push to `main` is live
at <https://wills-wall.pages.dev/> about half a minute later (no build step: the site is
the `docs/` folder as it stands, and `functions/` beside it is the Sun board's store). Any other branch that is pushed gets an address of its
own, `<branch>.wills-wall.pages.dev`, which is how a change is tried on a phone before
everyone has it. The build stamp at the foot of Settings says which build a phone has.

Until 9 October 2026 the app was at `willslawrence.github.io/moonboard`, served by GitHub
Pages from the same folder. That address is switched off when the repository is made
private. Until then it serves this same page, which does only one thing there (see "moved"
in the first lines of `docs/index.html`):

- in a browser it goes straight to the new address and takes along what the phone had
  chosen (who you are, the wall's code, the look), because a new address starts every
  phone from nothing, and a phone on a wall of its own would otherwise land in the crew's
  room. The new address takes that in once, on a phone that has not yet said who it is,
  wipes it off the link, and shows a notice;
- opened from a Home Screen icon it stays put and says how to make a new icon, because an
  icon keeps opening the address it was made at.

What the crew logged is not on any phone: it is kept by the relay, and the move did not
touch it. The phone that holds the Bluetooth is asked to pair again at the new address.

`homewall.pages.dev` is held by an empty Pages project of that name, for a later version
of this app for other people's walls.

Two traps met on the day. `wrangler pages project create` and `wrangler pages deploy`, run
by a coding agent for a project that does not exist yet, are turned into a Worker deploy of
whatever `wrangler.toml` is in the folder they are run from: run from `relay/`, that put a
copy of the relay online under the new name. Run anything about the account from an empty
folder, and add `--force` to get a real Pages project. And the dashboard's upload page only
checks a name; it holds nothing until a file is uploaded.

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
| `POST /lists/log/import` | Bring in a logbook from the official app, or from a file (`repeats: true` keeps every go of a day) |
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
