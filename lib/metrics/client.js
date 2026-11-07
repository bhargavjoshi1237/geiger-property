"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadReportSources } from "@/lib/reports/sources_client";
import { computeMetric, computeMetrics, metricSources, sourceRecords } from "./index";

// Browser metrics: load the sources the given metrics read (through the data layers) once, then compute
// on demand. useMetrics(keys, params) → { loading, metrics, compute(key, params), records(key, params), sources }.
export function useMetrics(keys, params = {}) {
  const [src, setSrc] = useState(null);
  const sig = keys.join(",");
  const paramSig = JSON.stringify(params);

  useEffect(() => {
    let alive = true;
    loadReportSources(metricSources(sig.split(","))).then((loaded) => {
      if (alive) setSrc(loaded);
    });
    return () => {
      alive = false;
    };
  }, [sig]);

  const metrics = useMemo(() => (src ? computeMetrics(sig.split(","), src, JSON.parse(paramSig)) : {}), [src, sig, paramSig]);
  const compute = useCallback((key, override) => (src ? computeMetric(key, src, override || JSON.parse(paramSig)) : null), [src, paramSig]);
  const records = useCallback((key, override) => (src ? sourceRecords(key, src, override || JSON.parse(paramSig)) : []), [src, paramSig]);

  return useMemo(() => ({ loading: !src, metrics, compute, records, sources: src }), [src, metrics, compute, records]);
}
