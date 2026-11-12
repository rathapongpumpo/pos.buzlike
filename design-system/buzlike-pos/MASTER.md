# BUZLIKE POS — Warm Peach

Accepted direction: adapt the colors of https://uupm.cc/demo/pet-grooming/ to the existing POS. Keep the Thai typography, information architecture, product imagery, copy, business rules, prices and responsive layouts. Do not introduce pet imagery or pet-service copy.

## Palette and roles

| Role | Token / color | Use |
|---|---|---|
| Canvas | `--bg: #FFF9F5` | Warm cream page background |
| Surface | `--surface: #FFFFFF` | Navigation, forms, cards, tables |
| Primary accent | `--accent: #FF8C42` | Main actions and selected navigation/tabs |
| Hover | `--accent-hover: #FF9F5A` | Warm orange hover/gradient endpoint |
| On accent | `--on-accent: #462A1B` | Dark readable labels on orange fills |
| Accent text | `--accent-strong: #A84412` | Links, price emphasis, focus rings |
| Soft accent | `--accent-soft: #FFF0E5` | Informational surfaces and trial banner |
| Pink | `--pink: #FF6B9D` | Reference secondary accent |
| Pink text | `--pink-strong: #A72F5B` | Featured Pro border and headline gradient |
| Pink surface | `--pink-soft: #FFF0F6` | Featured Pro card/comparison column |
| Mint | `--mint: #06D6A0` | Small identity accents; pair with dark text |
| Primary text | `--ink: #2D3436` | Headings, body, navigation and controls |
| Secondary text | `--muted: #636E72` | Descriptions, captions, placeholders |
| Divider | `--line: #EEDBD0` | Warm subtle separators |
| Control boundary | `--control-border: #A58B7C` | Inputs and outline buttons |

The orange fill, cream canvas, pink and mint come from the reference's rendered CSS. Darker accent text and dark button labels are intentional adaptations for contrast. Normal text pairs must meet 4.5:1; meaningful control boundaries need 3:1. A bright brand fill must not be reused as small body text.

## Semantic states

- Success: `--success: #087858` on `--success-soft: #E4FBF2`.
- Warning: `--warning: #88540D` on `--warning-soft: #FFF4D7`.
- Error/destructive: `--danger: #B62E3D` on `--danger-soft: #FFF0EF`.
- Keep status labels/icons. Do not recolor success, failure, refunds or stock movements merely to match the brand.
- QR codes and thermal receipts stay black on white.

## Components

- Reuse existing components and spacing. Primary buttons use a restrained peach gradient and shallow shadow; interactions must not shift their layout bounds.
- Light sidebar and header, orange selected navigation, warm dividers. Keep the existing mobile bottom navigation and tablet breakpoints.
- Preserve IBM Plex Sans Thai for the UI, Sarabun for receipts and JetBrains Mono for codes. Do not replace them with the generator's English-only font pairing.
- Use the existing Lucide SVG icons. Keep keyboard focus visible with the darker accent.
- Keep mobile inputs at 16px, menu/button labels on one line, long descriptions readable and wide tables scrollable inside their own containers.
- Main checkout must remain visible on normal desktop/tablet landscape heights; its minimum height accounts for the branch toolbar as well as the header and trial banner.
- Marketing screenshots must show the current real application with clearly identified sample-store data. Refresh all three together when changing the theme.

## Sources and skill use

UI/UX Pro Max installed at `C:\Users\rpump\.codex\skills\ui-ux-pro-max`, upstream revision `6ae86f61f520d6ca229d2f40e070410638c908c5` (11 November 2026).

The design-system search matched general retail guidance, including clear hierarchy and contrast, but its blue palette and marketing pattern were not adopted over the user's reference. A focused UX search returned color-only and contrast rules. Two Next.js-specific theme searches returned no match; theme implementation therefore follows the inspected application CSS and these explicit reference tokens, not a claimed stack search result.

Validate the rendered result with Playwright, screenshots and contrast measurements. Search output alone is not runtime or visual proof.

## Account entry layout

For login/register, place the home link beside the brand and put email fields before the secondary Google action. On phones use a white canvas with 20px side padding; from 600px use a bounded white card. Keep short benefit phrases intact while allowing explanatory paragraphs to wrap naturally. Password controls have independent 46px reveal buttons, and confirmation feedback reserves the same space before/after validation so the submit button does not move during a click. See `docs/auth-layout-review-2026-11-11.md` for captured evidence and scope.
