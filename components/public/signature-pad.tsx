"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type SignaturePadHandle = {
  /** Null if nothing has been drawn yet. */
  getDataUrl: () => string | null;
  clear: () => void;
};

/**
 * A plain drawn signature (not a typed name), per the spec's electronic
 * signature requirement. Deliberately dependency-free -- a canvas and
 * pointer events are all this needs, so it doesn't pull in a signature
 * library for something this small.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { className?: string }>(
  function SignaturePad({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const hasDrawnRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    useImperativeHandle(ref, () => ({
      getDataUrl: () => {
        if (!hasDrawnRef.current || !canvasRef.current) return null;
        return canvasRef.current.toDataURL("image/png");
      },
      clear: () => clearCanvas(),
    }));

    function clearCanvas() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawnRef.current = false;
      setIsEmpty(true);
    }

    function getPoint(e: ReactPointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      };
    }

    function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
      drawingRef.current = true;
      lastPointRef.current = getPoint(e);
      (e.target as Element).setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const point = getPoint(e);
      const last = lastPointRef.current ?? point;
      ctx.strokeStyle = "#211f1c";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPointRef.current = point;
      if (!hasDrawnRef.current) {
        hasDrawnRef.current = true;
        setIsEmpty(false);
      }
    }

    function handlePointerUp() {
      drawingRef.current = false;
      lastPointRef.current = null;
    }

    return (
      <div className={className}>
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="h-48 w-full touch-none rounded-lg border border-[var(--color-border)] bg-white"
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-[var(--color-muted)]">
            {isEmpty ? "Sign above with your mouse or finger." : "Signature captured."}
          </p>
          <button
            type="button"
            onClick={clearCanvas}
            className="text-xs font-medium text-[var(--color-primary)] hover:underline"
          >
            Clear
          </button>
        </div>
      </div>
    );
  }
);
