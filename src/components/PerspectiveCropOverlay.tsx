import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  LayoutChangeEvent,
  Image,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Polygon } from 'react-native-svg';
import { Skia, ImageFormat } from '@shopify/react-native-skia';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { theme } from '../theme';
import NeumorphicButton from './NeumorphicButton';
import { Check, SkipForward, X, RotateCcw } from 'lucide-react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

interface Props {
  imageUri: string;
  onApply: (uri: string) => void;
  onSkip: () => void;
  onDiscard: () => void;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/** Gaussian elimination with partial pivoting. Solves Ax = b in place. */
function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = A.length;
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > maxVal) {
        maxVal = Math.abs(A[row][col]);
        maxRow = row;
      }
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];
    [b[col], b[maxRow]] = [b[maxRow], b[col]];

    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      for (let c = col; c < n; c++) {
        A[row][c] -= factor * A[col][c];
      }
      b[row] -= factor * b[col];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = b[row];
    for (let col = row + 1; col < n; col++) {
      x[row] -= A[row][col] * x[col];
    }
    x[row] /= A[row][row];
  }
  return x;
}

/**
 * Compute the 3×3 homography (row-major, 9 elements) that maps
 * srcPoints[i] → dstPoints[i] using the standard DLT algorithm.
 *
 * Points are [TL, TR, BR, BL].
 * Returns [h0..h7, 1] in Skia's row-major format:
 *   [ScaleX, SkewX, TransX, SkewY, ScaleY, TransY, Persp0, Persp1, Persp2]
 */
function computeHomography(
  src: [Point, Point, Point, Point],
  dst: [Point, Point, Point, Point]
): number[] {
  const A: number[][] = [];
  const bVec: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    bVec.push(dx);

    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    bVec.push(dy);
  }

  const h = gaussianElimination(A, bVec);
  // h has 8 elements; append scale factor 1
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ---------------------------------------------------------------------------
// Perspective warp (Skia offscreen)
// ---------------------------------------------------------------------------

async function applyPerspectiveWarp(
  imageUri: string,
  /** corners in original image pixels: [TL, TR, BR, BL] */
  corners: [Point, Point, Point, Point],
  naturalW: number,
  naturalH: number
): Promise<string> {
  // Load image data
  const data = await Skia.Data.fromURI(imageUri);
  const srcImage = Skia.Image.MakeImageFromEncoded(data);
  if (!srcImage) throw new Error('Failed to decode image');

  // Compute output dimensions from corner distances (in image pixels)
  const [tl, tr, br, bl] = corners;
  const topLen = dist(tl, tr);
  const botLen = dist(bl, br);
  const leftLen = dist(tl, bl);
  const rightLen = dist(tr, br);
  let outW = Math.round(Math.max(topLen, botLen));
  let outH = Math.round(Math.max(leftLen, rightLen));

  // Cap to 2400px max
  const MAX = 2400;
  const scale = Math.min(1, MAX / Math.max(outW, outH));
  outW = Math.round(outW * scale);
  outH = Math.round(outH * scale);

  // dstPoints are the output rectangle corners (scaled)
  const dstScale = scale;
  const dstPoints: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];

  // srcPoints are scaled proportionally to dst (keep in image pixel space, then scale for H)
  const scaledSrc: [Point, Point, Point, Point] = corners.map((p) => ({
    x: p.x * dstScale,
    y: p.y * dstScale,
  })) as [Point, Point, Point, Point];

  const H = computeHomography(scaledSrc, dstPoints);

  // Offscreen surface
  const surface = Skia.Surface.Make(outW, outH);
  if (!surface) throw new Error('Failed to create Skia surface');
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color('white'));
  canvas.concat(H);

  // Draw the source image scaled by dstScale
  const imgW = srcImage.width();
  const imgH = srcImage.height();
  const paint = Skia.Paint();
  canvas.drawImageRect(
    srcImage,
    { x: 0, y: 0, width: imgW, height: imgH },
    { x: 0, y: 0, width: imgW * dstScale, height: imgH * dstScale },
    paint
  );

  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const b64 = snapshot.encodeToBase64(ImageFormat.JPEG, 92);

  const outPath = `${cacheDirectory}crop_${Date.now()}.jpg`;
  await writeAsStringAsync(outPath, b64, {
    encoding: EncodingType.Base64,
  });
  return outPath;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const HANDLE_SIZE = 28;

export default function PerspectiveCropOverlay({ imageUri, onApply, onSkip, onDiscard }: Props) {
  // Container layout (the View that shows the image)
  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);

  // Natural image size
  const [naturalW, setNaturalW] = useState(0);
  const [naturalH, setNaturalH] = useState(0);

  // Processing
  const [processing, setProcessing] = useState(false);

  // ------------------------------------------------------------------
  // Corner handles (display coordinates)
  // Initialised to 0; reset when container/image sizes are known.
  // ------------------------------------------------------------------
  const tlX = useSharedValue(0);
  const tlY = useSharedValue(0);
  const trX = useSharedValue(0);
  const trY = useSharedValue(0);
  const brX = useSharedValue(0);
  const brY = useSharedValue(0);
  const blX = useSharedValue(0);
  const blY = useSharedValue(0);

  // SVG polygon state (display coordinates) — updated via runOnJS
  const [polyPoints, setPolyPoints] = useState<[number, number, number, number, number, number, number, number]>(
    [0, 0, 0, 0, 0, 0, 0, 0]
  );

  // ------------------------------------------------------------------
  // Helpers: image rect inside container (contain scaling)
  // ------------------------------------------------------------------
  const getImageRect = useCallback(() => {
    if (!containerW || !containerH || !naturalW || !naturalH) {
      return { offsetX: 0, offsetY: 0, displayW: 0, displayH: 0, scale: 1 };
    }
    const scale = Math.min(containerW / naturalW, containerH / naturalH);
    const displayW = naturalW * scale;
    const displayH = naturalH * scale;
    const offsetX = (containerW - displayW) / 2;
    const offsetY = (containerH - displayH) / 2;
    return { offsetX, offsetY, displayW, displayH, scale };
  }, [containerW, containerH, naturalW, naturalH]);

  // Reset corners to image edges
  const resetCorners = useCallback(() => {
    const { offsetX, offsetY, displayW, displayH } = getImageRect();
    tlX.value = offsetX;
    tlY.value = offsetY;
    trX.value = offsetX + displayW;
    trY.value = offsetY;
    brX.value = offsetX + displayW;
    brY.value = offsetY + displayH;
    blX.value = offsetX;
    blY.value = offsetY + displayH;
    setPolyPoints([
      offsetX, offsetY,
      offsetX + displayW, offsetY,
      offsetX + displayW, offsetY + displayH,
      offsetX, offsetY + displayH,
    ]);
  }, [getImageRect, tlX, tlY, trX, trY, brX, brY, blX, blY]);

  const onContainerLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setContainerW(width);
      setContainerH(height);
    },
    []
  );

  // Called once natural image size is known
  const onImageLoad = useCallback(
    (e: any) => {
      const w = e.nativeEvent?.source?.width ?? e.nativeEvent?.width ?? 0;
      const h = e.nativeEvent?.source?.height ?? e.nativeEvent?.height ?? 0;
      if (w && h) {
        setNaturalW(w);
        setNaturalH(h);
      }
    },
    []
  );

  // Reset once we have both sizes
  const didInit = React.useRef(false);
  React.useEffect(() => {
    if (containerW && containerH && naturalW && naturalH && !didInit.current) {
      didInit.current = true;
      resetCorners();
    }
  }, [containerW, containerH, naturalW, naturalH, resetCorners]);

  // ------------------------------------------------------------------
  // Update poly from current shared values
  // ------------------------------------------------------------------
  const updatePoly = useCallback(
    (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
      setPolyPoints([ax, ay, bx, by, cx, cy, dx, dy]);
    },
    []
  );

  // ------------------------------------------------------------------
  // Per-corner pan gestures
  // ------------------------------------------------------------------
  const makeCornerGesture = (
    cx: ReturnType<typeof useSharedValue<number>>,
    cy: ReturnType<typeof useSharedValue<number>>
  ) => {
    const startX = useSharedValue(0);
    const startY = useSharedValue(0);
    return Gesture.Pan()
      .onBegin(() => {
        startX.value = cx.value;
        startY.value = cy.value;
      })
      .onUpdate((e) => {
        const cW = containerW;
        const cH = containerH;
        cx.value = Math.max(0, Math.min(cW, startX.value + e.translationX));
        cy.value = Math.max(0, Math.min(cH, startY.value + e.translationY));
        runOnJS(updatePoly)(
          tlX.value, tlY.value,
          trX.value, trY.value,
          brX.value, brY.value,
          blX.value, blY.value
        );
      });
  };

  // NOTE: hooks must be called unconditionally at top level
  const startTlX = useSharedValue(0);
  const startTlY = useSharedValue(0);
  const startTrX = useSharedValue(0);
  const startTrY = useSharedValue(0);
  const startBrX = useSharedValue(0);
  const startBrY = useSharedValue(0);
  const startBlX = useSharedValue(0);
  const startBlY = useSharedValue(0);

  const tlGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => { startTlX.value = tlX.value; startTlY.value = tlY.value; })
        .onUpdate((e) => {
          tlX.value = Math.max(0, Math.min(containerW, startTlX.value + e.translationX));
          tlY.value = Math.max(0, Math.min(containerH, startTlY.value + e.translationY));
          runOnJS(updatePoly)(tlX.value, tlY.value, trX.value, trY.value, brX.value, brY.value, blX.value, blY.value);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [containerW, containerH]
  );

  const trGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => { startTrX.value = trX.value; startTrY.value = trY.value; })
        .onUpdate((e) => {
          trX.value = Math.max(0, Math.min(containerW, startTrX.value + e.translationX));
          trY.value = Math.max(0, Math.min(containerH, startTrY.value + e.translationY));
          runOnJS(updatePoly)(tlX.value, tlY.value, trX.value, trY.value, brX.value, brY.value, blX.value, blY.value);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [containerW, containerH]
  );

  const brGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => { startBrX.value = brX.value; startBrY.value = brY.value; })
        .onUpdate((e) => {
          brX.value = Math.max(0, Math.min(containerW, startBrX.value + e.translationX));
          brY.value = Math.max(0, Math.min(containerH, startBrY.value + e.translationY));
          runOnJS(updatePoly)(tlX.value, tlY.value, trX.value, trY.value, brX.value, brY.value, blX.value, blY.value);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [containerW, containerH]
  );

  const blGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => { startBlX.value = blX.value; startBlY.value = blY.value; })
        .onUpdate((e) => {
          blX.value = Math.max(0, Math.min(containerW, startBlX.value + e.translationX));
          blY.value = Math.max(0, Math.min(containerH, startBlY.value + e.translationY));
          runOnJS(updatePoly)(tlX.value, tlY.value, trX.value, trY.value, brX.value, brY.value, blX.value, blY.value);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [containerW, containerH]
  );

  // Animated styles for each handle — use left/top positioning (avoids TS union type issue with separate transform entries)
  const tlStyle = useAnimatedStyle(() => ({
    left: tlX.value - HANDLE_SIZE / 2,
    top: tlY.value - HANDLE_SIZE / 2,
  }));
  const trStyle = useAnimatedStyle(() => ({
    left: trX.value - HANDLE_SIZE / 2,
    top: trY.value - HANDLE_SIZE / 2,
  }));
  const brStyle = useAnimatedStyle(() => ({
    left: brX.value - HANDLE_SIZE / 2,
    top: brY.value - HANDLE_SIZE / 2,
  }));
  const blStyle = useAnimatedStyle(() => ({
    left: blX.value - HANDLE_SIZE / 2,
    top: blY.value - HANDLE_SIZE / 2,
  }));

  // ------------------------------------------------------------------
  // Apply
  // ------------------------------------------------------------------
  const handleApply = useCallback(async () => {
    if (!naturalW || !naturalH || processing) return;
    setProcessing(true);
    try {
      const { offsetX, offsetY, scale } = getImageRect();
      // Convert display corners → image pixel coordinates
      const toPixel = (px: number, py: number): Point => ({
        x: (px - offsetX) / scale,
        y: (py - offsetY) / scale,
      });
      const corners: [Point, Point, Point, Point] = [
        toPixel(tlX.value, tlY.value),
        toPixel(trX.value, trY.value),
        toPixel(brX.value, brY.value),
        toPixel(blX.value, blY.value),
      ];
      const outUri = await applyPerspectiveWarp(imageUri, corners, naturalW, naturalH);
      onApply(outUri);
    } catch (err) {
      console.error('Perspective warp failed:', err);
      // Fall back to original
      onSkip();
    } finally {
      setProcessing(false);
    }
  }, [naturalW, naturalH, processing, getImageRect, tlX, tlY, trX, trY, brX, brY, blX, blY, imageUri, onApply, onSkip]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const polygonPoints = `${polyPoints[0]},${polyPoints[1]} ${polyPoints[2]},${polyPoints[3]} ${polyPoints[4]},${polyPoints[5]} ${polyPoints[6]},${polyPoints[7]}`;

  return (
    <View style={styles.root}>
      {/* Header hint */}
      <View style={styles.hintRow}>
        <Text style={styles.hintText}>Drag corners to align with document edges</Text>
      </View>

      {/* Image + overlay */}
      <View style={styles.imageContainer} onLayout={onContainerLayout}>
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="contain"
          onLoad={onImageLoad}
        />

        {/* SVG quadrilateral overlay */}
        {containerW > 0 && containerH > 0 && (
          <Svg
            style={StyleSheet.absoluteFill}
            width={containerW}
            height={containerH}
            pointerEvents="none"
          >
            <Polygon
              points={polygonPoints}
              fill="rgba(244,123,32,0.12)"
              stroke={theme.colors.accentStrong}
              strokeWidth={2}
            />
          </Svg>
        )}

        {/* Corner handles */}
        <GestureDetector gesture={tlGesture}>
          <Animated.View style={[styles.handle, tlStyle]} />
        </GestureDetector>
        <GestureDetector gesture={trGesture}>
          <Animated.View style={[styles.handle, trStyle]} />
        </GestureDetector>
        <GestureDetector gesture={brGesture}>
          <Animated.View style={[styles.handle, brStyle]} />
        </GestureDetector>
        <GestureDetector gesture={blGesture}>
          <Animated.View style={[styles.handle, blStyle]} />
        </GestureDetector>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        {/* Discard */}
        <NeumorphicButton layerStyle={styles.actionBtn} onPress={onDiscard} disabled={processing}>
          <X size={18} color="rgba(255,255,255,0.4)" />
          <Text style={styles.discardText}>DISCARD</Text>
        </NeumorphicButton>

        <View style={styles.primaryActions}>
          {/* Reset */}
          <NeumorphicButton layerStyle={styles.actionBtn} onPress={resetCorners} disabled={processing}>
            <RotateCcw size={16} color={theme.colors.textMuted} />
            <Text style={styles.secondaryText}>RESET</Text>
          </NeumorphicButton>

          {/* Skip */}
          <NeumorphicButton layerStyle={styles.actionBtn} onPress={onSkip} disabled={processing}>
            <SkipForward size={16} color={theme.colors.textMuted} />
            <Text style={styles.secondaryText}>SKIP</Text>
          </NeumorphicButton>

          {/* Apply */}
          <NeumorphicButton
            layerStyle={[styles.actionBtn, styles.applyBtn]}
            onPress={handleApply}
            disabled={processing}
          >
            {processing
              ? <ActivityIndicator color={theme.colors.white} size="small" />
              : <Check size={18} color={theme.colors.white} />}
            <Text style={styles.applyText}>APPLY</Text>
          </NeumorphicButton>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  hintRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  hintText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  imageContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  image: {
    flex: 1,
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: theme.colors.accentStrong,
    borderWidth: 2,
    borderColor: theme.colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 10,
  },
  primaryActions: {
    flex: 3,
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 0,
  },
  applyBtn: {
    backgroundColor: theme.colors.accentStrong,
    flexDirection: 'row',
    gap: 6,
  },
  discardText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  secondaryText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  applyText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
