# Build brief - fe

**Request:** AI voice receptionist platform dashboard
**Platform:** web  |  **Company:** Receptra
**Reference design:** IVR Web App (`ivr-web-app`)
**Reference folder:** `IVR Web app`
**Look at these before writing code:** `IVR Web app/image_original1.png`, `IVR Web app/image_original2.png`, `IVR Web app/image_original3.png`, `IVR Web app/image_original4.png`, `IVR Web app/image_original5.png`, `IVR Web app/image_original6.png`

## Direction
- Style: **playful**
- Mode: **light**
- Industry: ai, food-drink
- Layout: standard

## Tokens - template -> yours

_**the template has no authored tokens - these are mode fallbacks.** Read the real ground, ink, accent and fonts off the hero screenshot and write them to meta.json so the next run starts from the truth._

| Role | Template | Yours |
|---|---|---|
| ground | `#FFFFFF` | `#FFFFFF` |
| surface | `#F5F5F7` | `#F5F5F7` |
| ink | `#111113` | `#111113` |
| muted | `#6B7280` | `#6B7280` |
| accent | `#3D5AFE` | `#5B5BF0` **<-** |
| accent2 | `#2E40AC` | `#C08BF5` **<-** |
| display font | Space Grotesk | Sora **<-** |
| body font | Inter | Manrope **<-** |
- ! accent2 #C08BF5 on #FFFFFF is only 2.5:1 - fine for fills, but do not set body text in it

## Tokens
- Roles: ground=#FFFFFF  surface=#F5F5F7  ink=#111113  muted=#6B7280  accent=#5B5BF0  accent2=#C08BF5
- Fonts: Sora, Manrope
- Radius: 24px  |  Shadow: 0 6px 0 rgba(0,0,0,.9)
- Section padding: 120px desktop / 72px mobile
- Display type: clamp(2.5rem, 5vw, 4rem), leading 1.1
- Body type: 16px

## Sections, in order
1. nav
2. hero
3. about
4. process
5. features
6. pricing
7. cta
8. footer

## Motion
- **reveal-on-scroll** via IntersectionObserver + CSS - fire once at ~20% viewport; never re-animate on scroll up

## Non-negotiables
- No purple-to-blue gradient on a white card unless the reference design actually uses one.
- No emoji as icons. Use a real icon set or draw inline SVG.
- Body text is never below 15px, and never pure #000 on pure #FFF.
- Every section must differ from its neighbour in background, rhythm or column count - eleven identical centred slabs is the single clearest tell of a generated page.
- Buttons need real hover, focus-visible and active states, not just a colour change.
- Respect prefers-reduced-motion: hold transforms, keep opacity fades.
- Images need explicit width/height or aspect-ratio so nothing shifts on load.
- Ship real copy, not lorem ipsum, and not three-word headlines that say nothing.

## Image prompts

**hero** (16:9)
> Wide cinematic hero image for a ai, food-drink website. Receptra. playful art direction, palette restrained neutral palette, no text, no watermark, no UI chrome. Strong single focal point positioned off-centre with generous negative space on the left third for a headline overlay. Shallow depth of field, controlled contrast so white type stays readable over it.

**feature-texture** (1:1)
> Abstract close-up texture evoking ai, food-drink. playful art direction, palette restrained neutral palette, no text, no watermark, no UI chrome. Macro detail, soft directional light, extremely shallow depth of field, reads as a background at low opacity rather than as a subject.

**section-support** (4:3)
> Editorial supporting photograph for a ai, food-drink website section. Receptra. playful art direction, palette restrained neutral palette, no text, no watermark, no UI chrome. Documentary framing, natural light, one human gesture or one object in use, nothing staged or stock-like.

**og-card** (16:9)
> Open Graph share card background for a ai, food-drink brand. playful art direction, palette restrained neutral palette, no text, no watermark, no UI chrome. Simple, high contrast, centre kept visually quiet so a logo and title can be composited on top.

## Reference description

My role. UX/UI Designer

Project description.

The startup product is an IVR telephony solution designed to help businesses improve their customer service and streamline their phone communication processes. The solution is based on interactive voice response (IVR) technology and provides customers with a self-service menu that guides them through their inquiries and requests.

My role in the project
✅ Development of prototypes and user interface
✅ Thinking through the user flow for interactive user interaction with the product
✅ Interface animation
✅ Branding

Skills and deliverables

UX & UI
Web Design
User Experience Design
User Interface Design
AI App Development


Project Description

The IVR telephony solution for businesses includes a user-friendly interface that allows easy customization of the interactive voice response menus to suit each client's specific needs. It provides detailed call analytics and reporting features to help businesses monitor and assess their call-handling efficiency. Additionally, the solution integrates seamlessly with existing customer relationship management (CRM) systems to ensure a consistent and unified customer experience across all touchpoints.

Steps
- Prototypes and user interface
- Thinking through the user flow for interactive user interaction with the product
- Interface animation
- Branding








Published on Jun 26, 2024