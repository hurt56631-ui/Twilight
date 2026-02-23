import React, { useEffect, useMemo, useState, Suspense, lazy, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, PlayCircle, Clock, BookOpen, Search } from "lucide-react";

// ⭐ 引入我们刚才拆分出去的书籍数据
import { BOOKS_DATA } from "../data/books";

const PremiumReader = lazy(() => import("./PremiumReader"));

const HISTORY_KEY = "hsk-reader-meta";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const toProgress = (page = 0, total = 100) => clamp(Math.round((page / Math.max(total, 1)) * 100), 0, 100);

const ThreeDBook = memo(function ThreeDBook({ cover, title, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      type="button"
      className={`relative w-full aspect-[3/4.25] text-left ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      style={{ perspective: "1200px" }}
      aria-label={title}
    >
      <div className="absolute -bottom-4 left-2 right-4 h-4 rounded-full blur-xl" style={{ background: "rgba(15,23,42,0.35)" }} />
      <div className="absolute inset-0" style={{ transformStyle: "preserve-3d", transform: "rotateY(-12deg) rotateX(2deg)" }}>
        <div
          className="absolute inset-0 rounded-r-md rounded-l-[2px] overflow-hidden"
          style={{
            transform: "translateZ(8px)",
            boxShadow: "0 18px 24px rgba(15,23,42,.22), 0 8px 14px rgba(15,23,42,.15), inset 0 0 0 1px rgba(255,255,255,.18)",
          }}
        >
          <img src={cover} alt={title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-transparent to-white/10" />
          <div className="absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/25 to-transparent" />
        </div>

        <div
          className="absolute top-[3px] bottom-[3px] right-[-10px] w-[12px] rounded-r-sm border-l border-slate-300"
          style={{
            transform: "translateZ(1px)",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 35%, #eef2f7 100%)",
          }}
        />

        {disabled && (
          <div className="absolute inset-0 bg-slate-900/35 rounded-r-md rounded-l-[2px] flex items-end justify-center pb-2">
            <span className="text-[10px] text-white font-bold bg-black/40 px-2 py-0.5 rounded">即将上线</span>
          </div>
        )}
      </div>
    </button>
  );
});

export default function BookLibrary({ isOpen = true, onClose = () => {} }) {
  const [selectedBook, setSelectedBook] = useState(null);
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const allHistory = [];
    BOOKS_DATA.forEach((book) => {
      const raw = localStorage.getItem(`${HISTORY_KEY}_${book.id}`);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        allHistory.push({ ...book, ...parsed });
      } catch {}
    });

    allHistory.sort((a, b) => new Date(b.lastRead || 0).getTime() - new Date(a.lastRead || 0).getTime());
    setHistory(allHistory);
  }, [isOpen, selectedBook]);

  const progressMap = useMemo(() => new Map(history.map((x) => [x.id, x])), [history]);

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BOOKS_DATA;
    return BOOKS_DATA.filter((b) => `${b.title} ${b.subTitle}`.toLowerCase().includes(q));
  }, [query]);

  const continueBook = useMemo(
    () => history.find((x) => !!x.pdfUrl && filteredBooks.some((b) => b.id === x.id)),
    [history, filteredBooks]
  );

  if (!isOpen) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] flex justify-end">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[3px]" />

      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 220 }}
        className="relative w-full h-full bg-slate-50 shadow-2xl flex flex-col overflow-hidden sm:max-w-md ml-auto"
      >
        <div className="relative h-44 shrink-0 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=1200&q=80&auto=format&fit=crop"
            className="absolute inset-0 h-full w-full object-cover"
            alt="Library background"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-50 via-slate-900/35 to-slate-900/65" />

          <div className="absolute inset-0 px-5 pt-5 pb-3 flex flex-col justify-between z-10">
            <div className="flex items-center justify-between">
              <button onClick={onClose} className="p-2 -ml-2 rounded-full bg-white/10 backdrop-blur-md text-white border border-white/10">
                <ChevronLeft size={24} />
              </button>
              <div className="text-white text-sm font-bold tracking-wide">PDF Library</div>
            </div>

            <div>
              <h2 className="text-3xl font-black text-white tracking-tight">Library</h2>
              <p className="text-xs text-slate-200 font-medium">Discover your next journey</p>
              <div className="mt-3 rounded-xl bg-white/85 backdrop-blur border border-white/70 px-3 py-2 flex items-center gap-2">
                <Search size={16} className="text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search books..."
                  className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-8">
          {continueBook && (
            <section>
              <div className="flex items-center gap-2 mb-3 px-1">
                <Clock size={14} className="text-blue-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Continue Reading</span>
              </div>

              <button
                onClick={() => continueBook.pdfUrl && setSelectedBook(continueBook)}
                type="button"
                className="relative w-full aspect-[2.7/1] overflow-hidden rounded-2xl shadow-xl shadow-blue-500/10 bg-white text-left"
              >
                <div className="absolute inset-0 bg-cover bg-center opacity-25 blur-md scale-125" style={{ backgroundImage: `url(${continueBook.cover})` }} />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-800/90 to-slate-900/45" />

                <div className="absolute inset-0 p-4 flex items-center gap-4">
                  <div className="relative h-full aspect-[3/4.2] shadow-lg rounded-sm overflow-hidden border border-white/10">
                    <img src={continueBook.cover} className="w-full h-full object-cover" alt="" loading="lazy" decoding="async" />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-center text-white h-full py-1">
                    <h3 className="font-bold text-base leading-tight truncate text-slate-100">{continueBook.subTitle}</h3>
                    <p className="text-[10px] text-slate-300 mt-0.5 truncate">{continueBook.title}</p>

                    <div className="mt-auto">
                      <div className="flex justify-between text-[9px] text-slate-300 mb-1 font-mono">
                        <span>Progress</span>
                        <span>{toProgress(continueBook.page, continueBook.numPages)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-cyan-300 rounded-full"
                          style={{ width: `${toProgress(continueBook.page, continueBook.numPages)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
                    <PlayCircle size={20} className="text-white ml-0.5" />
                  </div>
                </div>
              </button>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-5 px-1">
              <BookOpen size={14} className="text-blue-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Collections</span>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100/50">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-8">
                {filteredBooks.map((book) => {
                  const p = progressMap.get(book.id);
                  const progress = p ? toProgress(p.page, p.numPages) : 0;

                  return (
                    <div key={book.id} className="flex flex-col items-center">
                      <div className="relative w-full">
                        <ThreeDBook cover={book.cover} title={book.title} disabled={!book.pdfUrl} onClick={() => setSelectedBook(book)} />
                        {progress > 0 && (
                          <span className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 shadow">
                            {progress}%
                          </span>
                        )}
                      </div>

                      <div className="text-center mt-3 w-full px-0.5">
                        <h3 className="text-xs font-bold text-slate-700 line-clamp-2 leading-relaxed h-[2.8em] overflow-hidden">{book.subTitle}</h3>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedBook?.pdfUrl && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-md flex items-center justify-center text-white">
                <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            }
          >
            <PremiumReader
              url={selectedBook.pdfUrl}
              title={selectedBook.title}
              bookId={selectedBook.id}
              onClose={() => setSelectedBook(null)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
