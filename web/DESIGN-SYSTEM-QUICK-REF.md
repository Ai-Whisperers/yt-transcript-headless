# Design System Quick Reference
**Web3.0 Glassmorphism Theme** · Steel Gradients · Dark Palette

---

## 🎨 Color Tokens (CSS Variables)

```css
/* Steel Gradients */
var(--steel-900)  /* Darkest: #0a0e14 */
var(--steel-800)  /* Dark: #121820 */
var(--steel-700)  /* Medium-dark: #1a222d */
var(--steel-500)  /* Medium: #2d3a4d */
var(--steel-300)  /* Light: #556b85 */
var(--steel-100)  /* Lightest: #a0b3cc */

/* Accent Colors */
var(--accent-primary)      /* Blue: #64b5f6 */
var(--accent-secondary)    /* Green: #81c784 */
var(--accent-error)        /* Red: #ef5350 */
var(--accent-success)      /* Green: #66bb6a */

/* Semantic */
var(--color-background)        /* Page background */
var(--color-surface)           /* Card surface */
var(--color-text-primary)      /* Main text */
var(--color-text-secondary)    /* Secondary text */
```

---

## 🪟 Glassmorphism Classes

```html
<!-- Primary Glass Card (40% opacity, 20px blur) -->
<div class="glass-primary">Content</div>

<!-- Elevated Glass (50% opacity, 24px blur) -->
<div class="glass-elevated">Content</div>

<!-- Subtle Glass (30% opacity, 16px blur) -->
<div class="glass-subtle">Content</div>
```

**CSS Variables:**
```css
background: var(--glass-bg-primary);
backdrop-filter: var(--glass-blur-primary);
border: 1px solid var(--glass-border-primary);
border-radius: var(--glass-radius-primary);
box-shadow: var(--glass-shadow-primary);
```

---

## 📐 Spacing Scale

```css
var(--space-xs)   /* 4px */
var(--space-sm)   /* 8px */
var(--space-md)   /* 16px - base */
var(--space-lg)   /* 24px */
var(--space-xl)   /* 32px */
var(--space-2xl)  /* 48px */
var(--space-3xl)  /* 64px */
```

---

## 🔤 Typography

```css
/* Font Families */
var(--font-primary)  /* Inter, system */
var(--font-mono)     /* JetBrains Mono */
var(--font-display)  /* Space Grotesk */

/* Font Sizes */
var(--font-size-xs)    /* 12px */
var(--font-size-sm)    /* 14px */
var(--font-size-base)  /* 16px */
var(--font-size-lg)    /* 18px */
var(--font-size-xl)    /* 20px */
var(--font-size-2xl)   /* 24px */
var(--font-size-4xl)   /* 36px */

/* Font Weights */
var(--font-weight-normal)    /* 400 */
var(--font-weight-medium)    /* 500 */
var(--font-weight-semibold)  /* 600 */
var(--font-weight-bold)      /* 700 */
```

---

## 🎞️ Animations

```css
/* Durations */
var(--duration-fast)    /* 200ms */
var(--duration-normal)  /* 300ms */
var(--duration-slow)    /* 400ms */

/* Transitions */
var(--transition-default)   /* All properties */
var(--transition-transform) /* Transform only */
var(--transition-opacity)   /* Opacity only */

/* Easing */
var(--ease-in-out)  /* Smooth */
var(--ease-spring)  /* Bouncy */
```

**Keyframe Animations:**
```css
animation: fadeIn 300ms ease;
animation: slideUp 300ms ease;
animation: shimmer 2s ease infinite;
animation: float 3s ease infinite;
animation: glow 2s ease infinite;
```

---

## 📜 Scroll Effects

```html
<!-- Reveal on Scroll -->
<div class="scroll-reveal">Slides up</div>
<div class="scroll-reveal-left">From left</div>
<div class="scroll-reveal-right">From right</div>
<div class="scroll-reveal-scale">Scales in</div>

<!-- Parallax -->
<div data-parallax="0.5">Slow scroll</div>
<div data-parallax="1.5">Fast scroll</div>
```

**React Hook:**
```tsx
import { useScrollEffects } from './hooks/useScrollEffects';

const { scrollProgress, isScrolled } = useScrollEffects({
  enableReveal: true,
  enableParallax: true,
  enableProgressBar: true
});
```

---

## 🖱️ Cursor Effects

```html
<!-- Interactive Element (hover state) -->
<button class="cursor-interactive">Hover me</button>

<!-- Ripple Effect on Click -->
<button class="ripple">Click me</button>

<!-- Magnetic Attraction -->
<a href="#" class="magnetic">Pull me</a>

<!-- Combined -->
<button class="cursor-interactive ripple magnetic">
  Click me
</button>
```

**React Component:**
```tsx
import { CursorEffects } from './components';

<CursorEffects
  enableCustomCursor={true}
  enableGlow={true}
  enableParticles={false}
/>
```

---

## 🎨 Gradient Text

```css
.gradient-text {
  background: var(--gradient-accent);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

```html
<h1 class="gradient-text">Gradient Heading</h1>
```

---

## 🃏 Common Patterns

### Glass Card with Hover
```css
.card {
  background: var(--glass-bg-primary);
  backdrop-filter: var(--glass-blur-primary);
  border: 1px solid var(--glass-border-primary);
  border-radius: var(--glass-radius-primary);
  transition: var(--transition-default);
}

.card:hover {
  border-color: var(--glass-border-hover);
  box-shadow: var(--glass-glow-hover);
  transform: translateY(-4px);
}
```

### Interactive Button
```html
<button class="button cursor-interactive ripple">
  Click Me
</button>
```

```css
.button {
  padding: var(--space-md) var(--space-xl);
  background: var(--gradient-accent);
  border: 1px solid var(--accent-primary);
  border-radius: var(--glass-radius-subtle);
  transition: var(--transition-default);
}

.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 30px rgba(100, 181, 246, 0.5);
}
```

### Input Field
```css
.input {
  padding: var(--space-md);
  background: var(--glass-bg-subtle);
  backdrop-filter: var(--glass-blur-subtle);
  border: 1px solid var(--glass-border-subtle);
  color: var(--color-text-primary);
  transition: var(--transition-default);
}

.input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(100, 181, 246, 0.15);
}
```

---

## 📱 Responsive

```css
@media (max-width: 768px) {
  /* Reduce blur on mobile for performance */
  .glass-primary {
    backdrop-filter: blur(12px);
  }
}
```

---

## ♿ Accessibility

```css
/* Disable animations for users who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* Focus states */
button:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
```

---

## 🚀 Quick Start

1. **Import styles** in `main.tsx`:
```tsx
import './styles/theme.css';
import './styles/effects/scroll.css';
import './styles/effects/cursor.css';
import './index.css';
```

2. **Add cursor effects** to `App.tsx`:
```tsx
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

3. **Use glass classes** on components:
```html
<div class="glass-primary">Content</div>
```

4. **Add interactive classes** to buttons:
```html
<button class="button cursor-interactive ripple">Click</button>
```

---

## 📦 File Structure

```
web/src/
├── styles/
│   ├── tokens/          # TypeScript design tokens
│   │   ├── colors.ts
│   │   ├── glassmorphism.ts
│   │   ├── spacing.ts
│   │   ├── typography.ts
│   │   └── animations.ts
│   ├── effects/         # Effect systems
│   │   ├── scroll.css
│   │   └── cursor.css
│   ├── theme.css        # CSS variables
│   └── README.md        # Full documentation
├── hooks/
│   ├── useScrollEffects.ts
│   └── useCursorEffects.ts
└── components/
    ├── CursorEffects.tsx
    └── ScrollProgress.tsx
```

---

## 🎯 Pro Tips

- Always add `cursor-interactive ripple` to buttons
- Use `scroll-reveal` for animated entrances
- Apply `glass-primary` to main content cards
- Use `gradient-text` for important headings
- Add `data-parallax` for depth effects
- Combine `magnetic` with interactive elements
- Test on mobile (custom cursor auto-disabled)
- Check `prefers-reduced-motion` support

---

**For full documentation, see:** `web/src/styles/README.md`
