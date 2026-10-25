# Widget redesign, week 1: screenshots

`shots/after/` holds the new widget. `shots/before/` holds the widget from `main` (28b754c), shot in light mode only because it has no dark mode.

File names follow `{state}-{light|dark}-{1440|390}.png`. Desktop shots (1440 wide) are cropped to the bottom-right corner where the widget sits. Mobile shots are 390×844 at 2x.

## How they were made

```
npm run build:widget
python docs/widget-redesign/shoot.py                       # after
python docs/widget-redesign/shoot.py --before path/to/main-widget.js
```

`shoot.py` serves `public/widget.js` and `public/widget-fonts/` on a plain host page. It runs Playwright with `/usr/bin/google-chrome` and mocks `/api/widget/config`, `/history`, `/lead` and `/api/chat` (SSE), so every state can be reproduced on demand. The replies are fixed sample text, not model output. Light and dark come from `prefers-color-scheme`.

Brands: the default (no colour, so saffron #C2410C) is "Ananya Handlooms" with no logo. Teal #0E7490 is "Sunrise Dental Clinic" with a logo. Pale yellow #FDE047 is "Kumar Electricals", which shows the auto-contrast fallback to dark text.

The Tamil and Hindi sample strings in `shoot.py` still need a native speaker to check them (each is marked `TODO: native check pending`).
