import React, { useEffect, useRef, useState } from 'react';
import { Circle, Group, Image as KonvaImage, Label, Layer, Line, Rect, Stage, Tag, Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import { nextId } from './utils';

export function AnnotationOverlay({
  pageIndex, pageWidth, pageHeight, activeTool, annotations,
  addAnnotation, updateAnnotation, removeAnnotation, selectedAnnotationId, setSelectedAnnotation,
  setActiveTool,
  penColor, penWidth, fontSize, fontFamily, user, onSignatureRequest,
}: any) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);

  // Text input state
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string; annotationId?: string } | null>(null);

  // Comment input state
  const [commentInput, setCommentInput] = useState<{ x: number; y: number; value: string } | null>(null);

  useEffect(() => {
    if (textInput) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [textInput]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedAnnotationId || textInput || commentInput) return;
      if (event.key === 'Backspace' || event.key === 'Delete') {
        removeAnnotation(selectedAnnotationId);
        setSelectedAnnotation(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commentInput, removeAnnotation, selectedAnnotationId, setSelectedAnnotation, textInput]);

  const getStagePosition = () => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return null;
    return {
      x: Math.max(0, Math.min(100, (pointer.x / pageWidth) * 100)),
      y: Math.max(0, Math.min(100, (pointer.y / pageHeight) * 100)),
    };
  };

  const handleStagePointerDown = (event: any) => {
    if (event.target !== event.target.getStage()) {
      return;
    }

    const pos = getStagePosition();
    if (!pos) return;

    if (activeTool === 'TEXT') {
      setTextInput({ x: pos.x, y: pos.y, value: '' });
      setSelectedAnnotation(null);
    } else if (activeTool === 'DRAW') {
      setIsDrawing(true);
      setDrawPoints([pos]);
    } else if (activeTool === 'SIGNATURE') {
      onSignatureRequest(pos.x, pos.y);
    } else if (activeTool === 'COMMENT') {
      setCommentInput({ x: pos.x, y: pos.y, value: '' });
      setSelectedAnnotation(null);
    } else if (activeTool === 'SELECT') {
      setSelectedAnnotation(null);
    }
  };

  const handleStagePointerMove = () => {
    if (!isDrawing) return;
    const pos = getStagePosition();
    if (!pos) return;
    setDrawPoints(prev => [...prev, pos]);
  };

  const handleStagePointerUp = () => {
    if (isDrawing && drawPoints.length > 1) {
      addAnnotation({
        id: nextId(),
        type: 'DRAW',
        pageIndex,
        data: { points: drawPoints, color: penColor, strokeWidth: penWidth },
      });
      setDrawPoints([]);
      setIsDrawing(false);
    }
  };

  const commitText = () => {
    if (textInput && textInput.value.trim()) {
      if (textInput.annotationId) {
        const existingAnnotation = annotations.find((annotation: any) => annotation.id === textInput.annotationId);
        updateAnnotation(textInput.annotationId, {
          data: {
            ...existingAnnotation?.data,
            text: textInput.value,
            x: textInput.x,
            y: textInput.y,
          },
        });
        setSelectedAnnotation(textInput.annotationId);
      } else {
        const annotationId = nextId();
        addAnnotation({
          id: annotationId,
          type: 'TEXT',
          pageIndex,
          data: { x: textInput.x, y: textInput.y, text: textInput.value, fontSize, color: penColor, fontFamily },
        });
        setSelectedAnnotation(annotationId);
      }
      setActiveTool('SELECT');
    }
    setTextInput(null);
  };

  const commitComment = () => {
    if (commentInput && commentInput.value.trim()) {
      addAnnotation({
        id: nextId(),
        type: 'COMMENT',
        pageIndex,
        data: {
          x: commentInput.x, y: commentInput.y,
          text: commentInput.value,
          author: user?.displayName || user?.email || 'You',
        },
      });
    }
    setCommentInput(null);
  };

  const drawingPoints = drawPoints.flatMap((point) => [
    (point.x / 100) * pageWidth,
    (point.y / 100) * pageHeight,
  ]);

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        cursor: activeTool === 'SELECT' ? 'default'
          : activeTool === 'DRAW' ? 'crosshair'
          : activeTool === 'TEXT' ? 'text'
          : 'pointer',
        zIndex: 10,
      }}
    >
      <Stage
        ref={(node) => {
          stageRef.current = node;
        }}
        width={pageWidth}
        height={pageHeight}
        onMouseDown={handleStagePointerDown}
        onMousemove={handleStagePointerMove}
        onMouseup={handleStagePointerUp}
        onMouseleave={handleStagePointerUp}
        onTouchStart={handleStagePointerDown}
        onTouchMove={handleStagePointerMove}
        onTouchEnd={handleStagePointerUp}
        style={{ width: pageWidth, height: pageHeight }}
      >
        <Layer>
          {annotations.map((annotation: any) => (
            <RenderedAnnotation
              key={annotation.id}
              annotation={annotation}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              isSelected={selectedAnnotationId === annotation.id}
              onSelect={() => {
                if (activeTool === 'SELECT') {
                  setSelectedAnnotation(annotation.id);
                }
              }}
              onDelete={() => {
                removeAnnotation(annotation.id);
                setSelectedAnnotation(null);
              }}
              onMove={(position: { x: number; y: number }) => {
                updateAnnotation(annotation.id, {
                  data: {
                    ...annotation.data,
                    x: position.x,
                    y: position.y,
                  },
                });
              }}
              onEditText={() => {
                if (annotation.type !== 'TEXT') return;
                setTextInput({
                  x: annotation.data.x,
                  y: annotation.data.y,
                  value: annotation.data.text || '',
                  annotationId: annotation.id,
                });
                setSelectedAnnotation(annotation.id);
              }}
            />
          ))}
          {isDrawing && drawingPoints.length > 2 && (
            <Line
              points={drawingPoints}
              stroke={penColor}
              strokeWidth={penWidth}
              lineCap="round"
              lineJoin="round"
              tension={0.15}
            />
          )}
        </Layer>
      </Stage>

      {/* Inline text input */}
      {textInput && (
        <div style={{
          position: 'absolute',
          left: `${(textInput.x / 100) * pageWidth}px`, top: `${(textInput.y / 100) * pageHeight}px`,
          transform: 'translate(-4px, -4px)',
        }}>
          <input
            ref={inputRef}
            value={textInput.value}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onBlur={commitText}
            onKeyDown={(e) => { if (e.key === 'Enter') commitText(); }}
            placeholder="Type here..."
            style={{
              background: 'rgba(255,255,200,0.9)',
              border: '2px solid #f59e0b',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: fontSize,
              color: penColor,
              outline: 'none',
              minWidth: 120,
              fontFamily,
            }}
          />
        </div>
      )}

      {/* Inline comment input */}
      {commentInput && (
        <div style={{
          position: 'absolute',
          left: `${(commentInput.x / 100) * pageWidth}px`, top: `${(commentInput.y / 100) * pageHeight}px`,
          transform: 'translate(-12px, -12px)',
          zIndex: 20,
        }}>
          <div style={{
            background: '#1a1a2e',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 12,
            padding: 12,
            width: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginBottom: 8, fontWeight: 'bold', letterSpacing: 1 }}>
              ADD COMMENT
            </div>
            <textarea
              autoFocus
              value={commentInput.value}
              onChange={(e) => setCommentInput({ ...commentInput, value: e.target.value })}
              placeholder="Write a comment..."
              rows={3}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: 8,
                color: '#fff',
                fontSize: 13,
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCommentInput(null)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none', borderRadius: 6, padding: '4px 12px',
                  color: '#fff', cursor: 'pointer', fontSize: 12,
                }}
              >Cancel</button>
              <button
                onClick={commitComment}
                style={{
                  background: '#6366f1',
                  border: 'none', borderRadius: 6, padding: '4px 12px',
                  color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
                }}
              >Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RenderedAnnotation({
  annotation,
  pageWidth,
  pageHeight,
  isSelected,
  onSelect,
  onDelete,
  onMove,
  onEditText,
}: any) {
  const { data, type } = annotation;
  const commonDragProps = activeDragProps(type, data, pageWidth, pageHeight, onMove);

  if (type === 'TEXT') {
    const x = (data.x / 100) * pageWidth;
    const y = (data.y / 100) * pageHeight;
    return (
      <Group
        x={x}
        y={y}
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onTap={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onDblClick={(event) => {
          event.cancelBubble = true;
          onEditText();
        }}
        {...commonDragProps}
      >
        {isSelected && (
          <Rect
            x={-4}
            y={-4}
            width={Math.max(40, ((data.text || '').length || 1) * ((data.fontSize || 16) * 0.6)) + 8}
            height={(data.fontSize || 16) + 10}
            fill="rgba(99,102,241,0.12)"
            stroke="#6366f1"
            strokeWidth={1}
            cornerRadius={4}
          />
        )}
        <KonvaText
          text={data.text || ''}
          fontFamily={data.fontFamily || 'Inter'}
          fontSize={data.fontSize || 16}
          fill={data.color || '#000'}
          fontStyle="500"
        />
        {isSelected && <DeleteControl x={Math.max(48, ((data.text || '').length || 1) * ((data.fontSize || 16) * 0.6)) + 8} y={-12} onDelete={onDelete} />}
      </Group>
    );
  }

  if (type === 'DRAW') {
    const points = (data.points || []).flatMap((point: any) => [
      (point.x / 100) * pageWidth,
      (point.y / 100) * pageHeight,
    ]);
    if (points.length < 4) return null;
    return (
      <Group
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onTap={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
      >
        {isSelected && (
          <Line
            points={points}
            stroke="rgba(99,102,241,0.35)"
            strokeWidth={(data.strokeWidth || 2) + 10}
            lineCap="round"
            lineJoin="round"
            tension={0.15}
          />
        )}
        <Line
          points={points}
          stroke={data.color || '#000'}
          strokeWidth={data.strokeWidth || 2}
          lineCap="round"
          lineJoin="round"
          tension={0.15}
        />
      </Group>
    );
  }

  if (type === 'SIGNATURE') {
    return <SignatureAnnotation annotation={annotation} pageWidth={pageWidth} pageHeight={pageHeight} isSelected={isSelected} onSelect={onSelect} onDelete={onDelete} onMove={onMove} />;
  }

  if (type === 'COMMENT') {
    return <CommentAnnotation annotation={annotation} pageWidth={pageWidth} pageHeight={pageHeight} isSelected={isSelected} onSelect={onSelect} onDelete={onDelete} onMove={onMove} />;
  }

  return null;
}

export function activeDragProps(type: string, data: any, pageWidth: number, pageHeight: number, onMove: (position: { x: number; y: number }) => void) {
  if (!['TEXT', 'SIGNATURE', 'COMMENT'].includes(type)) {
    return {};
  }

  return {
    draggable: true,
    onDragEnd: (event: any) => {
      const x = Math.max(0, Math.min(100, (event.target.x() / pageWidth) * 100));
      const y = Math.max(0, Math.min(100, (event.target.y() / pageHeight) * 100));
      event.target.position({
        x: (x / 100) * pageWidth,
        y: (y / 100) * pageHeight,
      });
      onMove({ x, y });
    },
  };
}

export function DeleteControl({ x, y, onDelete }: { x: number; y: number; onDelete: () => void }) {
  return (
    <Group
      x={x}
      y={y}
      onClick={(event) => {
        event.cancelBubble = true;
        onDelete();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onDelete();
      }}
    >
      <Circle radius={10} fill="#ef4444" stroke="#fff" strokeWidth={2} />
      <KonvaText text="x" fontSize={11} fill="#fff" x={-3.5} y={-5.5} />
    </Group>
  );
}

export function CommentAnnotation({ annotation, pageWidth, pageHeight, isSelected, onSelect, onDelete, onMove }: any) {
  const { data } = annotation;
  const x = (data.x / 100) * pageWidth;
  const y = (data.y / 100) * pageHeight;
  return (
    <Group
      x={x}
      y={y}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      {...activeDragProps('COMMENT', data, pageWidth, pageHeight, onMove)}
    >
      <Circle radius={14} fill={isSelected ? '#6366f1' : '#f59e0b'} stroke="#fff" strokeWidth={2} />
      <KonvaText text="?" fontSize={14} fill="#fff" x={-4} y={-7} />
      {(isSelected) && (
        <>
          <Label x={20} y={-12}>
            <Tag fill="#1a1a2e" stroke="rgba(255,255,255,0.15)" strokeWidth={1} cornerRadius={10} />
            <KonvaText
              text={`${data.author || 'Anonymous'}\n${data.text || ''}`}
              fill="#fff"
              fontSize={12}
              padding={12}
              width={200}
              lineHeight={1.35}
            />
          </Label>
          <DeleteControl x={122} y={-16} onDelete={onDelete} />
        </>
      )}
    </Group>
  );
}

export function SignatureAnnotation({ annotation, pageWidth, pageHeight, isSelected, onSelect, onDelete, onMove }: any) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const { data } = annotation;
  const x = (data.x / 100) * pageWidth;
  const y = (data.y / 100) * pageHeight;

  useEffect(() => {
    if (!data.imageDataUrl) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = data.imageDataUrl;
    img.onload = () => setImage(img);
  }, [data.imageDataUrl]);

  return (
    <Group
      x={x}
      y={y}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      {...activeDragProps('SIGNATURE', data, pageWidth, pageHeight, onMove)}
    >
      {isSelected && (
        <Rect
          width={data.width || 200}
          height={data.height || 80}
          stroke="#6366f1"
          strokeWidth={2}
          cornerRadius={4}
        />
      )}
      {image && (
        <KonvaImage
          image={image}
          width={data.width || 200}
          height={data.height || 80}
        />
      )}
      {isSelected && <DeleteControl x={(data.width || 200) + 10} y={-10} onDelete={onDelete} />}
    </Group>
  );
}

