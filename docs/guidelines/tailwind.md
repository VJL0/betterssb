# Tailwind CSS Best Practices

## Project Setup

- Tailwind v4 is configured in CSS, not a `tailwind.config.*` file
- Define theme tokens with `@theme` in the shared stylesheet, not per app
- Register content paths with `@source` instead of a purge/content config
- Load plugins with `@plugin` in CSS

## Component Styling

- Use utility classes over custom CSS
- Group related utilities with @apply when needed
- Use proper responsive design utilities
- Implement dark mode properly
- Use proper state variants
- Keep component styles consistent

## Layout

- Use Flexbox and Grid utilities effectively
- Implement proper spacing system
- Use container queries when needed
- Implement proper responsive breakpoints
- Use proper padding and margin utilities
- Implement proper alignment utilities

## Typography

- Use proper font size utilities
- Implement proper line height
- Use proper font weight utilities
- Configure custom fonts properly
- Use proper text alignment
- Implement proper text decoration

## Colors

- Use semantic color naming
- Implement proper color contrast
- Use opacity utilities effectively
- Configure custom colors properly
- Use proper gradient utilities
- Implement proper hover states

## Components

- Use shadcn/ui components when available; add shared ones to the UI package
- Compose variants with `cva` and merge classes with `cn`
- Keep component variants consistent
- Implement proper animations
- Use proper transition utilities
- Keep accessibility in mind

## Responsive Design

- Use mobile-first approach
- Implement proper breakpoints
- Use container queries effectively
- Handle different screen sizes properly
- Implement proper responsive typography
- Use proper responsive spacing

## Performance

- Minimize custom CSS
- Use proper caching strategies
- Implement proper code splitting
- Optimize for production
- Monitor bundle size

## Best Practices

- Follow naming conventions
- Keep styles organized
- Use proper documentation
- Implement proper testing
- Follow accessibility guidelines
- Use proper version control
