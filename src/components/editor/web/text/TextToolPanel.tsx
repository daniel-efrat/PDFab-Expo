import React from 'react';
import { theme } from '../../../../theme';
import { FONT_FAMILIES, FONT_SIZES, TOOL_COLORS } from '../constants';
import { normalizeHexColor } from '../utils';

export function ContextualToolMenu({
  title,
  subtitle,
  visible,
  isMobile,
  children,
}: {
  title: string;
  subtitle?: string;
  visible: boolean;
  isMobile: boolean;
  children: React.ReactNode;
}) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: isMobile ? 'auto' : 108,
        bottom: isMobile ? 92 : 'auto',
        left: isMobile ? 12 : '50%',
        right: isMobile ? 12 : 'auto',
        transform: isMobile ? 'none' : 'translateX(-50%)',
        zIndex: 120,
        minWidth: isMobile ? 'auto' : 360,
        maxWidth: isMobile ? 'none' : 420,
        padding: 16,
        borderRadius: 18,
        background: theme.colors.surface,
        boxShadow: `8px 8px 16px ${theme.neu.colors.darkShadow}, -8px -8px 16px ${theme.neu.colors.lightShadow}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 14 }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>{title}</span>
        {subtitle && (
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.4 }}>
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function TextToolControls({
  fontFamily,
  fontSize,
  color,
  onFontFamilyChange,
  onFontSizeChange,
  onColorChange,
}: {
  fontFamily: string;
  fontSize: number;
  color: string;
  onFontFamilyChange: (value: string) => void;
  onFontSizeChange: (value: number) => void;
  onColorChange: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 104px', gap: 12 }}>
        <ControlField label="Font">
          <select
            value={fontFamily}
            onChange={(event) => onFontFamilyChange(event.target.value)}
            style={controlSelectStyle}
          >
            {FONT_FAMILIES.map((family) => (
              <option key={family} value={family}>{family}</option>
            ))}
          </select>
        </ControlField>
        <ControlField label="Size">
          <select
            value={fontSize}
            onChange={(event) => onFontSizeChange(parseInt(event.target.value, 10))}
            style={controlSelectStyle}
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>{size}px</option>
            ))}
          </select>
        </ControlField>
      </div>

      <ControlField label="Color">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            {TOOL_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => onColorChange(swatch)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  border: color === swatch ? '2px solid #fff' : '2px solid rgba(255,255,255,0.18)',
                  background: swatch,
                  cursor: 'pointer',
                  boxShadow: color === swatch ? '0 0 0 2px rgba(99,102,241,0.5)' : 'none',
                }}
              />
            ))}
          </div>
          <input
            type="color"
            value={normalizeHexColor(color)}
            onChange={(event) => onColorChange(event.target.value)}
            style={{
              width: 38,
              height: 38,
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
        </div>
      </ControlField>

      <div
        style={{
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          padding: '12px 14px',
        }}
      >
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: 1.1, marginBottom: 8 }}>
          PREVIEW
        </div>
        <div style={{ color, fontFamily, fontSize, lineHeight: 1.2 }}>
          The quick brown fox
        </div>
      </div>
    </div>
  );
}

function ControlField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

const controlSelectStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  padding: '0 12px',
  outline: 'none',
};
