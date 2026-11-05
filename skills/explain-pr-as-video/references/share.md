# Share the video as a Jam

A Jam is a shareable jam.dev recording. Needs the Jam CLI signed in (`jam auth status`); if it is not, ask the user to run `jam auth login`.

Write the payload with the text map from step 5 as the description, then create the Jam:

```bash
jq -n --arg vp "$PWD/voiceover/voiced.mp4" --arg url "<PR URL>" --arg title "PR #<n>: <title>" --rawfile desc description.md \
  '{kind:"video", videoPath:$vp, url:$url, title:$title, description:$desc, micEnabled:true, screenDimensions:{width:1920,height:1080}}' > jam.json
jam create jam @jam.json --json | jq -r .url
```

`micEnabled` makes Jam transcribe the narration, so the Jam is searchable by what the video says. Return the link to the user; post it on the PR only when they ask.
