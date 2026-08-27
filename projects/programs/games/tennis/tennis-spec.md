# Tennis - behaviour specification

A two-player Pong, after the Fairchild Channel F game, reimplemented for a
160x100 logical screen in mode 13h.

This describes behaviour, not an implementation. Every Channel F hardware quirk
is resolved away: there are no per-row background attributes, no 2-bit pixel
values, and no colour that means "the background". Colours below are flat
palette indices.

Where a number was derived by scaling the original rather than taken from it,
the derivation is given, because those are the tuning knobs.

Filename is deliberately not 8.3, so `npm run image` leaves it off the disk.

---

## 1. Screen and coordinates

The logical screen is **160x100**. Each logical pixel is a 2x2 block in mode
13h's 320x200 buffer.

The original was 128x64. Both fill the same 4:3 display, so remapping x by 1.25
and y by 1.5625 preserves every displayed proportion exactly - "keep the aspect
ratio" and "rescale the coordinates" are one operation, and all the geometry
below is that remap, rounded.

| | value | |
|---|---|---|
| `screenWidth` | 160 | |
| `screenHeight` | 100 | |
| `xMax` | 159 | |
| `yMax` | 99 | |

## 2. Playfield geometry

| | value | original | |
|---|---|---|---|
| `playfieldLeft` | 40 | 32 | column of player 1's paddle |
| `playfieldRight` | 118 | 94 | column of player 2's paddle |
| `playfieldTop` | 9 | 6 | row of the top line |
| `playfieldBottom` | 80 | 51 | row of the bottom line |
| `playfieldWidth` | 79 | 63 | derived, inclusive |
| `playfieldHeight` | 72 | 46 | derived, inclusive |
| `centerX` | 79 | 63 | exactly `(40 + 118) / 2` |
| `scoreTop` | 84 | 54 | first row of the score band |

`playfieldWidth` is odd so the net has an exact centre column. The playfield's
proportions come out 0.14% from the original's.

The original's `viewWidth`, `viewHeight`, `viewLeft`, `viewTop` and `centerY`
are declared and never read. They are not part of this spec.

## 3. Object sizes

| | value | original |
|---|---|---|
| `paddleHeight` | 9 | 6 |
| `paddleWidth` | 1 | 1 |
| `ballWidth` | 3 | 2 |
| `ballHeight` | 3 | 2 |
| `digitWidth` | 5 | 5 |
| `digitHeight` | 5 | 5 |

Digits stay 5x5, so they read smaller relative to the screen than the original's
did. Deliberate.

## 4. The subgrid

Ball and paddle positions are held at **4x pixel resolution** and shifted down
to pixels for drawing. The original used 3x; 4 is a shift rather than a divide.

The travel range of each object is `(span - objectSize - 2) x 4`, where the 2 is
the pair of boundary lines or paddle columns it must stay inside:

| | value | derivation |
|---|---|---|
| `subgridScale` | 4 | |
| `paddleYMax` | 244 | `(72 - 9 - 2) x 4` |
| `ballXMax` | 296 | `(79 - 3 - 2) x 4` |
| `ballYMax` | 268 | `(72 - 3 - 2) x 4` |

All three run from 0. Converting to pixels is the same shape in every case:

```
paddlePixelY = playfieldTop  + 1 + (paddleY >> 2)      // 10 + ...
ballPixelX   = playfieldLeft + 1 + (ballX   >> 2)      // 41 + ...
ballPixelY   = playfieldTop  + 1 + (ballY   >> 2)      // 10 + ...
```

So `ballX = 0` puts the ball's left column immediately right of player 1's
paddle, and `ballX = ballXMax` puts its right column immediately left of player
2's. The boundaries *are* the contact positions, which is what makes the
collision tests below simple comparisons.

**Watch the sign.** These are signed values and `>> 2` is an arithmetic shift,
which rounds toward negative infinity where the original's `/ 3` rounded toward
zero. Positions are only ever shifted after clamping to 0 or above, so this
never fires - but it is the one place a negative coordinate would misbehave.

## 5. Colours

Palette indices, flat:

| index | colour | used for |
|---|---|---|
| 1 | lightGreen | playfield background |
| 3 | black | score band background |
| 4 | red | player 1's paddle; the ball when player 1 touched it last |
| 5 | green | playfield lines and net |
| 6 | blue | player 2's paddle; the ball when player 2 touched it last |
| 7 | white | score digits |

Indices 0 (lightGrey) and 2 (lightBlue) are unused by the game.

**The score digits are white in every state.** In the original this fell out of
the black-background rule rather than being chosen, but it is what the game
displays, so it is specified directly.

## 6. State

| name | type | range | |
|---|---|---|---|
| `winScreen` | bool | | true while the win screen is showing |
| `score1`, `score2` | u8 | 0-11 | |
| `p1Y`, `p2Y` | i16 | 0-244 | paddle top, subgrid |
| `p1Speed`, `p2Speed` | u8 | 0-16 | acceleration counter |
| `ballX` | i16 | 0-296 | subgrid |
| `ballY` | i16 | 0-268 | subgrid |
| `ballSpeedX` | i16 | +/-3, +/-6, +/-9 | never zero |
| `ballSpeedY` | i16 | 0, +/-3, +/-6, +/-9 | |
| `ballPlayer` | bool | | who touched the ball last |
| `volleyCount` | u8 | 0-2 | hits since the last speed increase |

Positions and speeds are signed because the collision and clamp tests are
written against zero - `yOffset >= 0` and `ballY < 0` are meaningless unsigned,
and a wrapped position never trips its clamp.

## 7. What a frame contains

A normal frame shows, in this order of precedence where they overlap:

1. **Background** - rows 0 to `scoreTop - 1` in lightGreen, rows `scoreTop` to
   99 in black.
2. **Playfield lines** - green, one pixel tall, at rows `playfieldTop` and
   `playfieldBottom`, spanning columns `playfieldLeft` to `playfieldRight`
   inclusive.
3. **Net** - green, five dashes in column `centerX`, each 9 rows tall, period
   14, dash `i` (0-4) starting at row `playfieldTop + 3 + i * 14`. So rows
   12-20, 26-34, 40-48, 54-62 and 68-76.
4. **Paddles** - one pixel wide, `paddleHeight` tall. Player 1 at column
   `playfieldLeft` in red, player 2 at column `playfieldRight` in blue, each
   with its top at its own `paddlePixelY`.
5. **Ball** - `ballWidth` x `ballHeight`, at `ballPixelX`, `ballPixelY`. Red if
   `ballPlayer` is player 1, blue if player 2.
6. **Score** - four 5x5 digits in white, tops at row `scoreTop + 1` (85).
   Player 1's at columns 44 and 51, player 2's at 101 and 108. The left digit of
   each pair is glyph 0 when that score is under 10 and glyph 1 otherwise; the
   right digit is the score, less 10 when the score is 10 or more.

The **win screen** contains only: the whole playfield area (rows 0 to
`scoreTop - 1`) filled with the winner's colour - red for player 1, blue for
player 2 - the score band in black, and the score digits in white. No lines, no
net, no paddles, no ball.

Erasing and dirty-rectangle strategy are implementation concerns and not part of
this spec.

## 8. Input

Each player has an up and a down control. The paddle accelerates while a
direction is held:

```
if up or down is held:
  speed = min( speed + 2, 16 )
  y = y - speed   (up)   or   y + speed   (down)
  clamp y to 0 .. paddleYMax
else:
  speed = 0
```

Full speed is reached after 8 frames - just under a quarter of a second at 35Hz
(§15) - and tops out at 4 pixels per frame. The original ramped over 15 frames
at 60Hz with an integer-division dead zone that made the first two frames of a
tap move nothing; that dead zone is dropped here, so a tap moves half a pixel.
Add a threshold back if taps feel too coarse.

The win screen ignores these and waits for a **restart control** - in the
original, either player's left or right.

**Settled.** This was the largest open question here, because BIOS `int 16h`
reports keystrokes rather than key state - no key-up, and no way to see two
players holding keys at once, which the acceleration model above requires.
`tkbd.momo` reads scancodes from port `0x60` instead, which needs `in` and `out`
(DESIGN §22, now built) and gives real presses and releases for as many keys as
are held.

The cost is that IRQ1 is masked for the duration, so the BIOS never sees the
keyboard: `keyboardBegin` and `keyboardEnd` bracket the game, and a crash
between them leaves the machine needing a reset. That was accepted deliberately
rather than worked around.

Two details the module owns rather than the game:

- **`keyboardEnd` waits for every key to be released** before unmasking. A key
  still held when IRQ1 goes live repeats straight into the BIOS buffer, and that
  keystroke turns up at the DOS prompt.
- **Esc is latched.** The nine key bools are level state, so a press and release
  falling inside one frame's poll would cancel out and the quit would be missed;
  `wasEsc` is set on the press and never cleared.

## 9. Ball movement

Once per frame:

**1. Advance.** `ballX += ballSpeedX`, `ballY += ballSpeedY`.

**2. Walls.** If `ballY < 0`, set it to 0 and negate `ballSpeedY`. If
`ballY > ballYMax`, set it to `ballYMax` and negate `ballSpeedY`.

**3. Paddles.** Only the side the ball is travelling toward is tested.

```
if ballSpeedX > 0 and ballX >= ballXMax:     test against player 2
if ballSpeedX < 0 and ballX <= 0:            test against player 1
```

**4. The test.** With `paddleY` being the tested player's:

```
yOffset = ballY - paddleY + 11
hit     = yOffset >= 0 and yOffset < 47
```

The 11 is `ballHeight * 4 - 1`, and the 47 is that plus `paddleHeight * 4` - so
the window runs from the ball's bottom edge just reaching the paddle's top to
its top edge just leaving the paddle's bottom.

**On a hit:** clamp `ballX` to the boundary it crossed (0 or `ballXMax`), set
`ballSpeedY` from the zone table below, apply the volley rule, negate
`ballSpeedX`, and set `ballPlayer` to the player who was hit against.

**On a miss:** the *other* player scores - the ball got past this paddle - and
that player serves. If their score reaches 11 they win.

## 10. The angle table

Where the ball met the paddle sets the outgoing vertical speed. Zones are the
original's, doubled to fit the 47-unit window:

| `yOffset` | `ballSpeedY` |
|---|---|
| 0-5 | -9 |
| 6-11 | -6 |
| 12-17 | -3 |
| 18-28 | 0 |
| 29-34 | +3 |
| 35-40 | +6 |
| 41-46 | +9 |

The middle zone is deliberately wider - it is the flat return, and it is 11
units against the others' 6, the same proportion the original used.

## 11. Volley speed-up

On every successful hit:

```
if abs( ballSpeedX ) < 9:
  volleyCount++
  if volleyCount == 3:
    increase abs( ballSpeedX ) by 3
    volleyCount = 0
```

So the ball goes 3 -> 6 -> 9 subgrid units per frame over the course of a rally,
and stops there. `volleyCount` resets on a serve.

## 12. Serving

A serve sets the ball beside the serving player's paddle, level with it, moving
away at the slowest speed:

| | player 1 serves | player 2 serves |
|---|---|---|
| `ballX` | 4 | `ballXMax - 4` |
| `ballY` | `p1Y + 12`, clamped to 0..`ballYMax` | `p2Y + 12`, same |
| `ballSpeedX` | +3 | -3 |
| `ballSpeedY` | 0 | 0 |
| `ballPlayer` | player 1 | player 2 |
| `volleyCount` | 0 | 0 |

The `+ 12` centres the 3-pixel ball on the 9-pixel paddle: the paddle is 36
subgrid units, the ball 12, so the offset is `(36 - 12) / 2`.

## 13. Scoring and the win screen

A player scores when the opponent misses. First to **11** wins. On reaching 11,
`winScreen` becomes true and the win screen replaces the game until a restart
control is pressed, which begins a new game.

## 14. Starting a game

```
winScreen = false
p1Y = p2Y = 122          // centred; paddleYMax / 2
score1 = score2 = 0
clear to the normal background
serve from a random player
```

The original started the paddles slightly above centre, at the equivalent of 94.
Centred is a deliberate change.

## 15. Frame timing

The original ran at 60Hz. **This runs at 35Hz**, locked to the display: mode 13h
refreshes at 70Hz, and a frame waits two retraces.

```momo
const vgaStatus = 0x3DA
const vgaVRetrace = 1 << 3

sub waitRetrace {
  while ( in8( vgaStatus ) & vgaVRetrace ) { }        // let one in progress end
  while ( ( in8( vgaStatus ) & vgaVRetrace ) == 0 ) { }
}

sub waitFrame {
  waitRetrace()
  waitRetrace()
}
```

Two loops rather than one: called during a retrace, waiting only for "in
retrace" would return at once and give a partial frame.

**The wait goes before drawing, not after**, which is the whole point of using
retrace rather than a timer:

```momo
sub tick {
  input()
  update()
  waitFrame()
  render()
}
```

During the retrace the beam is off-screen, so writes made then are not caught
mid-scan. Pacing the loop from the end would keep the same rate and tear exactly
as much as before.

**The speeds in this document were scaled for 30Hz**, so at 35Hz everything runs
about 17% brisk. That is a tuning knob rather than an error, and §10 and §11 are
where it would be turned.

This replaced a fixed `int 15h AH=86h` wait of 33333us, and is better in three
ways. It cannot tear. It does not drift - a fixed wait made a frame take *work
plus 33.3ms*, so the rate moved with the workload, where a missed retrace simply
costs the next one and the game steps down in whole frames. And it needs no
clock at all, where the BIOS tick at 18.2Hz was too coarse to measure a frame
against.

**What is not yet known** is how much of `render` fits inside the blanking
interval on real hardware. It is about 1.4ms of a 14.3ms frame, and `render` is
longer than that - so strictly this buys a head start rather than a guarantee,
and the score area, drawn last and low on the screen, is where the beam would
catch up first. Under DOSBox the whole frame fits and the result is completely
flicker free. 86Box is the next honest measurement, and a real machine after
that.
