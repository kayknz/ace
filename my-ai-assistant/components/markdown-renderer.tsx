import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MarkdownRendererComponent = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Style regular text paragraphs
        p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed text-slate-200">{children}</p>,
        
        // Style bullet and ordered lists
        ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1 text-slate-200">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1 text-slate-200">{children}</ol>,
        li: ({ children }) => <li className="marker:text-indigo-400">{children}</li>,
        
        // Style headers
        h1: ({ children }) => <h1 className="text-2xl font-bold tracking-tight text-white mb-4 mt-6">{children}</h1>,
        h2: ({ children }) => <h2 className="text-xl font-semibold tracking-tight text-white mb-3 mt-5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-lg font-medium tracking-tight text-white mb-2 mt-4">{children}</h3>,
        
        // Style links
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline font-medium">
            {children}
          </a>
        ),
        
        // Style inline code vs code blocks
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          const codeText = String(children).replace(/\n$/, '');
          
          if (!inline && match) {
            // Full Developer Code Block
            return (
              <div className="relative my-6 rounded-lg border border-slate-800 bg-[#0b0f19] overflow-hidden group">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-[#0d1321]">
                  <span className="text-xs font-mono text-slate-400 lowercase">{match[1]}</span>
                  <button 
                    onClick={() => navigator.clipboard.writeText(codeText)}
                    className="text-xs text-slate-400 hover:text-white transition-colors duration-150 active:scale-95"
                  >
                    Copy
                  </button>
                </div>
                <div className="p-4 overflow-x-auto font-mono text-sm leading-relaxed text-indigo-200 selection:bg-indigo-500/30">
                  <code>{children}</code>
                </div>
              </div>
            );
          }
          
          // Inline single code snippets like `const x = 1`
          return (
            <code className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-sm" {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

// Memoizing prevents unnecessary recalculations during real-time token streams
export const MarkdownRenderer = memo(MarkdownRendererComponent);