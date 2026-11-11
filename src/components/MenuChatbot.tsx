import { useState, useRef, useEffect } from 'react';
import { X, MessageCircle, Send, Sparkles, ChefHat } from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category?: string;
  description?: string;
  is_active: boolean;
}

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

interface MenuChatbotProps {
  items: MenuItem[];
  shopName?: string;
  primaryColor?: string;
  greeting?: string;
  onAddToCart?: (item: MenuItem) => void;
}

// Simple local NLP — no API key needed
function queryMenu(q: string, items: MenuItem[]): string {
  const lower = q.toLowerCase();
  const activeItems = items.filter(i => i.is_active);

  // Today's specials / featured
  if (lower.includes('special') || lower.includes('today') || lower.includes('recommend') || lower.includes('suggest') || lower.includes('popular') || lower.includes('best')) {
    const picks = activeItems.slice(0, 3);
    if (!picks.length) return "We're still updating our menu. Please check back soon! 😊";
    return `🌟 Our top picks today:\n${picks.map(i => `• **${i.name}** — ₹${i.price}${i.category ? ` (${i.category})` : ''}`).join('\n')}\n\nWant to add any of these to your cart?`;
  }

  // Price queries
  if (lower.includes('cheap') || lower.includes('affordable') || lower.includes('budget') || lower.includes('low price')) {
    const cheap = [...activeItems].sort((a, b) => a.price - b.price).slice(0, 4);
    return `💰 Most affordable items:\n${cheap.map(i => `• **${i.name}** — ₹${i.price}`).join('\n')}`;
  }

  // Category queries
  const categories = [...new Set(activeItems.map(i => i.category).filter(Boolean))];
  for (const cat of categories) {
    if (cat && lower.includes(cat.toLowerCase())) {
      const catItems = activeItems.filter(i => i.category?.toLowerCase() === cat.toLowerCase()).slice(0, 5);
      return `🍽️ ${cat} items:\n${catItems.map(i => `• **${i.name}** — ₹${i.price}`).join('\n')}`;
    }
  }

  // Veg
  if (lower.includes('veg') && !lower.includes('nonveg') && !lower.includes('non-veg')) {
    const veg = activeItems.filter(i => (i as any).is_veg === true || (i as any).food_type === 'veg').slice(0, 5);
    if (veg.length) return `🥦 Vegetarian options:\n${veg.map(i => `• **${i.name}** — ₹${i.price}`).join('\n')}`;
    return "I'll check our veg options for you — please scroll through the menu above! 🥗";
  }

  // Non-veg
  if (lower.includes('nonveg') || lower.includes('non-veg') || lower.includes('chicken') || lower.includes('mutton') || lower.includes('fish') || lower.includes('egg')) {
    const nv = activeItems.filter(i => {
      const name = i.name.toLowerCase();
      return (i as any).is_veg === false || name.includes('chicken') || name.includes('mutton') || name.includes('fish') || name.includes('egg') || name.includes('prawn');
    }).slice(0, 5);
    if (nv.length) return `🥩 Non-veg options:\n${nv.map(i => `• **${i.name}** — ₹${i.price}`).join('\n')}`;
  }

  // Search by name
  const matches = activeItems.filter(i =>
    i.name.toLowerCase().includes(lower) ||
    (i.description && i.description.toLowerCase().includes(lower))
  ).slice(0, 4);

  if (matches.length === 1) {
    const m = matches[0];
    return `🍽️ **${m.name}**\nPrice: ₹${m.price}${m.category ? `\nCategory: ${m.category}` : ''}${m.description ? `\n${m.description}` : ''}\n\nWant to add it to your cart?`;
  }
  if (matches.length > 1) {
    return `Found ${matches.length} items:\n${matches.map(i => `• **${i.name}** — ₹${i.price}`).join('\n')}`;
  }

  // Categories list
  if (lower.includes('categor') || lower.includes('section') || lower.includes('what do you have') || lower.includes('menu')) {
    if (categories.length) return `📋 We serve:\n${categories.map(c => `• ${c}`).join('\n')}\n\nWhat sounds good?`;
  }

  // Help
  if (lower.includes('help') || lower.includes('hi') || lower.includes('hello') || lower.includes('hii')) {
    return `Hi there! 👋 I can help you:\n• Find menu items ("show biryani")\n• Get recommendations ("what's popular?")\n• Check prices ("cheap items")\n• Browse categories ("what veg options?")\n\nWhat would you like? 😊`;
  }

  return `I'm not sure about that, but I can help you find items on our menu! Try asking:\n• "What's good today?"\n• "Show me veg items"\n• "What's cheapest?"\n• "Do you have biryani?"`;
}

export const MenuChatbot = ({ items, shopName, primaryColor, greeting, onAddToCart }: MenuChatbotProps) => {
  const color = primaryColor || '#ea580c';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'bot', text: greeting || `Hi! 👋 I'm your menu assistant at ${shopName || 'our restaurant'}. Ask me anything!` }
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = () => {
    const q = input.trim();
    if (!q) return;
    const userMsg: ChatMessage = { role: 'user', text: q };
    const botReply: ChatMessage = { role: 'bot', text: queryMenu(q, items) };
    setMessages(prev => [...prev, userMsg, botReply]);
    setInput('');
  };

  // Render message with basic **bold** markdown
  const renderText = (text: string) => {
    return text.split('\n').map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <span key={i}>
          {parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}
          {i < text.split('\n').length - 1 && <br />}
        </span>
      );
    });
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed z-[140] bottom-24 right-4 w-14 h-14 rounded-full text-white shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
        aria-label="Open chat assistant"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse" />
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed z-[145] bottom-[158px] right-4 w-80 max-h-[65vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-zinc-700 sheet-slide-up">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 text-white flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
            <ChefHat className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">Menu Assistant</p>
              <p className="text-[10px] opacity-80 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> Powered by ZenPOS AI
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 dark:bg-zinc-900">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'text-white rounded-br-sm'
                    : 'bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-100 rounded-bl-sm shadow-sm'
                }`} style={m.role === 'user' ? { background: color } : {}}>
                  {renderText(m.text)}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 p-2 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-700 flex-shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask about our menu..."
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 focus:outline-none focus:border-gray-400"
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-xl text-white flex items-center justify-center disabled:opacity-40 transition-all active:scale-90 !bg-transparent"
              style={{ background: color }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
