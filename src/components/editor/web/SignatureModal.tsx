import React, { useEffect, useRef } from 'react';
import { theme } from '../../../theme';

export function SignatureModal({ onConfirm, onCancel }: { onConfirm: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const getPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const down = (e: MouseEvent) => {
      isDrawingRef.current = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e: MouseEvent) => {
      if (!isDrawingRef.current) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const up = () => { isDrawingRef.current = false; };

    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', up);
    canvas.addEventListener('mouseleave', up);

    return () => {
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseup', up);
      canvas.removeEventListener('mouseleave', up);
    };
  }, []);

  const handleClear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleConfirm = () => {
    if (!canvasRef.current) return;
    onConfirm(canvasRef.current.toDataURL('image/png'));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(9,12,20,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{
        background: theme.colors.surface,
        borderRadius: 24,
        padding: 28,
        boxShadow: `12px 12px 24px ${theme.neu.colors.darkShadow}, -12px -12px 24px ${theme.neu.colors.lightShadow}`,
        width: 500,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ color: theme.colors.text, fontSize: 18, fontWeight: 'bold' }}>Draw Your Signature</span>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.textSoft, fontSize: 22 }}>✕</button>
        </div>
        <div style={{
          boxShadow: theme.neu.shadowStyles.lightLayerInset.boxShadow,
          borderRadius: 16,
          padding: 4,
          background: 'rgba(0,0,0,0.2)',
          marginBottom: 20,
        }}>
          <canvas
            ref={canvasRef}
            width={444}
            height={180}
            style={{
              borderRadius: 12,
              cursor: 'crosshair',
              display: 'block',
              width: '100%',
              background: '#fff',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
          <button onClick={handleClear} style={{
            background: theme.colors.surfaceSoft,
            border: 'none',
            borderRadius: 12, padding: '10px 24px',
            color: theme.colors.text, cursor: 'pointer', fontSize: 14,
            fontWeight: '600',
            boxShadow: `4px 4px 8px ${theme.neu.colors.darkShadow}, -4px -4px 8px ${theme.neu.colors.lightShadow}`,
          }}>Clear</button>
          <button onClick={handleConfirm} style={{
            background: theme.colors.accentStrong,
            border: 'none', borderRadius: 12, padding: '10px 28px',
            color: '#000', cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
            boxShadow: `4px 4px 10px ${theme.neu.colors.darkShadow}`,
          }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

