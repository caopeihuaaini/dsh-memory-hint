window.__ModuleLoader__.load({
  id: '@local/dsh-memory-hint',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    let ReactDOM = null;
    try {
      ReactDOM = require('react-dom');
    } catch {}

    const state = { items: [], error: '', setup: false, open: false, rect: null };
    const listeners = new Set();
    const emit = () => {
      for (const fn of listeners) {
        try {
          fn();
        } catch {}
      }
    };
    const setState = (patch) => {
      Object.assign(state, patch);
      emit();
    };
    const useStore = () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const fn = () => force((n) => n + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
      }, []);
      return state;
    };

    const findComposer = () => {
      const nodes = document.querySelectorAll('[contenteditable="true"]');
      return nodes.length ? nodes[nodes.length - 1] : null;
    };
    const readText = (el) => String((el && el.innerText) || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    const measure = () => {
      const el = findComposer();
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r || !r.width) return;
      setState({ rect: { top: r.top, left: r.left, width: r.width } });
    };

    const chip = {
      all: 'unset',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '8px',
      fontSize: '12px',
      fontWeight: 600,
      color: '#bfe6ff',
      background: 'rgba(16,44,64,0.95)',
      border: '1px solid rgba(127,212,255,0.5)',
    };

    function Panel() {
      const s = useStore();
      if (!s.items.length && !s.error && !s.setup) return null;

      const r = s.rect;
      const wrap = {
        position: 'fixed',
        left: r ? Math.round(r.left) : 24,
        top: r ? Math.round(r.top) - 10 : 120,
        width: r ? Math.max(280, Math.round(r.width)) : 420,
        transform: 'translateY(-100%)',
        zIndex: 2147483000,
        pointerEvents: 'auto',
        boxSizing: 'border-box',
        font: '12px/1.5 system-ui, "Microsoft YaHei", sans-serif',
        color: '#e8f4ff',
      };

      let inner;
      if (!s.items.length && s.error) {
        inner = h(
          'div',
          { style: { padding: '5px 9px', borderRadius: '8px', background: 'rgba(74,20,20,0.95)', border: '1px solid rgba(255,138,138,0.5)', color: '#ff9a9a', fontSize: '11px' }, title: s.error },
          `⚑ 记忆提示不可用：${s.error}`,
        );
      } else if (!s.items.length) {
        inner = h(
          'div',
          { style: { ...chip, cursor: 'default', fontSize: '11px', fontWeight: 400, opacity: 0.8 }, title: '在插件配置里设置 dir 指向规则目录' },
          '⚑ 未绑定记忆库：在插件配置里设置 dir',
        );
      } else {
        inner = h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          h(
            'button',
            { type: 'button', style: { ...chip, alignSelf: 'flex-start' }, onClick: () => setState({ open: !s.open }) },
            h('span', null, '⚑'),
            h('span', null, `相关规则 ${s.items.length} 条`),
            h('span', { style: { opacity: 0.65, fontWeight: 400 } }, s.open ? '收起' : '展开'),
          ),
          s.open
            ? h(
                'div',
                { style: { padding: '8px 10px', borderRadius: '9px', background: 'rgba(8,24,36,0.97)', border: '1px solid rgba(127,212,255,0.3)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '240px', overflowY: 'auto' } },
                ...s.items.map((it, i) =>
                  h(
                    'div',
                    { key: `${i}-${it.title}` },
                    h('div', { style: { fontWeight: 600, color: '#f0f8ff' } }, it.title),
                    it.body ? h('div', { style: { color: 'rgba(200,224,240,0.75)', fontSize: '11px' } }, it.body.slice(0, 180) + (it.body.length > 180 ? '…' : '')) : null,
                  ),
                ),
              )
            : null,
        );
      }

      const node = h('div', { style: wrap }, inner);
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return ReactDOM.createPortal(node, document.body);
      }
      return node;
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          let timer = 0;
          let seq = 0;
          let lastQuery = '';
          let prevText = '';

          const clear = () => {
            if (state.items.length || state.error) setState({ items: [], error: '' });
          };

          const runSearch = async (text) => {
            const q = text.slice(-300);
            measure();
            if (q.length < 4) {
              clear();
              return;
            }
            if (q === lastQuery) return;
            lastQuery = q;
            const my = ++seq;
            try {
              const res = await fetch(`/api/dsh-memory-hint/search?q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' } });
              if (my !== seq) return;
              if (!res.ok) {
                setState({ items: [], error: `HTTP ${res.status}` });
                return;
              }
              const data = await res.json();
              if (my !== seq) return;
              setState({
                items: Array.isArray(data.items) ? data.items : [],
                setup: !!data.setup,
                error: '',
              });
            } catch (e) {
              if (my === seq) setState({ items: [], error: String((e && e.message) || e) });
            }
          };

          const handleText = (text) => {
            const shrunk = text.length < prevText.length;
            prevText = text;
            if (text.length < 4) {
              clearTimeout(timer);
              lastQuery = '';
              clear();
              return;
            }
            if (shrunk) {
              clearTimeout(timer);
              lastQuery = '';
              clear();
            }
            clearTimeout(timer);
            timer = setTimeout(() => runSearch(text), shrunk ? 180 : 300);
          };

          const onInput = (event) => {
            const el = event.target;
            if (!el || !el.isContentEditable) return;
            handleText(readText(el));
          };

          let lastSeen = '';
          const poll = setInterval(() => {
            const el = findComposer();
            if (!el) return;
            const text = readText(el);
            if (text === lastSeen) return;
            lastSeen = text;
            handleText(text);
          }, 250);

          const onResize = () => measure();
          document.addEventListener('input', onInput, true);
          window.addEventListener('resize', onResize);
          window.addEventListener('scroll', onResize, true);
          return () => {
            clearTimeout(timer);
            clearInterval(poll);
            document.removeEventListener('input', onInput, true);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onResize, true);
            listeners.clear();
          };
        });

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register({ name: 'conversation.composer.dock', id: 'memory-hint', order: 40 }, Panel),
        );
      },
    };
  },
});
