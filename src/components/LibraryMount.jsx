import React, { useState, useEffect } from "react";
import BookLibrary from "./BookLibrary"; // 确保路径指向你写好的 BookLibrary.jsx

export default function LibraryMount() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // 监听来自 Astro 静态按钮的自定义事件
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("open-library", handleOpen);
    
    return () => window.removeEventListener("open-library", handleOpen);
  }, []);

  return <BookLibrary isOpen={isOpen} onClose={() => setIsOpen(false)} />;
}
