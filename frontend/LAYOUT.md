# Layout inventory - IVR Web App -> Receptra

## Template tokens (read off the images)

| | Template (from the image) | Yours |
|---|---|---|
| mode | dark marketing (#060606) + light app (white panels on black frame) | same split |
| ground | #060606 (marketing) / #FFFFFF (app) | #060606 / #FFFFFF |
| surface | #111111 dark circles; #F6F6F8 app hover/segmented | #121214 / #F6F6F8 |
| ink | #FFFFFF on dark, #111113 on light | same |
| accent | #2F60F5 electric blue (CTAs, active toggle, send, bars) | **#5B5BF0 violet** |
| accent2 | #B1ADD5 → #6F7FC4 periwinkle gradient (featured card, logo) | **#C08BF5 orchid** + periwinkle gradient kept as `--grad-peri` |
| display font | Aventa (geometric grotesk) | **Sora** |
| body font | Aventa | **Manrope** |
| corner radius | 16–24px cards, pill buttons, 40px app frame | 20px cards, pill buttons, 28px frame |
| nav pattern | Marketing: no top nav, floating icon tiles bottom-left/right. App: 220px left sidebar, logo top, lang/help/mode/user bottom | same |
| card style | white, 1px #EEE hairline, no shadow; featured card periwinkle gradient | **liquid glass**: translucent frosted pane (`.glass` / `bg-ground` in globals.css) with a bright top lip and diagonal sheen, over a drifting aurora (`Aurora.tsx`); featured card keeps the periwinkle gradient at ~90% opacity |
| hero subject | iridescent chrome robot head | **photoreal AI-generated receptionist** rendered as a depth-displaced 3D relief (`Portrait3D.tsx`), keyed out of her backdrop so she floats like the template's head |

## Screens

### Screen 1 - hero (image_original1)
| # | Region | Component | Contents | Layout | States / motion |
|---|---|---|---|---|---|
| 1 | Headline | Display h1 | "Interactive *Voice* Response", italic accent word in periwinkle | centred, 2 lines, ~120px, overlaps top of head | — |
| 2 | 3D head | WebGL | iridescent chrome head + neck cables | centred, ~55% viewport height | idle float, cursor follow, voice pulse |
| 3 | Wave rings | Canvas | dotted concentric wavy rings | centred behind head | slow wobble |
| 4 | Icon tiles | 5 tiles | apple/android/web (left, active=accent), figma/ae (right); diamond-rotated variant alternates | bottom corners | hover lift |

### Screen 2 - about + process (image_original2)
| 1 | Pill label "About platform" | outline pill | left col | 1/4 + 3/4 grid | — |
| 2 | Statement | 2 paragraphs ~44px, second para starts with periwinkle phrase | right 3/4 | reveal |
| 3 | Pill "Design process" + 6 overlapping circles (icon top, label bottom), one active gradient | row of overlapping 300px circles | hover activates |

### Screen 3 - dashboard (image_original3)
| 1 | App frame | sidebar + topbar (logo, "Download report" button right) | |
| 2 | Title + segmented (All time/Monthly/Weekly/Daily) | row | |
| 3 | 4 KPI cards: icon tile, mini bars/sparkline top-right, label, big number, delta chip | 4 cols | |
| 4 | Earning bar+line chart (2/3) + Calls line chart w/ legend (1/3) | 2 cols | tooltip |
| 5 | Top users card list (1/3) + Top campaigns table w/ status pill (2/3) | 2 cols | |

### Screen 4 - mosaic (image_original4): flow builder, billing, contacts, numbers
| 1 | Flow builder | sub-sidebar (number, Call distribution/Settings/Integrations/Business hours), tree "When a call comes in" pill → business hours / off hours branches with toggle rows | |
| 2 | Billing | 3 stat cards; usage tracking: featured gradient card w/ Pay button + 3 usage cards; unpaid table | |
| 3 | Contacts | search, Import CSV + Create contact (black pill), List/Grid toggle + filter, rows: avatar, name+phone, email, tag pills, call/message/more icon buttons, pagination | |
| 4 | Numbers cards | flag, name, number, Always Open toggle | |
| 5 | Pricing card | "Enterprise", Let's talk in periwinkle, Contact Sales, checklist | |

### Screen 5 - activity (image_original5)
| 1 | Col 1 (320px) | Contacts/Numbers segmented, two filters, contact list with avatar, time, unread badge, "Live Call" green | |
| 2 | Col 2 | date divider, featured gradient call card: Finished Call + duration, two pill toggles (keypad / speech-to-text), keypad steps, transcript, recording player; event cards (Unanswered call, Finished call); composer bottom | |
| 3 | Col 3 (360px) | avatar, name, call/message/more buttons, Schedule SMS card, Call details (total calls, avg time), Details list (tags, phone, email, address...) | |

### Screens 6–8: perspective detail, style guide, branding (wave logo mark) — logo becomes Receptra wave mark.
