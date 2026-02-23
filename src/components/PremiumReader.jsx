import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Loader2, ZoomIn, ZoomOut, List, X, AlertCircle } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const HISTORY_KEY = "hsk-reader-meta";
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
}

const getMobileFitScale = (screenWidth) => {
  const horizontalPadding = 24;
  return clamp((screenWidth - horizontalPadding) / 600, 0.6, 1.2);
};

const flattenOutlineItems = (items = [], level = 0) =>
  items.flatMap((item) => {
    const node = {
      title: item?.title || "Untitled",
      dest: item?.dest || null,
      url: item?.url || null,
      level,
    };
    return [node, ...flattenOutlineItems(item?.items || [], level + 1)];
  });

function PDFPageLayer({ pdfDoc, pageNum, scale, onVisible, shouldRender, enableTextLayer }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [status, setStatus] = useState("init");

  const clearLayer = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = "1px";
      canvas.style.height = "1px";
    }
    if (textLayerRef.current) textLayerRef.current.innerHTML = "";
    if (containerRef.current) {
      containerRef.current.style.width = "100%";
      containerRef.current.style.height = "220px";
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisible(pageNum);
      },
      { threshold: [0], rootMargin: "-45% 0px -45% 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible, pageNum]);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      if (!pdfDoc || !shouldRender || !canvasRef.current || !containerRef.current) {
        if (!shouldRender) {
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
            } catch {}
            renderTaskRef.current = null;
          }
          clearLayer();
          setStatus("init");
        }
        return;
      }

      setStatus("loading");

      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const textLayer = textLayerRef.current;
        const container = containerRef.current;
        const context = canvas.getContext("2d", { alpha: false });

        if (!context) {
          setStatus("error");
          return;
        }

        const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        container.style.width = `${viewport.width}px`;
        container.style.height = `${viewport.height}px`;

        if (textLayer) {
          textLayer.style.width = `${viewport.width}px`;
          textLayer.style.height = `${viewport.height}px`;
        }

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
        }

        const task = page.render({ canvasContext: context, viewport, intent: "display" });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        if (textLayer && enableTextLayer && pdfjsLib.renderTextLayer) {
          const textContent = await page.getTextContent();
          if (cancelled) return;
          textLayer.innerHTML = "";
          const textTask = pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport,
            textDivs: [],
          });
          if (textTask?.promise) await textTask.promise;
        } else if (textLayer) {
          textLayer.innerHTML = "";
        }

        setStatus("rendered");
      } catch (err) {
        if (!cancelled && err?.name !== "RenderingCancelledException") setStatus("error");
      }
    };

    render();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNum, scale, shouldRender, enableTextLayer, clearLayer]);

  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
      clearLayer();
    };
  }, [clearLayer]);

  return (
    <div
      ref={containerRef}
      id={`page-container-${pageNum}`}
      className="relative bg-white shadow-sm mb-3 mx-auto transition-all rounded-sm"
      style={{ minHeight: "220px" }}
    >
      {shouldRender ? (
        <>
          {status !== "rendered" && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-300 z-10">
              <Loader2 className="animate-spin" size={22} />
            </div>
          )}
          <canvas ref={canvasRef} className="block" />
          <div ref={textLayerRef} className="textLayer absolute inset-0" />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/60 text-slate-300 text-[10px]">{pageNum}</div>
      )}
    </div>
  );
}

export default function PremiumReader({ url, title, onClose, bookId }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [outline, setOutline] = useState([]);
  const [jumpTargetPage, setJumpTargetPage] = useState(null);

  const loadingTaskRef = useRef(null);
  const pdfDocRef = useRef(null);
  const restoreTimerRef = useRef(null);
  const userZoomedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const latestProgressRef = useRef({ page: 1, pages: 0 });
  const visibleRafRef = useRef(0);

  const progressKey = useMemo(() => `pdf_progress_${encodeURIComponent(url || "")}`, [url]);
  const metaKey = useMemo(() => (bookId ? `${HISTORY_KEY}_${bookId}` : null), [bookId]);

  const handlePageVisible = useCallback((visiblePage) => {
    if (visibleRafRef.current) cancelAnimationFrame(visibleRafRef.current);
    visibleRafRef.current = requestAnimationFrame(() => {
      setPageNumber((prev) => (prev === visiblePage ? prev : visiblePage));
    });
  }, []);

  const scrollToPageWithRetry = useCallback((targetPage, smooth = false, retries = 16) => {
    const el = document.getElementById(`page-container-${targetPage}`);
    if (el) {
      el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
      return true;
    }
    if (retries > 0) window.setTimeout(() => scrollToPageWithRetry(targetPage, smooth, retries - 1), 90);
    return false;
  }, []);

  const persistProgress = useCallback(
    (page, pages) => {
      if (!url) return;

      try {
        localStorage.setItem(progressKey, String(page));
      } catch {}

      if (metaKey) {
        let prev = {};
        try {
          const raw = localStorage.getItem(metaKey);
          prev = raw ? JSON.parse(raw) : {};
        } catch {}

        try {
          localStorage.setItem(
            metaKey,
            JSON.stringify({
              ...prev,
              page,
              numPages: pages || prev.numPages || 0,
              lastRead: new Date().toISOString(),
              url,
              title,
            })
          );
        } catch {}
      }
    },
    [metaKey, progressKey, title, url]
  );

  useEffect(() => {
    latestProgressRef.current = { page: pageNumber, pages: numPages };
  }, [pageNumber, numPages]);

  useEffect(() => {
    if (!url) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => persistProgress(pageNumber, numPages), 450);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [pageNumber, numPages, persistProgress, url]);

  useEffect(() => {
    return () => {
      const latest = latestProgressRef.current;
      persistProgress(latest.page, latest.pages);
      if (visibleRafRef.current) cancelAnimationFrame(visibleRafRef.current);
    };
  }, [persistProgress]);

  useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      if (restoreTimerRef.current) {
        clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy();
        } catch {}
        loadingTaskRef.current = null;
      }
      if (pdfDocRef.current) {
        try {
          pdfDocRef.current.destroy();
        } catch {}
        pdfDocRef.current = null;
      }
    };

    const init = async () => {
      setLoading(true);
      setError(null);
      setPdfDoc(null);
      setNumPages(0);
      setOutline([]);
      setJumpTargetPage(null);

      cleanup();

      if (!url) {
        setError("暂无可用 PDF");
        setLoading(false);
        return;
      }

      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      userZoomedRef.current = false;
      setScale(mobile ? getMobileFitScale(window.innerWidth) : 1);

      let savedPage = 1;

      if (metaKey) {
        try {
          const raw = localStorage.getItem(metaKey);
          const meta = raw ? JSON.parse(raw) : null;
          if (meta?.page && Number.isFinite(meta.page)) savedPage = meta.page;
        } catch {}
      }

      if (savedPage === 1) {
        const legacy = Number.parseInt(localStorage.getItem(progressKey) || "1", 10);
        if (Number.isFinite(legacy) && legacy > 0) savedPage = legacy;
      }

      setPageNumber(savedPage);

      try {
        const loadingTask = pdfjsLib.getDocument({
          url,
          withCredentials: false,
          disableAutoFetch: mobile,
          rangeChunkSize: mobile ? 1024 * 256 : 1024 * 1024,
          stopAtErrors: false,
        });

        loadingTaskRef.current = loadingTask;
        const doc = await loadingTask.promise;

        if (cancelled) {
          try {
            doc.destroy();
          } catch {}
          return;
        }

        pdfDocRef.current = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);

        doc
          .getOutline()
          .then((items) => {
            if (!cancelled) setOutline(flattenOutlineItems(items || []));
          })
          .catch(() => {
            if (!cancelled) setOutline([]);
          });

        const targetPage = clamp(savedPage, 1, doc.numPages);
        setPageNumber(targetPage);

        restoreTimerRef.current = window.setTimeout(() => {
          scrollToPageWithRetry(targetPage, false, 20);
        }, 350);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError("加载失败，请检查网络、CORS 或 PDF 链接");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const onResize = () => {
      const mobileNow = window.innerWidth < 768;
      setIsMobile(mobileNow);
      if (mobileNow && !userZoomedRef.current) setScale(getMobileFitScale(window.innerWidth));
    };

    init();
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      cleanup();
    };
  }, [url, metaKey, progressKey, scrollToPageWithRetry]);

  const jumpToDest = useCallback(
    async (dest, fallbackUrl) => {
      if (!pdfDoc) return;
      try {
        let resolvedDest = dest;
        let nextPage = null;

        if (typeof resolvedDest === "string") resolvedDest = await pdfDoc.getDestination(resolvedDest);
        if (Array.isArray(resolvedDest) && resolvedDest[0]) {
          const idx = await pdfDoc.getPageIndex(resolvedDest[0]);
          nextPage = idx + 1;
        }

        if (!nextPage && typeof fallbackUrl === "string" && fallbackUrl.includes("#page=")) {
          const parsed = Number.parseInt(fallbackUrl.split("#page=")[1], 10);
          if (Number.isFinite(parsed) && parsed > 0) nextPage = parsed;
        }

        if (!nextPage) return;

        setSidebarOpen(false);
        setJumpTargetPage(nextPage);
        setPageNumber(nextPage);

        requestAnimationFrame(() => {
          scrollToPageWithRetry(nextPage, true, 24);
        });

        window.setTimeout(() => setJumpTargetPage(null), 2500);
      } catch (err) {
        console.error("Jump failed:", err);
      }
    },
    [pdfDoc, scrollToPageWithRetry]
  );

  const changeScale = useCallback(
    (delta) => {
      userZoomedRef.current = true;
      const maxScale = isMobile ? 2.5 : 3;
      setScale((prev) => clamp(Number((prev + delta).toFixed(2)), 0.5, maxScale));
    },
    [isMobile]
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] bg-[#e2e8f0] flex flex-col text-slate-800">
      <header className="h-14 flex items-center justify-between px-3 z-30 shrink-0 bg-white/90 border-b shadow-sm">
        <div className="flex items-center gap-1 overflow-hidden">
          <button onClick={onClose} aria-label="Back" className="p-2 -ml-1 text-slate-600">
            <ChevronLeft size={24} />
          </button>
          <div className="flex flex-col overflow-hidden">
            <h1 className="text-xs font-bold truncate max-w-[190px] sm:max-w-[260px]">{title}</h1>
            <span className="text-[10px] text-slate-400">{pdfDoc ? `${pageNumber} / ${numPages}` : "Loading..."}</span>
          </div>
        </div>

        <button onClick={() => setSidebarOpen(true)} aria-label="Open table of contents" className="p-2">
          <List size={22} />
        </button>
      </header>

      <div className="flex-1 overflow-hidden relative bg-slate-200/50">
        {loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/65">
            <Loader2 className="animate-spin text-blue-500" size={30} />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center text-red-500 gap-2">
            <AlertCircle size={40} />
            <span className="text-xs">{error}</span>
          </div>
        )}

        <div className="h-full overflow-y-auto px-2 sm:px-8 py-3 scroll-smooth" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="max-w-fit min-h-full mx-auto pb-20 flex flex-col items-center">
            {pdfDoc &&
              Array.from({ length: numPages }, (_, i) => {
                const n = i + 1;
                const windowSize = isMobile ? 1 : 2;
                const shouldRender = Math.abs(pageNumber - n) <= windowSize || n === jumpTargetPage;
                const enableTextLayer = n === pageNumber;

                return (
                  <PDFPageLayer
                    key={n}
                    pdfDoc={pdfDoc}
                    pageNum={n}
                    scale={scale}
                    onVisible={handlePageVisible}
                    shouldRender={shouldRender}
                    enableTextLayer={enableTextLayer}
                  />
                );
              })}
          </div>
        </div>

        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-white/95 shadow-xl rounded-full px-4 py-2.5 flex items-center gap-3 z-20 border border-white/70">
          <button onClick={() => changeScale(-0.15)} aria-label="Zoom out" className="h-8 w-8 grid place-items-center rounded-full">
            <ZoomOut size={18} className="text-slate-600" />
          </button>
          <span className="text-xs font-black min-w-[40px] text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => changeScale(0.15)} aria-label="Zoom in" className="h-8 w-8 grid place-items-center rounded-full">
            <ZoomIn size={18} className="text-slate-600" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/30 z-[150]" />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="absolute right-0 top-0 bottom-0 w-[85vw] max-w-sm bg-white shadow-2xl z-[200] flex flex-col"
            >
              <div className="h-14 border-b flex items-center justify-between px-4 bg-slate-50">
                <span className="text-xs font-bold uppercase text-slate-500">Table of Contents</span>
                <button onClick={() => setSidebarOpen(false)} aria-label="Close" className="p-1 text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 bg-white">
                <div className="space-y-1">
                  {outline.length > 0 ? (
                    outline.map((item, i) => (
                      <button
                        key={`${item.title}-${i}-${item.level}`}
                        onClick={() => jumpToDest(item.dest, item.url)}
                        className="w-full text-left py-2.5 px-2 hover:bg-slate-50 border-b border-slate-50 text-xs text-slate-600 truncate"
                        style={{ paddingLeft: `${8 + item.level * 12}px` }}
                        title={item.title}
                      >
                        {item.title}
                      </button>
                    ))
                  ) : (
                    <div className="text-center mt-20 text-slate-300 text-xs">暂无目录</div>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .textLayer {
          position: absolute;
          inset: 0;
          line-height: 1;
          pointer-events: auto;
        }
        .textLayer > span {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
          pointer-events: auto;
        }
        ::selection {
          background: rgba(0, 100, 255, 0.2);
        }
      `}</style>
    </motion.div>
  );
}
