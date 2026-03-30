import React, { useEffect, useMemo, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { MAX_ZOOM, MIN_ZOOM } from '../constants';
import { styles } from '../styles';

export function ZoomSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
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
    return Number((MIN_ZOOM + ratio * (MAX_ZOOM - MIN_ZOOM)).toFixed(2));
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((event) => {
          setIsDragging(true);
          const nextValue = getValueForLocation(event.x);
          setPreviewValue(nextValue);
          onChange(nextValue);
        })
        .onUpdate((event) => {
          const nextValue = getValueForLocation(event.x);
          setPreviewValue(nextValue);
          onChange(nextValue);
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

  const fillRatio = (previewValue - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
  const clampedFillRatio = Math.max(0, Math.min(1, fillRatio));

  return (
    <View style={styles.zoomSliderWrap}>
      <GestureDetector gesture={panGesture}>
        <View
          style={styles.zoomTrack}
          onLayout={(event: LayoutChangeEvent) => {
            setTrackWidth(event.nativeEvent.layout.width);
          }}
        >
          <View style={[styles.zoomFill, { width: `${clampedFillRatio * 100}%` }]} />
          <View style={[styles.sliderThumb, { left: `${clampedFillRatio * 100}%` }]} />
        </View>
      </GestureDetector>
      <Text style={styles.zoomLabel}>{Math.round(previewValue * 100)}%</Text>
    </View>
  );
}
