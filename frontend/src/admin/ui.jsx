import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  Bell,
  Building,
  Building2,
  CalendarDays,
  Check as CheckMark,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Globe2,
  GripVertical,
  Image,
  Inbox,
  Layers,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  Monitor,
  Paintbrush,
  Palette,
  Phone,
  PhoneCall,
  Plug,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  X,
  BarChart3
} from 'lucide-react';

// One name per symbol, so menus and pages ask for a meaning, never for a drawing.
const icons = {
  activity: Activity,
  archive: Archive,
  bell: Bell,
  callbacks: PhoneCall,
  card: CreditCard,
  chart: BarChart3,
  check: CheckMark,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronsUpDown: ChevronsUpDown,
  alert: CircleAlert,
  clock: Clock,
  design: Paintbrush,
  download: Download,
  events: CalendarDays,
  external: ExternalLink,
  eye: Eye,
  file: FileText,
  filter: Filter,
  globe: Globe2,
  grip: GripVertical,
  image: Image,
  inbox: Inbox,
  layers: Layers,
  login: LogIn,
  logout: LogOut,
  mail: Mail,
  menu: Menu,
  organisation: Building2,
  overview: LayoutDashboard,
  palette: Palette,
  phone: Phone,
  plug: Plug,
  plus: Plus,
  printer: Printer,
  qr: QrCode,
  questions: ListChecks,
  refresh: RefreshCw,
  search: Search,
  send: Send,
  settings: Settings,
  shield: ShieldCheck,
  star: Star,
  team: Users,
  tenants: Building,
  texts: MessageSquareText,
  trash: Trash2,
  wallboard: Monitor,
  x: X
};

export function Icon({ name, size = 16, className = '', strokeWidth }) {
  const Symbol = icons[name] || CircleAlert;
  return <Symbol size={size} strokeWidth={strokeWidth} className={`flex-none ${className}`.trim()} aria-hidden="true" />;
}

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let active = true;
    setState((old) => ({ ...old, loading: true, error: null }));
    fn()
      .then((data) => active && setState({ loading: false, data, error: null }))
      .catch((error) => active && setState({ loading: false, data: null, error }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// Closes a menu when the pointer goes down anywhere else or Escape is pressed.
export function useDismiss(ref, onDismiss, active) {
  useEffect(() => {
    if (!active) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onDismiss();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onDismiss, active]);
}

export function Button({ variant = 'secondary', icon, iconSize = 16, size, className = '', children, type = 'button', ...props }) {
  const classes = ['q-btn', `q-btn-${variant}`, size === 'sm' ? 'q-btn-sm' : '', !children ? 'q-btn-icon' : '', className].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...props}>{icon && <Icon name={icon} size={iconSize} />}{children}</button>;
}

export function ButtonLink({ variant = 'secondary', icon, size, className = '', children, ...props }) {
  const classes = ['q-btn', `q-btn-${variant}`, size === 'sm' ? 'q-btn-sm' : '', className].filter(Boolean).join(' ');
  return <a className={classes} {...props}>{icon && <Icon name={icon} />}{children}</a>;
}

export function Panel({ title, note, actions, children, className = '', id }) {
  return <section id={id} className={`q-panel ${className}`.trim()}>
    {(title || actions || note) && <div className="q-panel-head">
      {title && <h2 className="q-panel-title">{title}</h2>}
      <div className="flex items-center gap-2">
        {note && <span className="q-panel-note">{note}</span>}
        {actions}
      </div>
    </div>}
    {children}
  </section>;
}

export function Page({ title, subtitle, actions, children, className = '' }) {
  return <div className={`grid gap-4 ${className}`.trim()}>
    {(title || actions) && <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {title && <h1 className="q-h1">{title}</h1>}
        {subtitle && <p className="mt-1 max-w-3xl text-q-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>}
    {children}
  </div>;
}

export function Field({ label, hint, children, className = '' }) {
  return <label className={`q-field ${className}`.trim()}>
    {label && <span className="q-label">{label}</span>}
    {children}
    {hint && <span className="q-hint">{hint}</span>}
  </label>;
}

export const Input = React.forwardRef(function Input(props, ref) {
  return <input ref={ref} className="q-input" {...props} />;
});

export function Select({ children, ...props }) {
  return <select className="q-input" {...props}>{children}</select>;
}

export function TextArea(props) {
  return <textarea className="q-input" {...props} />;
}

export function Check({ label, className = '', ...props }) {
  return <label className={`q-check ${className}`.trim()}><input type="checkbox" {...props} /><span>{label}</span></label>;
}

export function Tabs({ items, active, onSelect, className = '', label = 'Bereiche' }) {
  return <div role="tablist" aria-label={label} className={`q-tabs ${className}`.trim()}>
    {items.map((item) => <button
      key={item.id}
      type="button"
      role="tab"
      aria-selected={item.id === active}
      className="q-tab"
      onClick={() => onSelect(item.id)}
    >
      {item.icon && <Icon name={item.icon} size={15} />}
      {item.label}
      {item.kbd && <kbd className="q-kbd">{item.kbd}</kbd>}
    </button>)}
  </div>;
}

// Messages are plain strings (information) or { tone: 'error', text } from errorNotice().
export function errorNotice(error) {
  return { tone: 'error', text: error?.message || String(error) };
}

export function Notice({ message, className = '' }) {
  if (!message) return null;
  const tone = typeof message === 'object' ? message.tone || 'info' : 'info';
  const text = typeof message === 'object' ? message.text : message;
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`q-notice q-notice-${tone} ${className}`.trim()}>{text}</p>;
}

export function ErrorBox({ error, className = '' }) {
  if (!error) return null;
  return <p role="alert" className={`q-notice q-notice-error ${className}`.trim()}>{error?.message || String(error)}</p>;
}

export function Loading({ text = 'Wird geladen …' }) {
  return <p className="text-q-muted">{text}</p>;
}

export function Empty({ children }) {
  return <p className="text-q-muted">{children}</p>;
}

const starPath = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';

// Five stars, filled up to the rating. The number is there for screen readers.
export function Stars({ rating = 0, size = 12, className = '', offClassName = 'text-q-line' }) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return <span className={`inline-flex items-center gap-px ${className}`.trim()} role="img" aria-label={`${value} von 5 Sternen`}>
    {[1, 2, 3, 4, 5].map((index) => <svg key={index} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={index <= value ? '' : offClassName}>
      <path fill="currentColor" d={starPath} />
    </svg>)}
  </span>;
}

// A small menu under a button. It closes on a click elsewhere, on Escape and after a choice.
export function Popover({ label, icon, children, align = 'left', buttonClassName = 'q-btn q-btn-secondary', menuClassName = '' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useDismiss(box, () => setOpen(false), open);
  return <div ref={box} className="relative inline-block">
    <button type="button" className={buttonClassName} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
      {icon && <Icon name={icon} />}
      {label}
    </button>
    {open && <div role="menu" className={`q-menu ${align === 'right' ? 'right-0' : 'left-0'} ${menuClassName}`.trim()} style={{ top: 'calc(100% + 4px)' }} onClick={() => setOpen(false)}>
      {children}
    </div>}
  </div>;
}
