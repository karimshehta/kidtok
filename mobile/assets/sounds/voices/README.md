# KidTok voice preview assets

These short English samples are generated locally by
[`scripts/generate_voice_previews.py`](../../../scripts/generate_voice_previews.py)
with four distinct open Piper speakers, then lightly processed into the eight
KidTok character profiles. The source speakers are `joe` (young/robot), `cori`
(cheerful girl/cartoon), `kristin` (story/magic), and `bryce` (grandpa/space).

- The samples are synthetic speech and do not represent a real person.
- They are bundled only as short picker previews; the matching video profile is
  applied to a child's own recording after it is captured.
- Regenerate with `pip install piper-tts numpy`, then run the script with an
  explicit temporary model directory.
