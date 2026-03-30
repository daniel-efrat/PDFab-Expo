import React, { useEffect, useMemo, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { MAX_HIGHLIGHT_WIDTH, MIN_HIGHLIGHT_WIDTH } from '../constants';
import { styles } from '../styles';

export function StrokeWidthSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [previewValue, setPreviewValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      setPreviewValue(value);
    }
  }, [isDragging, value]);

  const getValueForLocation = (locationX: number) => {
    if (trackWidth <= 0) return previewValue;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
    const nextValue = MIN_HIGHLIGHT_WIDTH + ratio * (MAX_HIGHLIGHT_WIDTH - MIN_HIGHLIGHT_WIDTH);
    return Math.round(nextValue);
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((event) => {
          setIsDragging(true);
          setPreviewValue(getValueForLocation(event.x));
        })
        .onUpdate((event) => {
          setPreviewValue(getValueForLocation(event.x));
        })
        .onEnd((event) => {
          const nextValue = getValueForLocation(event.x);
          setPreviewValue(nextValue);
          onChange(nextValue);
          setIsDragging(false);
        })
        .onFinalize(() => {
          setIsDragging(false);
        }),
    [onChange, previewValue, trackWidth]
  );

  const fillRatio = (previewValue - MIN_HIGHLIGHT_WIDTH) / (MAX_HIGHLIGHT_WIDTH - MIN_HIGHLIGHT_WIDTH);
  const clampedFillRatio = Math.max(0, Math.min(1, fillRatio));

  return (
    <View style={styles.sliderBlock}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderLabel}>Stroke Width</Text>
        <Text style={styles.sliderValue}>{Math.round(previewValue)}</Text>
      </View>
      <GestureDetector gesture={panGesture}>
        <View
          style={styles.sliderTrack}
          onLayout={(event: LayoutChangeEvent) => {
            setTrackWidth(event.nativeEvent.layout.width);
          }}
        >
          <View style={[styles.sliderFill, { width: `${clampedFillRatio * 100}%` }]} />
          <View style={[styles.sliderThumb, { left: `${clampedFillRatio * 100}%` }]} />
        </View>
      </GestureDetector>
    </View>
  );
}
