# Design System Documentation
**Doc-Type:** Technical Reference · Version 1.0.0 · Updated 2025-11-17 · AI Whisperers

Centralized design token system with Web3.0 glassmorphism aesthetics, steel gradients, scroll effects, and cursor interactions.

---

## Purpose & Architecture

**what_this_provides**:
- Centralized design token system (TypeScript + CSS variables)
- Web3.0 inspired glassmorphism components
- Dark steel gradient color palette
- Scroll-based reveal and parallax effects
- Custom cursor with glow trail and magnetic interactions
- Consistent spacing, typography, and animation tokens

**architecture_pattern**: Follows hexagonal architecture - pure design constants with zero external dependencies

---

## Directory Structure

```
web/src/styles/
├── tokens/                 # TypeScript design tokens
│   ├── colors.ts          # Steel gradients & semantic colors
│   ├── glassmorphism.ts   # Glass effect variants
│   ├── spacing.ts         # Spacing scale (4px base)
│   ├── typography.ts      # Font families, sizes, weights
│   ├── animations.ts      # Duration, easing, transitions
│   └── index.ts           # Token exports
├── effects/                # Effect systems (CSS)
│   ├── scroll.css         # Scroll reveal, parallax, progress
│   └── cursor.css         # Custom cursor, glow, ripple
└── theme.css              # Main theme with CSS variables
```

---

## Design Tokens

### Color System

**steel_gradient_palette**:
- Steel 900-50: Dark to light steel gradient (`#0a0e14` → `#cdd7e5`)
- Primary use: Backgrounds, surfaces, borders

**accent_colors**:
- Primary: `#64b5f6` (blue) - Main interactive elements
- Secondary: `#81c784` (green) - Success states
- Tertiary: `#ba68c8` (purple) - Special highlights
- Error: `#ef5350` (red) - Error states
- Warning: `#ffb74d` (orange) - Warning states

**gradients**:
- `gradient-steel`: 135deg linear gradient
- `gradient-accent`: Primary accent gradient
- `gradient-mesh`: Multi-radial gradient overlay
- `gradient-shimmer`: Animated shimmer effect

**usage**:
```typescript
import { ColorTokens } from './styles/tokens';

const backgroundColor = ColorTokens.steel[900];
const accentColor = ColorTokens.accent.primary;
```

---

## Glassmorphism System

### Glass Card Variants

**primary_glass**:
- Background: `rgba(26, 34, 45, 0.4)` with 40% opacity
- Backdrop blur: `20px`
- Border: `rgba(117, 137, 163, 0.15)`
- Use: Main content cards

**elevated_glass**:
- Background: `rgba(35, 45, 61, 0.5)` with 50% opacity
- Backdrop blur: `24px`
- Border: `rgba(117, 137, 163, 0.2)`
- Use: Headers, footers, modals

**subtle_glass**:
- Background: `rgba(18, 24, 32, 0.3)` with 30% opacity
- Backdrop blur: `16px`
- Border: `rgba(117, 137, 163, 0.1)`
- Use: Input fields, secondary elements

**usage_css**:
```css
.my-card {
  background: var(--glass-bg-primary);
  backdrop-filter: var(--glass-blur-primary);
  -webkit-backdrop-filter: var(--glass-blur-primary);
  border: 1px solid var(--glass-border-primary);
  border-radius: var(--glass-radius-primary);
  box-shadow: var(--glass-shadow-primary);
}
```

**usage_utility_classes**:
```html
<div class="glass-primary">Primary glass card</div>
<div class="glass-elevated">Elevated glass card</div>
<div class="glass-subtle">Subtle glass card</div>
```

---

## Scroll Effects

### Available Effects

**scroll_reveal**:
- Fade in + slide up animation on scroll into view
- Uses `IntersectionObserver` API
- Threshold: 10% visibility by default

**parallax_scroll**:
- Elements move at different speeds on scroll
- Data attribute: `data-parallax="0.5"` (speed multiplier)
- Smooth transform transitions

**scroll_progress_bar**:
- Fixed progress indicator at top of page
- Shows percentage of page scrolled
- Gradient accent color

**custom_scrollbar**:
- Styled scrollbars matching dark theme
- Steel-colored track and thumb
- Hover and active states

**usage**:
```tsx
import { useScrollEffects } from './hooks/useScrollEffects';

function MyComponent() {
  const { scrollProgress, isScrolled } = useScrollEffects({
    enableReveal: true,
    enableParallax: true,
    enableProgressBar: true,
    enableStickyHeader: true
  });

  return <div className="scroll-reveal">Animated content</div>;
}
```

**html_classes**:
```html
<!-- Reveal on scroll -->
<div class="scroll-reveal">Slides up</div>
<div class="scroll-reveal-left">Slides from left</div>
<div class="scroll-reveal-right">Slides from right</div>
<div class="scroll-reveal-scale">Scales in</div>

<!-- Parallax -->
<div data-parallax="0.5">Moves slower than scroll</div>
```

---

## Cursor Effects

### Custom Cursor System

**components**:
- Cursor dot: 8px circle following mouse precisely
- Cursor ring: 32px hollow ring with spring animation
- Cursor glow: 200px radial gradient trail

**states**:
- Default: Blue accent color
- Hover (interactive): Larger, green accent
- Click: Extra large, orange accent

**additional_effects**:
- Magnetic attraction: Elements pull cursor toward them
- Ripple effect: Click creates expanding circle
- Particle trail: Random particles on movement
- Spotlight: Radial gradient highlighting cursor area

**usage**:
```tsx
import { CursorEffects } from './components';

function App() {
  return (
    <>
      <CursorEffects
        enableCustomCursor={true}
        enableGlow={true}
        enableParticles={false}
      />
      {/* Rest of app */}
    </>
  );
}
```

**interactive_elements**:
```html
<!-- Add cursor-interactive class for enhanced interactions -->
<button class="cursor-interactive ripple">Click me</button>
<a href="#" class="cursor-interactive magnetic">Hover me</a>
```

---

## Typography System

### Font Families

**primary**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
**mono**: `'JetBrains Mono', 'Fira Code', 'Courier New', monospace`
**display**: `'Space Grotesk', 'Inter', sans-serif`

### Font Scale

**sizes**: xs (12px) → base (16px) → 6xl (64px)
**weights**: light (300) → extrabold (800)
**line_heights**: tight (1.2) → loose (2)
**letter_spacing**: tight (-0.02em) → widest (0.1em)

**text_styles** (pre-composed):
- h1-h4: Heading styles with gradient text
- body, bodyLarge, bodySmall: Body text variants
- caption: Small secondary text
- code: Monospace code text

**usage**:
```css
.title {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
}

.gradient-text {
  background: var(--gradient-accent);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

---

## Spacing System

**base_unit**: 4px (8-point grid system)

**scale**:
- xs: 4px
- sm: 8px
- md: 16px (base)
- lg: 24px
- xl: 32px
- 2xl: 48px
- 3xl: 64px
- 4xl: 96px
- 5xl: 128px

**usage**:
```css
.card {
  padding: var(--space-2xl);
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}
```

---

## Animation System

### Durations

**instant**: 100ms - Micro-interactions
**fast**: 200ms - Hover states
**normal**: 300ms - Default transitions
**slow**: 400ms - Complex animations
**slower**: 600ms - Scroll reveals
**slowest**: 1000ms - Special effects

### Easing Functions

**ease-in-out**: `cubic-bezier(0.4, 0, 0.2, 1)` - Default smooth
**spring**: `cubic-bezier(0.34, 1.56, 0.64, 1)` - Bouncy entrance
**bounce**: `cubic-bezier(0.68, -0.55, 0.265, 1.55)` - Overshoot

**keyframe_animations**:
- fadeIn, fadeOut
- slideUp, slideDown
- scaleIn
- shimmer (background shine)
- float (gentle up/down)
- glow (pulsing shadow)
- spin (loader)
- pulse (opacity)

**usage**:
```css
.animated-element {
  transition: var(--transition-default);
  animation: slideUp var(--duration-normal) var(--ease-in-out);
}

.floating-icon {
  animation: float 3s ease-in-out infinite;
}
```

---

## Component Integration

### Apply Glassmorphism to Components

```tsx
// Before
<div className="card">Content</div>

// After
<div className="card glass-primary">Content</div>
```

### Add Scroll Reveal

```tsx
// Before
<section>Content</section>

// After
<section className="scroll-reveal">Content</section>
```

### Make Element Interactive

```tsx
// Before
<button>Click me</button>

// After
<button className="cursor-interactive ripple magnetic">Click me</button>
```

---

## Browser Support

**modern_features**:
- CSS Backdrop Filter (glassmorphism)
- CSS Custom Properties (design tokens)
- IntersectionObserver API (scroll reveals)
- CSS Grid & Flexbox (layouts)

**fallbacks**:
- Reduced motion: Automatically disables animations
- No backdrop filter: Solid backgrounds with opacity
- Touch devices: Custom cursor hidden automatically

**browser_targets**:
- Chrome 76+
- Firefox 103+
- Safari 15.4+
- Edge 79+

---

## Performance Considerations

**optimizations**:
- `will-change` on animated elements
- `passive: true` on scroll listeners
- Debounced scroll and mouse events
- GPU-accelerated transforms
- IntersectionObserver for lazy reveals

**best_practices**:
- Limit backdrop-filter on mobile (reduces blur quality)
- Use transforms instead of position changes
- Batch DOM reads/writes
- Remove event listeners on unmount

---

## Accessibility

**features**:
- Respects `prefers-reduced-motion`
- High contrast text on glass backgrounds
- Focus-visible outlines (2px accent color)
- Custom cursor hidden on touch devices
- Keyboard navigation support

**wcag_compliance**:
- Color contrast: 7:1 for normal text
- Interactive elements: 3:1 minimum size
- Focus indicators: 2px solid outline

---

## Customization

### Modify Colors

Edit `web/src/styles/tokens/colors.ts`:
```typescript
export const ColorTokens = {
  steel: {
    900: '#YOUR_COLOR', // Change background
    // ...
  },
  accent: {
    primary: '#YOUR_ACCENT', // Change accent
    // ...
  }
};
```

### Adjust Glass Opacity

Edit `web/src/styles/tokens/glassmorphism.ts`:
```typescript
primary: {
  background: 'rgba(26, 34, 45, 0.6)', // Increase opacity
  backdropBlur: 'blur(30px)', // Increase blur
  // ...
}
```

### Disable Effects

```tsx
// Disable cursor effects
<CursorEffects enableCustomCursor={false} />

// Disable scroll effects
const { scrollProgress } = useScrollEffects({
  enableReveal: false,
  enableParallax: false
});
```

---

## Migration Guide

### From Old CSS to New Design System

**step_1**: Import theme CSS
```css
/* index.css */
@import './styles/theme.css';
@import './styles/effects/scroll.css';
@import './styles/effects/cursor.css';
```

**step_2**: Replace color variables
```css
/* Before */
background: var(--bg-color);
color: var(--text-color);

/* After */
background: var(--color-background);
color: var(--color-text-primary);
```

**step_3**: Apply glass effects
```css
/* Before */
background: white;
box-shadow: 0 2px 4px rgba(0,0,0,0.1);

/* After */
background: var(--glass-bg-primary);
backdrop-filter: var(--glass-blur-primary);
box-shadow: var(--glass-shadow-primary);
```

**step_4**: Add cursor and scroll components
```tsx
// App.tsx
import { CursorEffects, ScrollProgress } from './components';

function App() {
  return (
    <>
      <CursorEffects />
      <ScrollProgress />
      {/* Rest of app */}
    </>
  );
}
```

---

## Common Patterns

### Glass Card with Hover

```css
.card {
  background: var(--glass-bg-primary);
  backdrop-filter: var(--glass-blur-primary);
  border: 1px solid var(--glass-border-primary);
  border-radius: var(--glass-radius-primary);
  box-shadow: var(--glass-shadow-primary);
  transition: var(--transition-default);
}

.card:hover {
  border-color: var(--glass-border-hover);
  box-shadow: var(--glass-glow-hover);
  transform: translateY(-4px);
}
```

### Gradient Text Heading

```css
.heading {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  background: var(--gradient-accent);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

### Animated Button

```css
.button {
  padding: var(--space-md) var(--space-xl);
  background: var(--gradient-accent);
  border: 1px solid var(--accent-primary);
  border-radius: var(--glass-radius-subtle);
  cursor: pointer;
  transition: var(--transition-default);
  box-shadow: 0 0 20px rgba(100, 181, 246, 0.3);
}

.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 30px rgba(100, 181, 246, 0.5);
}
```

---

## Troubleshooting

### Glassmorphism Not Working

**issue**: Backdrop blur not visible

**solutions**:
- Check browser support (Chrome 76+, Safari 15.4+)
- Ensure element has transparent background
- Add `-webkit-backdrop-filter` for Safari
- Verify parent has background behind glass

### Cursor Not Appearing

**issue**: Custom cursor not showing

**solutions**:
- Verify CursorEffects component is rendered
- Check `enableCustomCursor={true}` prop
- Ensure not on touch device (auto-disabled)
- Check z-index conflicts (cursor is z-index: 10000)

### Scroll Effects Not Triggering

**issue**: Elements not revealing on scroll

**solutions**:
- Add `scroll-reveal` class to elements
- Verify useScrollEffects hook is called
- Check threshold setting (default: 0.1)
- Ensure elements are below fold initially

---

## Examples

### Full Glass Card

```html
<div class="glass-primary cursor-interactive ripple">
  <h2 class="gradient-text">Glassmorphic Card</h2>
  <p>Beautiful Web3.0 inspired design</p>
</div>
```

### Parallax Section

```html
<section data-parallax="0.5" class="scroll-reveal">
  <h1>Parallax Content</h1>
</section>
```

### Interactive Button

```html
<button class="button cursor-interactive ripple magnetic">
  Click Me
</button>
```

---

## Roadmap

**planned_features**:
- 3D card tilt on mouse movement
- Animated gradient mesh background
- SVG path animations on scroll
- Noise texture overlay option
- Theme switcher (light/dark variants)

**experimental**:
- WebGL shader backgrounds
- Lottie animation integration
- Framer Motion variants
- GSAP scroll triggers

---

## Support

**documentation**: See inline comments in token files
**examples**: Check existing components for usage patterns
**testing**: Run `npm run dev` to preview changes
**issues**: Report bugs in project issue tracker

---

**Version:** 1.0.0 · **Updated:** 2025-11-17 · **Status:** Production Ready · **License:** MIT
