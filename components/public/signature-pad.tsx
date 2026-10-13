"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type SignaturePadHandle = {
  /** Null if nothing has been drawn yet. */
  getDataUrl: () => string | null;
  clear: () => void;
};

type SignaturePadProps = {
  className?: string;
  /** Restores a previously-captured signature (as a data URL) on mount --
   * used so the booking wizard can carry a signature across the
   * agree-and-sign step being unmounted/remounted (e.g. going back to fix
   * the address and returning), instead of silently discarding it and
   * forcing the customer to sign again. */
  initialDataUrl?: string | null;
  /** Fired with the current signature's data URL after each stroke, and
   * with null after Clear -- lets a parent keep its own copy in state so
   * it survives this component unmounting. */
  onChange?: (dataUrl: string | null) => void;
};

/**
 * A plain drawn signature (not a typed name), per the spec's electronic
 * signature requirement. Deliberately dependency-free -- a canvas and
 * pointer events are all this needs, so it doesn't pull in a signature
 * library for something this small.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ className, initialDataUrl, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const hasDrawnRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const [isEmpty, setIsEmpty] = useState(!initialDataUrl);

    // Redraw a previously-captured signature once, when this canvas first
    // mounts (e.g. the wizard stepped away from this step and back).
    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !initialDataUrl) return;
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        hasDrawnRef.current = true;
        setIsEmpty(false);
      };
      img.src = initialDataUrl;
      // Only ever restore once per mount, regardless of later prop changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
      onChange?.(null);
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
      if (drawingRef.current && hasDrawnRef.current && canvasRef.current) {
        onChange?.(canvasRef.current.toDataURL("image/png"));
      }
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
