"use client";

import React from "react";

export interface RadarAxis {
  label: string;
  value: number; // 0..1
}

const CX = 100;
const CY = 100;
const R = 72;

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

function polygonPoints(n: number, radius: number): string {
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = polar(-90 + (i * 360) / n, radius);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export default function SkillRadar({ axes }: { axes: RadarAxis[] }) {
  const n = Math.max(axes.length, 3);

  const dataPoints = axes
    .map((a, i) => {
      const [x, y] = polar(-90 + (i * 360) / n, Math.max(a.value, 0.08) * R);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="relative w-full aspect-square max-w-[280px] mx-auto flex items-center justify-center">
      <svg className="w-full h-full overflow-visible" viewBox="0 0 200 200">
        {/* Concentric grid */}
        {[R, (R * 2) / 3, R / 3].map((r) => (
          <polygon
            key={r}
            points={polygonPoints(n, r)}
            fill="none"
            stroke="#2a2f4c"
            strokeWidth="1"
          />
        ))}

        {/* Axes */}
        {axes.map((_, i) => {
          const [x, y] = polar(-90 + (i * 360) / n, R);
          return (
            <line
              key={i}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke="#2a2f4c"
              strokeWidth="1"
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={dataPoints}
          fill="rgba(168, 85, 247, 0.2)"
          stroke="#a855f7"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Data dots */}
        {axes.map((a, i) => {
          const [x, y] = polar(-90 + (i * 360) / n, Math.max(a.value, 0.08) * R);
          return <circle key={i} cx={x} cy={y} r="2.5" fill="#c084fc" />;
        })}

        {/* Labels */}
        {axes.map((a, i) => {
          const angle = -90 + (i * 360) / n;
          const [x, y] = polar(angle, R + 16);
          const anchor =
            Math.abs(Math.cos((angle * Math.PI) / 180)) < 0.3
              ? "middle"
              : Math.cos((angle * Math.PI) / 180) > 0
              ? "start"
              : "end";
          return (
            <text
              key={a.label}
              x={x}
              y={y + 3}
              fill="#8b92b2"
              fontSize="10"
              textAnchor={anchor}
              className="font-sans"
            >
              {a.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
