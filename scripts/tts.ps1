$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
if (-not ($request.text -is [string]) -or $request.text.Length -gt 300 -or [string]::IsNullOrWhiteSpace($request.text)) { throw 'Use 1 to 300 characters.' }
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$stream = New-Object System.IO.MemoryStream
try {
  $synth.SetOutputToWaveStream($stream)
  $synth.Speak($request.text)
  $synth.SetOutputToNull()
  [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))
} finally {
  $synth.Dispose()
  $stream.Dispose()
}
