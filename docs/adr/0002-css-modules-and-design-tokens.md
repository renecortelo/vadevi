# ADR-0002: CSS Modules with shared design tokens

- Status: accepted
- Date: 2026-08-12

## Context

The specification leaves CSS Modules versus Tailwind open after a small prototype. The app needs a calm custom visual language, a small initial JavaScript budget, predictable component ownership, and replaceable branding.

## Decision

Use CSS custom properties for color, typography, spacing, radius, elevation, and motion, distributed by `@vadevi/ui`. Use CSS Modules for component and feature styles. Keep global CSS limited to reset, document defaults, focus behavior, and responsive application-shell rules.

The Phase 0 shell prototype validates responsive navigation, focus treatment, reduced motion, a warm cream/coral/plum palette, and a text wordmark without adding a utility-framework build layer.

## Consequences

- Styles remain locally scoped and produce no runtime JavaScript.
- Repeated layout patterns should become shared components or tokenized utility classes, not copied declarations.
- A future change of styling system is a major architectural change and requires a superseding ADR.
