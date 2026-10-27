# Ads remain unresolved: YouTube prerolls in Windows WebView2

Status: **OPEN / NOT VERIFIED** (27 October 2026). No new public release has
been authorized by the evidence below. Latest release remains preview.20.

## Physical observation and scope

The user twice observed a full YouTube preroll before a regular video, first
with a BBVA ad and later with a 29-second separate advert displayed while
the selected YouTube video title remained visible. These observations override
all claims that installation, a green CI build or the extension's **Complete**
setting proves the absence of prerolls.

**SponsorBlock is not responsible for these preroll/midroll ads.** It skips
creator-integrated segments in requested content.

## Inspected causes and evidence

* Legacy TizenTube Windows adblock installed only five native URL patterns;
  this is not a complete adblock solution.
* uBlock Origin Lite was bundled and confirmed installed, enabled, with
  site access and level 3 (Complete) in the WebView2 profile:
  https://github.com/Angel52781/tizentube-windows/actions/runs/40441693252
* Stronger inspection now also confirms **5 registered content scripts and
  6 enabled rulesets** (not just extension manifest flags):
  https://github.com/Angel52781/tizentube-windows/actions/runs/40443753278
  This proves active extension plumbing **but not** its efficacy against the
  observed preroll.
* An independently packaged, GPL-3.0 official AdGuard Browser Extension
  5.5.3.3 Edge MV3 candidate, in a disposable WebView2 test profile, registered
  **1 ruleset and 0 content scripts**:
  https://github.com/Angel52781/tizentube-windows/actions/runs/40443468790
  This is *not evidence of superior blocking*. It has not been promoted to
  the user's application. The code path requires an isolated test profile,
  and production remains on uBOL only.
* Upstream has reported YouTube video prerolls bypassing uBOL despite
  Complete filtering. References:
  https://github.com/uBlockOrigin/uAssets/issues/30329
  https://github.com/uBlockOrigin/uAssets/issues/33382
* The original upstream TizenTube implementation
  `references/TizenTube/mods/features/adblock.js` neutralizes ad metadata
  such as `adPlacements`, `playerAds` and `adSlots` in the TV player JSON.
  In our desktop port, `src/mods/adblock_base.js` intentionally leaves
  desktop playback responses with `streamingData` or `playabilityStatus`
  intact to avoid corrupting legitimate video playback. It is also disabled
  as a whole when the embedded uBOL extension is present.

## Acceptance and safety

Do **not** publish another preview merely because a different MV3 extension
installs or a network rule count changes. The primary acceptance test is
reproducing and eliminating the reported preroll in an actual Windows
YouTube session while preserving playback, seeking, theater, fullscreen,
login state and SponsorBlock. Record the test version and whether it used an
anonymous or authenticated profile; do not collect cookies or credentials.
If a proposed mitigation strips the desktop player JSON, test it as a
reversible, limited-scope change and keep the original streaming contract
unchanged. Do not run overlapping experimental adblock engines on one user
profile. Retain the old release until that test is satisfied.
