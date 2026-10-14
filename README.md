# 30nama for LG webOS TV (unofficial)

<div dir="rtl" lang="fa">

## نصب سریع

۱. **روشن کردن حالت توسعه‌دهنده (فقط یک بار):** در [webostv.developer.lge.com](https://webostv.developer.lge.com/) یک حساب رایگان بسازید. روی تلویزیون از فروشگاه LG برنامه‌ی **Developer Mode** را نصب کنید و با همان حساب وارد شوید. **Dev Mode Status** را روشن کنید (تلویزیون ری‌استارت می‌شود) و بعد **Key Server** را روشن کنید.

۲. فایل **[30nama-webos.ipk](https://github.com/mmahdim77/30nama-webos/releases/latest/download/30nama-webos.ipk)** را دانلود کنید.

۳. برنامه‌ی **[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop/releases/latest)** را روی کامپیوتر نصب کنید (ویندوز، مک یا لینوکس).

۴. در Dev Manager تلویزیون را اضافه کنید و رمزی (Passphrase) را که در برنامه‌ی Developer Mode نمایش داده می‌شود وارد کنید.

۵. در زبانه‌ی **Apps** روی **Install** بزنید و فایل ipk را انتخاب کنید. تمام! برنامه‌ی **30nama** در فهرست برنامه‌های تلویزیون است.

> **نکته:** حالت توسعه‌دهنده بعد از حدود ۵۰ ساعت خاموش می‌شود و برنامه از تلویزیون پاک می‌شود. برای تمدید، در زبانه‌ی **Info** برنامه‌ی Dev Manager روی **Renew session** بزنید (یا در برنامه‌ی Developer Mode روی **Extend**).
>
> برای تماشا به اشتراک ۳۰نما نیاز دارید؛ ورود با اسکن کد QR با گوشی انجام می‌شود. این برنامه غیررسمی است و وابسته به ۳۰نما نیست.

</div>

---

An unofficial [30nama.com](https://30nama.com) app for LG webOS TVs, made for the remote: QR sign-in, home rows, details, search, archive, a Persian/English UI with right-to-left support, subtitles, continue watching, and a full TV player.

It is a webOS port of [msharifi99/30nama-tizenos](https://github.com/msharifi99/30nama-tizenos) (Samsung Tizen).

> **Disclaimer:** This is a community project. It is not affiliated with, endorsed by, or supported by 30nama. You need your own 30nama subscription to watch. No content is included in the app.

## Features

- **Sign in with your phone:** scan a QR code on the TV.
- **Player built for the remote:**
  - Left/Right seeks with a **live preview frame** of where you'll land.
  - Up/Down opens the control bar: Previous / Next episode, Play/Pause, Episodes (with season tabs), Subtitles (Persian / English, size), Audio (Stereo / 5.1), **Quality** (Auto, or a fixed 240p–4K), and About.
  - Skip intro / recap, Up Next with autoplay, and resume where you left off.
- **Magic Remote:** point and click, scroll wheel, and Back all work. The media keys and CH+/CH− work too.
- **Language:** Persian or English, switchable in Settings.
- **Optional TMDB extras:** trending rows, cast, reviews and recommendations, if you add your own TMDB token (see below).

**Requires webOS 22 or newer** (LG TVs from 2022 on). Seek previews need webOS 23 or newer; on webOS 22 the player works without them. Tested on a 2026 LG TV (webOS SDK 11).

## Install

Pick one of the three options below. Options 1 and 2 need **Developer Mode** turned on first; option 3 is for TVs rooted with Homebrew Channel.

### Step 0: turn on Developer Mode (one time)

1. On a computer or phone, create a free LG developer account at [webostv.developer.lge.com](https://webostv.developer.lge.com/).
2. On the TV, open the **LG Content Store** (called **Apps** on newer TVs), search for **Developer Mode**, install it and open it.
3. Sign in with the LG developer account.
4. Turn **Dev Mode Status** on. The TV restarts.
5. Open Developer Mode again and turn **Key Server** on. Keep this screen open: it shows the TV's **IP address** and the **passphrase** you'll need next.

> Developer Mode turns itself off after a while (about 50 hours on most TVs). When that happens, the TV removes apps installed this way. Renew it from the Developer Mode app (**Extend**) or with Dev Manager (option 1), or simply reinstall.

### Option 1: webOS Dev Manager (easiest, no command line)

Works on Windows, macOS and Linux.

1. Download **[30nama-webos.ipk](https://github.com/mmahdim77/30nama-webos/releases/latest/download/30nama-webos.ipk)** from the [latest release](https://github.com/mmahdim77/30nama-webos/releases/latest).
2. Download and install **[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop/releases/latest)**.
3. Open Dev Manager and add your TV: pick it from the list (or type its IP address), then enter the **passphrase** from the Developer Mode app.
4. Go to the **Apps** tab, click **Install**, and choose the `30nama-webos.ipk` you downloaded.
5. **30nama** now appears in the TV's app list.

To stop Developer Mode from expiring, open Dev Manager's **Info** tab: it shows the remaining time and has a **Renew session** button. **Renew automatically…** gives you a renewal link and script that you can schedule yourself.

### Option 2: command line (macOS / Linux)

Requires [Node.js](https://nodejs.org/) 18 or newer, and the TV and computer on the same network.

Install LG's webOS CLI:

```bash
npm install -g @webos-tools/cli
```

Register the TV. Use the IP address shown in the Developer Mode app:

```bash
ares-setup-device -a tv -i "host=TV_IP_ADDRESS" -i "port=9922" -i "username=prisoner"
```

Fetch the TV's key. It asks for the passphrase shown in the Developer Mode app:

```bash
ares-novacom -d tv --getkey
```

Download the app and install it:

```bash
curl -LO https://github.com/mmahdim77/30nama-webos/releases/latest/download/30nama-webos.ipk
```

```bash
ares-install -d tv 30nama-webos.ipk
```

```bash
ares-launch -d tv com.nama30.webos
```

On Windows, use option 1. Alternatively, download the `.ipk` in a browser and run the `ares-*` commands above in a terminal.

### Option 3: rooted TV (Homebrew Channel)

If your TV is rooted with [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel), turn on its SSH server in Homebrew Channel's settings, then use **webOS Dev Manager** (option 1, steps 1–4) and add the TV as a rooted device. You don't need Developer Mode, and the app never expires.

### Updating

Download the newer `.ipk` from [Releases](https://github.com/mmahdim77/30nama-webos/releases) and install it the same way. It replaces the old version, and you stay signed in.

## Using the app

- **Sign in:** on first launch, scan the QR code with a phone that is signed in to 30nama.com, and confirm. **Continue as guest** lets you browse without signing in, but playing requires a subscription.
- **Navigate:** arrows and OK. **Back** goes back, and on Home it asks before exiting. Press Left at the edge of the screen to open the menu.
- **In the player:**

| Key | Action |
|---|---|
| OK | Play / pause (while seeking: jump now) |
| Left / Right | Seek with preview. Steps grow from 10 s to 30 s to 60 s while you keep pressing; the jump happens 1.2 s after the last press |
| Up / Down | Show the control bar (Left/Right to move, OK to choose) |
| Back | Cancel the seek, then hide the controls, then leave the player |
| CH+ / CH− | Next / previous episode |
| ⏯ ⏹ ⏪ ⏩ | Play / pause, stop, seek 30 s |

- **Settings:** language, default subtitles, subtitle size, autoplay next episode, reduce motion, and **Player engine**. If a video won't play, switch the engine from Auto to Native and try again.

## Troubleshooting

- **The app disappeared from the TV:** Developer Mode expired. Renew it (see step 0) and install the `.ipk` again.
- **Dev Manager or `ares-*` can't reach the TV:** make sure the TV and computer are on the same network and **Key Server** is on. On macOS 15 or newer, also allow your terminal (or Dev Manager) under System Settings → Privacy & Security → **Local Network**.
- **"Playback error":** try Settings → Playback → Player engine → **Native**, or pick a lower quality from the player's Quality button.

## Optional: TMDB extras

TMDB adds trending rows, cast, reviews and "more like this". It is off by default, and the app works fully without it. Because the token is baked in when you build, this only applies when you build from source:

1. Create a free account at themoviedb.org and copy your **API Read Access Token** (v4).
2. Copy `webos-app/js/tmdb-token.example.js` to `webos-app/js/tmdb-token.js` and paste the token between the quotes.
3. Build and install with `./deploy.sh deploy` (see Development).

## Development

```bash
git clone https://github.com/mmahdim77/30nama-webos.git
```

```bash
cd 30nama-webos && npm install
```

`npm install` installs LG's CLI locally. `deploy.sh` wraps it:

| Command | What it does |
|---|---|
| `./deploy.sh setup <tv-ip>` | Register the TV and fetch its key (asks for the Developer Mode passphrase) |
| `./deploy.sh deploy` | Build `dist/*.ipk`, install it on the TV, and launch it |
| `./deploy.sh package` | Build the `.ipk` only |
| `./deploy.sh inspect` | Open Chrome DevTools attached to the app on the TV |
| `./deploy.sh info` | Print the TV model and webOS version |

Run the app in a desktop browser:

```bash
npm run dev
```

Then open http://localhost:8080/. A small proxy avoids CORS. Arrow keys, Enter, and Backspace (= Back) work, and the mouse behaves like the Magic Remote pointer.

**Releasing:** push a tag like `v1.0.1`. The [Release IPK](.github/workflows/release.yml) workflow builds the `.ipk` and attaches it to a GitHub Release.

### Project layout

```
webos-app/          the webOS web app: appinfo.json, index.html, js/, css/, fonts/, tools/ (dev only, not packaged)
deploy.sh           package / install / launch through the ares-* CLI
.github/workflows/  release workflow
design/DESIGN.md    UI spec (from the Tizen project)
```

### Differences from the Tizen app

| Tizen | webOS |
|---|---|
| `config.xml` | `webos-app/appinfo.json` (`disableBackHistoryAPI`, so the app handles Back itself) |
| AVPlay player | `<video>` with hls.js (quality levels, Stereo/5.1). webOS native HLS is the fallback |
| Back key 10009, `tvinputdevice.registerKey` | Back key 461; webOS delivers all remote keys without registering them |
| `tizen.application…exit()` | `window.close()` |
| — | Magic Remote pointer, wheel, seek previews, control bar, CH± episode switching |

## Credits and license

MIT, see [LICENSE](LICENSE). Based on [30nama-tizenos](https://github.com/msharifi99/30nama-tizenos) by Rebin Sharifi. Bundled libraries: [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0) and qrcode-generator (MIT). The Vazirmatn font is under the SIL Open Font License 1.1 (`webos-app/fonts/OFL.txt`).
