# =====================================================================
# 実ブラウザ検品用の音声を作る
#
# Windows の日本語 TTS で課題文を読み上げ、16 kHz モノラルの WAV にする。
# Chromium の --use-file-for-fake-audio-capture に食わせて、
# マイクからの経路をそのまま通すために使う。
#
# **TTS は人の音読の代わりにならない。** 合成音声は明瞭で間も一定なので、
# ここで出る CER は人が読んだときの値ではない。さらに SAPI が漢字を
# 読み違えれば、Whisper が忠実に写しても誤りとして数えられる。
# この音声で確かめるのは**経路が通ること**であって、精度ではない。
#
#   powershell -File scripts/make_speech.ps1 [-Index 0] [-Voice 'Microsoft Haruka']
# =====================================================================
param(
  [int]$Index = 0,
  [string]$Voice = 'Microsoft Haruka'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$json = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'data\passages.json') | ConvertFrom-Json
$passage = $json.passages[$Index]
if ($null -eq $passage) { throw "課題文 $Index が無い" }

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = 0

# 16 kHz モノラル 16 bit — アプリが認識器へ渡す形に揃えておく
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)

$dir = Join-Path $root '.loop\audio'
New-Item -ItemType Directory -Force $dir | Out-Null
$out = Join-Path $dir ("{0}.wav" -f $passage.id)

$synth.SetOutputToWaveFile($out, $format)
$synth.Speak($passage.text)
$synth.SetOutputToNull()
$synth.Dispose()

$bytes = (Get-Item $out).Length
"{0} — {1}『{2}』 {3:N1} 秒 / {4:N0} bytes / 声 {5}" -f `
  $out, $passage.author, $passage.title, (($bytes - 44) / 32000), $bytes, $Voice
