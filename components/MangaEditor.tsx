
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UploadedImage, TextBubble, BoundingBox } from '../types';
import { autoDetectAndTranslate, translateRegion, fileToGenerativePart, retranslateContextAware } from '../services/geminiService';
import { Scan, Trash2, MousePointer2, Wand2, X, ZoomIn, ZoomOut, Hand, Save, Undo, Redo, Globe, ChevronDown, Type, PaintBucket, Check, Circle, Square, Minus, Plus, ALargeSmall, Workflow, Link2, RefreshCw } from 'lucide-react';

interface MangaEditorProps {
  image: UploadedImage;
  onBack: () => void;
}

const LANGUAGES = [
  { code: 'English', label: 'English' },
  { code: 'Turkish', label: 'Türkçe' },
  { code: 'Spanish', label: 'Español' },
  { code: 'French', label: 'Français' },
  { code: 'German', label: 'Deutsch' },
  { code: 'Italian', label: 'Italiano' },
  { code: 'Portuguese', label: 'Português' },
  { code: 'Russian', label: 'Русский' },
  { code: 'Japanese', label: '日本語' },
  { code: 'Korean', label: '한국어' },
  { code: 'Chinese (Simplified)', label: '简体中文' },
  { code: 'Indonesian', label: 'Bahasa Indonesia' },
];

const FONTS = [
  { name: 'Comic Neue', label: 'Comic' },
  { name: 'Bangers', label: 'Loud' },
  { name: 'Patrick Hand', label: 'Hand' },
  { name: 'Architects Daughter', label: 'Architect' },
  { name: 'Indie Flower', label: 'Indie' },
  { name: 'Permanent Marker', label: 'Marker' },
  { name: 'Amatic SC', label: 'Tall' },
  { name: 'Caveat', label: 'Caveat' },
  { name: 'Kalam', label: 'Kalam' },
  { name: 'Shadows Into Light', label: 'Shadows' },
];

// Centralized font size calculation to ensure WYSIWYG
// Accepts normalized (0-1000) dimensions
const calculateBaseFontSize = (textLength: number, boxWidth: number, boxHeight: number) => {
    const area = boxWidth * boxHeight;
    // Prevent division by zero
    const charArea = area / (textLength || 1);
    let size = Math.sqrt(charArea);
    // Use a consistent multiplier (0.6) that matches the CSS visuals best
    // Clamp between 10 and 50 "units" (relative to 1000px base)
    return Math.min(Math.max(size * 0.6, 10), 50); 
};

const MangaEditor: React.FC<MangaEditorProps> = ({ image, onBack }) => {
  // History State
  const [history, setHistory] = useState<TextBubble[][]>([[]]); // Initial empty state
  const [historyIndex, setHistoryIndex] = useState(0);

  // View State
  const [bubbles, setBubbles] = useState<TextBubble[]>([]);
  const [targetLanguage, setTargetLanguage] = useState('English');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  // Added 'tree' tool
  const [tool, setTool] = useState<'select' | 'draw' | 'pan' | 'tree'>('draw');
  const [drawShape, setDrawShape] = useState<'rectangle' | 'ellipse'>('rectangle'); // New: Shape selector
  
  // Viewport State
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTextColor, setEditTextColor] = useState("#000000");
  const [editBgColor, setEditBgColor] = useState("#FFFFFF");
  const [editFontFamily, setEditFontFamily] = useState("Comic Neue");
  
  // Selection, Dragging and Resizing state
  const [drawSelection, setDrawSelection] = useState<{ start: { x: number, y: number }, current: { x: number, y: number } } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null); // New: Resize state
  const [resizeHandle, setResizeHandle] = useState<string | null>(null); // New: Which handle?
  const [dragOffset, setDragOffset] = useState<{ x: number, y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // --- TREE / CONTEXT MODE STATE ---
  const [connections, setConnections] = useState<[string, string][]>([]);
  const [activeTreeNode, setActiveTreeNode] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const activeBubbleRef = useRef<HTMLDivElement>(null);

  // --- HISTORY HELPERS ---

  const addToHistory = useCallback((newBubbles: TextBubble[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, newBubbles];
    });
    setHistoryIndex(prev => prev + 1);
    setBubbles(newBubbles);
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setBubbles(history[newIndex]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setBubbles(history[newIndex]);
    }
  }, [history, historyIndex]);

  // --- CLICK OUTSIDE ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setIsLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Undo / Redo
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                handleRedo();
            } else {
                handleUndo();
            }
            return;
        }
        // Redo alternative (Ctrl+Y)
        if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
            e.preventDefault();
            handleRedo();
            return;
        }

        // Pan Tool Shortcut
        if (e.code === 'Space' && !editingId) {
            e.preventDefault();
            if (!e.repeat) setIsSpacePressed(true);
            if (tool !== 'pan') document.body.style.cursor = 'grab';
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
             setIsSpacePressed(false);
             if (tool !== 'pan' && !editingId) document.body.style.cursor = 'default';
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [tool, editingId, handleUndo, handleRedo]);

  // --- FOCUS MANAGEMENT FOR EDITING ---
  useEffect(() => {
      if (editingId && activeBubbleRef.current) {
          activeBubbleRef.current.focus();
          // Move cursor to end
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(activeBubbleRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
      }
  }, [editingId]);

  // --- ACTION HANDLERS ---

  const handleAutoScan = async () => {
    if (!image.file) return;
    setIsProcessing(true);
    try {
      const base64 = await fileToGenerativePart(image.file);
      const detectedBubbles = await autoDetectAndTranslate(base64, targetLanguage);
      
      // Add default shape properties to auto-detected bubbles
      const processedBubbles = detectedBubbles.map(b => ({
          ...b,
          shape: 'rectangle' as const,
          fontSizeScale: 1,
          fontFamily: 'Comic Neue'
      }));

      const newBubbleState = [...bubbles, ...processedBubbles];
      addToHistory(newBubbleState);
      
      setTool('select');
    } catch (err) {
      alert("Auto scan failed. Please try manual selection.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBubble = (id: string) => {
    const newBubbles = bubbles.filter(b => b.id !== id);
    addToHistory(newBubbles);
    // Remove connections involving this bubble
    setConnections(prev => prev.filter(([start, end]) => start !== id && end !== id));
  };

  // --- TREE MODE HANDLERS ---

  const handleBubbleConnect = (id: string) => {
      if (tool !== 'tree') return;

      if (activeTreeNode === null) {
          // Start connection
          setActiveTreeNode(id);
      } else if (activeTreeNode === id) {
          // Deselect if clicked again
          setActiveTreeNode(null);
      } else {
          // Complete connection (activeTreeNode -> id)
          
          // Check if connection already exists (direction agnostic for checking, but we store directed)
          const exists = connections.some(
              ([s, e]) => (s === activeTreeNode && e === id) || (s === id && e === activeTreeNode)
          );

          if (!exists) {
              setConnections(prev => [...prev, [activeTreeNode, id]]);
          }
          
          // Chain: The new bubble becomes the active node for the next connection
          setActiveTreeNode(id);
      }
  };

  const handleRetranslateLinked = async () => {
      if (connections.length === 0) return;
      setIsProcessing(true);
      
      try {
          // 1. Identify components (groups of connected bubbles)
          // This is a simple graph traversal
          const adj: Record<string, string[]> = {};
          // Build Adjacency List
          connections.forEach(([from, to]) => {
              if (!adj[from]) adj[from] = [];
              if (!adj[to]) adj[to] = []; // ensure node exists
              adj[from].push(to);
              // We treat connections as directed flow A->B.
          });

          // Find all nodes involved in connections
          const nodes = new Set<string>();
          connections.forEach(([s, e]) => { nodes.add(s); nodes.add(e); });

          // Simple approach: Find chains. 
          // A node with in-degree 0 is a start of a chain.
          const inDegree: Record<string, number> = {};
          nodes.forEach(n => inDegree[n] = 0);
          connections.forEach(([_, to]) => inDegree[to] = (inDegree[to] || 0) + 1);

          const starts = Array.from(nodes).filter(n => inDegree[n] === 0);
          
          // Fallback: If a cycle exists or no pure start, pick any node (not handling complex cycles perfectly here, assuming tree/line)
          // Actually, let's just grab all connected components.
          
          const visited = new Set<string>();
          const chains: string[][] = [];

          const getChain = (startNode: string): string[] => {
              const path = [startNode];
              visited.add(startNode);
              let curr = startNode;
              while(adj[curr] && adj[curr].length > 0) {
                  // Prioritize unvisited next
                  const next = adj[curr].find(n => !visited.has(n));
                  if (next) {
                      visited.add(next);
                      path.push(next);
                      curr = next;
                  } else {
                      break; // End of chain or cycle detected
                  }
              }
              return path;
          }

          starts.forEach(start => {
              if (!visited.has(start)) {
                  chains.push(getChain(start));
              }
          });
          
          // Handle disconnected cycles if any (rare in this use case, but safe to check leftovers)
          nodes.forEach(n => {
             if (!visited.has(n)) {
                 chains.push(getChain(n));
             } 
          });

          // 2. Send each chain to AI
          let updatedBubbles = [...bubbles];

          for (const chainIds of chains) {
              if (chainIds.length < 2) continue; // Need at least 2 for "context" mode to mean anything useful
              
              const chainData = chainIds.map(id => {
                  const b = bubbles.find(b => b.id === id);
                  return b ? { id: b.id, text: b.text, originalText: b.originalText } : null;
              }).filter(b => b !== null) as { id: string, text: string, originalText?: string }[];

              const newTranslations = await retranslateContextAware(chainData, targetLanguage);
              
              // Update local state
              newTranslations.forEach(t => {
                  const idx = updatedBubbles.findIndex(b => b.id === t.id);
                  if (idx !== -1) {
                      updatedBubbles[idx] = { ...updatedBubbles[idx], text: t.text };
                  }
              });
          }

          addToHistory(updatedBubbles);
          alert("Linked bubbles have been retranslated with context!");

      } catch (error) {
          console.error(error);
          alert("Failed to retranslate context.");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleDownload = async () => {
    if (!imgRef.current) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const naturalWidth = imgRef.current.naturalWidth;
    const naturalHeight = imgRef.current.naturalHeight;

    canvas.width = naturalWidth;
    canvas.height = naturalHeight;

    // 1. Draw Original Image
    ctx.drawImage(imgRef.current, 0, 0);

    // 2. Draw Bubbles
    bubbles.forEach(b => {
        // Calculate positions in Real Pixels
        const x = (b.box.xmin / 1000) * naturalWidth;
        const y = (b.box.ymin / 1000) * naturalHeight;
        const w = ((b.box.xmax - b.box.xmin) / 1000) * naturalWidth;
        const h = ((b.box.ymax - b.box.ymin) / 1000) * naturalHeight;

        // Normalized dimensions for consistency with Editor
        const normalizedW = b.box.xmax - b.box.xmin;
        const normalizedH = b.box.ymax - b.box.ymin;

        // Draw Bubble Background
        ctx.fillStyle = b.backgroundColor || '#FFFFFF';
        ctx.beginPath();
        
        if (b.shape === 'ellipse') {
            ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, 2 * Math.PI);
        } else {
            const radius = Math.min(w, h) * 0.1; 
            ctx.roundRect(x, y, w, h, radius);
        }
        ctx.fill();

        // Draw Text
        ctx.fillStyle = b.textColor || '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Font Size Logic (CRITICAL FIX)
        const baseFontSizeUnits = calculateBaseFontSize(b.text.length, normalizedW, normalizedH);
        const scaleFactor = naturalWidth / 1000;
        const scaledFontSize = baseFontSizeUnits * scaleFactor * (b.fontSizeScale || 1);
        
        const fontFamily = b.fontFamily || 'Comic Neue';
        ctx.font = `bold ${scaledFontSize}px '${fontFamily}', sans-serif`;

        // Padding Logic
        const paddingPercent = b.shape === 'ellipse' ? 0.12 : 0.04;
        const paddingX = w * paddingPercent * 2; 
        
        const maxWidth = Math.max(w - paddingX, 10); 
        
        const words = b.text.split(' ');
        let line = '';
        const lines = [];

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                lines.push(line);
                line = words[n] + ' ';
            } else {
                line = testLine;
            }
        }
        lines.push(line);

        const lineHeight = scaledFontSize * 1.2;
        const totalTextHeight = lines.length * lineHeight;
        
        const startY = y + (h / 2) - (totalTextHeight / 2) + (lineHeight / 2);

        lines.forEach((l, i) => {
            ctx.fillText(l.trim(), x + w / 2, startY + (i * lineHeight) - (lineHeight * 0.15)); 
        });
    });

    const link = document.createElement('a');
    link.download = `translated-${image.file?.name || 'manga'}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.click();
  };

  // --- CHANGE BUBBLE PROPS ---
  
  const updateBubbleShape = (id: string, shape: 'rectangle' | 'ellipse') => {
      const newBubbles = bubbles.map(b => b.id === id ? { ...b, shape } : b);
      addToHistory(newBubbles);
  };

  const updateBubbleFontScale = (id: string, delta: number) => {
      const newBubbles = bubbles.map(b => {
          if (b.id === id) {
              const newScale = Math.max(0.5, Math.min(3, (b.fontSizeScale || 1) + delta));
              return { ...b, fontSizeScale: newScale };
          }
          return b;
      });
      addToHistory(newBubbles);
  };

  // --- COORDINATE HELPERS ---
  const getRelativeCoords = (e: React.MouseEvent | MouseEvent) => {
    if (!contentRef.current) return { x: 0, y: 0 };
    const rect = contentRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    };
  };

  const getBubbleCenter = (id: string) => {
      const b = bubbles.find(b => b.id === id);
      if (!b) return { x: 0, y: 0 };
      return {
          x: (b.box.xmin + b.box.xmax) / 2 / 10, // % units (0-100)
          y: (b.box.ymin + b.box.ymax) / 2 / 10  // % units (0-100)
      };
  };

  // --- MOUSE & WHEEL HANDLERS ---

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = -e.deltaY * 0.001;
    const newScale = Math.min(Math.max(0.5, scale + delta), 5); 
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // 1. Handle Panning
    if (tool === 'pan' || e.button === 1 || (e.buttons === 1 && isSpacePressed)) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
        return;
    }

    // 2. Handle Editing Save & Close (Click Outside)
    if (editingId) {
         if ((e.target as HTMLElement).closest('.editing-toolbar')) return;
         if ((e.target as HTMLElement).closest('.editing-bubble')) return;
        saveEdit();
    }

    // Check if clicking a resize handle
    const handle = (e.target as HTMLElement).getAttribute('data-handle');
    const bubbleId = (e.target as HTMLElement).getAttribute('data-bubble-id');
    
    if (tool === 'select' && handle && bubbleId) {
        setResizingId(bubbleId);
        setResizeHandle(handle);
        setIsDragging(false);
        return;
    }

    const coords = getRelativeCoords(e);

    // 3. Handle Selection / Dragging / Tree Connecting
    if (tool === 'select' || tool === 'tree') {
        // Find if clicked on a bubble
        const clickedBubble = [...bubbles].reverse().find(b => {
            const bx = b.box.xmin / 1000;
            const by = b.box.ymin / 1000;
            const bw = (b.box.xmax - b.box.xmin) / 1000;
            const bh = (b.box.ymax - b.box.ymin) / 1000;
            return coords.x >= bx && coords.x <= bx + bw && coords.y >= by && coords.y <= by + bh;
        });

        if (clickedBubble) {
            if (tool === 'tree') {
                handleBubbleConnect(clickedBubble.id);
            } else {
                setDraggingId(clickedBubble.id);
                setDragOffset({
                    x: coords.x - (clickedBubble.box.xmin / 1000),
                    y: coords.y - (clickedBubble.box.ymin / 1000)
                });
                setIsDragging(false);
            }
            return;
        } else {
            setEditingId(null);
            if (tool === 'tree') setActiveTreeNode(null);
        }
    }

    // 4. Start Drawing
    if (tool === 'draw') {
        setDrawSelection({ start: coords, current: coords });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
        setOffset({
            x: e.clientX - panStart.x,
            y: e.clientY - panStart.y
        });
        return;
    }

    const coords = getRelativeCoords(e);

    // Handle Resizing
    if (resizingId && resizeHandle) {
        setBubbles(prev => prev.map(b => {
            if (b.id !== resizingId) return b;
            
            let { xmin, ymin, xmax, ymax } = b.box;
            const currentX = coords.x * 1000;
            const currentY = coords.y * 1000;

            if (resizeHandle === 'nw') {
                xmin = Math.min(currentX, xmax - 10);
                ymin = Math.min(currentY, ymax - 10);
            } else if (resizeHandle === 'ne') {
                xmax = Math.max(currentX, xmin + 10);
                ymin = Math.min(currentY, ymax - 10);
            } else if (resizeHandle === 'sw') {
                xmin = Math.min(currentX, xmax - 10);
                ymax = Math.max(currentY, ymin + 10);
            } else if (resizeHandle === 'se') {
                xmax = Math.max(currentX, xmin + 10);
                ymax = Math.max(currentY, ymin + 10);
            }

            return { ...b, box: { xmin, ymin, xmax, ymax } };
        }));
        return;
    }

    // Handle Dragging
    if (draggingId && dragOffset) {
        setIsDragging(true);
        setBubbles(prev => prev.map(b => {
            if (b.id !== draggingId) return b;
            
            const width = b.box.xmax - b.box.xmin;
            const height = b.box.ymax - b.box.ymin;
            
            let newXmin = (coords.x - dragOffset.x) * 1000;
            let newYmin = (coords.y - dragOffset.y) * 1000;

            return {
                ...b,
                box: {
                    xmin: newXmin,
                    ymin: newYmin,
                    xmax: newXmin + width,
                    ymax: newYmin + height
                }
            };
        }));
    } else if (drawSelection) {
        setDrawSelection(prev => prev ? { ...prev, current: coords } : null);
    }
  };

  const handleMouseUp = async () => {
    if (isPanning) {
        setIsPanning(false);
        return;
    }

    if (resizingId) {
        addToHistory(bubbles);
        setResizingId(null);
        setResizeHandle(null);
        return;
    }

    if (draggingId) {
        if (isDragging) {
            addToHistory(bubbles);
        }
        setDraggingId(null);
        setDragOffset(null);
        setIsDragging(false);
        return;
    }

    if (!drawSelection || !imgRef.current || !image.file) {
        setDrawSelection(null);
        return;
    }

    const x1 = Math.min(drawSelection.start.x, drawSelection.current.x);
    const x2 = Math.max(drawSelection.start.x, drawSelection.current.x);
    const y1 = Math.min(drawSelection.start.y, drawSelection.current.y);
    const y2 = Math.max(drawSelection.start.y, drawSelection.current.y);

    if ((x2 - x1) < 0.01 || (y2 - y1) < 0.01) {
      setDrawSelection(null);
      return;
    }

    const tempId = Date.now().toString();
    const newBox: BoundingBox = {
        ymin: y1 * 1000,
        xmin: x1 * 1000,
        ymax: y2 * 1000,
        xmax: x2 * 1000
    };

    const tempBubble: TextBubble = {
        id: tempId,
        text: "...",
        box: newBox,
        isManual: true,
        textColor: "#000000",
        backgroundColor: "#FFFFFF",
        shape: drawShape, 
        fontSizeScale: 1,
        fontFamily: 'Comic Neue'
    };

    setBubbles(prev => [...prev, tempBubble]);
    setDrawSelection(null);

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const naturalWidth = imgRef.current.naturalWidth;
        const naturalHeight = imgRef.current.naturalHeight;

        const cropX = x1 * naturalWidth;
        const cropY = y1 * naturalHeight;
        const cropW = (x2 - x1) * naturalWidth;
        const cropH = (y2 - y1) * naturalHeight;

        canvas.width = cropW;
        canvas.height = cropH;
        
        if (ctx) {
            ctx.drawImage(imgRef.current, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            const cropBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
            
            const result = await translateRegion(cropBase64, targetLanguage);
            
            const resolvedBubble = { 
                ...tempBubble, 
                text: result.text,
                textColor: result.textColor,
                backgroundColor: result.backgroundColor
            };
            
            setBubbles(prev => {
                const updated = prev.map(b => b.id === tempId ? resolvedBubble : b);
                addToHistory(updated);
                return updated;
            });
        }
    } catch (e) {
        setBubbles(prev => prev.filter(b => b.id !== tempId));
    }
  };

  // --- EDITING HANDLERS ---

  const startEditing = (bubble: TextBubble) => {
    setEditingId(bubble.id);
    setEditText(bubble.text);
    setEditTextColor(bubble.textColor || "#000000");
    setEditBgColor(bubble.backgroundColor || "#FFFFFF");
    setEditFontFamily(bubble.fontFamily || "Comic Neue");
  };

  const saveEdit = () => {
    if (!editingId) return;
    
    const currentBubble = bubbles.find(b => b.id === editingId);
    if (currentBubble) {
        const hasChanged = 
            currentBubble.text !== editText || 
            currentBubble.textColor !== editTextColor || 
            currentBubble.backgroundColor !== editBgColor ||
            currentBubble.fontFamily !== editFontFamily;

        if (hasChanged) {
            const newBubbles = bubbles.map(b => b.id === editingId ? { 
                ...b, 
                text: editText,
                textColor: editTextColor,
                backgroundColor: editBgColor,
                fontFamily: editFontFamily
            } : b);
            addToHistory(newBubbles);
        }
    }
    
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      {/* Header Toolbar */}
      <header className="h-16 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur flex items-center justify-between px-4 lg:px-6 z-20 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
            <X size={18} />
          </button>
          <h1 className="text-white font-bold hidden md:block truncate max-w-[150px] lg:max-w-xs text-sm lg:text-base">{image.file?.name}</h1>
        </div>

        {/* Center Controls (Tools) */}
        <div className="flex items-center gap-4">
            {/* Undo/Redo Controls */}
            <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-800 p-1">
                <button 
                    onClick={handleUndo} 
                    disabled={historyIndex === 0}
                    className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    title="Undo (Ctrl+Z)"
                >
                    <Undo size={18} />
                </button>
                <div className="w-px h-4 bg-zinc-800 mx-0.5"></div>
                <button 
                    onClick={handleRedo} 
                    disabled={historyIndex === history.length - 1}
                    className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    title="Redo (Ctrl+Y)"
                >
                    <Redo size={18} />
                </button>
            </div>

            {/* Tool Controls */}
            <div className="flex items-center gap-1 lg:gap-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                <button 
                    onClick={() => setTool('pan')}
                    className={`p-2 rounded-md transition-all ${tool === 'pan' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}
                    title="Pan Tool"
                >
                    <Hand size={18} />
                </button>
                <div className="w-px h-6 bg-zinc-800 mx-1"></div>
                
                {/* Draw Group */}
                <div className="flex items-center bg-zinc-900 rounded-md">
                    <button 
                        onClick={() => setTool('draw')}
                        className={`p-2 transition-all ${tool === 'draw' ? 'bg-indigo-600 text-white rounded-l-md' : 'text-zinc-400 hover:bg-zinc-800 rounded-md'}`}
                        title="Draw Box"
                    >
                        <Scan size={18} />
                    </button>
                    {tool === 'draw' && (
                        <button 
                           onClick={() => setDrawShape(prev => prev === 'rectangle' ? 'ellipse' : 'rectangle')}
                           className="p-2 rounded-r-md bg-indigo-700 text-indigo-100 hover:bg-indigo-600 border-l border-indigo-500"
                           title={`Shape: ${drawShape}`}
                        >
                             {drawShape === 'rectangle' ? <Square size={14} /> : <Circle size={14} />}
                        </button>
                    )}
                </div>
                
                <button 
                    onClick={() => setTool('select')}
                    className={`p-2 rounded-md transition-all ${tool === 'select' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}
                    title="Select Tool"
                >
                    <MousePointer2 size={18} />
                </button>
                
                {/* Tree / Workflow Mode */}
                <button 
                    onClick={() => setTool('tree')}
                    className={`p-2 rounded-md transition-all ${tool === 'tree' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}
                    title="Translation Tree (Context) Mode"
                >
                    <Workflow size={18} />
                </button>
            </div>
        </div>

        {/* Right Controls (Lang, Zoom, Actions) */}
        <div className="flex items-center gap-2 lg:gap-3">
            
            {/* Retranslate Button (Only visible in Tree Mode) */}
            {tool === 'tree' && connections.length > 0 && (
                <button
                    onClick={handleRetranslateLinked}
                    className="flex items-center gap-2 px-3 py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium animate-in fade-in zoom-in shadow-lg shadow-indigo-500/20 border border-indigo-500"
                >
                    <RefreshCw size={14} className={isProcessing ? "animate-spin" : ""} />
                    <span>Retranslate Linked</span>
                </button>
            )}

            {/* Language Selector */}
            <div className="relative" ref={langMenuRef}>
                <button 
                    onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                    className="flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300 hover:text-white transition-all text-xs lg:text-sm"
                >
                    <Globe size={16} />
                    <span className="hidden lg:inline">{targetLanguage}</span>
                    <ChevronDown size={14} className={`transition-transform ${isLangMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isLangMenuOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                        <div className="max-h-64 overflow-y-auto py-1">
                            {LANGUAGES.map(lang => (
                                <button
                                    key={lang.code}
                                    onClick={() => {
                                        setTargetLanguage(lang.code);
                                        setIsLangMenuOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-zinc-800 flex items-center justify-between ${targetLanguage === lang.code ? 'text-indigo-400 bg-zinc-800/50' : 'text-zinc-300'}`}
                                >
                                    {lang.label}
                                    {targetLanguage === lang.code && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-800 p-1 mr-2">
                <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="p-1.5 text-zinc-400 hover:text-white"><ZoomOut size={16} /></button>
                <span className="text-xs text-zinc-300 w-12 text-center">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(5, s + 0.25))} className="p-1.5 text-zinc-400 hover:text-white"><ZoomIn size={16} /></button>
            </div>

            {/* Action Buttons */}
            <button 
                onClick={handleDownload}
                className="hidden sm:flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-green-600 text-zinc-100 rounded-md text-xs lg:text-sm font-medium transition-all border border-zinc-700 hover:border-green-500"
                title="Download Translated Image"
            >
                <Save size={16} />
                <span className="hidden lg:inline">Save</span>
            </button>

            <button 
                onClick={handleAutoScan}
                disabled={isProcessing}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-indigo-600 text-zinc-100 rounded-md text-xs lg:text-sm font-medium transition-all border border-zinc-700 hover:border-indigo-500 disabled:opacity-50"
            >
                <Wand2 size={16} className={isProcessing ? "animate-spin" : ""} />
                <span className="hidden lg:inline">{isProcessing ? "..." : "Scan"}</span>
            </button>
        </div>
      </header>

      {/* Main Editor Area */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-zinc-950 cursor-gray-100"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setIsPanning(false); setDrawSelection(null); }}
        style={{
            cursor: isPanning ? 'grabbing' : (tool === 'pan' ? 'grab' : (tool === 'draw' ? 'crosshair' : (tool === 'tree' ? 'crosshair' : 'default')))
        }}
      >
        <div 
            ref={contentRef}
            className="absolute origin-center transition-transform duration-75 ease-out"
            style={{ 
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
                left: '50%',
                top: '50%',
                marginLeft: imgRef.current ? -(imgRef.current.width / 2) : 0,
                marginTop: imgRef.current ? -(imgRef.current.height / 2) : 0,
            }}
        >
            <img 
                ref={imgRef}
                src={image.url} 
                alt="Manga Page" 
                onLoad={() => {
                    setOffset({ x: 0, y: 0 });
                }}
                className="max-w-none pointer-events-none select-none shadow-2xl shadow-black block"
            />
            
            {/* --- TREE CONNECTIONS OVERLAY --- */}
            {tool === 'tree' && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
                    {/* Existing Connections */}
                    {connections.map(([start, end], idx) => {
                        const s = getBubbleCenter(start);
                        const e = getBubbleCenter(end);
                        return (
                            <g key={`${start}-${end}-${idx}`}>
                                <line 
                                    x1={`${s.x}%`} y1={`${s.y}%`} 
                                    x2={`${e.x}%`} y2={`${e.y}%`} 
                                    stroke="#6366f1" 
                                    strokeWidth="3" 
                                    strokeDasharray="5,5"
                                    className="drop-shadow-md"
                                />
                                {/* Arrow or dot at end? Let's use a small circle at connection points */}
                                <circle cx={`${s.x}%`} cy={`${s.y}%`} r="4" fill="#4f46e5" />
                                <circle cx={`${e.x}%`} cy={`${e.y}%`} r="4" fill="#4f46e5" />
                            </g>
                        )
                    })}
                    {/* Active Drag Line (Visual feedback for linking) */}
                    {activeTreeNode && (
                        (() => {
                            const center = getBubbleCenter(activeTreeNode);
                            // NOTE: We don't strictly have mouse cursor pos in % here easily without state,
                            // but the feedback of the active node being highlighted is usually enough.
                            // To keep it simple, we highlight the active node below.
                            return (
                                <circle cx={`${center.x}%`} cy={`${center.y}%`} r="6" fill="#22c55e" className="animate-pulse" />
                            )
                        })()
                    )}
                </svg>
            )}

            {/* Bubbles Overlay */}
            {bubbles.map(bubble => {
                const top = bubble.box.ymin / 10;
                const left = bubble.box.xmin / 10;
                const height = (bubble.box.ymax - bubble.box.ymin) / 10;
                const width = (bubble.box.xmax - bubble.box.xmin) / 10;
                
                const normalizedW = bubble.box.xmax - bubble.box.xmin;
                const normalizedH = bubble.box.ymax - bubble.box.ymin;
                
                const scaleFactor = imgRef.current ? (imgRef.current.naturalWidth / 1000) : 1;
                const baseFontSizeUnits = calculateBaseFontSize(bubble.text.length, normalizedW, normalizedH);
                const realFontSizePx = baseFontSizeUnits * scaleFactor * (bubble.fontSizeScale || 1);

                const currentFont = bubble.fontFamily || 'Comic Neue';
                const isEditing = editingId === bubble.id;

                // Render Handles if Selected and not Editing
                const renderHandles = tool === 'select' && !isEditing && !draggingId;
                
                const isTreeActive = tool === 'tree' && activeTreeNode === bubble.id;
                const isTreeConnected = tool === 'tree' && connections.some(c => c.includes(bubble.id));

                return (
                    <div
                        key={bubble.id}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (tool === 'select') startEditing(bubble);
                        }}
                        className={`absolute flex items-center justify-center text-center shadow-sm group transition-all duration-200
                            ${tool === 'select' && !isEditing ? 'hover:ring-2 hover:ring-indigo-500 cursor-pointer' : ''}
                            ${tool === 'tree' ? 'cursor-crosshair hover:scale-[1.02]' : ''}
                            ${draggingId === bubble.id ? 'ring-2 ring-indigo-500 z-50 opacity-90' : ''}
                            ${isEditing ? 'z-50 ring-2 ring-yellow-400 editing-bubble' : 'overflow-visible'}
                            ${isTreeActive ? 'ring-4 ring-green-500 z-50 shadow-lg shadow-green-500/50' : ''}
                            ${isTreeConnected && !isTreeActive ? 'ring-2 ring-indigo-400' : ''}
                        `}
                        style={{
                            top: `${top}%`,
                            left: `${left}%`,
                            width: `${width}%`,
                            height: `${height}%`,
                            backgroundColor: isEditing ? editBgColor : (bubble.backgroundColor || '#ffffff'),
                            color: isEditing ? editTextColor : (bubble.textColor || '#000000'),
                            borderRadius: bubble.shape === 'ellipse' ? '50%' : '8px',
                            fontFamily: isEditing ? editFontFamily : currentFont,
                            containerType: 'size'
                        }}
                    >
                        {/* Resize Handles */}
                        {renderHandles && (
                           <>
                             <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-indigo-500 rounded-full cursor-nw-resize z-40 opacity-0 group-hover:opacity-100 transition-opacity border border-white"
                                  data-handle="nw" data-bubble-id={bubble.id}></div>
                             <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-indigo-500 rounded-full cursor-ne-resize z-40 opacity-0 group-hover:opacity-100 transition-opacity border border-white"
                                  data-handle="ne" data-bubble-id={bubble.id}></div>
                             <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-indigo-500 rounded-full cursor-sw-resize z-40 opacity-0 group-hover:opacity-100 transition-opacity border border-white"
                                  data-handle="sw" data-bubble-id={bubble.id}></div>
                             <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-500 rounded-full cursor-se-resize z-40 opacity-0 group-hover:opacity-100 transition-opacity border border-white"
                                  data-handle="se" data-bubble-id={bubble.id}></div>
                           </>
                        )}

                        {tool === 'tree' && (
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                {isTreeActive ? 'Active' : 'Click to link'}
                            </div>
                        )}

                        {isEditing ? (
                            <>
                                {/* Floating Toolbar for Editing */}
                                <div 
                                    className="absolute -top-14 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700 shadow-xl rounded-lg flex items-center gap-1 p-1.5 z-[60] scale-[1] editing-toolbar" 
                                    style={{ transform: `translate(-50%, 0) scale(${1/scale})`, transformOrigin: 'bottom center' }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    {/* Text Color */}
                                    <label className="p-1.5 hover:bg-zinc-800 rounded cursor-pointer text-zinc-300 hover:text-white relative group/btn" title="Text Color">
                                        <Type size={16} className="text-zinc-300" />
                                        <div className="absolute bottom-1 right-1 w-2 h-2 rounded-full border border-zinc-900" style={{ backgroundColor: editTextColor }} />
                                        <input 
                                            type="color" 
                                            value={editTextColor} 
                                            onChange={(e) => setEditTextColor(e.target.value)} 
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                                        />
                                    </label>
                                    <div className="w-px h-4 bg-zinc-700 mx-0.5"></div>
                                    
                                    {/* Bg Color */}
                                    <label className="p-1.5 hover:bg-zinc-800 rounded cursor-pointer text-zinc-300 hover:text-white relative group/btn" title="Background Color">
                                        <PaintBucket size={16} style={{ color: editBgColor }} />
                                        <input 
                                            type="color" 
                                            value={editBgColor} 
                                            onChange={(e) => setEditBgColor(e.target.value)} 
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                                        />
                                    </label>
                                    <div className="w-px h-4 bg-zinc-700 mx-0.5"></div>

                                    {/* Font Family Selector */}
                                    <div className="relative p-1.5 hover:bg-zinc-800 rounded cursor-pointer text-zinc-300 hover:text-white" title="Change Font">
                                        <ALargeSmall size={16} />
                                        <select
                                            value={editFontFamily}
                                            onChange={(e) => setEditFontFamily(e.target.value)}
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full appearance-none"
                                        >
                                            {FONTS.map(f => (
                                                <option key={f.name} value={f.name}>{f.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div className="w-px h-4 bg-zinc-700 mx-0.5"></div>

                                    {/* Shape Toggle */}
                                    <button
                                        onClick={() => updateBubbleShape(bubble.id, bubble.shape === 'ellipse' ? 'rectangle' : 'ellipse')}
                                        className="p-1.5 hover:bg-zinc-800 rounded text-zinc-300 hover:text-white"
                                        title="Toggle Shape"
                                    >
                                        {bubble.shape === 'ellipse' ? <Square size={16} /> : <Circle size={16} />}
                                    </button>

                                    <div className="w-px h-4 bg-zinc-700 mx-0.5"></div>

                                    {/* Font Size */}
                                    <div className="flex items-center bg-zinc-800 rounded">
                                        <button 
                                            onClick={() => updateBubbleFontScale(bubble.id, -0.1)}
                                            className="p-1 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-l"
                                        >
                                            <Minus size={12} />
                                        </button>
                                        <button 
                                            onClick={() => updateBubbleFontScale(bubble.id, 0.1)}
                                            className="p-1 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-r"
                                        >
                                            <Plus size={12} />
                                        </button>
                                    </div>

                                    <div className="w-px h-4 bg-zinc-700 mx-0.5"></div>

                                    {/* Save */}
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                                        className="p-1.5 hover:bg-green-600/20 text-green-400 rounded hover:text-green-300"
                                        title="Save"
                                    >
                                        <Check size={16} />
                                    </button>
                                </div>

                                <div
                                    ref={activeBubbleRef}
                                    contentEditable
                                    suppressContentEditableWarning
                                    onInput={(e) => setEditText(e.currentTarget.innerText)}
                                    onKeyDown={(e) => { 
                                        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
                                            e.stopPropagation(); 
                                        }
                                        if(e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault(); 
                                            saveEdit();
                                        }
                                    }}
                                    className="w-full h-full bg-transparent outline-none flex items-center justify-center text-center break-words whitespace-pre-wrap"
                                    style={{
                                        fontSize: `${realFontSizePx}px`,
                                        lineHeight: '1.2',
                                        color: editTextColor,
                                        fontFamily: editFontFamily,
                                        padding: bubble.shape === 'ellipse' ? '12%' : '4%'
                                    }}
                                >
                                    {editText}
                                </div>
                            </>
                        ) : (
                            <div 
                                style={{ 
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: bubble.shape === 'ellipse' ? '12%' : '4%' 
                                }}
                            >
                               <p 
                                className="font-bold break-words w-full select-none"
                                style={{ 
                                    fontSize: `${realFontSizePx}px`,
                                    lineHeight: '1.2',
                                    fontFamily: currentFont
                                }}
                               >
                                    {bubble.text}
                               </p>
                            </div>
                        )}
                        
                        {tool === 'select' && !isEditing && (
                            <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 scale-[1/scale] z-30">
                                <button 
                                    onMouseDown={(e) => e.stopPropagation()} 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteBubble(bubble.id); }}
                                    className="bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Active Drawing Selection Box */}
            {drawSelection && (
                <div 
                    className="absolute border-2 border-indigo-500 bg-indigo-500/20 backdrop-blur-[1px]"
                    style={{
                        left: `${Math.min(drawSelection.start.x, drawSelection.current.x) * 100}%`,
                        top: `${Math.min(drawSelection.start.y, drawSelection.current.y) * 100}%`,
                        width: `${Math.abs(drawSelection.current.x - drawSelection.start.x) * 100}%`,
                        height: `${Math.abs(drawSelection.current.y - drawSelection.start.y) * 100}%`,
                        borderRadius: drawShape === 'ellipse' ? '50%' : '0px'
                    }}
                />
            )}
        </div>
      </div>
      
      {/* Status Bar */}
      <div className="h-8 bg-zinc-900 border-t border-zinc-800 flex items-center px-4 text-xs text-zinc-500 justify-between shrink-0 z-20">
         <div className="flex gap-4">
            <span>{bubbles.length} Translation(s)</span>
            <span className="hidden sm:inline text-zinc-600">|</span>
            <span className="hidden sm:inline">Ctrl+Z: Undo</span>
            <span className="hidden sm:inline">Space + Drag: Pan</span>
            {tool === 'tree' && <span className="text-indigo-400">Context Mode: Click bubbles to link them in order.</span>}
         </div>
         <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Gemini 2.5 Flash
         </span>
      </div>
    </div>
  );
};

export default MangaEditor;
