# Sound credits

All sampled sounds are from [Kenney](https://www.kenney.nl) audio packs, released under
**Creative Commons Zero (CC0 1.0)** — public domain, free for commercial use, no attribution
required (credited here anyway; thank you, Kenney). License text:
https://creativecommons.org/publicdomain/zero/1.0/

Files were decoded from the original Ogg Vorbis, mixed to mono, peak-normalized and re-encoded
as AAC (`.m4a`, 64 kbps) so they play in Safari, Chrome and Firefox.

| File | Source pack (page) | Original file | License |
| --- | --- | --- | --- |
| club-hit-1.m4a | Impact Sounds — https://kenney.nl/assets/impact-sounds | impactWood_heavy_000.ogg | CC0 |
| club-hit-2.m4a | Impact Sounds — https://kenney.nl/assets/impact-sounds | impactWood_heavy_002.ogg | CC0 |
| maul-hit.m4a | Impact Sounds — https://kenney.nl/assets/impact-sounds | impactPunch_heavy_001.ogg | CC0 |
| enemy-death.m4a | Impact Sounds — https://kenney.nl/assets/impact-sounds | impactSoft_medium_000.ogg | CC0 |
| hammer-1.m4a | Impact Sounds — https://kenney.nl/assets/impact-sounds | impactMining_000.ogg | CC0 |
| hammer-2.m4a | Impact Sounds — https://kenney.nl/assets/impact-sounds | impactMining_002.ogg | CC0 |
| land.m4a | Impact Sounds — https://kenney.nl/assets/impact-sounds | footstep_concrete_000.ogg | CC0 |
| pickup.m4a | RPG Audio — https://kenney.nl/assets/rpg-audio | handleSmallLeather.ogg | CC0 |
| reload.m4a | RPG Audio — https://kenney.nl/assets/rpg-audio | metalLatch.ogg | CC0 |
| empty-click.m4a | RPG Audio — https://kenney.nl/assets/rpg-audio | metalClick.ogg | CC0 |
| jump.m4a | RPG Audio — https://kenney.nl/assets/rpg-audio | cloth1.ogg | CC0 |
| coins.m4a | RPG Audio — https://kenney.nl/assets/rpg-audio | handleCoins.ogg | CC0 |
| ui-click.m4a | Interface Sounds — https://kenney.nl/assets/interface-sounds | click_001.ogg | CC0 |

## Synthesized (no external source)

These are generated procedurally at load time by `src/audio.ts` (Web Audio, original code —
no third-party audio, nothing to license):

- `cannon` — muzzle crack + low-passed noise blast + descending sine boom
- `impact` — cannonball explosion (noise burst + thump + debris rattle)
- `wallCollapse`, `towerRuin` — swelling rumble with tumbling stone chunks
- `nightHorn` — two-note brass horn call (D3 → A3)
- `victory` — rising D-major brass fanfare
- `defeat` — falling minor brass phrase
- ambience — seamless night-wind loop (filtered noise with slow gusts)
