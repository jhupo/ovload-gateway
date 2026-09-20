# UI reference review

Date: 2026-09-19. Scope: component catalog design, not gateway behavior.

## Linux DO CDK
Source: https://github.com/linux-do/cdk
Inspected revision: 6d947d26a76b94d9c63531ac932c2d0a1e2c06ff. License: MIT.
- frontend/app/layout.tsx: Inter and Noto Sans SC, Chinese weights 300–700.
- frontend/components/ui/button.tsx: 14px medium labels, 16px icons,
  32/36/40px button variants, quiet ghost actions.
- frontend/components/ui/sidebar.tsx: 16rem desktop, 18rem mobile,
  3rem collapsed navigation.
- frontend/components/animate-ui/radix/tabs.tsx: animated active state,
  spring stiffness 200 and damping 25.
The project uses Lucide, Recharts, and motion/react. Ovload keeps its Vue stack,
PrimeVue primitives, and ECharts rather than introducing React dependencies.
The dashboard itself returned a Cloudflare challenge; source inspection is not
proof of its exact deployed appearance. No source was copied.

## Flutter
Sources: https://flutter.dev/ and https://flutter.dev/main.css?hash=18IKqwOp2C1f
Public HTML and stylesheet inspected; browser animation inspection unavailable.
Observed stylesheet values: 14px body, 40px buttons, heading levels
46/34/24/18/16px, Google Sans Flex/Roboto, and Material Symbols.
Transitions include 300ms button background changes, a 3px icon shift over
400ms, and cubic-bezier(.27,.89,.39,.95).
Adopted principle: clear typographic hierarchy and restrained, coherent feedback.
Ovload uses its own font/icon choices and a 280ms tab underline with that easing.
A public marketing page does not dictate administration table density.

## Implementation and review scope
The development-only test.html catalog includes localized controls, collapsible
navigation, charts, contextual dialog dismissal, glass surfaces, and theme motion.
Product promotion remains subject to user design review. Browser regressions
exercise desktop/mobile, both themes, language persistence, and dismissal rules.
No backend, provider request identity, or production data behavior changed here.
