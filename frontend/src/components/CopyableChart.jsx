import { useRef, useState } from 'react';
import { Copy, Check, Download } from 'lucide-react';

export default function CopyableChart({ title, children, className = '' }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  const captureImage = async () => {
    if (!ref.current) return null;
    try {
      const { default: html2canvas } = await import('html2canvas');
      return await html2canvas(ref.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
      });
    } catch {
      return null;
    }
  };

  const handleCopy = async () => {
    try {
      const canvas = await captureImage();
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }, 'image/png');
    } catch {}
  };

  const handleDownload = async () => {
    const canvas = await captureImage();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${(title || 'chart').replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className={`card relative group ${className}`}>
      <div className="absolute top-3 right-3 hidden group-hover:flex items-center gap-1 z-10">
        <button onClick={handleCopy} className="p-1.5 rounded-md bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Copy as image">
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
        </button>
        <button onClick={handleDownload} className="p-1.5 rounded-md bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Download as PNG">
          <Download className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>
      <div ref={ref}>
        {title && <h3 className="font-semibold mb-4">{title}</h3>}
        {children}
      </div>
    </div>
  );
}
