import React from 'react';

export function PdfPageCanvas({ pdf, pageIndex, containerWidth, containerHeight }: {
  pdf: any; pageIndex: number; containerWidth: number; containerHeight: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const renderIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    const currentRenderId = ++renderIdRef.current;

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageIndex + 1);
        if (currentRenderId !== renderIdRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const cssScale = containerWidth / viewport.width;
        const renderScale = cssScale * dpr;
        const scaledViewport = page.getViewport({ scale: renderScale });

        // Set canvas buffer to high-res, CSS to display size
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${Math.round(containerWidth * (viewport.height / viewport.width))}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Reset transform to prevent flipping
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      } catch (err) {
        if (currentRenderId === renderIdRef.current) {
          console.error(`Error rendering page ${pageIndex + 1}:`, err);
        }
      }
    };

    renderPage();
    return () => { renderIdRef.current++; };
  }, [pdf, pageIndex, containerWidth, containerHeight]);

  return (
    <div style={{
      width: '100%', height: '100%',
      backgroundColor: '#fff', overflow: 'hidden',
    }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />  
    </div>
  );
}

