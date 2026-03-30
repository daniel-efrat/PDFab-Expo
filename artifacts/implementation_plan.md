# Make App Neumorphic and Animate Interactions

This plan outlines the steps to change the app's design language to a neumorphic style and add animations to interactions.

## User Review Required
> [!IMPORTANT]
> Neumorphism relies heavily on shadows to create depth. It works best on very specific background colors. I will update `theme.ts` to reflect a standard neumorphic palette (usually an off-white or soft gray for light mode, or a specific dark gray for dark mode). Let me know if you prefer a light or dark neumorphic theme!
>
> I am assuming a unified neumorphic style across the entire app. This will involve changing the fundamental styling of many components (`View`, `TouchableOpacity`, `TextInput`, etc.).

## Proposed Changes

### 1. Update Theme (`src/theme.ts`)
#### [MODIFY] `theme.ts`
- Change colors to create a cohesive neumorphic palette.
- Add standard shadow definitions (light shadow top-left, dark shadow bottom-right) to be reused across components.

### 2. Create Reusable Neumorphic Components
#### [NEW] `src/components/NeumorphicView.tsx`
- A generic wrapper component that applies the neumorphic inset/outset shadows based on a `pressed` state or `variant` prop.
#### [NEW] `src/components/NeumorphicButton.tsx`
- A button component integrating `framer-motion` (for web) or `moti`/`react-native-reanimated` (for native) to animate the scale and shadow transitions on press, creating the "pushing into the screen" effect.

### 3. Replace Existing Components
#### [MODIFY] `src/components/Auth.tsx`
#### [MODIFY] `src/components/Dashboard.tsx`
#### [MODIFY] `src/components/Scanner.tsx` / `Scanner.web.tsx`
#### [MODIFY] `src/components/Transcription.tsx`
#### [MODIFY] `src/components/Layout.tsx`
#### [MODIFY] `src/components/Editor.web.tsx` / `EditorNative.tsx`
- Replace standard `View` containers with `NeumorphicView` where appropriate (e.g., cards, panels).
- Replace `TouchableOpacity` with `NeumorphicButton` for all interactive elements to get consistent styling and animations.
- Replace `TextInput` styles to use inset neumorphic styling.

## Open Questions

1. **Light vs. Dark Theme:** Neumorphism effect depends heavily on base color. Do you have a preference for a light (e.g., off-white, light gray) or dark (e.g., dark gray, slate) base theme?
2. **Animation Library:** We have `framer-motion` (web-only hook) installed, but to support both web and native, we might need a unified approach or handle animations conditionally based on platform (e.g. using `moti` or standard `Animated` from React Native). I will use `moti` as it supports both out of the box with `react-native-reanimated`. Is this acceptable?

## Verification Plan

### Manual Verification
- Start the Expo app (`npx expo start -c`).
- Open in a web browser (`w`).
- Verify the overall aesthetic is neumorphic (elements look like they extrude from or intrude into the background).
- Click various buttons and verify they animate correctly (pressing down changes shadows and slightly scales the element).
- Verify no functionality is broken by the UI updates.
