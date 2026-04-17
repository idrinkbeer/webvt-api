# === INPUT PLAYLIST (we'll control this dynamically later)
playlist = playlist(mode="random", "/music")

# === CROSSFADE (radio-style)
radio = crossfade(start_next=5.0, fade_in=2.0, fade_out=3.0, playlist)

# === OUTPUT (local audio OR stream)
output.alsa(radio)   # local playback

# OR stream:
# output.icecast(%mp3, host="localhost", port=8000,
#   password="hackme", mount="/stream", radio)
